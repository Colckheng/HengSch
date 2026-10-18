import { contextBridge, ipcRenderer } from 'electron';
import type { ReminderBridge, ReminderPaper } from '../paper-reminder/protocol';
const bridge: ReminderBridge = {
  ready: () => ipcRenderer.invoke('reminder-paper:ready'),
  onPapers: callback => { const listener = (_event: unknown, papers: ReminderPaper[]): void => callback(papers); ipcRenderer.on('reminder-paper:papers', listener); return () => ipcRenderer.removeListener('reminder-paper:papers', listener); },
  action: command => ipcRenderer.invoke('reminder-paper:action', command),
  resolved: (id, time) => ipcRenderer.invoke('reminder-paper:resolved', id, time),
  hitRegions: (regions, captured) => ipcRenderer.send('reminder-paper:regions', regions, captured)
};
contextBridge.exposeInMainWorld('reminderPaper', bridge);
