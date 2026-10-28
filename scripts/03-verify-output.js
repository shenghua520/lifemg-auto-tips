#!/usr/bin/env node
/**
 * 03 · 校验导出产物（本地只读，不联网）
 *   node scripts/03-verify-output.js
 *
 * 检查：每个商品文件夹是否齐全、图片是否可解析（PNG/JPG 魔数）、Excel 行数与 SKU 数是否对得上
 */
const fs = require('fs');
const path = require('path');
const C = require('./lib/common');

function imgInfo(file) {
  const b = fs.readFileSync(file);
  if (b.length < 16) return null;
  const isPng = b[0] === 0x89 && b[1] === 0x50;
  const isJpg = b[0] === 0xff && b[1] === 0xd8;
  const isWebp = b.slice(8, 12).toString() === 'WEBP';
  const isGif = b.slice(0, 3).toString() === 'GIF';
  return (isPng || isJpg || isWebp || isGif) ? { bytes: b.length, type: isPng ? 'png' : isJpg ? 'jpg' : isWebp ? 'webp' : 'gif' } : null;
}

(function main() {
  const outRoot = path.join(C.ROOT, C.loadConfig().outDir || 'output');
  if (!fs.existsSync(outRoot)) { console.error('输出目录不存在:', outRoot); process.exit(1); }

  const dirs = fs.readdirSync(outRoot).filter((d) => fs.statSync(path.join(outRoot, d)).isDirectory());
  const xlsx = fs.readdirSync(outRoot).filter((f) => f.endsWith('.xlsx')).sort().pop();

  let totalImgs = 0, badImgs = 0;
  const problems = [];

  for (const d of dirs) {
    const base = path.join(outRoot, d);
    // 平铺命名：<两位序号>_<类型>[.扩展名]，如 01_主图.png / 09_详情图.png
    const files = fs.readdirSync(base).filter((f) => /^\d{2}_(主图|轮播图|详情图|SKU图).*\.(png|jpe?g|webp|gif)$/i.test(f));
    const stat = { 主图: 0, 轮播图: 0, 详情图: 0, SKU图: 0 };
    const seqs = [];
    for (const f of files.sort()) {
      totalImgs++;
      const t = f.match(/^\d{2}_(主图|轮播图|详情图|SKU图)/)[1];
      stat[t]++;
      seqs.push(Number(f.slice(0, 2)));
      const info = imgInfo(path.join(base, f));
      if (!info) { badImgs++; problems.push(`${d}/${f} 不是有效图片`); }
    }
    // 序号必须从 1 开始连续
    seqs.sort((a, b) => a - b);
    const gap = seqs.some((v, i) => v !== i + 1);
    if (gap) problems.push(`${d} 图片序号不连续: ${seqs.join(',')}`);

    const hasJson = fs.existsSync(path.join(base, '商品信息.json'));
    const hasCsv = fs.existsSync(path.join(base, '图片清单.csv'));
    console.log(`${d}\n   主图 ${stat['主图']} / 轮播 ${stat['轮播图']} / 详情 ${stat['详情图']} / SKU ${stat['SKU图']}`
      + `   序号 1~${seqs.length}${gap ? '(断号!)' : ' 连续'}`
      + `   商品信息.json ${hasJson ? 'ok' : '缺失!'}  图片清单.csv ${hasCsv ? 'ok' : '缺失!'}`);
    if (stat['主图'] === 0) problems.push(`${d} 没有主图`);
    if (!hasJson) problems.push(`${d} 缺 商品信息.json`);
    if (!hasCsv) problems.push(`${d} 缺 图片清单.csv`);
  }

  console.log('\n图片合计', totalImgs, '张，异常', badImgs, '张');
  if (xlsx) {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(path.join(outRoot, xlsx));
    const main = XLSX.utils.sheet_to_json(wb.Sheets['商品总表'] || {});
    const sku = XLSX.utils.sheet_to_json(wb.Sheets['SKU明细'] || {});
    console.log(`Excel: ${xlsx}  商品总表 ${main.length} 行 / SKU明细 ${sku.length} 行`);
    if (main.length !== dirs.length) problems.push(`Excel 商品数(${main.length}) 与文件夹数(${dirs.length}) 不一致`);
    const urlOk = main.every((r) => r['主图URL'] && r['详情页']);
    if (!urlOk) problems.push('部分行缺少主图URL或详情页链接');
  } else {
    problems.push('没找到 xlsx');
  }

  if (problems.length) { console.log('\n发现问题:'); problems.forEach((p) => console.log('  -', p)); process.exitCode = 2; }
  else console.log('\n全部通过 ✔');
})();
