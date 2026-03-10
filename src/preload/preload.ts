import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('athena', {
  onWarStatus: (callback: (data: unknown) => void) => {
    ipcRenderer.on('war-status', (_event, data) => callback(data));
  },
  onHexItems: (callback: (data: unknown) => void) => {
    ipcRenderer.on('hex-items', (_event, data) => callback(data));
  },
  onStaticLabels: (callback: (data: unknown) => void) => {
    ipcRenderer.on('static-labels', (_event, data) => callback(data));
  },
  setSelectedHexes: (hexes: string[]) => {
    ipcRenderer.send('set-selected-hexes', hexes);
  },
  setAppSilence: (mute: boolean) => {
    ipcRenderer.send('set-app-silence', mute);
  },
  loadStaticData: () => {
    return ipcRenderer.invoke('load-static-data');
  },
  getSettings: () => {
    return ipcRenderer.invoke('get-settings');
  },
  setSettings: (partial: unknown) => {
    return ipcRenderer.invoke('set-settings', partial);
  },
  onPttToggle: (callback: () => void) => {
    ipcRenderer.on('ptt-toggle', () => callback());
  },
  updatePinnedArtillery: (data: unknown[]) => {
    ipcRenderer.send('update-pinned-artillery', data);
  },
  quit: () => {
    ipcRenderer.send('quit');
  },
});
