/**
 * 商品详情抓取 + 图片下载 + Excel 导出
 *
 * 落盘结构：一个商品一个目录，所有图片平铺，文件名 = 序号_类型[.扩展名]
 *   01_主图.png
 *   02_轮播图.png 03_轮播图.png … 08_轮播图.png     序号 = 页面轮播顺序
 *   09_详情图.png 10_详情图.png                    序号 = 详情页自上而下
 *   11_SKU图_HQKP3043A_6944041509433.png          SKU 图带货号+条码
 *   图片清单.csv / 商品信息.json
 * 全目录按文件名排序 = 页面从上到下的完整顺序。
 */
const fs = require('fs');
const path = require('path');
const C = require('./common');

/** 拉详情三接口 */
async function fetchItemDetail(page, itemId) {
  const [h5, args, nd] = await Promise.all([
    C.api(page, `h5/item/${itemId}`),
    C.api(page, `item/itemArgs/${itemId}`),
    C.api(page, `item/${itemId}/newDetail`),
  ]);
  if (!nd.json || nd.json.code !== 0) throw new Error('newDetail 失败: ' + JSON.stringify(nd.json && nd.json.message));
  return {
    h5: (h5.json && h5.json.data) || {},
    args: (args.json && args.json.data) || {},
    detail: nd.json.data,
  };
}

function uniq(arr) { return Array.from(new Set(arr.filter(Boolean))); }

/** 从 HTML 里提 <img src>（保持出现顺序 = 页面自上而下） */
function imgsFromHtml(html) {
  const out = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html || ''))) out.push(m[1]);
  return out;
}

/**
 * 汇总四类图片
 *  主图   = thum_image_url（与 share_image 同图，去重）
 *  轮播图 = cover_image_url_list[].url，按数组顺序 = 页面轮播顺序
 *  详情图 = detailHtml 里的 <img>，按出现顺序 = 页面自上而下
 *  SKU图  = 搜索接口 itemSkuList[].coverImageUrl（多数商品为空）
 */
function collectImages(detail, h5, searchItem) {
  const main = uniq([detail.thum_image_url, detail.share_image]);
  const carousel = uniq((detail.cover_image_url_list || []).map((x) => x && x.url));
  const descHtml = [h5.detailHtml, detail.item_desc].filter(Boolean).join('\n');
  const desc = uniq(imgsFromHtml(descHtml));

  const sku = [];
  const skuSrc = (searchItem && searchItem.itemSkuList) || [];
  for (const s of skuSrc) {
    const url = s.coverImageUrl || s.cover_image_url || '';
    if (!url) continue;
    sku.push({
      url,
      goodNo: s.goodNo || s.skuNo || s.skuNo || '',
      barcode: s.goodsBarcode || '',
      spec: s.prop1Value || s.skuName || '',
    });
  }
  return { main, carousel, desc, sku };
}

function extOf(url) {
  const m = String(url).split('?')[0].match(/\.(png|jpe?g|webp|gif|bmp)$/i);
  return m ? '.' + m[1].toLowerCase() : '.png';
}

/** 从文件头读宽高（png / jpeg / gif / webp），不引第三方依赖 */
function sniffSize(file) {
  let b;
  try { b = fs.readFileSync(file); } catch (e) { return null; }
  if (b.length < 24) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  // GIF
  if (b.slice(0, 3).toString() === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  // WEBP
  if (b.slice(8, 12).toString() === 'WEBP') {
    if (b.slice(12, 16).toString() === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  // JPEG：扫 SOFn
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * 按计划下载一组图片（平铺到一个目录），序号连续、文件名带类型
 * @param plan [{ 类型, url, label? }]
 * @returns { ok: [{序号,类型,文件名,宽,高,字节,URL}], fail: [] }
 */
async function downloadPlan(ctx, plan, dir, { concurrency = 4 } = {}) {
  C.ensureDir(dir);
  const ok = [];
  const fail = [];
  let i = 0;

  async function worker() {
    while (i < plan.length) {
      const idx = i++;
      const it = plan[idx];
      const ext = extOf(it.url);
      const seq = String(idx + 1).padStart(2, '0');
      const name = it.label
        ? `${seq}_${it.类型}_${C.safeName(it.label, 40)}${ext}`
        : `${seq}_${it.类型}${ext}`;
      const dest = path.join(dir, name);
      try {
        await C.downloadImage(ctx.request, it.url, dest);
        const sz = sniffSize(dest);
        ok.push({
          序号: idx + 1,
          类型: it.类型,
          文件名: name,
          宽: sz ? sz.w : '',
          高: sz ? sz.h : '',
          字节: fs.statSync(dest).size,
          URL: it.url,
        });
      } catch (e) {
        fail.push({ 序号: idx + 1, 类型: it.类型, url: it.url, err: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, plan.length || 1) }, worker));
  ok.sort((a, b) => a.序号 - b.序号);
  return { ok, fail };
}

/** 图片清单 CSV（UTF-8 BOM，Excel 直接打开不乱码） */
function writeManifest(dir, rows) {
  const head = ['类型', '序号', '文件名', '宽', '高', '字节', 'URL'];
  const lines = [head.join(',')];
  for (const r of rows) {
    const cells = [r.类型, r.序号, r.文件名, r.宽, r.高, r.字节, r.URL].map((v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    });
    lines.push(cells.join(','));
  }
  const p = path.join(dir, '图片清单.csv');
  fs.writeFileSync(p, '\uFEFF' + lines.join('\r\n'), 'utf8');
  return p;
}

/** 商品 → 一行主表数据 */
function buildRow(item, detail, args, manifest) {
  const skus = detail.sku_list || [];
  const by = (t) => (manifest || []).filter((r) => r.类型 === t);
  const names = (t) => by(t).map((r) => r.文件名).join(' | ');
  return {
    条码: item.__barcode || '',
    商品名称: detail.item_name || item.item_name || '',
    商品编码: detail.itemNo || item.item_no || '',
    商品ID: detail.item_id || item.item_id || '',
    品牌: detail.brand || args.brandName || '',
    一级分类: detail.firstCate || '',
    二级分类: detail.secondCate || '',
    三级分类: detail.thirdCate || '',
    四级分类: detail.fourthCate || '',
    本店价: detail.minPrice || item.price || '',
    建议零售价: args.suggestPrice || '',
    包装规格: args.itemPacket || '',
    属性: args.attributes || '',
    库存: detail.stockString || item.stocksString || '',
    上架状态: detail.onSale ? '在售' : '下架',
    是否新品: detail.ifNew || '',
    SKU数: skus.length,
    主图数: by('主图').length,
    轮播图数: by('轮播图').length,
    详情图数: by('详情图').length,
    SKU图数: by('SKU图').length,
    主图文件: names('主图'),
    轮播图文件: names('轮播图'),
    详情图文件: names('详情图'),
    SKU图文件: names('SKU图'),
    主图URL: (item.__urls && item.__urls.main.join(' | ')) || '',
    轮播图URL: (item.__urls && item.__urls.carousel.join(' | ')) || '',
    详情图URL: (item.__urls && item.__urls.desc.join(' | ')) || '',
    详情页: C.BASE + '/goods-detail?itemId=' + (detail.item_id || item.item_id),
    图片文件夹: item.__folder || '',
    抓取时间: new Date().toLocaleString('zh-CN'),
  };
}

/** 去掉后台自带的显示前缀，如 "条码: 6944…" → "6944…" */
function stripPrefix(v, prefixes) {
  let s = String(v == null ? '' : v).trim();
  for (const p of prefixes) {
    if (s.startsWith(p)) { s = s.slice(p.length).trim(); break; }
  }
  return s;
}

/** SKU 明细行 */
function buildSkuRows(item, detail) {
  return (detail.sku_list || []).map((s, i) => ({
    商品名称: detail.item_name || '',
    商品编码: detail.itemNo || '',
    条码: stripPrefix(s.barCode, ['条码:', '条码：', 'barcode:']),
    SKU货号: s.goodNo || '',
    SKU编码: stripPrefix(s.skuCode, ['编码:', '编码：']),
    SKU_ID: s.sku_id || '',
    mdm编码: s.mdm_code || '',
    规格: s.prop_value || '',
    本店价: s.show_price || '',
    零售价数字: s.sale_price != null ? s.sale_price : '',
    建议零售价: s.suggestPrice || '',
    起订量: s.moq != null ? s.moq : stripPrefix(s.moqText, ['起订量:', '起订量：']),
    包装单位: (s.skuUnit || []).map((u) => `${u.count}${u.name}`).join('/'),
    大仓库存: s.company_stock || '',
    配送库存: s.deliver_stock || '',
    库存描述: s.stocksString || '',
    在售: s.isSale ? '是' : '否',
    序号: i + 1,
  }));
}

const MAIN_COLS = ['条码', '商品名称', '商品编码', '商品ID', '品牌', '一级分类', '二级分类', '三级分类', '四级分类',
  '本店价', '建议零售价', '包装规格', '属性', '库存', '上架状态', '是否新品', 'SKU数',
  '主图数', '轮播图数', '详情图数', 'SKU图数',
  '主图文件', '轮播图文件', '详情图文件', 'SKU图文件',
  '主图URL', '轮播图URL', '详情图URL', '详情页', '图片文件夹', '抓取时间'];

const SKU_COLS = ['商品名称', '商品编码', '条码', 'SKU货号', 'SKU编码', 'SKU_ID', 'mdm编码', '规格',
  '本店价', '零售价数字', '建议零售价', '起订量', '包装单位', '大仓库存', '配送库存', '库存描述', '在售', '序号'];

function writeExcel(rows, skuRows, outPath) {
  const XLSX = require('xlsx');
  C.ensureDir(path.dirname(outPath));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(rows, { header: MAIN_COLS });
  const ws2 = XLSX.utils.json_to_sheet(skuRows, { header: SKU_COLS });
  const wide = { 商品名称: 46, 主图文件: 22, 轮播图文件: 60, 详情图文件: 24, SKU图文件: 34 };
  ws1['!cols'] = MAIN_COLS.map((c) => ({ wch: c.includes('URL') ? 40 : (wide[c] || 14) }));
  ws2['!cols'] = SKU_COLS.map((c) => ({ wch: c === '商品名称' ? 46 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws1, '商品总表');
  XLSX.utils.book_append_sheet(wb, ws2, 'SKU明细');
  XLSX.writeFile(wb, outPath);
  return outPath;
}

module.exports = {
  fetchItemDetail, collectImages, downloadPlan, buildRow, buildSkuRows,
  writeExcel, writeManifest, sniffSize, MAIN_COLS, SKU_COLS,
};
