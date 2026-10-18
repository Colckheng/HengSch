import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import type { ReminderPaper, ReminderCommand, HitRegion } from '../paper-reminder/protocol';
export type PaperPayload = ReminderPaper;
export type PaperAction = ReminderCommand;
let win: BrowserWindow | null = null;
const papers = new Map<string, ReminderPaper>();
const committed = new Set<string>();
const previews = new Set<string>();
let actionHandler: (action: PaperAction) => void = () => undefined;
let resolvedHandler: (id: string) => void = () => undefined;
let poll: ReturnType<typeof setInterval> | undefined;
let regions: HitRegion[] = [];
let captured = false;
let ignoring = true;
const key = (p: ReminderPaper | ReminderCommand): string => JSON.stringify([p.todoId, p.remindAt]);
function broadcast(): void { if (win && !win.isDestroyed()) win.webContents.send('reminder-paper:papers', [...papers.values()]); }
function ensureWindow(): boolean {
  if (win && !win.isDestroyed()) return true;
  try {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const window = new BrowserWindow({ ...area, frame: false, transparent: true, resizable: false, movable: false,
      minimizable: false, maximizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'paper-preload.js') } });
    win = window; ignoring = true; regions = []; captured = false;
    window.setIgnoreMouseEvents(true, { forward: true });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('blur', () => { captured = false; });
    window.webContents.on('render-process-gone', () => window.destroy());
    window.webContents.on('did-fail-load', () => window.destroy());
    window.on('closed', () => {
      if (win !== window) return;
      win = null; clearInterval(poll); poll = undefined;
      const ids = [...papers.keys()]; papers.clear(); committed.clear(); previews.clear();
      for (const id of ids) resolvedHandler(id);
    });
    const adjust = (): void => { if (!window.isDestroyed()) window.setBounds(screen.getDisplayNearestPoint(window.getBounds()).workArea); };
    screen.on('display-metrics-changed', adjust); screen.on('display-removed', adjust);
    window.once('closed', () => { screen.removeListener('display-metrics-changed', adjust); screen.removeListener('display-removed', adjust); });
    poll = setInterval(() => {
      if (window.isDestroyed()) return;
      const cursor = screen.getCursorScreenPoint(); const area = window.getBounds();
      const x = cursor.x - area.x; const y = cursor.y - area.y;
      const next = !captured && !regions.some(r => x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height);
      if (next !== ignoring) { ignoring = next; window.setIgnoreMouseEvents(next, { forward: true }); }
    }, 16);
    const loading = app.isPackaged || process.env.HENG_SCH_REMINDER_BUILT === '1'
      ? window.loadFile(path.join(__dirname, '../paper.html'))
      : window.loadURL('http://localhost:5175/paper.html');
    void loading.catch(() => { if (!window.isDestroyed()) window.destroy(); });
    return true;
  } catch { return false; }
}
const authorized = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean => !!win && event.sender === win.webContents;
ipcMain.handle('reminder-paper:ready', event => {
  if (!authorized(event)) throw new Error('Unauthorized');
  win?.setAlwaysOnTop(true, 'screen-saver');
  win?.showInactive(); return [...papers.values()];
});
ipcMain.on('reminder-paper:regions', (event, next: HitRegion[], held: boolean) => {
  if (!authorized(event) || !Array.isArray(next)) return;
  regions = next.slice(0, 20).filter(r => r && [r.x,r.y,r.width,r.height].every(Number.isFinite) && r.width > 0 && r.height > 0);
  captured = held === true;
});
ipcMain.handle('reminder-paper:action', (event, action: PaperAction) => {
  if (!authorized(event) || !action) throw new Error('Unauthorized');
  const paper = papers.get(action.todoId);
  if (!paper || paper.remindAt !== action.remindAt) throw new Error('Stale reminder');
  if (committed.has(key(action))) return;
  if (!previews.has(action.todoId)) actionHandler(action); // Acknowledge only after durable save.
  committed.add(key(action));
});
ipcMain.handle('reminder-paper:resolved', (event, todoId: string, remindAt: number) => {
  if (!authorized(event)) return;
  const paper = papers.get(todoId);
  if (paper?.remindAt === remindAt && committed.has(key(paper))) {
    // Let invoke deliver its acknowledgement before destroying its sender.
    setTimeout(() => { if (papers.get(todoId) === paper) removePaper(todoId); }, 20);
  }
});
export function removePaper(todoId: string): void {
  const paper = papers.get(todoId); if (!paper) return;
  papers.delete(todoId); previews.delete(todoId); committed.delete(key(paper)); broadcast(); resolvedHandler(todoId);
  if (!papers.size && win) { const window = win; window.destroy(); }
}
export function onPaperAction(callback: (action: PaperAction) => void): void { actionHandler = callback; }
export function onPaperResolved(callback: (id: string) => void): void { resolvedHandler = callback; }
export function presentPaper(payload: PaperPayload): boolean {
  if (!ensureWindow()) return false;
  papers.set(payload.todoId, payload); broadcast(); return true;
}
export function paperCapacity(): number {
  const area = win?.getBounds() ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return area.width >= 740 && area.height >= 760 ? 3 : area.width >= 740 ? 2 : 1;
}
export function stopPaperWindow(): void {
  clearInterval(poll); poll = undefined; papers.clear(); committed.clear();
  win?.destroy(); win = null;
}

const PREVIEW_SAMPLES = [
  { title: '试试新的纸片提醒', description: '长按纸片后任意移动鼠标即可揉成纸团，拖进纸篓只关闭这次提醒。', group: '提醒试用' },
  { title: '把季度报销单交给财务', description: '发票按时间顺序排好，附上审批截图。', group: '工作' },
  { title: '给妈妈打个电话', description: '问问她周末要不要过来吃饭。', group: '生活' },
  { title: '把本周周报发给组长', description: '附上三个项目的进度和风险。', group: '工作' },
  { title: '预约牙科复诊', description: '上次医生说三个月后复查。', group: '生活' }
];

export function previewPaper(): boolean {
  const shown = [...papers.keys()].filter(id => id.startsWith('__paper-preview'));
  if (shown.length >= PREVIEW_SAMPLES.length) return false;
  let n = 1;
  while (papers.has(`__paper-preview-${n}__`)) n += 1;
  const todoId = `__paper-preview-${n}__`;
  const sample = PREVIEW_SAMPLES[(n - 1) % PREVIEW_SAMPLES.length];
  previews.add(todoId);
  return presentPaper({ todoId, title: sample.title, description: sample.description, remindAt: Date.now() + (n - 1) * 60_000, group: sample.group, color: '#E63329' });
}
