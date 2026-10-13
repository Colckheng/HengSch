/**
 * 将 packages/ 下的 shared 包同步到 v1.1.0-an/shared/
 * 在 monorepo 中开发时，修改 packages 后运行此脚本再执行 EAS 构建
 * 用法: node scripts/sync-shared.js (从 v1.1.0-an 目录运行)
 *
 * 注意：AN 走 EAS 云构建，EAS 上传的是自包含工程目录、访问不到 ../packages，
 * 所以必须保留这份副本。本脚本负责生成它；check-shared-sync.js 负责校验它没漂移。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const packages = path.join(root, 'packages');
const shared = path.join(__dirname, '..', 'shared');

/** 包 → 副本目录名（顺序即处理顺序） */
const SHARED_PACKAGES = [
  ['shared-types', 'shared-types'],
  ['shared-logic', 'shared-logic'],
  ['shared-storage', 'shared-storage']
];

/**
 * 副本内的路径改写：副本把各包平铺在 shared/ 下，包名导入解析不了，
 * 需改为相对路径。只在 sync 与 check 两处共用同一张表，避免两边规则漂移。
 */
const REWRITES = [
  { file: 'todo-utils.ts', from: "from '@hengsch/shared-types'", to: "from '../shared-types'" }
];

/** 对单个文件应用改写规则（destName 保留以便将来按包区分规则） */
function rewrite(destName, relPath, content) {
  let out = content;
  const base = path.basename(relPath);
  for (const r of REWRITES) {
    if (base === r.file) out = out.split(r.from).join(r.to);
  }
  return out;
}

/** 递归列出目录下所有文件（绝对路径） */
function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** 归一化：去 BOM + 统一换行，仅用于内容比对，避免行尾差异造成误报 */
function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((f) => copy(path.join(src, f), path.join(dest, f)));
  } else {
    fs.copyFileSync(src, dest);
  }
}

function syncPackage(name, destName) {
  const src = path.join(packages, name, 'src');
  const dest = path.join(shared, destName);
  if (!fs.existsSync(src)) {
    console.warn(`Skip ${name}: not found`);
    return;
  }
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  copy(src, dest);
  // 应用路径改写
  for (const relPath of walk(dest).map((p) => path.relative(dest, p))) {
    const target = path.join(dest, relPath);
    const content = fs.readFileSync(target, 'utf8');
    const rewritten = rewrite(destName, relPath, content);
    if (rewritten !== content) fs.writeFileSync(target, rewritten);
  }
  console.log(`Synced ${name} -> shared/${destName}`);
}

if (require.main === module) {
  for (const [name, destName] of SHARED_PACKAGES) syncPackage(name, destName);
  console.log('Done.');
}

module.exports = { root, packages, shared, SHARED_PACKAGES, REWRITES, rewrite, walk, normalize };
