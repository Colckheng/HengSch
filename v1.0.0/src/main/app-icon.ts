import { app, nativeImage, NativeImage } from 'electron';
import * as path from 'path';

/**
 * 解析应用图标（.ico，多尺寸）：
 * - dev 模式取 public/assets（exe 是 electron.exe，不带应用图标，窗口/托盘必须显式指定）
 * - 打包版取 dist 内资源（与 electron-builder 内嵌 exe 的是同一文件）
 * 图标缺失或加载失败时返回 null，调用方回退到系统默认行为。
 */
export function getAppIcon(): NativeImage | null {
  try {
    const iconPath = app.isPackaged
      ? path.join(__dirname, '../assets/icon.ico')
      : path.join(app.getAppPath(), 'public/assets/icon.ico');
    const image = nativeImage.createFromPath(iconPath);
    return image.isEmpty() ? null : image;
  } catch {
    return null;
  }
}
