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
  onTttToggle: (callback: () => void) => {
    ipcRenderer.on('ttt-toggle', () => callback());
  },
  updatePinnedArtillery: (data: unknown[]) => {
    ipcRenderer.send('update-pinned-artillery', data);
  },
  showCommandBanner: (command: string) => {
    ipcRenderer.send('show-command-banner', command);
  },
  showCustomNotification: (text: string, senderName: string) => {
    ipcRenderer.send('show-custom-notification', text, senderName);
  },
  onSendQuickNotification: (callback: (text: string) => void) => {
    ipcRenderer.on('send-quick-notification', (_event, text) => callback(text));
  },
  onCheckLobbyStatus: (callback: () => void) => {
    ipcRenderer.on('check-lobby-status', () => callback());
  },
  sendLobbyStatusResult: (inLobby: boolean) => {
    ipcRenderer.send('lobby-status-result', inLobby);
  },
  togglePip: (show: boolean) => {
    ipcRenderer.send('toggle-pip', show);
  },
  sendPipLobbyStatus: (connected: boolean) => {
    ipcRenderer.send('pip-lobby-status', connected);
  },
  onPipCommand: (callback: (command: string) => void) => {
    ipcRenderer.on('pip-command', (_event, command) => callback(command));
  },
  quit: () => {
    ipcRenderer.send('quit');
  },
});
