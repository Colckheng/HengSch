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
  }
});