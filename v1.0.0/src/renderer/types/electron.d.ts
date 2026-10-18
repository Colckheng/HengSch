import type { SyncConfig, SyncStatus, SyncPayload, AiChatMessage, AiChatResult } from '@hengsch/shared-types';

export interface AiMaskedSettings {
  model: 'deepseek-flash' | 'deepseek-v4-pro';
  monitorVerdictEnabled: boolean;
  apiKeySet: boolean;
  apiKeyMasked: string;
}

export interface OpenReminderItem {
  todoId: string;
  remindAt: number;
  title: string;
  description?: string;
  group?: string;
  color?: string;
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setAlwaysOnTop: (flag: boolean) => Promise<void>;
    getAlwaysOnTop: () => Promise<boolean>;
    getBounds: () => Promise<{ width: number; height: number; x: number; y: number } | null>;
    setCompactMode: (isCompact: boolean) => Promise<void>;
    getAutoHideEnabled: () => Promise<boolean>;
    setAutoHideEnabled: (enabled: boolean) => Promise<void>;
    userActivity: () => Promise<void>;
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
  sync: {
    deviceInfo: () => Promise<{ deviceId: string }>;
    getConfig: () => Promise<{ config: SyncConfig | null; publicKey: string | null }>;
    getStatus: () => Promise<SyncStatus>;
    configure: (cfg: SyncConfig) => Promise<{ ok: boolean; error?: string }>;
    test: (cfg: SyncConfig) => Promise<{ ok: boolean; error?: string }>;
    run: (local?: SyncPayload) => Promise<{ status: SyncStatus; merged?: SyncPayload }>;
    onStatus: (cb: (payload: SyncStatus) => void) => () => void;
    onMerged: (cb: (payload: SyncPayload) => void) => () => void;
  };
  monitor: {
    configure: (
      entries: {
        todoId: string;
        title: string;
        exeName: string;
        thresholdMinutes: number;
        auto?: boolean;
        askOnExit?: boolean;
      }[]
    ) => Promise<void>;
    listProcesses: () => Promise<string[]>;
    getProgress: () => Promise<{ day: string; progress: Record<string, { ms: number; notified: boolean }> }>;
    setJournalEnabled: (enabled: boolean) => Promise<boolean>;
    getJournalEnabled: () => Promise<boolean>;
    onProgress: (cb: (payload: { day: string; progress: Record<string, { ms: number; notified: boolean }> }) => void) => () => void;
    onCompleted: (cb: (payload: { todoId: string }) => void) => () => void;
    /** 进程结束询问的裁决结果：complete=标记完成；revert=撤销自动完成回待办 */
    onAskResolved: (cb: (payload: { todoId: string; action: 'complete' | 'revert' }) => void) => () => void;
  };
  reminder: {
    preview: () => Promise<boolean>;
    list: () => Promise<OpenReminderItem[]>;
    act: (command: { todoId: string; remindAt: number; action: 'complete' | 'snooze' | 'dismiss'; snoozeAt?: number }) => Promise<{ ok: boolean; error?: string }>;
  };
  ai: {
    chat: (messages: AiChatMessage[]) => Promise<AiChatResult>;
    stop: () => Promise<void>;
    commit: (id: string, patch?: unknown) => Promise<boolean>;
    reject: (id: string) => Promise<boolean>;
    settingsGet: () => Promise<AiMaskedSettings>;
    settingsSet: (patch: { apiKey?: string; model?: 'deepseek-flash' | 'deepseek-v4-pro'; monitorVerdictEnabled?: boolean }) => Promise<AiMaskedSettings>;
    settingsTest: (key?: string) => Promise<{ ok: boolean; message: string }>;
    onChunk: (cb: (payload: { delta: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}