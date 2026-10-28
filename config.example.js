/**
 * 配置模板 —— 复制成 config.local.js 后填写真实值
 *   cp config.example.js config.local.js
 * config.local.js 已在 .gitignore 里，不会被提交。
 */
module.exports = {
  // 登录账号（手机号 + 密码）。密码注意末尾可能带标点，原样填。
  phone: '<PHONE>',
  password: '<YOUR_PASSWORD>',

  // 门店名（模糊匹配，留空则自动选第一个）
  // 门店名，支持模糊匹配；留空则自动选第一个
  storeName: '<STORE_NAME>',   // 只有一个门店时也要显式选一次

  // 图片存储根目录（相对项目根）
  outDir: 'output',

  // 下载图片并发数（对 CDN 友好，别超过 8）
  concurrency: 4,
};
