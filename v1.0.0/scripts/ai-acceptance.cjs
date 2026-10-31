/* §8.2/§8.3 手工剧本（CDP/真机项的可重复执行版）：
   隔离 userData + 已构建桌面产物 + 主进程全局 fetch 拦截为脚本化假 DeepSeek。
   只放行 api.deepseek.com，其余网络调用直接抛错。
   用法：先在桌面 workspace 执行 npm run build，再执行 npm run ai:acceptance。
   无显示环境可追加 -- --no-screenshots，报告会显式标注截图跳过。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const screenshotsSkipped = process.argv.includes('--no-screenshots');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengsch-ai-acceptance-'));
const configPath = path.join(directory, 'config.json');
app.on('window-all-closed', () => {});
// 终端等窗口遮挡会让 visibilityState=hidden → CSS 过渡冻结在 0ms → 抽屉永远"开不了"
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setPath('userData', directory);
process.env.HENG_SCH_BUILT = '1';
fs.writeFileSync(
  configPath,
  JSON.stringify({
    aiSettings: { apiKey: 'sk-test', model: 'deepseek-flash', monitorVerdictEnabled: false, promptLevel: 1 },
    todos: [],
    groups: [{ id: 'default', name: '未分类', color: '#999', createdAt: 1, updatedAt: 1 }],
    deviceId: 'acceptance-dev'
  })
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const rendererErrors = [];
let win;
const check = (name, pass) => {
  checks.push({ name, pass: Boolean(pass) });
  assert.ok(pass, name);
};
const evaluate = (code) => win.webContents.executeJavaScript(code, true);
async function until(code, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(code)) return;
    await wait(50);
  }
  throw new Error(`条件超时：${code}`);
}

// ---------- 假 DeepSeek ----------
function sse(object) {
  return `data: ${JSON.stringify(object)}\n`;
}
function sseResponse(parts, { delayMs = 0, firstDelayMs = null, signal = null } = {}) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader() {
        return {
          async read() {
            const delay = index === 0 && firstDelayMs !== null ? firstDelayMs : delayMs;
            if (delay) await wait(delay);
            if (signal && signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
            if (index >= parts.length) return { done: true, value: undefined };
            return { done: false, value: Buffer.from(parts[index++]) };
          }
        };
      }
    }
  };
}
function toolRoundParts(title) {
  const joined = [
    sse({ choices: [{ delta: { content: '好的，' } }] }),
    sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'create_todo', arguments: '{"title":' } }] } }] }),
    sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(title) + '}' } }] } }] }),
    'data: [DONE]\n'
  ].join('');
  return [joined.slice(0, 61), joined.slice(61, 140), joined.slice(140)];
}
function stageBatchParts(entries) {
  return [sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'batch_call', function: { name: 'stage_batch', arguments: JSON.stringify({ entries }) } }] } }] }), 'data: [DONE]\n'];
}
function textParts(content, lineCount = 1) {
  const parts = [];
  for (let i = 0; i < lineCount; i += 1) {
    parts.push(sse({ choices: [{ delta: { content: `${content}${i + 1}\n` } }] }));
  }
  parts.push('data: [DONE]\n');
  return parts;
}
const script = [];
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('api.deepseek.com')) throw new Error(`验收脚本发现意外网络请求：${url}`);
  const step = script.shift();
  if (!step) throw new Error('假 DeepSeek 脚本已耗尽（用例顺序与预期不符）');
  return step({ ...(init || {}) });
};

// electron-store 已打包进主进程，外部 require 得到另一份类；在加载前拦截真实原子落盘边界。
// 仅对本次隔离 config 注入失败，其余文件与正常写盘走原实现。
let failConfigCommit = false;
const nativeRenameSync = fs.renameSync;
fs.renameSync = (source, target) => {
  if (failConfigCommit && path.resolve(String(target)).toLowerCase() === configPath.toLowerCase()) {
    throw new Error('模拟批量写入失败');
  }
  return nativeRenameSync(source, target);
};

require(path.resolve(__dirname, '../dist/main/index.js'));
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => {
    if (level >= 3) rendererErrors.push(message);
  });
});

// ---------- 渲染层操作 ----------
async function setValue(selector, value, isTextarea = true) {
  const proto = isTextarea ? 'HTMLTextAreaElement' : 'HTMLInputElement';
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(window.${proto}.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(40);
}
async function sendChat(text) {
  await setValue('.ai-input textarea', text);
  await evaluate(`(() => {
    const el = document.querySelector('.ai-input textarea');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  })()`);
}
async function click(selector) {
  await until(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await wait(80);
}
const storeTodos = () => evaluate(`window.electronAPI.store.get('todos')`);

async function stageBatch(entries, message) {
  script.push((init) => sseResponse(stageBatchParts(entries), { signal: init.signal }));
  script.push((init) => sseResponse(textParts('已暂存，请在卡片中确认。'), { signal: init.signal }));
  await sendChat(message);
  await until(`!!document.querySelector('.ai-send') && !document.querySelector('.ai-stop')`);
}

async function createViaChat(title) {
  const beforeCount = (await storeTodos()).length;
  await stageBatch([{ summary: `新建${title}`, action: 'create', draft: { title } }], `新建：${title}`);
  await until(`document.querySelector('.ai-card[aria-label="新建确认卡"] input:not(:disabled)')?.value === ${JSON.stringify(title)}`);
  await click('.ai-card[aria-label="新建确认卡"] .button-primary:not(:disabled)');
  await until(`window.electronAPI.store.get('todos').then(todos => todos.length === ${beforeCount + 1})`);
}

const deleteEntries = (todos) => todos.map((todo) => ({ summary: `删除${todo.title}`, action: 'delete', draft: { todoId: todo.id } }));

async function run() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html'));
    if (win) break;
    await wait(100);
  }
  assert.ok(win, '主窗口未加载构建产物');
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.focus();
  await wait(200);
  // 本机开了系统"减少动画"（prefers-reduced-motion: reduce）会让角标脉冲/流式光标等动画失效，
  // 验收按普通用户环境走，用 CDP 模拟回 no-preference
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await until(`!!document.querySelector('.foot-ai')`, 20000);
  await evaluate('document.fonts.ready.then(() => true)');

  // ===== §8.2-1 发送 → 流式光标 → 忙碌反馈/停止 → 关抽屉 busy 角标 =====
  script.push((init) => sseResponse(textParts('回看片段', 120), { firstDelayMs: 400, delayMs: 15, signal: init.signal }));
  await click('.foot-ai');
  await until(`document.querySelector('.ai-drawer')?.classList.contains('open')`);
  await until(`document.activeElement?.getAttribute('aria-label') === 'AI 对话输入'`, 3000).catch(() => undefined);
  check('抽屉打开即聚焦输入框', await evaluate(`document.activeElement?.getAttribute('aria-label') === 'AI 对话输入'`));
  check('空态提示可见', await evaluate(`document.querySelector('.ai-empty')?.textContent.includes('READY')`));
  await sendChat('给我一段很长的说明');
  await until(`!!document.querySelector('.ai-skeleton')`, 2000);
  check('等待首包时显示骨架气泡', true);
  await until(`!!document.querySelector('.ai-stream')`, 2000);
  check('流式光标闪烁（ai-caret-blink）', await evaluate(`getComputedStyle(document.querySelector('.ai-stream'), '::after').animationName === 'ai-caret-blink'`));
  check('生成中发送按钮变停止', await evaluate(`!!document.querySelector('.ai-stop')`));
  await setValue('.ai-input textarea', '插一句话');
  await evaluate(`document.querySelector('.ai-input textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await until(`document.querySelector('.ai-notice')?.textContent.includes('正在生成中')`, 2000);
  check('生成中回车得到明确反馈且不打断', true);
  await click('[aria-label="关闭提示"]');
  await click('[aria-label="关闭 AI 抽屉"]');
  await until(`!!document.querySelector('.foot-ai-dot.busy')`);
  check('关抽屉时入口 busy 角标脉冲', await evaluate(`getComputedStyle(document.querySelector('.foot-ai-dot.busy')).animationName === 'foot-ai-pulse'`));
  await click('.foot-ai');
  await until(`!!document.querySelector('.ai-stop')`);
  await click('.ai-stop');
  await until(`!!document.querySelector('.ai-send')`, 6000);
  check('停止后回到可发送态', true);
  await until(`document.querySelector('.ai-notice')?.textContent.includes('已停止生成')`, 2000);
  check('停止得到「已停止生成」提示', true);
  await click('[aria-label="关闭提示"]');

  // ===== §8.2-1 长回复回看 → 浮标出现/回底 =====
  script.push((init) => sseResponse(textParts('超长回复内容段落', 100), { signal: init.signal }));
  await sendChat('再来一段超长回复');
  await until(`!!document.querySelector('.ai-send') && !document.querySelector('.ai-stop')`, 8000);
  check('长回复完成后保持吸底', await evaluate(`(() => { const m = document.querySelector('.ai-msgs'); return m.scrollHeight - m.scrollTop - m.clientHeight < 48; })()`));
  await evaluate(`(() => { const m = document.querySelector('.ai-msgs'); m.scrollTop = 0; m.dispatchEvent(new Event('scroll', { bubbles: true })); })()`);
  await until(`!!document.querySelector('.ai-jump')`, 2000);
  check('上翻出现「↓ 回到最新」浮标', true);
  await click('.ai-jump');
  check('浮标一键回到底部', await evaluate(`(() => { const m = document.querySelector('.ai-msgs'); return m.scrollHeight - m.scrollTop - m.clientHeight < 48 && !document.querySelector('.ai-jump'); })()`));

  // ===== §8.2-3 改要求：模式条可见可退、[流程] 只显原话、生成中 ask 禁用 =====
  script.push((init) => sseResponse(toolRoundParts('买牛奶'), { signal: init.signal }));
  script.push((init) => sseResponse([sse({ choices: [{ delta: { content: '已生成预览卡，去列表里确认。' } }] }) + 'data: [DONE]\n'], { signal: init.signal }));
  await sendChat('加个待办：买牛奶');
  await until(`!!document.querySelector('.ai-card')`, 6000);
  check('提案卡出现且待确认未锁', await evaluate(`(() => { const c = document.querySelector('.ai-card'); return c.textContent.includes('待确认') && !c.querySelector('input').disabled; })()`));
  const cancelledId = await evaluate(`window.electronAPI.ai.queueList().then(list => list.at(-1)?.id)`);
  await evaluate(`[...document.querySelectorAll('.ai-card-footer .button-secondary')].find(b => b.textContent.includes('取消')).click()`);
  await until(`!!document.querySelector('.ai-ask')`);
  check('取消后折叠成一行+问句行', await evaluate(`(() => { const c = [...document.querySelectorAll('.ai-card')].at(-1); return c.classList.contains('muted') && c.classList.contains('ai-card-mini') && !c.querySelector('input') && document.querySelector('.ai-ask')?.textContent.includes('这条怎么办'); })()`));
  await until(`window.electronAPI.ai.queueList().then(list => !list.some(p => p.id === ${JSON.stringify(cancelledId)}))`);
  check('取消同步移出主进程队列', true);
  await evaluate(`[...document.querySelectorAll('.ai-ask .button')].find(b => b.textContent.includes('改要求')).click()`);
  await until(`!!document.querySelector('.ai-amend-bar')`);
  check('改要求模式条可见并标注原卡', await evaluate(`document.querySelector('.ai-amend-bar').textContent.includes('买牛奶')`));
  await click('.ai-amend-exit');
  await until(`!document.querySelector('.ai-amend-bar')`);
  check('改要求模式条可退出', true);
  await evaluate(`[...document.querySelectorAll('.ai-ask .button')].find(b => b.textContent.includes('改要求')).click()`);
  await until(`!!document.querySelector('.ai-amend-bar')`);
  script.push((init) => sseResponse(toolRoundParts('买酸奶'), { signal: init.signal }));
  script.push((init) => sseResponse(textParts('新卡生成中', 8), { delayMs: 350, signal: init.signal }));
  await sendChat('改成买酸奶');
  await wait(150);
  check('生成中 ask 按钮全部禁用', await evaluate(`(() => { const bs = [...document.querySelectorAll('.ai-ask button')]; return bs.length >= 2 && bs.every(b => b.disabled); })()`));
  await until(`!!document.querySelector('.ai-send') && !document.querySelector('.ai-stop')`, 10000);
  await until(`document.querySelectorAll('.ai-card:not(.muted):not(.ok):not(.bad)').length === 1`);
  check('[流程] 气泡只显示原话', await evaluate(`(() => { const bodies = [...document.querySelectorAll('.ai-msg-me .ai-msg-body')]; const last = bodies.at(-1); return last && last.textContent === '改成买酸奶'; })()`));
  check('旧卡保留已取消态且 ask 行撤除', await evaluate(`document.querySelectorAll('.ai-card.muted').length === 1 && !document.querySelector('.ai-ask')`));

  // ===== §8.2-2 双击创建不翻红、终态控件锁死、状态色 =====
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.ai-card-footer .button-primary')].find(x => !x.disabled && x.textContent.includes('创建'));
    b.click(); b.click();
  })()`);
  await until(`!!document.querySelector('.ai-card.ok')`, 4000);
  let todos = await storeTodos();
  check('连点创建只产生一条待办', todos.length === 1 && todos[0].title === '买酸奶');
  check('终态卡折叠为一行（✓ 已创建、无输入无错误条）', await evaluate(`(() => {
    const c = document.querySelector('.ai-card.ok');
    return c && c.classList.contains('ai-card-mini') && c.textContent.includes('已创建')
      && !c.querySelector('input') && !c.querySelector('.ai-card-error');
  })()`));
  await evaluate(`document.querySelector('.ai-card.ok .ai-card-mini-line').click()`);
  await until(`!!document.querySelector('.ai-card.ok input')`);
  check('点开终态卡：输入/按钮全禁用且无错误条', await evaluate(`(() => {
    const c = document.querySelector('.ai-card.ok');
    return c.querySelector('input').disabled
      && [...c.querySelectorAll('.ai-card-footer button')].every(b => b.disabled) && !c.querySelector('.ai-card-error');
  })()`));
  await evaluate(`document.querySelector('.ai-card.ok .ai-card-fold').click()`);
  await until(`!!document.querySelector('.ai-card.ok.ai-card-mini')`);
  check('收起回到一行摘要', true);

  // ===== 第四态：数据已变化（stale）=====
  script.push((init) => sseResponse(toolRoundParts('第三件'), { signal: init.signal }));
  script.push((init) => sseResponse([sse({ choices: [{ delta: { content: '已生成预览卡。' } }] }) + 'data: [DONE]\n'], { signal: init.signal }));
  await sendChat('再加个待办：第三件');
  await until(`document.querySelectorAll('.ai-card:not(.muted):not(.ok):not(.bad)').length === 1`, 6000);
  await evaluate(`(async () => {
    const list = await window.electronAPI.ai.queueList();
    await window.electronAPI.ai.reject(list[0].id);
    return true;
  })()`);
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.ai-card-footer .button-primary')].find(x => !x.disabled && x.textContent.includes('创建'));
    b.click();
  })()`);
  await until(`!!document.querySelector('.ai-card.bad')`, 4000);
  check('过期卡：数据已变化 + bad 色 + 控件锁死', await evaluate(`(() => {
    const c = document.querySelector('.ai-card.bad');
    return c.textContent.includes('数据已变化') && c.querySelector('input').disabled;
  })()`));

  // ===== §8.2-4 关抽屉 pending 角标 → 重开自动聚焦+定位最新（含 D-4 合并不重复）=====
  script.push((init) => sseResponse(toolRoundParts('买纸巾'), { signal: init.signal }));
  script.push((init) => sseResponse([sse({ choices: [{ delta: { content: '已生成预览卡。' } }] }) + 'data: [DONE]\n'], { signal: init.signal }));
  await sendChat('第四件：买纸巾');
  await until(`document.querySelectorAll('.ai-card:not(.muted):not(.ok):not(.bad)').length === 1`, 6000);
  check('四态状态色齐备（待确认/已创建/已取消/数据已变化）', await evaluate(`new Set([...document.querySelectorAll('.ai-card-status')].map(s => s.textContent.trim())).size >= 4`));
  await click('[aria-label="关闭 AI 抽屉"]');
  await until(`document.querySelector('.foot-ai-dot.pending')?.textContent.trim() === '1'`);
  check('关抽屉入口 pending 角标计数', true);
  await click('.foot-ai');
  await until(`document.querySelector('.ai-drawer')?.classList.contains('open')`);
  check('重开自动聚焦', await evaluate(`document.activeElement?.getAttribute('aria-label') === 'AI 对话输入'`));
  check('重开定位到最新（底部）', await evaluate(`(() => { const m = document.querySelector('.ai-msgs'); return m.scrollHeight - m.scrollTop - m.clientHeight < 48; })()`));
  check('D-4 队列恢复合并不产生重复卡', await evaluate(`document.querySelectorAll('.ai-card:not(.muted):not(.ok):not(.bad)').length === 1`));

  // ===== B-1a 重载恢复：对话文字/终态卡本地持久化、pending 卡走主进程队列 =====
  await win.webContents.reload();
  await wait(1500);
  await until(`!!document.querySelector('.app-container')`, 8000);
  await click('.foot-ai');
  await until(`document.querySelector('.ai-drawer')?.classList.contains('open')`);
  await wait(300);
  check('重载后对话文字恢复', await evaluate(`document.querySelectorAll('.ai-msg-me').length > 0 && [...document.querySelectorAll('.ai-msg-me .ai-msg-body')].some(el => el.textContent.includes('改成买酸奶'))`));
  check('重载后终态卡折叠行恢复', await evaluate(`document.querySelectorAll('.ai-card.ai-card-mini').length >= 2`));
  check('重载后 pending 卡经队列恢复不重复', await evaluate(`document.querySelectorAll('.ai-card:not(.muted):not(.ok):not(.bad)').length === 1`));

  // ===== B-2 合并删除：部分勾选、写盘失败重试、混合批次接续 =====
  // 先确认恢复的纸巾卡，清空 D-2 未决闸门；所有数据均通过隔离应用的真实入口创建。
  await click('.ai-card[aria-label="新建确认卡"] .button-primary:not(:disabled)');
  await until(`window.electronAPI.ai.queueList().then(list => list.length === 0)`);
  await createViaChat('买咖啡');
  todos = await storeTodos();
  const retained = todos.find((todo) => todo.title === '买纸巾' && !todo.deleted);
  assert.ok(retained);
  const targets = [retained, ...todos.filter((todo) => !todo.deleted && todo.id !== retained.id)];
  assert.equal(targets.length, 3);
  await stageBatch([
    ...deleteEntries(targets),
    { summary: '删除后继续新建', action: 'create', draft: { title: '删除后的接续任务' } }
  ], '删除这三条，然后新建一条接续任务');
  const deleteCard = '.ai-card-delete:not(.ok):not(.muted)';
  const deleteList = `${deleteCard} .ai-group-list`;
  await until(`document.querySelectorAll('${deleteList} input').length === 3`);
  check('三条删除合并为一张清单卡且默认全选', await evaluate(`document.querySelectorAll('${deleteCard}').length === 1 && document.querySelectorAll('${deleteList} input:checked').length === 3`));
  await click(`${deleteList} input`);
  await until(`document.querySelectorAll('${deleteList} input:checked').length === 2`);
  if (!screenshotsSkipped) fs.writeFileSync(path.join(directory, 'batch-delete-preview.png'), (await win.webContents.capturePage()).toPNG());
  const beforeDelete = JSON.stringify(await storeTodos());
  await click(`${deleteCard} .button-primary`);
  check('首次点击删除仅进入确认，未写入待办', JSON.stringify(await storeTodos()) === beforeDelete);

  failConfigCommit = true;
  try {
    await click(`${deleteCard} .ai-card-danger`);
    await until(`document.querySelector('${deleteCard} .ai-card-error')?.textContent.includes('模拟批量写入失败')`);
    check('写盘失败整组和勾选保留，待办与队列均未部分提交',
      JSON.stringify(await storeTodos()) === beforeDelete
      && (await evaluate(`window.electronAPI.ai.queueList()`)).length === 4
      && await evaluate(`document.querySelectorAll('${deleteList} input').length === 3 && document.querySelectorAll('${deleteList} input:checked').length === 2 && !document.querySelector('${deleteList} input').checked`));
  } finally {
    failConfigCommit = false;
  }
  await evaluate(`(() => { const button = document.querySelector('${deleteCard} .ai-card-danger'); button.click(); button.click(); })()`);
  await until(`document.querySelector('.ai-card[aria-label="新建确认卡"] input:not(:disabled)')?.value === '删除后的接续任务'`);
  todos = await storeTodos();
  check('重试连点只删除勾选项，未勾首条完整保留',
    JSON.stringify(todos.find((todo) => todo.id === retained.id)) === JSON.stringify(retained)
    && targets.slice(1).every((target) => {
      const saved = todos.find((todo) => todo.id === target.id);
      return saved?.deleted === true && saved.updatedAt > target.updatedAt && saved.deviceId === 'acceptance-dev';
    })
    && todos.length === targets.length);
  check('删除整组后下一张非删除卡接续出现', (await evaluate(`window.electronAPI.ai.queueList()`)).length === 1);
  check('折叠摘要只列实际删除项并显示数量', await evaluate(`(() => {
    const card = [...document.querySelectorAll('.ai-card-mini.ok')].find(c => c.textContent.includes('已删除'));
    return card?.textContent.includes('×2') && !card.querySelector('.ai-card-mini-title').textContent.includes('买纸巾');
  })()`));
  await evaluate(`[...document.querySelectorAll('.ai-card-mini.ok')].find(c => c.textContent.includes('已删除')).querySelector('button').click()`);
  await until(`!!document.querySelector('[aria-label="批量删除回看"]')`);
  check('展开回看逐条区分已删除与保留且不可编辑', await evaluate(`(() => {
    const list = document.querySelector('[aria-label="批量删除回看"]');
    return JSON.stringify([...list.querySelectorAll('.ai-group-meta')].map(el => el.textContent)) === JSON.stringify(['保留', '已删除', '已删除']) && !list.querySelector('input');
  })()`));
  await evaluate(`document.querySelector('[aria-label="批量删除回看"]').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await wait(350);
  if (!screenshotsSkipped) fs.writeFileSync(path.join(directory, 'batch-delete-result.png'), (await win.webContents.capturePage()).toPNG());
  await click('.ai-card-delete.ok .ai-card-fold');
  await click('.ai-card[aria-label="新建确认卡"] .button-primary:not(:disabled)');
  await until(`window.electronAPI.ai.queueList().then(list => list.length === 0)`);
  check('混合批次接续完成后收尾计数正确', await evaluate(`[...document.querySelectorAll('.ai-sys')].at(-1)?.textContent === '完成 6 · 跳过 1'`));

  // ===== B-2 全选三条：一次落定并清空队列 =====
  await createViaChat('买茶叶');
  const allTargets = (await storeTodos()).filter((todo) => !todo.deleted);
  assert.equal(allTargets.length, 3);
  await stageBatch(deleteEntries(allTargets), '把这三条都删掉');
  await until(`document.querySelectorAll('${deleteList} input:checked').length === 3`);
  await click(`${deleteCard} .button-primary`);
  await click(`${deleteCard} .ai-card-danger`);
  await until(`window.electronAPI.ai.queueList().then(list => list.length === 0)`);
  check('三条全选一次落墓碑，队列清空并输出收尾行',
    (await storeTodos()).every((todo) => todo.deleted)
    && await evaluate(`[...document.querySelectorAll('.ai-sys')].at(-1)?.textContent === '完成 10 · 跳过 1'`));

  // ===== B-2 全不选/过期：跳过全部零写入，仍释放下一张卡 =====
  for (const title of ['保留任务', '同名待办', '同名待办']) await createViaChat(title);
  const skipTargets = (await storeTodos()).filter((todo) => !todo.deleted);
  const beforeSkip = JSON.stringify(await storeTodos());
  await stageBatch([
    ...deleteEntries(skipTargets),
    { summary: '跳过后继续新建', action: 'create', draft: { title: '跳过后的接续任务' } }
  ], '删除这三条，然后新建下一条');
  await until(`document.querySelectorAll('${deleteList} input').length === 3`);
  await evaluate(`document.querySelectorAll('${deleteList} input').forEach(input => input.click())`);
  await until(`document.querySelectorAll('${deleteList} input:checked').length === 0`);
  check('全不选时删除禁用，跳过全部仍可用', await evaluate(`document.querySelector('${deleteCard} .button-primary').disabled && !document.querySelector('${deleteCard} .button-secondary').disabled`));
  await click(`${deleteList} input`);
  await evaluate(`(async () => { const list = await window.electronAPI.ai.queueList(); await window.electronAPI.ai.reject(list[0].id); })()`);
  await click(`${deleteCard} .button-primary`);
  await click(`${deleteCard} .ai-card-danger`);
  await until(`document.querySelector('${deleteCard} .ai-card-error')?.textContent.includes('过期')`);
  check('过期失败保留整张清单并允许跳过', await evaluate(`document.querySelectorAll('${deleteList} input').length === 3 && document.querySelector('${deleteCard} .ai-card-danger').disabled && !document.querySelector('${deleteCard} .button-secondary').disabled`));
  await click(`${deleteCard} .button-secondary`);
  await until(`document.querySelector('.ai-card[aria-label="新建确认卡"] input:not(:disabled)')?.value === '跳过后的接续任务'`);
  check('跳过全部保留待办原样，清掉删除组并接续下一张',
    JSON.stringify(await storeTodos()) === beforeSkip
    && (await evaluate(`window.electronAPI.ai.queueList()`)).length === 1
    && await evaluate(`!document.querySelector('.ai-ask') && [...document.querySelectorAll('.ai-card-mini.muted')].some(c => c.textContent.includes('已跳过'))`));

  // ===== §8.2-2 错误条可关/可重试 =====
  script.push(() => ({ ok: false, status: 401, text: async () => 'invalid api key' }));
  await sendChat('随便回点什么');
  await until(`!!document.querySelector('.ai-err')`, 6000);
  check('错误条出现且可重试/可关', await evaluate(`(() => {
    const e = document.querySelector('.ai-err');
    return e.getAttribute('role') === 'alert' && e.textContent.includes('无效')
      && [...e.querySelectorAll('.ai-notice-btn')].some(b => b.textContent.includes('重试'));
  })()`));
  script.push((init) => sseResponse(textParts('恢复了，继续吧', 2), { signal: init.signal }));
  await evaluate(`[...document.querySelectorAll('.ai-notice-btn')].find(b => b.textContent.includes('重试')).click()`);
  await until(`!document.querySelector('.ai-err') && [...document.querySelectorAll('.ai-msg-ai .ai-msg-body')].some(el => el.textContent.includes('恢复了'))`, 8000);
  check('重试后成功且错误条消失', true);
  script.push(() => ({ ok: false, status: 401, text: async () => 'invalid api key' }));
  await sendChat('再错一次');
  await until(`!!document.querySelector('.ai-err')`, 6000);
  await click('[aria-label="关闭提示"]');
  await until(`!document.querySelector('.ai-err')`);
  check('错误条 ✕ 可直接关闭', true);

  // ===== §8.2-4 新会话：清空对话与终态卡，只保留待确认卡 =====
  const pendingBefore = await evaluate(`document.querySelectorAll('.ai-card:not(.muted):not(.ok):not(.bad)').length`);
  await click('[aria-label="新会话"]');
  await until(`document.querySelectorAll('.ai-msg-me,.ai-msg-ai').length === 0`);
  check('新会话清空对话与终态卡，只保留待确认卡', (await evaluate(`document.querySelectorAll('.ai-card').length`)) === pendingBefore);
  await click('[aria-label="关闭 AI 抽屉"]');

  // ===== §8.2-5 循环待办：下次提醒提示 + nextDueDate =====
  await click('.footer-add');
  await until(`!!document.querySelector('.modal-overlay')`);
  await setValue('#title', '循环回归任务', false);
  await click('#type-select');
  await until(`!!document.querySelector('.group-select-menu')`);
  await evaluate(`[...document.querySelectorAll('.group-select-menu .group-select-option')].find(b => b.textContent.includes('循环')).click()`);
  await until(`!document.querySelector('.group-select-menu') && !!document.querySelector('#cycle-select')`);
  await evaluate(`[...document.querySelector('.modal-overlay').querySelectorAll('label.monitor-toggle')].find(l => l.textContent.includes('到点提醒')).querySelector('input').click()`);
  await until(`!!document.querySelector('.reminder-next')`);
  check('循环+到点提醒显示「下次提醒」提示', await evaluate(`/今天|明天/.test(document.querySelector('.reminder-next').textContent)`));
  await evaluate(`[...document.querySelectorAll('.modal-footer .button-primary')].find(b => b.textContent.includes('添加')).click()`);
  await until(`!document.querySelector('.modal-overlay')`);
  todos = await storeTodos();
  const added = todos.find((t) => t.title === '循环回归任务');
  check('循环待办落库含 nextDueDate', Boolean(added) && added.type === 'recurring' && typeof added.nextDueDate === 'number' && added.nextDueDate > Date.now() - 60000 && added.nextDueDate < Date.now() + 26 * 3600000);

  // ===== §8.3 回归：Add 弹窗 Esc 直接关 =====
  await click('.footer-add');
  await until(`!!document.querySelector('.modal-overlay')`);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await until(`!document.querySelector('.modal-overlay')`);
  check('Esc 关闭添加弹窗', true);

  // ===== §8.3 回归：U-9 外点先关时间面板、再点才关弹窗 =====
  await click('.footer-add');
  await until(`!!document.querySelector('.modal-overlay')`);
  await evaluate(`[...document.querySelector('.modal-overlay').querySelectorAll('label.monitor-toggle')].find(l => l.textContent.includes('到点提醒')).querySelector('input').click()`);
  await until(`!!document.querySelector('.tp-trigger')`);
  await click('.tp-trigger');
  await until(`!!document.querySelector('.tp-panel')`);
  await evaluate(`(() => {
    const overlay = document.querySelector('.modal-overlay');
    overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await until(`!document.querySelector('.tp-panel')`);
  check('外点第一下只关时间面板、弹窗保留', await evaluate(`!!document.querySelector('.modal-overlay')`));
  await wait(350);
  await evaluate(`document.querySelector('.modal-overlay').click()`);
  await until(`!document.querySelector('.modal-overlay')`);
  check('外点第二下关闭弹窗', true);

  // ===== §8.3 回归：提醒设置面板开合 =====
  await click('.foot-reminder');
  await until(`!!document.querySelector('.modal-overlay')`);
  check('提醒设置面板可打开', true);
  await evaluate(`(() => {
    const b = document.querySelector('.modal-overlay .modal-close');
    if (b) b.click();
    else document.querySelector('.modal-overlay').click();
  })()`);
  await until(`!document.querySelector('.modal-overlay')`);
  check('提醒设置面板可关闭', true);

  check('渲染层无 console 错误', rendererErrors.length === 0);

  const report = { at: new Date().toISOString(), electron: process.versions.electron, checks, rendererErrors, screenshotsSkipped, store: directory };
  console.log(JSON.stringify({ passed: checks.filter((c) => c.pass).length, total: checks.length, rendererErrors, screenshotsSkipped }, null, 2));
  fs.writeFileSync(path.join(directory, 'acceptance-report.json'), JSON.stringify(report, null, 2));
  console.log(`report: ${path.join(directory, 'acceptance-report.json')}`);
}

app.whenReady().then(() => {
  run()
    .then(() => app.exit(0))
    .catch(async (error) => {
      let active = 'unavailable';
      let uiState = null;
      try {
        if (win) {
          active = await win.webContents.executeJavaScript(`document.activeElement ? document.activeElement.tagName + '[' + (document.activeElement.getAttribute('aria-label') || document.activeElement.className || '') + ']' : 'none'`, true);
          uiState = await evaluate(`({
            notice: document.querySelector('.ai-err,.ai-notice')?.textContent,
            busy: !!document.querySelector('.ai-stop'),
            stream: document.querySelector('.ai-stream')?.textContent,
            latestReply: [...document.querySelectorAll('.ai-msg-ai .ai-msg-body')].at(-1)?.textContent,
            cards: [...document.querySelectorAll('.ai-card-status')].map(el => el.textContent)
          })`);
          if (!screenshotsSkipped) fs.writeFileSync(path.join(directory, 'failure.png'), (await win.webContents.capturePage()).toPNG());
        }
      } catch { /* window may be gone */ }
      console.error(`ai-acceptance FAILED: ${error.message} | activeElement=${active}`);
      console.error(`uiState: ${JSON.stringify(uiState)} | report: ${path.join(directory, 'acceptance-report.json')}`);
      try {
        fs.writeFileSync(path.join(directory, 'acceptance-report.json'), JSON.stringify({ failure: String(error), checks, rendererErrors, uiState, screenshotsSkipped }, null, 2));
      } catch { /* ignore */ }
      app.exit(1);
    });
});
