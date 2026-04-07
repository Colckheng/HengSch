import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WINDOWS_RUN_VALUE = 'HengSch Todo';

export function setAutoStart(enable: boolean): boolean {
  if (process.platform === 'win32') {
    return setAutoStartWindows(enable);
  }

  if (process.platform === 'darwin') {
    return setAutoStartMac(enable);
  }

  if (process.platform === 'linux') {
    return setAutoStartLinux(enable);
  }

  return false;
}

export function getAutoStart(): boolean {
  if (process.platform === 'win32') {
    return getAutoStartWindows();
  }

  if (process.platform === 'darwin') {
    return getAutoStartMac();
  }

  if (process.platform === 'linux') {
    return getAutoStartLinux();
  }

  return false;
}

function setAutoStartWindows(enable: boolean): boolean {
  const appPath = process.execPath;
  const regAdd = `reg add "${WINDOWS_RUN_KEY}" /v "${WINDOWS_RUN_VALUE}" /t REG_SZ /d "${appPath}" /f`;
  const regDelete = `reg delete "${WINDOWS_RUN_KEY}" /v "${WINDOWS_RUN_VALUE}" /f`;

  try {
    execSync(enable ? regAdd : regDelete, { stdio: 'ignore' });
  } catch (error) {
    console.error('Failed to update auto-start on Windows:', error);
  }

  return getAutoStartWindows();
}

function getAutoStartWindows(): boolean {
  const regQuery = `reg query "${WINDOWS_RUN_KEY}" /v "${WINDOWS_RUN_VALUE}"`;

  try {
    const stdout = execSync(regQuery, { encoding: 'utf8' });
    return stdout.includes(WINDOWS_RUN_VALUE);
  } catch {
    return false;
  }
}

function getMacLaunchAgentPath(): string {
  const appName = app.getName();
  return path.join(process.env.HOME || '', 'Library', 'LaunchAgents', `${appName}.plist`);
}

function setAutoStartMac(enable: boolean): boolean {
  const launchAgentPath = getMacLaunchAgentPath();
  const appName = app.getName();
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
</dict>
</plist>`;

  try {
    if (enable) {
      fs.mkdirSync(path.dirname(launchAgentPath), { recursive: true });
      fs.writeFileSync(launchAgentPath, plistContent, 'utf8');
    } else if (fs.existsSync(launchAgentPath)) {
      fs.rmSync(launchAgentPath);
    }
  } catch (error) {
    console.error('Failed to update auto-start on macOS:', error);
  }

  return getAutoStartMac();
}

function getAutoStartMac(): boolean {
  return fs.existsSync(getMacLaunchAgentPath());
}

function getLinuxAutostartPath(): string {
  return path.join(process.env.HOME || '', '.config', 'autostart', 'hengsch-todo.desktop');
}

function setAutoStartLinux(enable: boolean): boolean {
  const autostartPath = getLinuxAutostartPath();
  const desktopEntry = `[Desktop Entry]
Type=Application
Name=HengSch Todo
Exec=${process.execPath}
Terminal=false
X-GNOME-Autostart-enabled=true`;

  try {
    if (enable) {
      fs.mkdirSync(path.dirname(autostartPath), { recursive: true });
      fs.writeFileSync(autostartPath, desktopEntry, 'utf8');
    } else if (fs.existsSync(autostartPath)) {
      fs.rmSync(autostartPath);
    }
  } catch (error) {
    console.error('Failed to update auto-start on Linux:', error);
  }

  return getAutoStartLinux();
}

function getAutoStartLinux(): boolean {
  return fs.existsSync(getLinuxAutostartPath());
}
