import { contextBridge, ipcRenderer } from 'electron';

/** 询问小窗专用精简 preload：仅暴露 present（收内容）与 answer（回传答案） */
contextBridge.exposeInMainWorld('askApi', {
  onPresent: (cb: (payload: unknown) => void) => {
    const handler = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('ask:present', handler);
    return () => ipcRenderer.removeListener('ask:present', handler);
  },
  answer: (action: 'complete' | 'not-done' | 'cancel') => ipcRenderer.invoke('ask:answer', action)
});
