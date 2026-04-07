import { useWindow } from '../context/WindowContext';

type WindowToggleButtonProps = {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
  toneClass: string;
  children: JSX.Element;
};

function WindowToggleButton({
  active,
  label,
  title,
  onClick,
  toneClass,
  children
}: WindowToggleButtonProps): JSX.Element {
  return (
    <button
      className={`window-button window-button-toggle ${toneClass} ${active ? 'active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <span className="window-button-content">
        <span className="window-button-glyph" aria-hidden="true">
          {children}
        </span>
        <span className="window-button-text">{label}</span>
      </span>
    </button>
  );
}

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
      <WindowToggleButton
        active={isAlwaysOnTop}
        label="置顶"
        title={isAlwaysOnTop ? '取消置顶' : '窗口置顶'}
        onClick={toggleAlwaysOnTop}
        toneClass="tone-blue"
      >
        <svg viewBox="0 0 24 24">
          <path d="m9 9 6-4" />
          <path d="m8.2 10.2 5.6-5.6 2.3 2.3-5.6 5.6" />
          <path d="M10.6 11.1 8 18" />
          <path d="M10.2 11.6 15.6 17" />
        </svg>
      </WindowToggleButton>

      <WindowToggleButton
        active={isCompactMode}
        label="小窗"
        title={isCompactMode ? '退出小窗模式' : '进入小窗模式'}
        onClick={toggleCompactMode}
        toneClass="tone-yellow"
      >
        <svg viewBox="0 0 24 24">
          <rect x="5" y="6.5" width="14" height="11" rx="2.5" />
          <path d="M10 9.5h6" />
          <path d="M8 12h8" />
        </svg>
      </WindowToggleButton>

      <WindowToggleButton
        active={isAutoHideEnabled}
        label="贴边"
        title={isAutoHideEnabled ? '关闭贴边隐藏' : '开启贴边隐藏'}
        onClick={toggleAutoHideEnabled}
        toneClass="tone-coral"
      >
        <svg viewBox="0 0 24 24">
          <path d="M6 5v14" />
          <path d="m11 8-3 4 3 4" />
          <path d="M13 8h5" />
          <path d="M13 16h5" />
        </svg>
      </WindowToggleButton>

      <WindowToggleButton
        active={isAutoStart}
        label="自启"
        title={isAutoStart ? '取消开机自启' : '开启开机自启'}
        onClick={toggleAutoStart}
        toneClass="tone-green"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 4.8v7.3" />
          <path d="M7.1 8.1a7 7 0 1 0 9.8 0" />
        </svg>
      </WindowToggleButton>

      <button className="window-button window-button-icon" onClick={minimizeWindow} title="最小化" aria-label="最小化">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 16h12" />
        </svg>
      </button>
      <button className="window-button window-button-icon" onClick={maximizeWindow} title="最大化或还原" aria-label="最大化或还原">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.8" />
        </svg>
      </button>
      <button className="window-button window-button-icon close" onClick={closeWindow} title="关闭" aria-label="关闭">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7.5 7.5 9 9" />
          <path d="m16.5 7.5-9 9" />
        </svg>
      </button>
    </>
  );
}
