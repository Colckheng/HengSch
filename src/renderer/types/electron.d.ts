export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setAlwaysOnTop: (flag: boolean) => Promise<void>;
    getAlwaysOnTop: () => Promise<boolean>;
    getBounds: () => Promise<{ width: number; height: number; x: number; y: number } | null>;
    setCompactMode: (isCompact: boolean) => Promise<void>;
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  autoStart: {
    set: (enable: boolean) => Promise<void>;
    get: () => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}