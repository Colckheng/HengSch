import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import Store from 'electron-store';
import { setAutoStart, getAutoStart, healAutoStart } from './auto-start';
import { abortAskWindows } from './ask-window';
import { getAppIcon } from './app-icon';
import {
  initMonitorService,
  configureMonitor,
  listProcessDisplayNames,
  getTodayProgress,
  setJournalEnabled,
  getJournalEnabled,
  stopMonitorService,
  cancelAskQueue,
  type MonitorEntry
} from './monitor-service';
import {
  initSyncService,
  runCycle,
  testConnection,
  configureSync,
  getSyncConfig,
  getSyncStatus,
  stopSyncService
} from './sync-service';
import { initReminderService, stopReminderService, listOpenReminders, runReminderAction } from './reminder-service';
import { initAiService, runAiChat, cancelAiChat, commitProposal, rejectProposal, maskedAiSettings, writeAiSettings, testAiConnection, type AiChatMessage, type AiSettings } from './ai-service';
import { previewPaper } from './paper-window';
import { mergeSyncStates } from '@hengsch/shared-logic';
import type { Todo, Group } from '@hengsch/shared-types';
import type { SyncConfig, SyncPayload } from '@hengsch/shared-types';
import { createTray } from './tray';

const store = new Store();

// dev 调试入口：HENG_SCH_DEBUG=1 时开放 CDP（9223），供截图/验收脚本连入；打包版不生效
if (!app.isPackaged && process.env.HENG_SCH_DEBUG === '1') {
  app.commandLine.appendSwitch('remote-debugging-port', '9223');
}
let mainWindow: BrowserWindow | null = null;
let originalBounds: { width: number; height: number; x?: number; y?: number } | null = null;
/** 退出流程标志：置位后才允许主窗口真正销毁（否则关闭 = 隐藏到托盘） */
let isQuitting = false;

// 单实例锁：重复双击不再起第二个进程（两个实例会各自轮询弹窗）；第二个启动请求聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  // 用 exit 而非 quit：quit 异步，之后模块顶层仍会继续执行并注册 whenReady（第二实例可能仍建窗/起轮询）
  app.exit(0);
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

type SnappedEdge = 'left' | 'right' | 'top' | 'bottom' | null;

const AUTO_HIDE_ENABLED_KEY = 'autoHideEnabled';
const AUTO_HIDE_IDLE_MS_KEY = 'autoHideIdleMs';

const SNAP_THRESHOLD_PX = 16;
const HIDE_PEEK_PX = 4;
// 鼠标靠近边缘的“触发带宽”，用于提升缩入后悬停弹出的稳定性
// 这里不要太大，否则在角落/边缘移动鼠标时容易导致“刚缩入就弹出/循环缩入弹出”
const REVEAL_HOVER_PX = 6;
// 触发区域沿着边缘方向的容错，避免必须精准对准缩入前窗口的那一段
// 注意：这个值不要太大，否则在角落/边缘移动鼠标时容易导致误判
// 进一步减小到8px，确保只在窗口实际位置附近才触发
const REVEAL_ALONG_EDGE_SLOP_PX = 8;
// 小窗尺寸上限：防止拖成比正常窗口还大
const COMPACT_MAX_W = 640;
const COMPACT_MAX_H = 560;
let isCompactMode = false;
let snappedEdge: SnappedEdge = null;
let isHidden = false;
let lastShownBounds: Electron.Rectangle | null = null;
let moveEndDebounceTimer: NodeJS.Timeout | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let hoverPollTimer: NodeJS.Timeout | null = null;
let animTimer: NodeJS.Timeout | null = null;
let hoverWasHit = false;
let hoverStartBlockedUntil = 0;
// 自缩入/弹出转换后是否发生过新的用户活动：
// 弹出后若用户没有再活动（鼠标静止），不允许再次自动缩入——杜绝"弹出→闲置→缩入→悬停→弹出"死循环
let activitySinceTransition = true;
// 缩入完成时的光标位置：窗口在静止光标下移开时 Chromium 会合成 mousemove，
// 光标真实位移小于阈值时忽略 userActivity 的自动弹出，防止"缩入→立马弹出"循环
let cursorAtHideX = 0;
let cursorAtHideY = 0;
const REAL_MOVE_PX = 12;
// 缩入/弹出动画时长（与 hideToEdge/showFromEdge 内的 durationMs 一致）
const ANIM_DURATION_MS = 180;
// 动画结束后继续屏蔽 move/resize 自触发的宽限期（毫秒）。
// Windows 上 setBounds/setResizable 会产生 WM_MOVE，Electron 异步派发，
// 若在 isHidden 翻转后才送达，会触发 move 处理器里的 showFromEdge——
// 造成"缩入后立马被自己弹出"的死循环。宽限期内 move/resize 一律不处理。
const MOVE_SUPPRESS_GRACE_MS = 400;
let suppressMoveHandlingUntil = 0;

function getAutoHideEnabled(): boolean {
  return (store.get(AUTO_HIDE_ENABLED_KEY, true) as boolean) ?? true;
}

function getAutoHideIdleMs(): number {
  const ms = store.get(AUTO_HIDE_IDLE_MS_KEY, 5000) as number;
  return typeof ms === 'number' && ms > 0 ? ms : 5000;
}

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function clearHoverPoll(): void {
  if (hoverPollTimer) {
    clearInterval(hoverPollTimer);
    hoverPollTimer = null;
  }
  hoverWasHit = false;
}

function clearAnimTimer(): void {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = null;
  }
}

function resetAutoHideIdleTimer(): void {
  clearIdleTimer();

  if (!mainWindow) return;
  if (!isCompactMode) return;
  if (!getAutoHideEnabled()) return;
  if (!snappedEdge) return;
  if (isHidden) return;

  const ms = getAutoHideIdleMs();
  idleTimer = setTimeout(() => {
    hideToEdge();
  }, ms);
}

function getWorkAreaForBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  return screen.getDisplayMatching(bounds).workArea;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeSnappedEdge(bounds: Electron.Rectangle, workArea: Electron.Rectangle): SnappedEdge {
  const leftDist = Math.abs(bounds.x - workArea.x);
  const topDist = Math.abs(bounds.y - workArea.y);
  const rightDist = Math.abs(workArea.x + workArea.width - (bounds.x + bounds.width));
  const bottomDist = Math.abs(workArea.y + workArea.height - (bounds.y + bounds.height));

  // v1.0.3：当同时满足多个边缘阈值（尤其在四个角）时，按固定优先级选择
  // 优先级：top > bottom > left > right
  if (topDist <= SNAP_THRESHOLD_PX) return 'top';
  if (bottomDist <= SNAP_THRESHOLD_PX) return 'bottom';
  if (leftDist <= SNAP_THRESHOLD_PX) return 'left';
  if (rightDist <= SNAP_THRESHOLD_PX) return 'right';
  return null;
}

function snapWindowToEdge(edge: Exclude<SnappedEdge, null>): void {
  if (!mainWindow) return;

  const bounds = mainWindow.getBounds();
  const workArea = getWorkAreaForBounds(bounds);

  let x = bounds.x;
  let y = bounds.y;

  if (edge === 'left') x = workArea.x;
  if (edge === 'right') x = workArea.x + workArea.width - bounds.width;
  if (edge === 'top') y = workArea.y;
  if (edge === 'bottom') y = workArea.y + workArea.height - bounds.height;

  // 贴边后把另一轴也限制在工作区范围内，避免拖到外面导致“找不到”窗口
  x = clamp(x, workArea.x, workArea.x + workArea.width - bounds.width);
  y = clamp(y, workArea.y, workArea.y + workArea.height - bounds.height);

  mainWindow.setPosition(x, y);
  snappedEdge = edge;
  isHidden = false;
  lastShownBounds = mainWindow.getBounds();

  // 小窗位置记忆：贴边后也更新一下保存值
  store.set('compactWindowBounds', mainWindow.getBounds());

  // 拖拽吸附本身就是一次用户活动，允许后续闲置自动缩入
  activitySinceTransition = true;
  resetAutoHideIdleTimer();
}

function hideToEdge(): void {
  if (!mainWindow) return;
  if (!isCompactMode) return;
  if (!getAutoHideEnabled()) return;
  if (!snappedEdge) return;
  if (isHidden) return;
  // 弹出后没有新的用户活动 → 不再自动缩入（防止静止鼠标触发缩入/弹出循环）
  if (!activitySinceTransition) return;

  const bounds = mainWindow.getBounds();
  const workArea = getWorkAreaForBounds(bounds);

  lastShownBounds = bounds;

  const peek = HIDE_PEEK_PX;
  const hiddenBounds: Electron.Rectangle = { ...bounds };

  if (snappedEdge === 'left') hiddenBounds.x = workArea.x - bounds.width + peek;
  if (snappedEdge === 'right') hiddenBounds.x = workArea.x + workArea.width - peek;
  if (snappedEdge === 'top') hiddenBounds.y = workArea.y - bounds.height + peek;
  if (snappedEdge === 'bottom') hiddenBounds.y = workArea.y + workArea.height - peek;

  clearIdleTimer();
  clearAnimTimer();
  // 动画期间+宽限期内屏蔽 move/resize 处理（WM_MOVE 异步自触发）
  suppressMoveHandlingUntil = Date.now() + ANIM_DURATION_MS + MOVE_SUPPRESS_GRACE_MS;

  const from = bounds;
  const to = hiddenBounds;
  const durationMs = ANIM_DURATION_MS;
  const steps = Math.max(1, Math.round(durationMs / 16));
  let step = 0;

  animTimer = setInterval(() => {
    if (!mainWindow) {
      clearAnimTimer();
      return;
    }

    step += 1;
    const t = step / steps;

    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    const width = Math.round(from.width + (to.width - from.width) * t);
    const height = Math.round(from.height + (to.height - from.height) * t);

    mainWindow.setBounds({ x, y, width, height });

    if (step >= steps) {
      clearAnimTimer();
      mainWindow.setBounds(to);
      isHidden = true;
      // 缩入完成视为一次转换：之后必须有新的用户活动才允许再次缩入
      activitySinceTransition = false;
      // 记录缩入完成时的光标位置，用于甄别"窗口移开产生的合成鼠标事件"
      const c = screen.getCursorScreenPoint();
      cursorAtHideX = c.x;
      cursorAtHideY = c.y;

      // 缩入后禁用窗口resize能力，避免鼠标悬停时显示缩放图标并拦截我们的hoverPoll检测
      // setResizable 会再次产生异步 WM_MOVE，先延长屏蔽期再调用
      suppressMoveHandlingUntil = Date.now() + MOVE_SUPPRESS_GRACE_MS;
      mainWindow.setResizable(false);

      // 缩入后轮询鼠标位置：鼠标悬停在“保留 4px 附近的小带宽”即可自动弹出（无需点击）
      clearHoverPoll();
      // 初始标记为“鼠标已在触发带”：若用户松手时鼠标还停在带内（贴顶边时最常见），
      // 必须先移出再移回才允许弹出，否则刚缩入就会被自己触发弹出
      hoverStartBlockedUntil = Date.now() + 2000;
      hoverWasHit = true;

      hoverPollTimer = setInterval(() => {
        if (!mainWindow || !isCompactMode || !isHidden || !snappedEdge) return;

        const current = mainWindow.getBounds();
        const workArea = getWorkAreaForBounds(current);
        const cursor = screen.getCursorScreenPoint();

        // hoverWasHit 只记录鼠标【真实】是否在触发带内，不受屏蔽期影响；
        // 屏蔽期内若沿用旧逻辑覆写为 false，鼠标静止时会在屏蔽结束后被误判为“新进入”而立即弹出
        const inBand = isCursorInRevealBand(cursor, workArea, snappedEdge);
        const blocked = Date.now() < hoverStartBlockedUntil;

        // 进入触发：只有从“带外”变为“带内”（且不在屏蔽期）才弹出
        if (!blocked && inBand && !hoverWasHit) {
          showFromEdge();
        }
        hoverWasHit = inBand;
      }, 50);
    }
  }, 16);
}

function showFromEdge(): void {
  if (!mainWindow) return;
  if (!isCompactMode) return;
  if (!isHidden) return;

  // 立即翻转状态：任何动画期间/之后迟到的 move 事件都无法重入 showFromEdge
  isHidden = false;
  // 动画期间+宽限期内屏蔽 move/resize 处理（WM_MOVE 异步自触发）
  suppressMoveHandlingUntil = Date.now() + ANIM_DURATION_MS + MOVE_SUPPRESS_GRACE_MS;

  clearHoverPoll();
  clearAnimTimer();
  hoverStartBlockedUntil = 0;

  // 弹出时立即恢复窗口resize能力和可拖动状态，确保动画过程中和动画完成后都能正常拖动
  mainWindow.setResizable(true);
  // 确保窗口可以拖动（虽然默认就是可拖动的，但显式设置一下更保险）
  mainWindow.setMovable(true);

  const current = mainWindow.getBounds();
  const workArea = getWorkAreaForBounds(current);

  const target = lastShownBounds ?? current;

  // 弹出时确保仍贴边（避免由于 workArea/分辨率变化导致位置漂移）
  let x = target.x;
  let y = target.y;

  if (snappedEdge === 'left') x = workArea.x;
  if (snappedEdge === 'right') x = workArea.x + workArea.width - target.width;
  if (snappedEdge === 'top') y = workArea.y;
  if (snappedEdge === 'bottom') y = workArea.y + workArea.height - target.height;

  x = clamp(x, workArea.x, workArea.x + workArea.width - target.width);
  y = clamp(y, workArea.y, workArea.y + workArea.height - target.height);

  const from = current;
  const to: Electron.Rectangle = { ...target, x, y };
  const durationMs = ANIM_DURATION_MS;
  const steps = Math.max(1, Math.round(durationMs / 16));
  let step = 0;

  animTimer = setInterval(() => {
    if (!mainWindow) {
      clearAnimTimer();
      return;
    }

    step += 1;
    const t = step / steps;

    const nx = Math.round(from.x + (to.x - from.x) * t);
    const ny = Math.round(from.y + (to.y - from.y) * t);
    const width = Math.round(from.width + (to.width - from.width) * t);
    const height = Math.round(from.height + (to.height - from.height) * t);

    mainWindow.setBounds({ x: nx, y: ny, width, height });

    if (step >= steps) {
      clearAnimTimer();
      mainWindow.setBounds(to);
      isHidden = false;
      // 弹出完成视为一次转换：之后必须有新的用户活动才允许再次自动缩入
      activitySinceTransition = false;

      // 动画完成后确保窗口完全恢复正常状态（可拖动、可调整大小）
      // setResizable 会再次产生异步 WM_MOVE，先延长屏蔽期再调用
      suppressMoveHandlingUntil = Date.now() + MOVE_SUPPRESS_GRACE_MS;
      mainWindow.setResizable(true);
      mainWindow.setMovable(true);

      // 弹出后继续计时（无活动时到点会被 activitySinceTransition 拦住，不会再次缩入）
      resetAutoHideIdleTimer();
    }
  }, 16);
}

function getRevealRangeBaseBounds(): Electron.Rectangle | null {
  // 优先使用缩入前的 bounds 作为“沿边触发范围”，避免变成“整条屏幕边缘都触发”
  if (lastShownBounds) return lastShownBounds;
  if (mainWindow) return mainWindow.getBounds();
  return null;
}

function isCursorInRevealBand(p: Electron.Point, workArea: Electron.Rectangle, edge: Exclude<SnappedEdge, null>): boolean {
  const base = getRevealRangeBaseBounds();
  if (!base) return false;

  if (edge === 'left') {
    const minX = workArea.x;
    const maxX = workArea.x + HIDE_PEEK_PX + REVEAL_HOVER_PX;
    // 对于left/right边，y坐标范围应该更严格，只在窗口实际位置附近触发
    // 使用更小的容错，避免在屏幕中间移动鼠标时误判
    const minY = Math.max(workArea.y, base.y - REVEAL_ALONG_EDGE_SLOP_PX);
    const maxY = Math.min(workArea.y + workArea.height, base.y + base.height + REVEAL_ALONG_EDGE_SLOP_PX);
    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  }

  if (edge === 'right') {
    const minX = workArea.x + workArea.width - (HIDE_PEEK_PX + REVEAL_HOVER_PX);
    const maxX = workArea.x + workArea.width;
    // 对于left/right边，y坐标范围应该更严格，只在窗口实际位置附近触发
    // 使用更小的容错，避免在屏幕中间移动鼠标时误判
    const minY = Math.max(workArea.y, base.y - REVEAL_ALONG_EDGE_SLOP_PX);
    const maxY = Math.min(workArea.y + workArea.height, base.y + base.height + REVEAL_ALONG_EDGE_SLOP_PX);
    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  }

  if (edge === 'top') {
    const minY = workArea.y;
    const maxY = workArea.y + HIDE_PEEK_PX + REVEAL_HOVER_PX;
    // 对于top/bottom边，x坐标范围应该更严格，只在窗口实际位置附近触发
    // 使用更小的容错，避免在屏幕中间移动鼠标时误判
    const minX = Math.max(workArea.x, base.x - REVEAL_ALONG_EDGE_SLOP_PX);
    const maxX = Math.min(workArea.x + workArea.width, base.x + base.width + REVEAL_ALONG_EDGE_SLOP_PX);
    return p.y >= minY && p.y <= maxY && p.x >= minX && p.x <= maxX;
  }

  // bottom
  const minY = workArea.y + workArea.height - (HIDE_PEEK_PX + REVEAL_HOVER_PX);
  const maxY = workArea.y + workArea.height;
  // 对于top/bottom边，x坐标范围应该更严格，只在窗口实际位置附近触发
  // 使用更小的容错，避免在屏幕中间移动鼠标时误判
  const minX = Math.max(workArea.x, base.x - REVEAL_ALONG_EDGE_SLOP_PX);
  const maxX = Math.min(workArea.x + workArea.width, base.x + base.width + REVEAL_ALONG_EDGE_SLOP_PX);
  return p.y >= minY && p.y <= maxY && p.x >= minX && p.x <= maxX;
}

function createWindow(): void {
  const savedBounds = store.get('windowBounds') as { width: number; height: number; x?: number; y?: number } | undefined;

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || 800,
    height: savedBounds?.height || 600,
    x: savedBounds?.x,
    y: savedBounds?.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true // 沙箱渲染进程；preload 仅用 contextBridge/ipcRenderer，兼容沙箱
    },
    frame: false,
    transparent: false,
    backgroundColor: '#f0f0f0',
    resizable: true,
    alwaysOnTop: store.get('alwaysOnTop', false) as boolean,
    // dev 下 electron.exe 自带原子 logo，必须显式指定应用图标，任务栏/Alt-Tab 才是 H.
    icon: getAppIcon() ?? undefined
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5175');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }

  // 安全：禁止渲染层开新窗口；拦截外部导航（防止在带 preload 的窗口里加载任意站点）
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = app.isPackaged ? url.startsWith('file://') : url.startsWith('http://localhost:5175');
    if (!allowed) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 关闭按钮（X / Alt+F4 / 任务栏关闭）= 隐藏到托盘，后台继续监测；
  // 真正退出（托盘「退出」）在 before-quit 置 isQuitting 后放行销毁
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      // 小窗与正常窗口的尺寸记忆分开存，避免互相污染
      if (isCompactMode) {
        // 缩入/弹出动画期间的中间帧 bounds 是垃圾值，不落盘
        if (!isHidden && Date.now() >= suppressMoveHandlingUntil) {
          store.set('compactWindowBounds', bounds);
        }
      } else {
        store.set('windowBounds', bounds);
      }
    }
  });

  mainWindow.on('move', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      // 正常窗口移动才更新 windowBounds；小窗移动不污染正常窗口记忆
      if (!isCompactMode) {
        store.set('windowBounds', bounds);
      }

      // 小窗模式下：拖动过程中不断重置闲置计时；拖动结束后做吸附
      if (isCompactMode) {
        // 缩入/弹出动画期间及宽限期内的 move 一律是 setBounds/setResizable 的异步自触发
        // （Windows WM_MOVE 延迟派发）。若不屏蔽：缩入完成、isHidden=true 后迟到的 move
        // 会命中下面的 showFromEdge，造成"缩入→立马被自己弹出"死循环。
        if (Date.now() < suppressMoveHandlingUntil) return;

        if (isHidden) {
          // 缩入状态下不该有正常拖动；真收到 move（如显示器变化）则弹出避免窗口丢失
          showFromEdge();
        }

        // 拖动即用户活动，允许后续闲置自动缩入
        activitySinceTransition = true;
        resetAutoHideIdleTimer();

        if (moveEndDebounceTimer) clearTimeout(moveEndDebounceTimer);
        moveEndDebounceTimer = setTimeout(() => {
          if (!mainWindow || !isCompactMode) return;

          const b = mainWindow.getBounds();
          const wa = getWorkAreaForBounds(b);
          const edge = computeSnappedEdge(b, wa);

          if (edge) {
            snapWindowToEdge(edge);
          } else {
            snappedEdge = null;
            // 未贴边时不自动缩入
            clearIdleTimer();
          }

          // 小窗位置记忆：拖动结束后保存
          store.set('compactWindowBounds', mainWindow.getBounds());
        }, 150);
      }
    }
  });
}

/** 显示并聚焦主窗口（托盘点击 / 第二实例唤起用） */
function showMainWindow(): void {
  if (isQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    // 启动尚未完成时由 whenReady 自建窗口，这里不提前创建
    if (app.isReady()) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(() => {
  // 自启动自愈：清掉旧注册表残留（曾指向 dev electron.exe 导致开机弹空窗），
  // 并按存储意图重写为当前 exe 路径
  healAutoStart(store.get('autoStart', false) as boolean);

  const pushToRenderer = (channel: string, payload: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };
  initMonitorService(store, pushToRenderer);
  initSyncService(store, pushToRenderer);
  initReminderService(store, pushToRenderer);
  initAiService(store, pushToRenderer);
  createWindow();
  createTray(showMainWindow);

  if (!app.isPackaged) globalShortcut.register('Alt+D', previewPaper);

});

// 退出流程：置位放行主窗口销毁 + 收尾询问队列/小窗 + 停轮询，保证退出后零残留
app.on('before-quit', () => {
  if (isQuitting) return;
  isQuitting = true;
  globalShortcut.unregisterAll();
  stopSyncService(); // 停止 SFTP 同步轮询，避免写入中途被强杀在远端留 .tmp
  clearHoverPoll();
  clearIdleTimer();
  clearAnimTimer();
  if (moveEndDebounceTimer) {
    clearTimeout(moveEndDebounceTimer);
    moveEndDebounceTimer = null;
  }
  cancelAskQueue();
  abortAskWindows();
  stopReminderService();
  stopMonitorService();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    const isFullScreen = mainWindow.isFullScreen();
    
    if (isFullScreen) {
      mainWindow.setFullScreen(false);
      return;
    }
    
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    
    mainWindow.focus();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window:setAlwaysOnTop', (_, flag: boolean) => {
  if (mainWindow) {
    const wasMaximized = mainWindow.isMaximized();
    
    if (wasMaximized) {
      mainWindow.unmaximize();
    }
    
    mainWindow.setAlwaysOnTop(flag);
    store.set('alwaysOnTop', flag);
    
    if (wasMaximized) {
      mainWindow.maximize();
    }
    
    mainWindow.focus();
  }
});

ipcMain.handle('window:getAlwaysOnTop', () => {
  return store.get('alwaysOnTop', false);
});

ipcMain.handle('window:getBounds', () => {
  if (mainWindow) {
    return mainWindow.getBounds();
  }
  return null;
});

// 渲染层只允许访问这些键（白名单 + fail-closed）。
// 凭据/密钥类键（syncPrivateKey / syncPrivateKeyEnc）一律不进白名单，
// 避免渲染进程经 store:get 直接取走 SSH 私钥。
const RENDERER_STORE_KEYS = new Set<string>([
  'todos',
  'groups',
  'compactMode',
  'syncOrderMigrated',
  'reminderSettings'
]);

ipcMain.handle('store:get', (_, key: string) => {
  if (typeof key !== 'string' || !RENDERER_STORE_KEYS.has(key)) return undefined;
  return store.get(key);
});

ipcMain.handle('store:set', (_, key: string, value: unknown) => {
  if (typeof key !== 'string' || !RENDERER_STORE_KEYS.has(key)) return undefined;
  if (key === 'todos' && Array.isArray(value)) {
    const groups = (store.get('groups') ?? []) as Group[];
    const todos = mergeSyncStates({ todos: (store.get('todos') ?? []) as Todo[], groups }, { todos: value as Todo[], groups }, Date.now()).todos;
    store.set(key, todos);
    if (!isDeepStrictEqual(todos, value) && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('sync:merged', { todos, groups });
  } else store.set(key, value);
  return undefined;
});

ipcMain.handle('store:delete', (_, key: string) => {
  if (typeof key !== 'string' || !RENDERER_STORE_KEYS.has(key)) return undefined;
  store.delete(key);
  return undefined;
});

ipcMain.handle('sync:deviceInfo', () => {
  let deviceId = store.get('deviceId') as string | undefined;
  if (!deviceId || typeof deviceId !== 'string') {
    deviceId = randomUUID();
    store.set('deviceId', deviceId);
  }
  return { deviceId };
});

ipcMain.handle('monitor:configure', (_, entries: MonitorEntry[]) => {
  configureMonitor(Array.isArray(entries) ? entries : []);
});

ipcMain.handle('monitor:listProcesses', () => listProcessDisplayNames());

ipcMain.handle('monitor:getProgress', () => getTodayProgress());

ipcMain.handle('monitor:setJournalEnabled', (_, enabled: boolean) => setJournalEnabled(Boolean(enabled)));

ipcMain.handle('monitor:getJournalEnabled', () => getJournalEnabled());

ipcMain.handle('sync:getConfig', () => getSyncConfig());

ipcMain.handle('sync:getStatus', () => getSyncStatus());

ipcMain.handle('sync:configure', (_, cfg: SyncConfig) => configureSync(cfg));

ipcMain.handle('sync:test', (_, cfg: SyncConfig) => testConnection(cfg));

ipcMain.handle('sync:run', (_, local?: SyncPayload) => runCycle(local));

ipcMain.handle('auto-start:set', (_, enable: boolean) => {
  setAutoStart(enable);
  store.set('autoStart', enable);
});

ipcMain.handle('auto-start:get', () => {
  // 返回操作系统真实状态（旧实现返回 store 缓存，注册表被清/指错时按钮无法反映）
  const real = getAutoStart();
  store.set('autoStart', real);
  return real;
});

ipcMain.handle('window:setCompactMode', (_, isCompact: boolean) => {
  if (mainWindow) {
    const currentBounds = mainWindow.getBounds();
    if (isCompact) {
      isCompactMode = true;
      snappedEdge = null;
      isHidden = false;
      lastShownBounds = null;
      clearHoverPoll();
      clearIdleTimer();

      originalBounds = currentBounds;
      mainWindow.setMinimumSize(400, 300);
      // 小窗尺寸上限：防止拖成比正常窗口还大
      mainWindow.setMaximumSize(COMPACT_MAX_W, COMPACT_MAX_H);

      // 检查是否有保存的小窗模式大小和位置
      const compactBounds = store.get('compactWindowBounds') as { width: number; height: number; x?: number; y?: number } | undefined;
      if (compactBounds) {
        mainWindow.setSize(
          clamp(compactBounds.width, 400, COMPACT_MAX_W),
          clamp(compactBounds.height, 300, COMPACT_MAX_H)
        );
        if (compactBounds.x !== undefined && compactBounds.y !== undefined) {
          mainWindow.setPosition(compactBounds.x, compactBounds.y);
        }
      } else {
        mainWindow.setSize(500, 400);
        mainWindow.center();
      }

      // 进入小窗后：立即做一次吸附判定（如果靠近边缘）并开启闲置计时
      const b = mainWindow.getBounds();
      const wa = getWorkAreaForBounds(b);
      const edge = computeSnappedEdge(b, wa);
      if (edge) snapWindowToEdge(edge);
      // 进入小窗本身是用户活动，允许闲置后自动缩入
      activitySinceTransition = true;
      resetAutoHideIdleTimer();
    } else {
      // 退出小窗前：如果处于隐藏状态先弹出，避免保存到屏外
      if (isHidden) showFromEdge();

      // 退出小窗模式时确保恢复resize能力（保险起见）
      mainWindow.setResizable(true);

      isCompactMode = false;
      snappedEdge = null;
      isHidden = false;
      lastShownBounds = null;
      clearHoverPoll();
      clearIdleTimer();

      // 保存小窗模式的大小和位置
      store.set('compactWindowBounds', currentBounds);
      
      mainWindow.setMinimumSize(600, 400);
      // 恢复正常窗口的尺寸上限（解除小窗限制）
      mainWindow.setMaximumSize(10000, 10000);
      if (originalBounds) {
        mainWindow.setSize(originalBounds.width, originalBounds.height);
        if (originalBounds.x !== undefined && originalBounds.y !== undefined) {
          mainWindow.setPosition(originalBounds.x, originalBounds.y);
        }
      } else {
        mainWindow.setSize(800, 600);
        mainWindow.center();
      }
    }
  }
});

ipcMain.handle('window:autoHide:getEnabled', () => {
  return store.get(AUTO_HIDE_ENABLED_KEY, true);
});

ipcMain.handle('window:autoHide:setEnabled', (_, enabled: boolean) => {
  store.set(AUTO_HIDE_ENABLED_KEY, enabled);
  if (!enabled) {
    // 关闭自动缩入：如果已经缩入则立即弹出并停止轮询/计时
    if (isHidden) showFromEdge();
    clearIdleTimer();
    clearHoverPoll();
  } else {
    resetAutoHideIdleTimer();
  }
});

ipcMain.handle('window:userActivity', () => {
  // 任何用户活动都视为“活跃”，重置闲置计时；如果已经缩入，仅在光标真实移动后弹出
  if (isHidden) {
    const c = screen.getCursorScreenPoint();
    const moved = Math.hypot(c.x - cursorAtHideX, c.y - cursorAtHideY);
    // 窗口在静止光标下移开会产生合成 mousemove（光标坐标不变），
    // 距离未变则视为噪声不弹出；用户真实移动鼠标后才会弹出
    if (moved >= REAL_MOVE_PX) showFromEdge();
  }
  activitySinceTransition = true;
  resetAutoHideIdleTimer();
});
ipcMain.handle('reminder:preview', event => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  return previewPaper();
});
ipcMain.handle('reminder:list', event => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  return listOpenReminders();
});
ipcMain.handle('reminder:act', (event, command: { todoId?: string; remindAt?: number; action?: string; snoozeAt?: number }) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  if (!command || typeof command.todoId !== 'string' || typeof command.remindAt !== 'number') throw new Error('Invalid command');
  if (command.action !== 'complete' && command.action !== 'snooze' && command.action !== 'dismiss') throw new Error('Invalid command');
  return runReminderAction({ todoId: command.todoId, remindAt: command.remindAt, action: command.action, snoozeAt: command.snoozeAt });
});

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
}

function sanitizeChatMessages(messages: unknown): AiChatMessage[] {
  if (!Array.isArray(messages)) throw new Error('Invalid messages');
  const sanitized: AiChatMessage[] = [];
  for (const message of messages.slice(-40)) {
    if (!message || typeof message !== 'object') throw new Error('Invalid messages');
    const candidate = message as { role?: unknown; content?: unknown };
    if (candidate.role !== 'user' && candidate.role !== 'assistant') throw new Error('Invalid messages');
    if (typeof candidate.content !== 'string') throw new Error('Invalid messages');
    sanitized.push({ role: candidate.role, content: candidate.content.slice(0, 8000) });
  }
  return sanitized;
}

ipcMain.handle('ai:chat', async (event, messages: unknown) => {
  assertTrustedSender(event);
  const processNames = await listProcessDisplayNames();
  return runAiChat({ messages: sanitizeChatMessages(messages), processNames });
});

ipcMain.handle('ai:stop', event => {
  assertTrustedSender(event);
  cancelAiChat();
});

ipcMain.handle('ai:commit', (event, id: unknown, patch: unknown) => {
  assertTrustedSender(event);
  if (typeof id !== 'string' || !id) throw new Error('Invalid proposal id');
  if (patch !== undefined && (typeof patch !== 'object' || patch === null)) throw new Error('Invalid patch');
  commitProposal(id, patch);
  return true;
});

ipcMain.handle('ai:reject', (event, id: unknown) => {
  assertTrustedSender(event);
  if (typeof id !== 'string' || !id) throw new Error('Invalid proposal id');
  return rejectProposal(id);
});

ipcMain.handle('ai:settings:get', event => {
  assertTrustedSender(event);
  return maskedAiSettings(store);
});

ipcMain.handle('ai:settings:set', (event, patch: unknown) => {
  assertTrustedSender(event);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
  const candidate = patch as Partial<AiSettings>;
  if (candidate.apiKey !== undefined && (typeof candidate.apiKey !== 'string' || candidate.apiKey.length > 300)) throw new Error('Invalid settings');
  writeAiSettings(store, candidate);
  return maskedAiSettings(store);
});

ipcMain.handle('ai:settings:test', async (event, key: unknown) => {
  assertTrustedSender(event);
  if (key !== undefined && (typeof key !== 'string' || key.length > 300)) throw new Error('Invalid key');
  return testAiConnection(store, key as string | undefined);
});
