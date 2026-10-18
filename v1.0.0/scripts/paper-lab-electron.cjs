/* Isolated preview only: never imports the production main process or electron-store. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const smoke = process.argv.includes('--smoke');
const record = process.argv.includes('--record');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengsch-paper-lab-'));
app.setPath('userData', tempDirectory);
app.setName('HengSch Paper Lab');
app.on('window-all-closed', () => app.quit());
const evidenceDirectory = path.resolve(__dirname, '../../docs/evidence/paper-reminder-rebuild');
const checks = [];
const errors = [];
let win;
let held = false;
let stopRecording = async () => undefined;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = (code) => win.webContents.executeJavaScript(code, true);
const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); assert.ok(pass, name); };
async function waitFor(code, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await evaluate(code)) return; await wait(40); }
  throw new Error(`Condition timed out: ${code}`);
}
async function clickText(text) {
  const found = await evaluate(`(() => { const matches = [...document.querySelectorAll('button')].filter(el => el.textContent.trim() === ${JSON.stringify(text)}); if(matches.length !== 1) return matches.length; matches[0].click(); return 1; })()`);
  assert.equal(found, 1, `Unique button: ${text}`);
  await wait(60);
}
async function rect(selector) {
  return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, cx:r.x+r.width/2, cy:r.y+r.height/2 }; })()`);
}
async function mouse(type, x, y) {
  if (type === 'mouseDown') held = true;
  if (type === 'mouseUp') held = false;
  win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), modifiers: held ? ['leftButtonDown'] : [], ...(type !== 'mouseMove' ? { button: 'left', clickCount: 1 } : {}) });
  await wait(25);
}
async function capture(name) {
  await wait(100); // Allow Chromium to present the DOM state being captured.
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, `${name}.png`), (await win.webContents.capturePage()).toPNG());
}
async function recordScene() {
  if (!record) return async () => undefined;
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '15', '-vcodec', 'png', '-i', 'pipe:0', '-an', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(evidenceDirectory, 'paper-interaction.mp4')], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let encoderError = '';
  encoder.stderr.on('data', (chunk) => { encoderError += chunk.toString(); });
  const closed = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('close', (code) => code === 0 ? resolve() : reject(new Error(encoderError))); });
  let inFlight = Promise.resolve();
  let capturing = false;
  const timer = setInterval(() => {
    if (capturing || encoder.stdin.destroyed) return;
    capturing = true;
    inFlight = win.webContents.capturePage().then((frame) => {
      if (!encoder.stdin.destroyed) encoder.stdin.write(frame.toPNG());
    }).finally(() => { capturing = false; });
  }, 1000 / 15);
  return async () => { clearInterval(timer); await inFlight; encoder.stdin.end(); await closed; };
}
async function reset() { await clickText('↺ 再试一次'); await waitFor(`document.querySelectorAll('.paper-object').length === 1 && document.querySelector('.paper-object').dataset.phase === 'paper'`); }
async function openDetails() { await evaluate(`document.querySelector('.paper-object').click()`); await waitFor(`!!document.querySelector('[role="dialog"]')`); }
async function makeBall() { await openDetails(); await clickText('揉成纸团 ↗'); await waitFor(`document.querySelector('.paper-object')?.dataset.phase === 'ball'`); await wait(250); }

async function runSmoke() {
  win.show(); win.focus();
  await wait(200);
  await waitFor(`document.querySelectorAll('.paper-object').length === 1`);
  await evaluate('document.fonts.ready');
  // Capture the full animation deliberately, independent of the host OS preference.
  await evaluate(`if (document.querySelectorAll('.lab-options input')[0].checked) document.querySelectorAll('.lab-options input')[0].click()`);
  await capture('01-paper');
  check('isolated runtime, no production bridge', await evaluate(`typeof window.electronAPI === 'undefined' && typeof window.paperApi === 'undefined'`));
  check('paper canvas has rendered pixels', await evaluate(`document.querySelector('canvas').getContext('2d').getImageData(368,268,1,1).data[3] > 0`));
  const initial = await rect('.paper-object');
  await mouse('mouseMove', initial.cx, initial.cy);
  await mouse('mouseDown', initial.cx, initial.cy);
  await mouse('mouseUp', initial.cx, initial.cy);
  await waitFor(`!!document.querySelector('[role="dialog"]')`);
  check('Electron input opens details', true);
  await capture('02-detail');
  await clickText('稍后提醒');
  await waitFor(`!!document.querySelector('input[type="datetime-local"]')`);
  await clickText('确定时间');
  check('invalid custom date stays open with error', await evaluate(`document.querySelector('[role="alert"]').textContent.includes('有效时间')`));
  await capture('03-snooze');
  await clickText('10 分钟后');
  await waitFor(`document.querySelectorAll('.paper-object').length === 0`);
  check('snooze records selected time', await evaluate(`document.querySelector('.event-list').textContent.includes('稍后提醒已设为')`));

  await reset();
  const start = await rect('.paper-object');
  await mouse('mouseMove', start.cx, start.cy);
  await mouse('mouseDown', start.cx, start.cy);
  await mouse('mouseMove', start.cx + 90, start.cy + 20);
  await mouse('mouseUp', start.cx + 90, start.cy + 20);
  check('quick drag moves without details or crumpling', await evaluate(`!document.querySelector('[role="dialog"]') && document.querySelector('.paper-object').dataset.progress === '0.000'`));
  const moved = await rect('.paper-object');
  check('quick drag changed position', moved.cx > start.cx + 30);

  await reset();
  const paper = await rect('.paper-object');
  await mouse('mouseMove', paper.cx, paper.cy);
  await mouse('mouseDown', paper.cx, paper.cy);
  await wait(400);
  check('native long hold enters crumpling', await evaluate(`document.querySelector('.paper-object').dataset.phase === 'crumpling'`));
  await mouse('mouseMove', paper.cx + 80, paper.cy);
  await mouse('mouseMove', paper.cx - 20, paper.cy);
  await wait(100);
  await capture('04-partial-crumple');
  await evaluate(`document.querySelector('.paper-object').dispatchEvent(new PointerEvent('pointercancel', { bubbles:true }))`);
  check('pointer cancellation restores paper without closing', await evaluate(`document.querySelector('.paper-object').dataset.phase === 'paper' && !document.querySelector('.event-list')`));
  await mouse('mouseUp', paper.cx - 20, paper.cy);

  // A synthetic cancel does not cancel Chromium's native input sequence. Reload
  // before the next native gesture so the test cannot leave that sequence active.
  await win.webContents.reload();
  await waitFor(`document.querySelectorAll('.paper-object').length === 1`);
  await evaluate(`if (document.querySelectorAll('.lab-options input')[0].checked) document.querySelectorAll('.lab-options input')[0].click()`);

  await reset();
  const rubStart = await rect('.paper-object');
  stopRecording = await recordScene();
  if (record) await wait(650);
  await mouse('mouseMove', rubStart.cx, rubStart.cy);
  await mouse('mouseDown', rubStart.cx, rubStart.cy);
  await wait(400);
  for (const dx of [90, 0, 90, 0, 90, 0]) { await mouse('mouseMove', rubStart.cx + dx, rubStart.cy); if (record) await wait(150); }
  check('native back-and-forth forms ball', await evaluate(`document.querySelector('.paper-object').dataset.phase === 'ball-moving'`));
  await mouse('mouseUp', rubStart.cx, rubStart.cy);
  await wait(180);
  check('release outside bin retains ball', await evaluate(`document.querySelector('.paper-object').dataset.phase === 'ball'`));
  await capture('05-ball');
  if (record) await wait(600);
  const sphere = await rect('.paper-object');
  const bin = await rect('.paper-bin');
  await mouse('mouseMove', sphere.cx, sphere.cy);
  await mouse('mouseDown', sphere.cx, sphere.cy);
  for (let step = 1; step <= 12; step += 1) await mouse('mouseMove', sphere.cx + (bin.cx - sphere.cx) * step / 12, sphere.cy + (bin.cy - sphere.cy) * step / 12);
  check('entering bin highlights without closing', await evaluate(`document.querySelector('.paper-bin').dataset.hot === 'true' && document.querySelectorAll('.paper-object').length === 1`));
  await capture('06-bin-hot');
  if (record) await wait(500);
  await mouse('mouseUp', bin.cx, bin.cy);
  await waitFor(`document.querySelectorAll('.paper-object').length === 0`);
  check('drop closes reminder but keeps task pending', await evaluate(`document.querySelector('.event-list').textContent.includes('仍未完成')`));
  await capture('07-discarded');
  if (record) await wait(600);
  await stopRecording();
  stopRecording = async () => undefined;

  await reset();
  await evaluate(`document.querySelector('details').open = true; document.querySelectorAll('.lab-options input')[1].click()`);
  await openDetails();
  await clickText('关闭本次提醒');
  await waitFor(`!!document.querySelector('[role="alert"]')`);
  check('failed save retains actionable reminder', await evaluate(`document.querySelectorAll('.paper-object').length === 1 && ![...document.querySelectorAll('button')].find(el => el.textContent === '关闭本次提醒').disabled`));
  await capture('08-failure');
  await clickText('关闭本次提醒');
  await waitFor(`document.querySelectorAll('.paper-object').length === 0`);
  check('retry after failure succeeds exactly once', await evaluate(`document.querySelectorAll('.event-list li').length === 1`));

  await reset(); await openDetails(); await clickText('✓ 完成待办');
  await waitFor(`document.querySelectorAll('.paper-object').length === 0`);
  check('complete action differs from dismissal', await evaluate(`document.querySelector('.event-list').textContent === '示例待办已完成'`));
  await reset(); await makeBall();
  await evaluate(`document.querySelector('.paper-object').focus()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await wait(100);
  check('keyboard unfolds parked ball', await evaluate(`document.querySelector('.paper-object').dataset.phase === 'paper'`));
  await evaluate(`if (!document.querySelectorAll('.lab-options input')[0].checked) document.querySelectorAll('.lab-options input')[0].click()`);
  await makeBall();
  check('reduced motion keeps ball interaction available', await evaluate(`document.querySelector('.lab').classList.contains('reduce-motion') && document.querySelector('.paper-object').dataset.phase === 'ball'`));
  await evaluate(`document.querySelectorAll('.lab-options input')[0].click()`);

  await reset(); await clickText('＋ 加一张纸'); await clickText('＋ 加一张纸');
  check('three samples have independent accessible objects', await evaluate(`document.querySelectorAll('.paper-object').length === 3 && new Set([...document.querySelectorAll('.paper-object')].map(el=>el.getAttribute('aria-label'))).size === 3`));
  check('initial paper rectangles never overlap', await evaluate(`(() => { const r=[...document.querySelectorAll('.paper-object')].map(el=>el.getBoundingClientRect()); return r.every((a,i)=>r.every((b,j)=>i===j || a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top)); })()`));
  await capture('09-multiple');
  await reset();
  win.setContentSize(680, 860);
  await wait(200);
  await openDetails(); await clickText('稍后提醒');
  check('narrow layout has no horizontal document overflow', await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
  check('custom time and buttons reachable in narrow detail', await evaluate(`(() => { const d=document.querySelector('.paper-detail'); return d.clientHeight > 200 && d.scrollHeight >= d.clientHeight && !!d.querySelector('input'); })()`));
  await capture('10-narrow');
  win.setContentSize(1280, 900);
  await reset();
  check('no renderer console errors', errors.length === 0);
}

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1280, height: 900, useContentSize: true, show: !smoke,
    title: 'HengSch · 纸片提醒体验原型', backgroundColor: '#f6f5ef',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.setMenuBarVisibility(false);
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await win.loadFile(path.resolve(__dirname, '../dist-paper-lab/paper-lab.html'));
    if (!smoke) return;
    await runSmoke();
    fs.writeFileSync(path.join(evidenceDirectory, 'prototype-smoke.json'), JSON.stringify({ at: new Date().toISOString(), electron: process.versions.electron, chrome: process.versions.chrome, checks, errors, scope: 'Isolated Electron prototype; no production persistence, OS click-through or mixed-DPI certification.' }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, passed: checks.filter((item) => item.pass).length, evidenceDirectory }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    await stopRecording().catch((recordError) => console.error(recordError));
    if (smoke) {
      await capture('failure-debug').catch(() => undefined);
      fs.writeFileSync(path.join(evidenceDirectory, 'prototype-smoke.json'), JSON.stringify({ checks, errors, failure: String(error) }, null, 2));
      app.exit(1);
    }
  }
});
