import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { setAutoStart } from './auto-start';

const store = new Store();
let mainWindow: BrowserWindow | null = null;
let originalBounds: { width: number; height: number; x?: number; y?: number } | null = null;

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
    mainWindow.webContents.openDevTools();
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
    } else {
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