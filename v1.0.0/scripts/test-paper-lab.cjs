const { buildSync } = require('esbuild');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, unlinkSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const temporary = mkdtempSync(path.join(tmpdir(), 'hengsch-paper-tests-'));
const outfile = path.join(temporary, 'gesture.test.cjs');
try {
  buildSync({ stdin: { contents: `import './src/paper-lab/gesture.test.ts'; import './src/main/reminder-command.test.ts'; import './src/main/ai-tools.test.ts'; import './src/main/ai-service.test.ts';`, resolveDir: path.join(__dirname, '..') }, outfile, bundle: true, platform: 'node' });
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  try { unlinkSync(outfile); } catch { /* Build may fail before producing the file. */ }
  rmdirSync(temporary);
}
