import { globalShortcut, BrowserWindow } from 'electron';
import { showPip, hidePip } from './pipWindow';

let currentAccelerator: string | null = null;
let currentPttAccelerator: string | null = null;

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

export function registerPttHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  if (currentPttAccelerator) {
    globalShortcut.unregister(currentPttAccelerator);
    currentPttAccelerator = null;
  }

  const success = globalShortcut.register(accelerator, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('ptt-toggle');
  });

  if (success) {
    currentPttAccelerator = accelerator;
  }
  return success;
}

export function getCurrentAccelerator(): string | null {
  return currentAccelerator;
}
