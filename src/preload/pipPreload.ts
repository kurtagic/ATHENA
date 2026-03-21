import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pipBridge', {
  sendCommand: (command: string) => ipcRenderer.send('pip-command', command),
  requestArtilleryData: () => ipcRenderer.send('pip-request-artillery-data'),
  selectSpotter: (payload: unknown) => ipcRenderer.send('pip-select-spotter', payload),
  sendModeChange: (mode: string) => ipcRenderer.send('pip-mode-change', mode),
  closeSpotter: () => ipcRenderer.send('pip-close-spotter'),
  requestResize: () => ipcRenderer.send('pip-request-resize'),
  onArtilleryData: (cb: (data: unknown) => void) => {
    ipcRenderer.on('pip-artillery-data', (_event, data) => cb(data));
  },
  onSpotterUpdate: (cb: (data: unknown) => void) => {
    ipcRenderer.on('pip-spotter-update', (_event, data) => cb(data));
  },
  onStartSpotter: (cb: () => void) => {
    ipcRenderer.on('pip-start-spotter', () => cb());
  },
});
