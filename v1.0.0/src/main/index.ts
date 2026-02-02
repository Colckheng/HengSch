import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { setAutoStart } from './auto-start';

const store = new Store();
let mainWindow: BrowserWindow | null = null;
let originalBounds: { width: number; height: number; x?: number; y?: number } | null = null;

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

  resetAutoHideIdleTimer();
}

function hideToEdge(): void {
  if (!mainWindow) return;
  if (!isCompactMode) return;
  if (!getAutoHideEnabled()) return;
  if (!snappedEdge) return;
  if (isHidden) return;

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

  const from = bounds;
  const to = hiddenBounds;
  const durationMs = 180;
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

      // 缩入后禁用窗口resize能力，避免鼠标悬停时显示缩放图标并拦截我们的hoverPoll检测
      mainWindow.setResizable(false);

      // 缩入后轮询鼠标位置：鼠标悬停在“保留 4px 附近的小带宽”即可自动弹出（无需点击）
      // 为避免“刚缩入就立刻弹出/循环”，采用进入触发 + 严格初始化：
      // - 缩入完成时，无论鼠标是否在触发区，都强制标记为已命中，并延长阻塞时间到2000ms
      // - 这样可以确保即使检测逻辑误判，也需要等待更长时间，并且需要"移出再移入"才会弹出
      // - 用户必须先把鼠标移出触发区，然后再移回触发区，才会弹出
      clearHoverPoll();
      // 无论鼠标是否在触发区，都强制标记为已命中，并延长阻塞时间
      // 这样可以确保用户必须"移出再移入"才会弹出，避免立刻弹出/循环
      hoverStartBlockedUntil = Date.now() + 2000;
      hoverWasHit = true;

      hoverPollTimer = setInterval(() => {
        if (!mainWindow || !isCompactMode || !isHidden || !snappedEdge) return;

        const current = mainWindow.getBounds();
        const workArea = getWorkAreaForBounds(current);
        const cursor = screen.getCursorScreenPoint();

        const hit = Date.now() >= hoverStartBlockedUntil && isCursorInRevealBand(cursor, workArea, snappedEdge);

        // 进入触发：只有从“未命中”变为“命中”才弹出
        if (hit && !hoverWasHit) {
          showFromEdge();
        }
        hoverWasHit = hit;
      }, 50);
    }
  }, 16);
}

function showFromEdge(): void {
  if (!mainWindow) return;
  if (!isCompactMode) return;
  if (!isHidden) return;

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
  const durationMs = 180;
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

      // 动画完成后确保窗口完全恢复正常状态（可拖动、可调整大小）
      mainWindow.setResizable(true);
      mainWindow.setMovable(true);

      // 弹出后继续计时
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
      sandbox: false
    },
    frame: false,
    transparent: false,
    backgroundColor: '#f0f0f0',
    resizable: true,
    alwaysOnTop: store.get('alwaysOnTop', false) as boolean
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);
    }
  });

  mainWindow.on('move', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);

      // 小窗模式下：拖动过程中不断重置闲置计时；拖动结束后做吸附
      if (isCompactMode) {
        if (isHidden) {
          // 隐藏状态不允许拖动，保险起见先弹出
          showFromEdge();
        }

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

app.whenReady().then(() => {
  createWindow();
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

ipcMain.handle('store:get', (_, key: string) => {
  return store.get(key);
});

ipcMain.handle('store:set', (_, key: string, value: unknown) => {
  store.set(key, value);
});

ipcMain.handle('store:delete', (_, key: string) => {
  store.delete(key);
});

ipcMain.handle('auto-start:set', (_, enable: boolean) => {
  setAutoStart(enable);
  store.set('autoStart', enable);
});

ipcMain.handle('auto-start:get', () => {
  const storedValue = store.get('autoStart', false) as boolean;
  return storedValue;
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
      
      // 检查是否有保存的小窗模式大小和位置
      const compactBounds = store.get('compactWindowBounds') as { width: number; height: number; x?: number; y?: number } | undefined;
      if (compactBounds) {
        mainWindow.setSize(compactBounds.width, compactBounds.height);
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
  // 任何用户活动都视为“活跃”，重置闲置计时；如果已经缩入，也弹出
  if (isHidden) showFromEdge();
  resetAutoHideIdleTimer();
});