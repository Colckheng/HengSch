import type { SyncConfig, SyncStatus, SyncPayload, AiChatMessage, AiChatResult, AiProposal } from '@hengsch/shared-types';

export interface AiMaskedSettings {
  model: 'deepseek-flash' | 'deepseek-v4-pro';
  monitorVerdictEnabled: boolean;
  /** 详细程度：1=只按用户说的+默认；2=缺字段先集中问 */
  promptLevel: 1 | 2;
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

export interface VoiceModelStatus {
  state: 'ready' | 'missing' | 'downloading' | 'error';
  /** 0..1，downloading 时有效 */
  progress: number;
  /** whisper-cli.exe 是否就位 */
  exeReady: boolean;
  error?: string;
}

export interface VoiceTranscribeProgress {
  phase: 'load' | 'decode' | 'progress' | 'done';
  /** 0..99，phase=progress 时有效 */
  percent?: number;
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
    commitBatch: (commit: string[], reject: string[]) => Promise<{ committed: number; rejected: number }>;
    reject: (id: string) => Promise<boolean>;
    queueList: () => Promise<AiProposal[]>;
    queueTouch: (id: string) => Promise<boolean>;
    settingsGet: () => Promise<AiMaskedSettings>;
    settingsSet: (patch: { apiKey?: string; model?: 'deepseek-flash' | 'deepseek-v4-pro'; monitorVerdictEnabled?: boolean; promptLevel?: 1 | 2 }) => Promise<AiMaskedSettings>;
    settingsTest: (key?: string) => Promise<{ ok: boolean; message: string }>;
    voice: (data: ArrayBuffer | Uint8Array) => Promise<{ text: string }>;
    voiceModelStatus: () => Promise<VoiceModelStatus>;
    voiceModelDownload: () => Promise<VoiceModelStatus>;
    drawerStatus: (open: boolean) => Promise<boolean>;
    monitorAnswer: (todoId: string, answer: 'complete' | 'keep') => Promise<boolean>;
    onVoiceModel: (cb: (payload: VoiceModelStatus) => void) => () => void;
    onVoiceTranscribeProgress: (cb: (payload: VoiceTranscribeProgress) => void) => () => void;
    onMonitorAsk: (cb: (payload: { todoId: string; title: string; message: string; reason: string }) => void) => () => void;
    onMonitorVerdict: (cb: (payload: { todoId: string; title: string; verdict: 'complete' | 'ask' | 'keep'; reason: string; trigger: 'threshold' | 'exit' }) => void) => () => void;
    onChunk: (cb: (payload: { delta: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}