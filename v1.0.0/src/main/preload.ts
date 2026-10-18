import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
    getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),
    getBounds: () => ipcRenderer.invoke('window:getBounds'),
    setCompactMode: (isCompact: boolean) => ipcRenderer.invoke('window:setCompactMode', isCompact),
    getAutoHideEnabled: () => ipcRenderer.invoke('window:autoHide:getEnabled'),
    setAutoHideEnabled: (enabled: boolean) => ipcRenderer.invoke('window:autoHide:setEnabled', enabled),
    userActivity: () => ipcRenderer.invoke('window:userActivity')
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },
  autoStart: {
    set: (enable: boolean) => ipcRenderer.invoke('auto-start:set', enable),
    get: () => ipcRenderer.invoke('auto-start:get')
  },
  sync: {
    deviceInfo: () => ipcRenderer.invoke('sync:deviceInfo'),
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    configure: (cfg: unknown) => ipcRenderer.invoke('sync:configure', cfg),
    test: (cfg: unknown) => ipcRenderer.invoke('sync:test', cfg),
    run: (local?: unknown) => ipcRenderer.invoke('sync:run', local),
    onStatus: (cb: (payload: unknown) => void) => {
      const handler = (_: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('sync:status', handler);
      return () => ipcRenderer.removeListener('sync:status', handler);
    },
    onMerged: (cb: (payload: unknown) => void) => {
      const handler = (_: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('sync:merged', handler);
      return () => ipcRenderer.removeListener('sync:merged', handler);
    }
  },
  monitor: {
    configure: (entries: unknown[]) => ipcRenderer.invoke('monitor:configure', entries),
    listProcesses: () => ipcRenderer.invoke('monitor:listProcesses'),
    getProgress: () => ipcRenderer.invoke('monitor:getProgress'),
    setJournalEnabled: (enabled: boolean) => ipcRenderer.invoke('monitor:setJournalEnabled', enabled),
    getJournalEnabled: () => ipcRenderer.invoke('monitor:getJournalEnabled'),
    onProgress: (cb: (payload: unknown) => void) => {
      const handler = (_: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('monitor:progress', handler);
      return () => ipcRenderer.removeListener('monitor:progress', handler);
    },
    onCompleted: (cb: (payload: unknown) => void) => {
      const handler = (_: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('monitor:completed', handler);
      return () => ipcRenderer.removeListener('monitor:completed', handler);
    },
    onAskResolved: (cb: (payload: unknown) => void) => {
      const handler = (_: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('monitor:ask-resolved', handler);
      return () => ipcRenderer.removeListener('monitor:ask-resolved', handler);
    }
  },
  reminder: {
    preview: () => ipcRenderer.invoke('reminder:preview'),
    list: () => ipcRenderer.invoke('reminder:list'),
    act: (command: { todoId: string; remindAt: number; action: 'complete' | 'snooze' | 'dismiss'; snoozeAt?: number }) =>
      ipcRenderer.invoke('reminder:act', command)
  },
  ai: {
    chat: (messages: unknown) => ipcRenderer.invoke('ai:chat', messages),
    stop: () => ipcRenderer.invoke('ai:stop'),
    commit: (id: string, patch?: unknown) => ipcRenderer.invoke('ai:commit', id, patch),
    reject: (id: string) => ipcRenderer.invoke('ai:reject', id),
    settingsGet: () => ipcRenderer.invoke('ai:settings:get'),
    settingsSet: (patch: unknown) => ipcRenderer.invoke('ai:settings:set', patch),
    settingsTest: (key?: string) => ipcRenderer.invoke('ai:settings:test', key),
    onChunk: (cb: (payload: { delta: string }) => void) => {
      const handler = (_: unknown, payload: { delta: string }) => cb(payload);
      ipcRenderer.on('ai:chunk', handler);
      return () => ipcRenderer.removeListener('ai:chunk', handler);
    }
  }
});
