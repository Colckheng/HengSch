/**
 * 将 packages/ 下的 shared 包同步到 v1.1.0-an/shared/
 * 在 monorepo 中开发时，修改 packages 后运行此脚本再执行 EAS 构建
 * 用法: node scripts/sync-shared.js (从 v1.1.0-an 目录运行)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const packages = path.join(root, 'packages');
const shared = path.join(__dirname, '..', 'shared');

const copy = (src, dest) => {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((f) => copy(path.join(src, f), path.join(dest, f)));
  } else {
    fs.copyFileSync(src, dest);
  }
};

const syncPackage = (name, destName) => {
  const src = path.join(packages, name, 'src');
  const dest = path.join(shared, destName);
  if (!fs.existsSync(src)) {
    console.warn(`Skip ${name}: not found`);
    return;
  }
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  copy(src, dest);
  // shared-logic 的 todo-utils 需将 @hengsch/shared-types 改为相对路径
  if (destName === 'shared-logic') {
    const utilsPath = path.join(dest, 'todo-utils.ts');
    if (fs.existsSync(utilsPath)) {
      let content = fs.readFileSync(utilsPath, 'utf8');
      content = content.replace(
        "from '@hengsch/shared-types'",
        "from '../shared-types'"
      );
      fs.writeFileSync(utilsPath, content);
    }
  }
  console.log(`Synced ${name} -> shared/${destName}`);
};

syncPackage('shared-types', 'shared-types');
syncPackage('shared-logic', 'shared-logic');
syncPackage('shared-storage', 'shared-storage');
console.log('Done.');
