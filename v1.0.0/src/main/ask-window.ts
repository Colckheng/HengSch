import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

/** 小窗回答：complete=完成 / not-done=还没做 / cancel=ESC 或关闭（按还没做语义） */
export type AskAnswer = 'complete' | 'not-done' | 'cancel';

export interface AskPayload {
  todoId: string;
  message: string;
  detail: string;
}

const ASK_WIDTH = 380;
const ASK_HEIGHT = 250;

/** 串行队列保证同时至多一个小窗，此 resolver 对应当前小窗 */
let pendingResolve: ((answer: AskAnswer) => void) | null = null;
/** 当前存活的小窗（退出流程强制收尾用） */
let activeWindow: BrowserWindow | null = null;

ipcMain.handle('ask:answer', (_event, answer: AskAnswer) => {
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve(answer === 'complete' ? 'complete' : answer === 'not-done' ? 'not-done' : 'cancel');
  }
  return true;
});

/**
 * 呈现独立询问小窗（无边框、置顶、屏幕居中），等待用户回答。
 * 任何异常路径（加载失败 / 渲染进程崩溃 / 窗口被关）都按 cancel 结算，不阻塞队列。
 */
export function presentAskWindow(payload: AskPayload): Promise<AskAnswer> {
  return new Promise((resolve) => {
    let settled = false;
    let win: BrowserWindow | null = null; // 先声明：settle 可能在 win 赋值前（构造抛错）被调用
    const settle = (answer: AskAnswer): void => {
      if (settled) return;
      settled = true;
      pendingResolve = null;
      activeWindow = null;
      if (win && !win.isDestroyed()) win.destroy();
      resolve(answer);
    };
    pendingResolve = settle;

    // 相对鼠标所在屏幕居中（多显示器友好）
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;

    win = new BrowserWindow({
      width: ASK_WIDTH,
      height: ASK_HEIGHT,
      x: Math.round(area.x + (area.width - ASK_WIDTH) / 2),
      y: Math.round(area.y + (area.height - ASK_HEIGHT) / 2),
      title: 'HengSch · 进程结束',
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#FAFAF8',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'ask-preload.js')
      }
    });

    activeWindow = win;

    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) {
        win.show();
        win.focus();
      }
    });
    win.webContents.on('did-fail-load', () => settle('cancel'));
    win.webContents.on('render-process-gone', () => settle('cancel'));
    win.on('closed', () => settle('cancel'));

    if (!app.isPackaged) {
      void win.loadURL('http://localhost:5175/ask.html');
    } else {
      void win.loadFile(path.join(__dirname, '../ask.html'));
    }
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.send('ask:present', payload);
    });
  });
}

/**
 * 退出流程调用：当前小窗按 cancel 结算并销毁，不再阻塞 window-all-closed。
 * 与 monitor-service 的 cancelAskQueue 配对使用，保证 app.quit() 干净退出。
 */
export function abortAskWindows(): void {
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve('cancel'); // settle 内部会销毁小窗并按「还没做」语义收尾
  } else if (activeWindow && !activeWindow.isDestroyed()) {
    activeWindow.destroy();
  }
  activeWindow = null;
}
