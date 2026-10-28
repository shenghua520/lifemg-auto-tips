#!/usr/bin/env node
/**
 * 02 · 条码 → 下载全部图片 + 导出 Excel（只读，不写后台数据）
 *
 *   node scripts/02-export-item.js 6944041509433
 *   node scripts/02-export-item.js 6944041509433 6944041511153
 *   node scripts/02-export-item.js --file barcodes.txt
 *
 * 每个商品一个文件夹（商品名称命名）：
 *   output/<商品名称>/
 *     ├── 主图/01.png
 *     ├── 轮播图/01.png …
 *     ├── 详情图/01.png …
 *     └── 商品信息.json
 * 汇总表：output/商品清单_<时间>.xlsx（商品总表 + SKU明细）
 */
const fs = require('fs');
const path = require('path');
const C = require('./lib/common');
const E = require('./lib/exporter');

function parseArgs(argv) {
  const out = { barcodes: [], file: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') out.file = argv[++i];
    else if (a.startsWith('--')) { /* 忽略未知参数 */ }
    else out.barcodes.push(a.trim());
  }
  if (out.file) {
    const txt = fs.readFileSync(out.file, 'utf8');
    txt.split(/[\r\n,，\s]+/).map((s) => s.trim()).filter((s) => /^\d{8,14}$/.test(s)).forEach((s) => out.barcodes.push(s));
  }
  out.barcodes = Array.from(new Set(out.barcodes.filter(Boolean)));
  return out;
}

(async () => {
  const { barcodes } = parseArgs(process.argv);
  if (!barcodes.length) {
    console.error('用法: node scripts/02-export-item.js <条码> [条码...]  |  --file barcodes.txt');
    process.exit(1);
  }
  const cfg = C.loadConfig();
  const outRoot = C.ensureDir(path.join(C.ROOT, cfg.outDir || 'output'));

  const { browser, ctx, page } = await C.launch({ headless: false });
  const rows = [];
  const skuRows = [];
  const failures = [];
  const seenItemIds = new Set();

  try {
    await C.ensureLogin(page);
    await C.ensureStore(page, cfg.storeName);
    await C.saveState(ctx);

    for (const barcode of barcodes) {
      C.log('──────── 条码', barcode, '────────');
      try {
        const res = await C.searchByBarcode(page, barcode);
        const item = res.exact[0] || res.fuzzy[0];
        if (!item) { C.log('× 未搜到商品'); failures.push({ barcode, reason: '未搜到商品' }); continue; }
        if (seenItemIds.has(String(item.item_id))) {
          C.log('# 同一商品已导出（item_id=' + item.item_id + '），跳过');
          continue;
        }
        seenItemIds.add(String(item.item_id));

        C.log('√ 商品:', item.item_name, '| id=' + item.item_id);

        const { h5, args, detail } = await E.fetchItemDetail(page, item.item_id);
        const urls = E.collectImages(detail, h5, item);
        C.log('图片：主图', urls.main.length, '/ 轮播', urls.carousel.length,
          '/ 详情', urls.desc.length, '/ SKU', urls.sku.length);

        const folderName = C.safeName(detail.item_name || item.item_name);
        const dir = path.join(outRoot, folderName);

        // 平铺命名：01_主图 / 02_轮播图 … / 09_详情图 … / SKU图带货号+条码
        const plan = [
          ...urls.main.map((u) => ({ 类型: '主图', url: u })),
          ...urls.carousel.map((u) => ({ 类型: '轮播图', url: u })),
          ...urls.desc.map((u) => ({ 类型: '详情图', url: u })),
          ...urls.sku.map((s) => ({ 类型: 'SKU图', url: s.url, label: `${s.goodNo || 'SKU'}_${s.barcode || ''}` })),
        ];

        const r = await E.downloadPlan(ctx, plan, dir, { concurrency: cfg.concurrency });
        const cnt = (t) => r.ok.filter((x) => x.类型 === t).length;
        C.log('已下载：主图', cnt('主图'), '/ 轮播', cnt('轮播图'), '/ 详情', cnt('详情图'), '/ SKU', cnt('SKU图'));
        r.fail.forEach((f) => C.log('  × 下载失败', f.url, f.err));
        r.ok.forEach((x) => C.log('   ', x.文件名, `${x.宽}x${x.高}`));

        const manifest = r.ok;
        E.writeManifest(dir, manifest);
        C.log('图片清单:', path.join(folderName, '图片清单.csv'));

        // 单品快照
        fs.writeFileSync(path.join(dir, '商品信息.json'),
          JSON.stringify({ barcode, item, h5, args, detail, urls, manifest }, null, 1), 'utf8');

        item.__barcode = barcode;
        item.__folder = folderName;
        item.__urls = urls;
        rows.push(E.buildRow(item, detail, args, manifest));
        E.buildSkuRows(item, detail).forEach((s) => skuRows.push(s));
      } catch (e) {
        C.log('× 失败:', e.message);
        failures.push({ barcode, reason: e.message });
      }
      await C.sleep(800); // 对后台友好，别打太猛
    }

    if (rows.length) {
      const xlsx = path.join(outRoot, `商品清单_${C.timestamp()}.xlsx`);
      E.writeExcel(rows, skuRows, xlsx);
      C.log('\nExcel 已生成:', xlsx, '（商品', rows.length, '条 / SKU', skuRows.length, '行）');
    }
    if (failures.length) {
      C.log('\n失败清单:');
      failures.forEach((f) => C.log('  ', f.barcode, f.reason));
      fs.writeFileSync(path.join(outRoot, `失败清单_${C.timestamp()}.json`), JSON.stringify(failures, null, 1), 'utf8');
    }
    C.log('\n完成。输出目录:', outRoot);
  } finally { await browser.close(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
