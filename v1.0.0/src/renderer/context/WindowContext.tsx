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

  useEffect(() => {
    loadWindowSettings();
  }, []);

  const loadWindowSettings = async () => {
    try {
      const alwaysOnTop = await window.electronAPI.window.getAlwaysOnTop();
      setIsAlwaysOnTop(alwaysOnTop);

      const compactMode = await window.electronAPI.store.get('compactMode');
      setIsCompactMode(Boolean(compactMode));

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
      await window.electronAPI.window.setCompactMode(newValue);
      await window.electronAPI.store.set('compactMode', newValue);
      
      // 小窗模式激活时自动置顶，退出时取消置顶
      await window.electronAPI.window.setAlwaysOnTop(newValue);
      setIsAlwaysOnTop(newValue);
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
  }, [isCompactMode]);

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

export function useWindow(): WindowContextType {
  const context = useContext(WindowContext);
  if (context === undefined) {
    throw new Error('useWindow must be used within a WindowProvider');
  }
  return context;
}