import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface WindowContextType {
  isAlwaysOnTop: boolean;
  isMinimized: boolean;
  isCompactMode: boolean;
  isAutoStart: boolean;
  isAutoHideEnabled: boolean;
  toggleAlwaysOnTop: () => Promise<void>;
  toggleCompactMode: () => Promise<void>;
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

  const loadWindowSettings = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadWindowSettings();
  }, [loadWindowSettings]);

  const toggleAlwaysOnTop = useCallback(async () => {
    try {
      const newValue = !isAlwaysOnTop;
      await window.electronAPI.window.setAlwaysOnTop(newValue);
      setIsAlwaysOnTop(newValue);
    } catch (error) {
      console.error('Failed to toggle always on top:', error);
    }
  }, [isAlwaysOnTop]);

  const toggleCompactMode = useCallback(async () => {
    try {
      const newValue = !isCompactMode;
      setIsCompactMode(newValue);
      await window.electronAPI.window.setCompactMode(newValue);
      await window.electronAPI.store.set('compactMode', newValue);
    } catch (error) {
      console.error('Failed to toggle compact mode:', error);
    }
  }, [isCompactMode]);

  const toggleAutoHideEnabled = useCallback(async () => {
    try {
      const newValue = !isAutoHideEnabled;
      await window.electronAPI.window.setAutoHideEnabled(newValue);
      setIsAutoHideEnabled(newValue);
    } catch (error) {
      console.error('Failed to toggle auto hide:', error);
    }
  }, [isAutoHideEnabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'q' && event.altKey && isCompactMode) {
        void toggleCompactMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCompactMode, toggleCompactMode]);

  useEffect(() => {
    if (!isCompactMode) {
      return;
    }

    const sendActivity = () => {
      const now = Date.now();
      if (now - lastActivitySentAtRef.current < 250) {
        return;
      }

      lastActivitySentAtRef.current = now;
      window.electronAPI.window
        .userActivity()
        .catch((error) => console.error('Failed to send user activity:', error));
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

  const minimizeWindow = useCallback(async () => {
    try {
      await window.electronAPI.window.minimize();
      setIsMinimized(true);
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }, []);

  const toggleAutoStart = useCallback(async () => {
    try {
      const newValue = !isAutoStart;
      const actualValue = await window.electronAPI.autoStart.set(newValue);
      setIsAutoStart(actualValue);
    } catch (error) {
      console.error('Failed to toggle auto start:', error);
    }
  }, [isAutoStart]);

  const maximizeWindow = useCallback(async () => {
    try {
      await window.electronAPI.window.maximize();
    } catch (error) {
      console.error('Failed to maximize window:', error);
    }
  }, []);

  const closeWindow = useCallback(async () => {
    try {
      await window.electronAPI.window.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  }, []);

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
