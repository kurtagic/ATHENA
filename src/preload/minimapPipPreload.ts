import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('minimapBridge', {
  onHexData: (cb: (data: any) => void) => ipcRenderer.on('minimap-hex-data', (_e, data) => cb(data)),
  onLayerUpdate: (cb: (layer: string, data: any) => void) => ipcRenderer.on('minimap-layer-update', (_e, layer, data) => cb(layer, data)),
  onHexList: (cb: (hexes: any[]) => void) => ipcRenderer.on('minimap-hex-list', (_e, hexes) => cb(hexes)),
  selectHex: (hexId: string) => ipcRenderer.send('minimap-select-hex', hexId),
  requestHexList: () => ipcRenderer.send('minimap-request-hex-list-from-pip'),
});
