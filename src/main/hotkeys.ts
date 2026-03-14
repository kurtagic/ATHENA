import { globalShortcut, BrowserWindow, ipcMain } from 'electron';
import { showPip, hidePip } from './pipWindow';
import { showQuickNotifWindow } from './quickNotifWindow';

let currentAccelerator: string | null = null;
let currentTttAccelerator: string | null = null;
let currentQuickNotifAccelerator: string | null = null;

export function registerOverlayHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator);
    currentAccelerator = null;
  }

  const success = globalShortcut.register(accelerator, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.getOpacity() > 0) {
      mainWindow.setOpacity(0);
      mainWindow.setIgnoreMouseEvents(true);
      showPip();
    } else {
      mainWindow.setOpacity(1);
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.focus();
      hidePip();
    }
  });

  if (success) {
    currentAccelerator = accelerator;
  }
  return success;
}

export function registerTttHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  if (currentTttAccelerator) {
    globalShortcut.unregister(currentTttAccelerator);
    currentTttAccelerator = null;
  }

  const success = globalShortcut.register(accelerator, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('ttt-toggle');
  });

  if (success) {
    currentTttAccelerator = accelerator;
  }
  return success;
}

export function registerQuickNotifHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  if (currentQuickNotifAccelerator) {
    globalShortcut.unregister(currentQuickNotifAccelerator);
    currentQuickNotifAccelerator = null;
  }

  const success = globalShortcut.register(accelerator, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Ask renderer for lobby status before opening
    mainWindow.webContents.send('check-lobby-status');
    ipcMain.once('lobby-status-result', (_event: Electron.IpcMainEvent, inLobby: boolean) => {
      if (!inLobby) return;
      showQuickNotifWindow(mainWindow, currentQuickNotifAccelerator, () => {
        registerQuickNotifHotkey(accelerator, mainWindow);
      });
    });
  });

  if (success) {
    currentQuickNotifAccelerator = accelerator;
  }
  return success;
}

export function getCurrentAccelerator(): string | null {
  return currentAccelerator;
}

export function getCurrentQuickNotifAccelerator(): string | null {
  return currentQuickNotifAccelerator;
}
