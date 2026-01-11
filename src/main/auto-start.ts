import { app } from 'electron';
import * as path from 'path';
import { exec } from 'child_process';

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
  const appPath = process.execPath;
  const keyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const regAdd = `reg add "${keyPath}" /v "HengSch Todo" /t REG_SZ /d "${appPath}" /f`;
  const regDelete = `reg delete "${keyPath}" /v "HengSch Todo" /f`;

  if (enable) {
    exec(regAdd, (error) => {
      if (error) {
        console.error('Failed to set auto-start on Windows:', error);
      }
    });
  } else {
    exec(regDelete, (error) => {
      if (error) {
        console.error('Failed to remove auto-start on Windows:', error);
      }
    });
  }
}

function getAutoStartWindows(): boolean {
  const keyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const regQuery = `reg query "${keyPath}" /v "HengSch Todo"`;
  
  return new Promise<boolean>((resolve) => {
    exec(regQuery, (error, stdout, stderr) => {
      if (error || stderr) {
        resolve(false);
      } else {
        resolve(stdout.includes('HengSch Todo'));
      }
    });
  }).catch(() => {
    resolve(false);
  });
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
</dict>
</plist>`;
    
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
  
  exec(`test -f "${launchAgentPath}"`, (error) => {
    if (error) {
      return false;
    }
    return true;
  });
  
  return false;
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
  
  exec(`test -f "${autostartPath}"`, (error) => {
    if (error) {
      return false;
    }
    return true;
  });
  
  return false;
}