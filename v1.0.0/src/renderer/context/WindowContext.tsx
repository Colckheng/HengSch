import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';

interface WindowContextType {
  isAlwaysOnTop: boolean;
  isMinimized: boolean;
  isCompactMode: boolean;
  isAutoStart: boolean;
  isAutoHideEnabled: boolean;
  toggleAlwaysOnTop: () => Promise<void>;
  toggleCompactMode: () => void;
  toggleAutoStart: () => Promise<void>;
  toggleAutoHideEnabled: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

const WindowContext = createContext<WindowContextType | undefined>(undefined);

export function WindowProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [isAutoStart, setIsAutoStart] = useState(false);
  const [isAutoHideEnabled, setIsAutoHideEnabled] = useState(true);
  const lastActivitySentAtRef = useRef<number>(0);
  const prevAlwaysOnTopRef = useRef<boolean>(false);

  useEffect(() => {
    loadWindowSettings();
  }, []);

  const loadWindowSettings = async () => {
    try {
      const alwaysOnTop = await window.electronAPI.window.getAlwaysOnTop();
      setIsAlwaysOnTop(alwaysOnTop);

      const compactMode = await window.electronAPI.store.get('compactMode');
      setIsCompactMode(Boolean(compactMode));
      if (compactMode) {
        // 重启后恢复小窗：同步主进程状态（贴边/缩入/尺寸上限），并置顶
        await window.electronAPI.window.setCompactMode(true);
        await window.electronAPI.window.setAlwaysOnTop(true);
        setIsAlwaysOnTop(true);
      }

      const autoStart = await window.electronAPI.autoStart.get();
      setIsAutoStart(autoStart);

      const autoHideEnabled = await window.electronAPI.window.getAutoHideEnabled();
      setIsAutoHideEnabled(Boolean(autoHideEnabled));
    } catch (error) {
      console.error('Failed to load window settings:', error);
    }
  };

  const toggleAlwaysOnTop = async () => {
    try {
      const newValue = !isAlwaysOnTop;
      await window.electronAPI.window.setAlwaysOnTop(newValue);
      setIsAlwaysOnTop(newValue);
    } catch (error) {
      console.error('Failed to toggle always on top:', error);
    }
  };

  const toggleCompactMode = async () => {
    try {
      const newValue = !isCompactMode;
      setIsCompactMode(newValue);
      if (newValue) {
        prevAlwaysOnTopRef.current = isAlwaysOnTop;
      }
      await window.electronAPI.window.setCompactMode(newValue);
      await window.electronAPI.store.set('compactMode', newValue);

      // 小窗强制置顶；退出时恢复进小窗前的置顶状态（不再无条件取消）
      const topValue = newValue ? true : prevAlwaysOnTopRef.current;
      await window.electronAPI.window.setAlwaysOnTop(topValue);
      setIsAlwaysOnTop(topValue);
    } catch (error) {
      console.error('Failed to toggle compact mode:', error);
    }
  };

  const toggleAutoHideEnabled = async () => {
    try {
      const newValue = !isAutoHideEnabled;
      await window.electronAPI.window.setAutoHideEnabled(newValue);
      setIsAutoHideEnabled(newValue);
    } catch (error) {
      console.error('Failed to toggle auto hide:', error);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 输入框/文本域内不触发退出小窗，避免打字误触
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      // 按下alt+q键且处于小窗模式时，退出小窗模式
      if (event.key === 'q' && event.altKey && isCompactMode) {
        toggleCompactMode();
      }
    };

    // 添加键盘事件监听
    window.addEventListener('keydown', handleKeyDown);

    // 清理事件监听
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCompactMode]); // eslint-disable-line react-hooks/exhaustive-deps -- toggleCompactMode 每次渲染重建，isCompactMode 已在依赖中

  useEffect(() => {
    // 小窗模式下：任何用户活动都通知主进程，重置闲置计时/触发弹出
    if (!isCompactMode) return;

    const sendActivity = () => {
      const now = Date.now();
      if (now - lastActivitySentAtRef.current < 250) return;
      lastActivitySentAtRef.current = now;
      window.electronAPI.window.userActivity().catch((error) => console.error('Failed to send user activity:', error));
    };

    const onMouseMove = () => sendActivity();
    const onMouseDown = () => sendActivity();
    const onWheel = () => sendActivity();
    const onKeyDown = () => sendActivity();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isCompactMode]);

  const minimizeWindow = async () => {
    try {
      await window.electronAPI.window.minimize();
      setIsMinimized(true);
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const toggleAutoStart = async () => {
    try {
      const newValue = !isAutoStart;
      await window.electronAPI.autoStart.set(newValue);
      setIsAutoStart(newValue);
    } catch (error) {
      console.error('Failed to toggle auto start:', error);
    }
  };

  const maximizeWindow = async () => {
    try {
      await window.electronAPI.window.maximize();
    } catch (error) {
      console.error('Failed to maximize window:', error);
    }
  };

  const closeWindow = async () => {
    try {
      await window.electronAPI.window.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  return (
    <WindowContext.Provider
      value={{
        isAlwaysOnTop,
        isMinimized,
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
      }}
    >
      {children}
    </WindowContext.Provider>
  );
}

export function useWindow(): WindowContextType { // eslint-disable-line react-refresh/only-export-components -- Provider+Hook 同文件是 React 标准模式
  const context = useContext(WindowContext);
  if (context === undefined) {
    throw new Error('useWindow must be used within a WindowProvider');
  }
  return context;
}