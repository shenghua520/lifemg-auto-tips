#!/usr/bin/env node
/**
 * 98 · 排障用：抓商品详情三接口的原始响应，落到 backup/detail_<itemId>_<时间>.json
 *   node scripts/98-sniff-detail.js 66496
 *
 * 用途：字段对不上、怀疑接口变了、想加新列时，先跑这个看真实结构。
 */
const fs = require('fs');
const path = require('path');
const C = require('./lib/common');

const ITEM_ID = process.argv[2] || '66496';

(async () => {
  const { browser, page } = await C.launch({ headless: false, useProfile: true });
  const bag = {};
  page.on('response', async (r) => {
    const u = r.url();
    const m = u.match(/\/v4\/(h5\/item\/\d+|item\/\d+\/newDetail|item\/itemArgs\/\d+)/);
    if (!m) return;
    let b = ''; try { b = await r.text(); } catch (e) { return; }
    bag[m[1]] = b;
  });

  try {
    await C.ensureLogin(page);
    await C.ensureStore(page, C.loadConfig().storeName);
    await page.goto(C.BASE + '/goods-detail?itemId=' + ITEM_ID, { waitUntil: 'domcontentloaded' });
    await C.sleep(9000);

    const dir = C.ensureDir(path.join(C.ROOT, 'backup'));
    const f = path.join(dir, `detail_${ITEM_ID}_${C.timestamp()}.json`);
    fs.writeFileSync(f, JSON.stringify(bag, null, 1), 'utf8');

    for (const [k, v] of Object.entries(bag)) {
      console.log(k, 'len=' + v.length);
      try {
        const j = JSON.parse(v);
        console.log('   code=' + j.code, '| data keys:', j.data && typeof j.data === 'object' ? Object.keys(j.data).join(', ') : '-');
      } catch (e) { console.log('   not json'); }
    }
    console.log('\n原始响应已存:', f);
  } finally { await browser.close(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
