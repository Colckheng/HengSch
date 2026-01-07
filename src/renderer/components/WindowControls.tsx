import { useWindow } from '../context/WindowContext';

export function WindowControls(): JSX.Element {
  const { isAlwaysOnTop, isCompactMode, isAutoStart, toggleAlwaysOnTop, toggleCompactMode, toggleAutoStart, minimizeWindow, maximizeWindow, closeWindow } = useWindow();

  return (
    <>
      <button className="window-button" onClick={toggleAlwaysOnTop} title={isAlwaysOnTop ? '取消置顶' : '置顶'}>
        {isAlwaysOnTop ? '▲' : '△'}
      </button>
      <button className="window-button" onClick={toggleCompactMode} title={isCompactMode ? '退出小窗模式' : '小窗模式'}>
        {isCompactMode ? '⬜' : '⬛'}
      </button>
      <button className="window-button" onClick={toggleAutoStart} title={isAutoStart ? '取消开机自启动' : '开机自启动'}>
        {isAutoStart ? '⏻' : '⏼'}
      </button>
      <button className="window-button" onClick={minimizeWindow} title="最小化">
        −
      </button>
      <button className="window-button" onClick={maximizeWindow} title="最大化/还原">
        □
      </button>
      <button className="window-button close" onClick={closeWindow} title="关闭">
        ✕
      </button>
    </>
  );
}