#!/usr/bin/env node
/**
 * 00 · 登录一次，把登录态（Cookie + localStorage）存到 profile/auth.json
 *   后面所有脚本都会自动复用，避免反复登录触发风控。
 *
 *   node scripts/00-login-save-state.js
 */
const C = require('./lib/common');

(async () => {
  const { browser, ctx, page } = await C.launch({ headless: false, useProfile: false });
  try {
    await C.login(page);
    const shop = await C.ensureStore(page, C.loadConfig().storeName);
    await C.saveState(ctx);
    C.log('门店:', shop.store, '/ store_id=' + shop.store_id);
    C.log('登录态已保存 →', C.AUTH_FILE);
  } finally { await browser.close(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
