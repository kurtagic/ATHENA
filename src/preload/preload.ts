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
  showCustomNotification: (text: string, senderName: string, targetKind?: string, senderRole?: string, targetLabel?: string) => {
    ipcRenderer.send('show-custom-notification', text, senderName, targetKind, senderRole, targetLabel);
  },
  onSendQuickNotification: (callback: (data: { text: string; target?: { kind: string; crewId?: string } }) => void) => {
    ipcRenderer.on('send-quick-notification', (_event, data) => callback(data));
  },
  onRequestNotifContext: (callback: () => void) => {
    ipcRenderer.on('request-notif-context', () => callback());
  },
  sendNotifContextReply: (data: { isOfficer: boolean; crews: { id: string; name: string }[] }) => {
    ipcRenderer.send('notif-context-reply', data);
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
  onQuickControlsToggle: (callback: () => void) => {
    ipcRenderer.on('quick-controls-toggle', () => callback());
  },
  onQcRequestArtilleryData: (callback: () => void) => {
    ipcRenderer.on('qc-request-artillery-data', () => callback());
  },
  sendQcArtilleryDataReply: (data: unknown) => {
    ipcRenderer.send('qc-artillery-data-reply', data);
  },
  onQcSelectSpotter: (callback: (payload: any) => void) => {
    ipcRenderer.on('qc-select-spotter', (_event, payload) => callback(payload));
  },
  onQcSpotterAdjust: (callback: (payload: any) => void) => {
    ipcRenderer.on('qc-spotter-adjust', (_event, payload) => callback(payload));
  },
  sendQcSpotterUpdate: (data: unknown) => {
    ipcRenderer.send('qc-spotter-update', data);
  },
  onQcCloseMode: (callback: () => void) => {
    ipcRenderer.on('qc-close-mode', () => callback());
  },
  toggleNotesPip: (show: boolean, text?: string) => {
    ipcRenderer.send('toggle-notes-pip', show, text);
  },
  updatePinnedNotes: (text: string) => {
    ipcRenderer.send('update-pinned-notes', text);
  },
  onNotesPipTextChange: (callback: (text: string) => void) => {
    ipcRenderer.on('notes-pip-text-change', (_event, text) => callback(text));
  },
  toggleCrewPip: (show: boolean, crews?: unknown[]) => {
    ipcRenderer.send('toggle-crew-pip', show, crews);
  },
  updateCrewPip: (crews: unknown[]) => {
    ipcRenderer.send('update-crew-pip', crews);
  },
  onQcRequestCrewData: (callback: () => void) => {
    ipcRenderer.on('qc-request-crew-data', () => callback());
  },
  sendQcCrewDataReply: (data: unknown) => {
    ipcRenderer.send('qc-crew-data-reply', data);
  },
  onQcCrewSetStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('qc-crew-set-status', (_event, status) => callback(status));
  },
  onQcTogglePip: (callback: () => void) => {
    ipcRenderer.on('qc-toggle-pip', () => callback());
  },
  onQcToggleNotesPip: (callback: () => void) => {
    ipcRenderer.on('qc-toggle-notes-pip', () => callback());
  },
  onQcToggleCrewPip: (callback: () => void) => {
    ipcRenderer.on('qc-toggle-crew-pip', () => callback());
  },
  onQcRequestPinStates: (callback: () => void) => {
    ipcRenderer.on('qc-request-pin-states', () => callback());
  },
  sendQcPinStatesReply: (data: { artillery: boolean; notes: boolean; crew: boolean; minimap: boolean }) => {
    ipcRenderer.send('qc-pin-states-reply', data);
  },
  toggleMinimapPip: (show: boolean, hexData?: unknown) => {
    ipcRenderer.send('toggle-minimap-pip', show, hexData);
  },
  updateMinimapPip: (layer: string, data: unknown) => {
    ipcRenderer.send('update-minimap-pip', layer, data);
  },
  onQcToggleMinimapPip: (callback: () => void) => {
    ipcRenderer.on('qc-toggle-minimap-pip', () => callback());
  },
  onMinimapSelectHex: (callback: (hexId: string) => void) => {
    ipcRenderer.on('minimap-select-hex', (_e, hexId) => callback(hexId));
  },
  onMinimapRequestHexList: (callback: () => void) => {
    ipcRenderer.on('minimap-request-hex-list', () => callback());
  },
  onMinimapRequestHexListForced: (callback: () => void) => {
    ipcRenderer.on('minimap-request-hex-list-forced', () => callback());
  },
  sendMinimapHexListReply: (hexes: { id: string; name: string }[]) => {
    ipcRenderer.send('minimap-hex-list-reply', hexes);
  },
  sendMinimapHexData: (data: unknown) => {
    ipcRenderer.send('minimap-hex-data-from-renderer', data);
  },
  quit: () => {
    ipcRenderer.send('quit');
  },
});
