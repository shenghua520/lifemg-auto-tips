/** 确认详情页有没有 SKU 级图片（规格切换时的小图） */
const C = require('./lib/common');

(async () => {
  const { browser, page } = await C.launch({ headless: false, useProfile: true });
  try {
    await C.ensureLogin(page);
    await C.ensureStore(page, C.loadConfig().storeName);
    await page.goto(C.BASE + '/goods-detail?itemId=66496', { waitUntil: 'domcontentloaded' });
    await C.sleep(8000);
    await page.screenshot({ path: require('path').join(C.ROOT, 'backup', 'sku-check.png'), clip: { x: 0, y: 0, width: 1600, height: 780 } });

    // 规格区域：找所有带图片的规格按钮 / 小图
    const info = await page.evaluate(() => {
      const imgs = Array.from(document.images).map((i) => ({
        src: (i.currentSrc || i.src || '').slice(0, 120),
        w: i.naturalWidth, h: i.naturalHeight, cls: i.className,
        alt: i.alt,
      }));
      const skuish = Array.from(document.querySelectorAll('[class*="sku" i], [class*="spec" i], [class*="prop" i]'))
        .slice(0, 12).map((e) => e.className + ' :: ' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 40));
      return { imgCount: imgs.length, imgs, skuish };
    });
    console.log('页面图片数:', info.imgCount);
    info.imgs.forEach((i) => console.log(`  ${i.w}x${i.h}  ${i.src}`));
    console.log('\n规格相关节点:');
    info.skuish.forEach((s) => console.log('  ' + s));
  } finally { await browser.close(); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
