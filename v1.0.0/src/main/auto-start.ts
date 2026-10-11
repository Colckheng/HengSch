import { app } from 'electron';
import * as path from 'path';
import { exec, execSync } from 'child_process';

const WIN_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
// 旧实现用 reg add 直写此值名：路径未加引号，且开发模式下会指向 node_modules 里的
// electron.exe，导致开机弹出一个空白 Electron 窗口而不是应用本身
const WIN_LEGACY_VALUE = 'HengSch Todo';

function deleteLegacyWindowsEntry(): void {
  try {
    execSync(`reg delete "${WIN_RUN_KEY}" /v "${WIN_LEGACY_VALUE}" /f`, {
      windowsHide: true,
      stdio: 'ignore'
    });
  } catch {
    /* 值不存在等失败忽略 */
  }
}

/** 启动自愈：清掉旧实现残留；打包版按存储意图重写为当前 exe 路径（安装目录变化也能自愈） */
export function healAutoStart(storeFlag: boolean): void {
  if (process.platform !== 'win32') return;
  deleteLegacyWindowsEntry();
  if (!app.isPackaged) return;
  // 开启时总是幂等重写：确保 Run 项指向当前 exe（安装/便携目录变化后自动修正）
  if (storeFlag) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  } else if (app.getLoginItemSettings().openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: false });
  }
}

export function setAutoStart(enable: boolean): void {
  if (process.platform === 'win32') {
    setAutoStartWindows(enable);
  } else if (process.platform === 'darwin') {
    setAutoStartMac(enable);
  } else if (process.platform === 'linux') {
    setAutoStartLinux(enable);
  }
}

export function getAutoStart(): boolean {
  if (process.platform === 'win32') {
    return getAutoStartWindows();
  } else if (process.platform === 'darwin') {
    return getAutoStartMac();
  } else if (process.platform === 'linux') {
    return getAutoStartLinux();
  }
  return false;
}

function setAutoStartWindows(enable: boolean): void {
  // 无论开关都先清旧残留，避免指向 electron.exe 的坏项残留
  deleteLegacyWindowsEntry();
  if (!app.isPackaged) {
    // 开发模式下 execPath 是 electron.exe，注册进自启只会开机弹空窗，直接忽略
    return;
  }
  // Electron 负责正确加引号写入 Run 项（旧实现的 reg add 经 cmd 解析后引号被吃掉）
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath });
}

function getAutoStartWindows(): boolean {
  if (!app.isPackaged) return false;
  return app.getLoginItemSettings().openAtLogin;
}

function setAutoStartMac(enable: boolean): void {
  const appName = app.getName();
  const launchAgentPath = path.join(
    process.env.HOME || '',
    'Library',
    'LaunchAgents',
    `${appName}.plist`
  );

  if (enable) {
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${appName}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>`;

    exec(`echo '${plistContent}' > "${launchAgentPath}"`, (error) => {
      if (error) {
        console.error('Failed to set auto-start on macOS:', error);
      }
    });
  } else {
    exec(`rm "${launchAgentPath}"`, (error) => {
      if (error) {
        console.error('Failed to remove auto-start on macOS:', error);
      }
    });
  }
}

function getAutoStartMac(): boolean {
  const appName = app.getName();
  const launchAgentPath = path.join(
    process.env.HOME || '',
    'Library',
    'LaunchAgents',
    `${appName}.plist`
  );
  try {
    execSync(`test -f "${launchAgentPath}"`, { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function setAutoStartLinux(enable: boolean): void {
  const desktopEntry = `[Desktop Entry]
Type=Application
Name=HengSch Todo
Exec=${process.execPath}
Terminal=false
X-GNOME-Autostart-enabled=true`;

  const autostartPath = path.join(
    process.env.HOME || '',
    '.config',
    'autostart',
    'hengsch-todo.desktop'
  );

  if (enable) {
    exec(`mkdir -p "${path.dirname(autostartPath)}" && echo '${desktopEntry}' > "${autostartPath}"`, (error) => {
      if (error) {
        console.error('Failed to set auto-start on Linux:', error);
      }
    });
  } else {
    exec(`rm "${autostartPath}"`, (error) => {
      if (error) {
        console.error('Failed to remove auto-start on Linux:', error);
      }
    });
  }
}

function getAutoStartLinux(): boolean {
  const autostartPath = path.join(
    process.env.HOME || '',
    '.config',
    'autostart',
    'hengsch-todo.desktop'
  );
  try {
    execSync(`test -f "${autostartPath}"`, { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}
