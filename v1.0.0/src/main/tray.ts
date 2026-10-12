import { app, Menu, Tray } from 'electron';
import { getAppIcon } from './app-icon';

let tray: Tray | null = null;

/**
 * 创建系统托盘图标（常驻通知区域）。
 * 左键单击/双击 → 显示主窗口；右键 → 菜单「显示主窗口 / 退出」。
 * 图标缺失或创建失败时静默跳过，不影响应用启动。
 */
export function createTray(onShow: () => void): void {
  try {
    const image = getAppIcon();
    if (!image) return;

    tray = new Tray(image);
    tray.setToolTip('HengSch Todo');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主窗口', click: onShow },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ])
    );
    tray.on('click', onShow);
    tray.on('double-click', onShow);
  } catch {
    // 托盘创建失败不阻塞启动
  }
}
