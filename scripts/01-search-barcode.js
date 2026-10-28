#!/usr/bin/env node
/**
 * 01 · 按条码搜商品（只读）
 *   node scripts/01-search-barcode.js 6944041509433
 * 输出：屏幕摘要 + backup/search_<条码>_<时间>.json 原始响应
 */
const fs = require('fs');
const path = require('path');
const C = require('./lib/common');

(async () => {
  const barcode = process.argv[2];
  if (!barcode) { console.error('用法: node scripts/01-search-barcode.js <条码>'); process.exit(1); }

  const { browser, ctx, page } = await C.launch({ headless: false });
  try {
    await C.ensureLogin(page);
    await C.ensureStore(page, C.loadConfig().storeName);
    await C.saveState(ctx);

    const res = await C.searchByBarcode(page, barcode);
    const all = [...res.exact, ...res.fuzzy];
    console.log('\n精确命中 %d 条，模糊命中 %d 条\n', res.exact.length, res.fuzzy.length);
    if (!all.length) { console.log('未找到商品，确认条码是否正确 / 该门店是否铺货'); return; }

    all.forEach((it, i) => {
      console.log(`[${i + 1}] ${it.item_name}`);
      console.log(`    item_id=${it.item_id}  item_no=${it.item_no}  价格=${it.price}  库存=${it.stocksString}`);
      const hit = (it.itemSkuList || []).find((s) => s.goodsBarcode === barcode);
      if (hit) console.log(`    命中条码 → SKU ${hit.skuNo} / ${hit.prop1Value} / ￥${hit.customPrice}`);
      console.log(`    详情 ${C.BASE}/goods-detail?itemId=${it.item_id}`);
    });

    const dir = C.ensureDir(path.join(C.ROOT, 'backup'));
    const f = path.join(dir, `search_${barcode}_${C.timestamp()}.json`);
    fs.writeFileSync(f, JSON.stringify(res.raw, null, 1), 'utf8');
    console.log('\n原始响应已存:', f);
  } finally { await browser.close(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
