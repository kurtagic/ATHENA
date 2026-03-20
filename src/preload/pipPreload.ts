import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pipBridge', {
  sendCommand: (command: string) => ipcRenderer.send('pip-command', command),
  openSpotter: () => ipcRenderer.send('pip-open-spotter'),
});
