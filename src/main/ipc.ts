import { app, ipcMain, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setSelectedHexes } from './warPoller';
import { getSettings, updateSettings } from './settings';
import { registerOverlayHotkey, registerTttHotkey, registerQuickNotifHotkey, registerQuickControlsHotkey } from './hotkeys';
import { muteOtherApps, unmuteOtherApps } from './audioSilencer';
import { updatePipData, showPip, destroyPip, updatePipLobbyStatus, getPipWin } from './pipWindow';
import { showNotesPip, destroyNotesPip, updateNotesPipData } from './notesPipWindow';
import { showCrewPip, destroyCrewPip, updateCrewPipData } from './crewPipWindow';
import { showMinimapPip, destroyMinimapPip, updateMinimapPipData, sendMinimapHexData } from './minimapPipWindow';
import { showBannerWindow } from './bannerWindow';
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
    const oldQnKey = oldSettings.keybinds.quickNotification;
    const oldQcKey = oldSettings.keybinds.quickControls;

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

    if (partial.keybinds?.quickNotification && partial.keybinds.quickNotification !== oldQnKey) {
      const qnSuccess = registerQuickNotifHotkey(newSettings.keybinds.quickNotification, win);
      if (!qnSuccess) {
        updateSettings({ keybinds: { quickNotification: oldQnKey } });
        registerQuickNotifHotkey(oldQnKey, win);
        return {
          settings: getSettings(),
          error: `Could not register "${partial.keybinds.quickNotification}". It may be in use by another application.`,
        };
      }
    }

    if (partial.keybinds?.quickControls && partial.keybinds.quickControls !== oldQcKey) {
      const qcSuccess = registerQuickControlsHotkey(newSettings.keybinds.quickControls, win);
      if (!qcSuccess) {
        updateSettings({ keybinds: { quickControls: oldQcKey } });
        registerQuickControlsHotkey(oldQcKey, win);
        return {
          settings: getSettings(),
          error: `Could not register "${partial.keybinds.quickControls}". It may be in use by another application.`,
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

  ipcMain.on('toggle-pip', (_event, show: boolean) => {
    if (show) showPip(win); else destroyPip();
  });

  ipcMain.on('pip-lobby-status', (_event, connected: boolean) => {
    updatePipLobbyStatus(connected);
  });

  ipcMain.on('pip-open-spotter', () => {
    const pipWin = getPipWin();
    if (pipWin) {
      pipWin.webContents.send('pip-start-spotter');
    }
  });

  ipcMain.on('pip-command', (_event, command: string) => {
    if (command !== 'fire' && command !== 'stop') return;
    if (win && !win.isDestroyed()) {
      win.webContents.send('pip-command', command);
      if (win.getOpacity() === 0) showBannerWindow(command);
    }
  });

  ipcMain.on('toggle-notes-pip', (_event, show: boolean, text?: string) => {
    if (show) showNotesPip(text); else destroyNotesPip();
  });

  ipcMain.on('update-pinned-notes', (_event, text: string) => {
    updateNotesPipData(text);
  });

  ipcMain.on('notes-pip-text-change', (_event, text: string) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('notes-pip-text-change', text);
    }
  });

  ipcMain.on('toggle-crew-pip', (_event, show: boolean, crews?: unknown[]) => {
    if (show) showCrewPip(crews as any[]); else destroyCrewPip();
  });

  ipcMain.on('update-crew-pip', (_event, crews: unknown[]) => {
    updateCrewPipData(crews as any[]);
  });

  ipcMain.on('toggle-minimap-pip', (_event, show: boolean, hexData?: unknown) => {
    if (show) showMinimapPip(win, hexData); else destroyMinimapPip();
  });

  ipcMain.on('update-minimap-pip', (_event, layer: string, data: unknown) => {
    updateMinimapPipData(layer, data);
  });

  ipcMain.on('minimap-hex-data-from-renderer', (_event, data: unknown) => {
    sendMinimapHexData(data);
  });

}
