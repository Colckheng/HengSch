import { useWindow } from '../context/WindowContext';
import {
  IconPin,
  IconCompact,
  IconSnap,
  IconPower,
  IconMinimize,
  IconMaximize,
  IconClose
} from './Icons';

export function WindowControls(): JSX.Element {
  const {
    isAlwaysOnTop,
    isCompactMode,
    isAutoStart,
    isAutoHideEnabled,
    toggleAlwaysOnTop,
    toggleCompactMode,
    toggleAutoStart,
    toggleAutoHideEnabled,
    minimizeWindow,
    maximizeWindow,
    closeWindow
  } = useWindow();

  return (
    <>
      <button
        className="window-button"
        onClick={toggleAlwaysOnTop}
        title={isAlwaysOnTop ? '取消置顶' : '置顶'}
        aria-label={isAlwaysOnTop ? '取消置顶' : '置顶窗口'}
        aria-pressed={isAlwaysOnTop}
      >
        <IconPin filled={isAlwaysOnTop} />
      </button>
      <button
        className="window-button"
        onClick={toggleCompactMode}
        title={isCompactMode ? '退出小窗模式' : '小窗模式'}
        aria-label={isCompactMode ? '退出小窗模式' : '小窗模式'}
        aria-pressed={isCompactMode}
      >
        <IconCompact filled={isCompactMode} />
      </button>
      <button
        className="window-button"
        onClick={toggleAutoHideEnabled}
        title={isAutoHideEnabled ? '关闭贴边缩入（闲置5秒）' : '开启贴边缩入（闲置5秒）'}
        aria-label={isAutoHideEnabled ? '关闭贴边缩入' : '贴边缩入'}
        aria-pressed={isAutoHideEnabled}
      >
        <IconSnap hidden={isAutoHideEnabled} />
      </button>
      <button
        className="window-button"
        onClick={toggleAutoStart}
        title={isAutoStart ? '取消开机自启动' : '开机自启动'}
        aria-label={isAutoStart ? '取消开机自启动' : '开机自启动'}
        aria-pressed={isAutoStart}
      >
        <IconPower filled={isAutoStart} />
      </button>
      <button className="window-button" onClick={minimizeWindow} aria-label="最小化" title="最小化">
        <IconMinimize />
      </button>
      <button className="window-button" onClick={maximizeWindow} aria-label="最大化或还原" title="最大化/还原">
        <IconMaximize />
      </button>
      <button className="window-button close" onClick={closeWindow} aria-label="关闭" title="关闭">
        <IconClose />
      </button>
    </>
  );
}
