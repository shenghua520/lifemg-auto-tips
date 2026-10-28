/**
 * lifemg-auto-tips · 公共库
 * 晨光联盟商城（lifemg.cn）PC 端自动化：登录 / 选门店 / 带鉴权调接口 / 图片下载
 *
 * 约定：
 *  - 一律用 Playwright 常驻页面，接口调用走 page.evaluate(fetch)，自动带 Cookie + 鉴权头
 *  - 登录态存 profile/auth.json，下次可直接复用，减少登录次数
 *  - 所有写操作脚本必须外部传 --yes，本库不主动做任何写操作
 */
const path = require('path');
const fs = require('fs');

/** 解析 playwright 模块：优先本地依赖，其次全局 npm 里的 @playwright/cli 自带副本 */
function resolvePlaywright() {
  const tries = [
    process.env.PW_PATH,
    'playwright',
    path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright'),
    '/usr/lib/node_modules/@playwright/cli/node_modules/playwright',
  ].filter(Boolean);
  for (const t of tries) {
    try { return require(t); } catch (e) {}
  }
  throw new Error('找不到 playwright，请 npm i playwright 或设置 PW_PATH');
}
const { chromium } = resolvePlaywright();

const ROOT = path.resolve(__dirname, '../..');
const PROFILE = path.join(ROOT, 'profile');
const AUTH_FILE = path.join(PROFILE, 'auth.json');
const BASE = 'https://lifemg.cn';
const VIEWPORT = { width: 1600, height: 1000 };

function loadConfig() {
  const p = path.join(ROOT, 'config.local.js');
  if (fs.existsSync(p)) return require(p);
  const ex = path.join(ROOT, 'config.example.js');
  if (fs.existsSync(ex)) return require(ex);
  return { phone: '', password: '', storeName: '' };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

/** 文件名安全化：去掉 Windows 非法字符，限长 120 */
function safeName(s, max = 120) {
  return String(s || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'unknown';
}

async function launch({ headless = false, useProfile = true } = {}) {
  fs.mkdirSync(PROFILE, { recursive: true });
  const browser = await chromium.launch({ headless, channel: 'chrome', args: ['--start-maximized'] });
  const ctxOpts = { viewport: VIEWPORT, acceptDownloads: true };
  if (useProfile && fs.existsSync(AUTH_FILE)) ctxOpts.storageState = AUTH_FILE;
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

async function saveState(ctx) {
  fs.mkdirSync(PROFILE, { recursive: true });
  await ctx.storageState({ path: AUTH_FILE });
}

/** 登录；成功后返回 true */
/** 确保协议已勾选（Element Plus：点 label 才生效）；返回是否勾上 */
async function checkAgree(page) {
  for (let i = 0; i < 6; i++) {
    const ok = await page.evaluate(() => {
      const lbl = document.querySelector('.agree .el-checkbox');
      if (!lbl) return false;
      if (!lbl.className.includes('is-checked')) lbl.click();
      return lbl.className.includes('is-checked');
    });
    if (ok) return true;
    await sleep(300);
  }
  return false;
}

async function login(page, cfg = loadConfig()) {
  log('登录中…', cfg.phone);
  let lastErr = '';

  // 诊断用：捕获登录接口的最后一次返回
  let signinMsg = '';
  const onResp = async (r) => {
    if (!r.url().includes('pwd_signin')) return;
    try { const j = JSON.parse(await r.text()); signinMsg = j.code + ' ' + (j.message || ''); } catch (e) {}
  };
  page.on('response', onResp);

  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('input[placeholder="请输入手机号"]', { timeout: 20000 }).catch(() => {});
      // 等首屏 JS 加载 + Vue 挂载完成，否则填进去的值会被 mounted 后的空状态覆盖
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(1500);

      // 填值 → 回读校验 → 不对就重填（hydration 竞态的兜底）
      let filled = false;
      for (let k = 0; k < 5; k++) {
        await page.fill('input[placeholder="请输入手机号"]', cfg.phone);
        await page.fill('input[placeholder="请输入密码"]', cfg.password);
        await sleep(250);
        const vals = await page.evaluate(() => ({
          phone: (document.querySelector('input[placeholder="请输入手机号"]') || {}).value || '',
          pwd: (document.querySelector('input[placeholder="请输入密码"]') || {}).value || '',
        }));
        if (vals.phone === cfg.phone && vals.pwd === cfg.password) { filled = true; break; }
        await sleep(600);
      }
      if (!filled) { lastErr = '账号/密码没能写入表单'; log('  × 第' + attempt + '次：' + lastErr); continue; }

      const agreed = await checkAgree(page);
      if (!agreed) { lastErr = '协议勾选框没能勾上'; log('  × 第' + attempt + '次：' + lastErr); await sleep(1200); continue; }

      signinMsg = '';
      // 按钮可能被底部 footer 遮挡 → force
      await page.locator('button:has-text("登录")').first().click({ force: true });

      let ok = false;
      for (let i = 0; i < 24; i++) {
        await sleep(500);
        if (!page.url().includes('/login')) { ok = true; break; }
      }
      if (ok) { log('登录成功 →', page.url()); return true; }

      lastErr = signinMsg || (await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' ').slice(0, 160)));
      log('  × 第' + attempt + '次登录未成功，接口返回：' + lastErr);
      await sleep(1200);
    }
  } finally { page.off('response', onResp); }

  throw new Error('登录失败（重试 3 次）：' + lastErr);
}

/** 已登录则跳过登录 */
async function ensureLogin(page, cfg = loadConfig()) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  if (page.url().includes('/login')) return login(page, cfg);
  const ok = await page.evaluate(async () => {
    try {
      const r = await fetch('/v4/users/me', { credentials: 'include' });
      const j = await r.json();
      return !!(j && j.data && j.data.id);
    } catch (e) { return false; }
  });
  if (!ok) return login(page, cfg);
  log('复用登录态');
  return true;
}

/** 读取门店列表 */
async function getShops(page) {
  return page.evaluate(async () => {
    const r = await fetch('/v4/users/newShopList?companyCode=&deliverCode=&storeName=&storeCode=&pageNo=1&pageSize=50', { credentials: 'include' });
    const j = await r.json();
    return (j.data && j.data.items) || [];
  });
}

/**
 * 选门店。不选门店时前端 header 里 auth_storeid=0、auth_org_code=未绑定终端，
 * 搜索/价格/库存全部不可用（这是本项目最大的坑，见 docs/02）。
 */
async function ensureStore(page, storeName = '') {
  const cur = await page.evaluate(() => localStorage.getItem('storeId'));
  if (cur && cur !== '0') {
    const shops = await getShops(page);
    const hit = shops.find((s) => String(s.store_id) === String(cur));
    if (hit) {
      const head = await page.evaluate(() => document.body.innerText.slice(0, 60));
      if (!head.includes('未绑定终端')) { log('门店已选中：', hit.store); return hit; }
    }
  }
  const shops = await getShops(page);
  if (!shops.length) throw new Error('该账号没有可用门店');
  let shop = shops[0];
  if (storeName) {
    const m = shops.find((s) => s.store.includes(storeName) || s.shop.includes(storeName));
    if (!m) throw new Error(`未找到门店「${storeName}」，可选：` + shops.map((s) => s.store).join(' / '));
    shop = m;
  }
  log('切换门店 →', shop.store, 'store_id=' + shop.store_id);
  const res = await page.evaluate(async (id) => {
    const fd = new FormData();
    fd.append('shop_id', String(id));
    const r = await fetch('/v4/users/shop', { method: 'POST', body: fd, credentials: 'include' });
    const j = await r.json();
    localStorage.setItem('storeId', String(id));
    return j.code;
  }, shop.store_id);
  if (res !== 200) throw new Error('切换门店失败 code=' + res);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  return shop;
}

/**
 * 带完整鉴权头调用 /v4 接口。
 * header 名字与前端 axios 拦截器一致：pctoken / newh5token / auth_* / shopid …
 */
async function api(page, pathname, { method = 'GET', body = null, query = null } = {}) {
  return page.evaluate(async ({ pathname, method, body, query }) => {
    const ls = {};
    for (const k of Object.keys(localStorage)) ls[k] = localStorage.getItem(k);
    const ui = (JSON.parse(ls.user || '{}').userInfo) || {};
    const storeId = ls.storeId || '0';
    const H = {
      accept: 'application/json, text/plain, */*',
      mgchannel: 'pc', 'x-ver': '9.8.27', 'x-app': 'cn.lifemg.union',
      'x-os': 'iOS', 'x-os1': 'iOS', 'x-build': '1',
      pctoken: ls.pcToken || '',
      newh5token: ui.newH5Token || '',
      auth_userid: String(ui.id || ''),
      auth_storeid: storeId,
      shopid: storeId,
      auth_shop_code: ui.storeCode || '',
      auth_org_code: encodeURIComponent(ui.store || ''),
      auth_user_org_code: ui.deliver_code || '',
      auth_username: encodeURIComponent(ui.nickname || ''),
    };
    let url = '/v4/' + pathname.replace(/^\/+/, '');
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) url += '?' + qs;
    }
    const opt = { method, headers: H, credentials: 'include' };
    if (body) {
      H['content-type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const r = await fetch(url, opt);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, text: json ? null : text.slice(0, 500) };
  }, { pathname, method, body, query });
}

/**
 * 按条码搜索商品。
 * 关键点：接口是 searchGoodsV2，参数 keyWords（大写 W），精确命中在 secondItems，
 * 模糊命中在 firstItems，两者都要看。
 */
async function searchByBarcode(page, barcode, { pageSize = 30 } = {}) {
  const q = {
    pageNo: 1, pageSize, queryType: 4, keyWords: barcode,
    activityId: '', sort: 1, filterList: '', noSaleSelectFlag: 'false',
    isFromCategroy: 'false', openSearchRequestId: '',
  };
  const { status, json } = await api(page, 'search/searchGoodsV2', { query: q });
  if (!json || json.code !== 0) throw new Error('搜索接口异常 ' + status + ' ' + JSON.stringify(json && json.message));
  const d = json.data || {};
  return {
    exact: d.secondItems || [],
    fuzzy: d.firstItems || [],
    total: d.postCount || 0,
    requestId: d.openSearchRequestId || '',
    raw: json,
  };
}

/** 图片下载（CDN 公开直链，走 Playwright request 以复用 UA/Referer） */
async function downloadImage(ctxOrapi, url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await ctxOrapi.get(url, { headers: { referer: BASE + '/', 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok()) throw new Error('下载失败 ' + res.status() + ' ' + url);
  const buf = await res.body();
  fs.writeFileSync(destPath, buf);
  return { bytes: buf.length, file: destPath };
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

module.exports = {
  BASE, ROOT, PROFILE, AUTH_FILE,
  loadConfig, launch, saveState, login, ensureLogin, checkAgree,
  getShops, ensureStore, api, searchByBarcode,
  downloadImage, ensureDir, safeName, timestamp, sleep, log,
};
