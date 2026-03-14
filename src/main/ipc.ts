import { app, ipcMain, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setSelectedHexes } from './warPoller';
import { getSettings, updateSettings } from './settings';
import { registerOverlayHotkey, registerTttHotkey, registerQuickNotifHotkey } from './hotkeys';
import { muteOtherApps, unmuteOtherApps } from './audioSilencer';
import { updatePipData } from './pipWindow';
import type { SettingsPartial, PinnedSolution } from '../shared/types';

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

  ipcMain.handle('get-settings', () => {
    return getSettings();
  });

  ipcMain.handle('set-settings', (_event, partial: SettingsPartial) => {
    const oldSettings = getSettings();
    const oldKey = oldSettings.keybinds.toggleOverlay;
    const oldTttKey = oldSettings.keybinds.toggleToTalk;

    const newSettings = updateSettings(partial);

    if (partial.keybinds?.toggleOverlay && partial.keybinds.toggleOverlay !== oldKey) {
      const success = registerOverlayHotkey(newSettings.keybinds.toggleOverlay, win);
      if (!success) {
        // Revert to old key
        updateSettings({ keybinds: { toggleOverlay: oldKey } });
        registerOverlayHotkey(oldKey, win);
        return {
          settings: getSettings(),
          error: `Could not register "${partial.keybinds.toggleOverlay}". It may be in use by another application.`,
        };
      }
    }

    if (partial.keybinds?.toggleToTalk && partial.keybinds.toggleToTalk !== oldTttKey) {
      const tttSuccess = registerTttHotkey(newSettings.keybinds.toggleToTalk, win);
      if (!tttSuccess) {
        updateSettings({ keybinds: { toggleToTalk: oldTttKey } });
        registerTttHotkey(oldTttKey, win);
        return {
          settings: getSettings(),
          error: `Could not register "${partial.keybinds.toggleToTalk}". It may be in use by another application.`,
        };
      }
    }

    if (partial.keybinds?.quickNotification && partial.keybinds.quickNotification !== oldSettings.keybinds.quickNotification) {
      const qnSuccess = registerQuickNotifHotkey(newSettings.keybinds.quickNotification, win);
      if (!qnSuccess) {
        const oldQnKey = oldSettings.keybinds.quickNotification;
        updateSettings({ keybinds: { quickNotification: oldQnKey } });
        registerQuickNotifHotkey(oldQnKey, win);
        return {
          settings: getSettings(),
          error: `Could not register "${partial.keybinds.quickNotification}". It may be in use by another application.`,
        };
      }
    }

    return { settings: newSettings };
  });

  ipcMain.on('update-pinned-artillery', (_event, data: PinnedSolution[]) => {
    updatePipData(data);
  });

  ipcMain.on('set-app-silence', (_event, mute: boolean) => {
    if (mute) {
      muteOtherApps(process.pid);
    } else {
      unmuteOtherApps();
    }
  });

}
