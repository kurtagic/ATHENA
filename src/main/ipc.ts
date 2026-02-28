import { app, ipcMain, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setSelectedHexes } from './warPoller';

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.on('set-selected-hexes', (_event, hexes: string[]) => {
    setSelectedHexes(hexes);
  });

  ipcMain.handle('load-static-data', async () => {
    // In dev, app.getAppPath() is the project root; packaged, static/ is an extraResource
    const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
    const staticPath = path.join(basePath, 'static', 'static_data.json');
    try {
      const raw = await readFile(staticPath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('[ipc] Failed to load static_data.json:', err);
      return null;
    }
  });
}
