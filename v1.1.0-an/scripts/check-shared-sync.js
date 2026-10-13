/**
 * 校验 v1.1.0-an/shared/ 副本与 packages/ 源头是否一致。
 * 不一致说明改完 packages 忘了跑 sync-shared（历史事故：monitor.ts 漂移两个提交）。
 *
 * 用法: node scripts/check-shared-sync.js   （退出码 0=一致，1=有漂移）
 * 接进 CI / 根 npm test，从机制上杜绝"忘记同步"。
 */
const fs = require('fs');
const path = require('path');
const { packages, shared, SHARED_PACKAGES, rewrite, walk, normalize } = require('./sync-shared');

let problems = 0;
const fail = (msg) => {
  problems++;
  console.error(`  [FAIL] ${msg}`);
};

for (const [name, destName] of SHARED_PACKAGES) {
  const srcRoot = path.join(packages, name, 'src');
  const destRoot = path.join(shared, destName);

  if (!fs.existsSync(srcRoot)) {
    console.warn(`  [skip] ${name}: 源头 packages/${name}/src 不存在`);
    continue;
  }
  if (!fs.existsSync(destRoot)) {
    fail(`${destName}: 副本目录缺失（未跑过 sync-shared）`);
    continue;
  }

  const relOf = (base, p) => path.relative(base, p).replace(/\\/g, '/');
  const srcSet = new Set(walk(srcRoot).map((f) => relOf(srcRoot, f)));
  const destSet = new Set(walk(destRoot).map((f) => relOf(destRoot, f)));

  for (const rp of srcSet) {
    if (!destSet.has(rp)) {
      fail(`${destName}/${rp}: 副本缺失`);
      continue;
    }
    const expected = rewrite(destName, rp, fs.readFileSync(path.join(srcRoot, rp), 'utf8'));
    const actual = fs.readFileSync(path.join(destRoot, rp), 'utf8');
    if (normalize(expected) !== normalize(actual)) {
      fail(`${destName}/${rp}: 内容与源头不一致（需重跑 sync-shared）`);
    }
  }
  for (const rp of destSet) {
    if (!srcSet.has(rp)) fail(`${destName}/${rp}: 副本多出源头没有的文件`);
  }
}

if (problems === 0) {
  console.log('shared 副本与源头一致 ✓');
  process.exit(0);
} else {
  console.error(`\nshared 副本漂移 ${problems} 处 —— 运行: npm run sync-shared`);
  process.exit(1);
}
