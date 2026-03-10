import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { registerTileProtocol } from './protocol';
import { registerIpcHandlers } from './ipc';
import { startPoller, stopPoller } from './warPoller';
import { loadSettings } from './settings';
import { registerOverlayHotkey, registerPttHotkey } from './hotkeys';
import { unmuteOtherApps } from './audioSilencer';

// Handle Squirrel install/update/uninstall events
const squirrelArg = process.argv[1];
if (squirrelArg === '--squirrel-install' || squirrelArg === '--squirrel-updated') {
  const updateExe = path.join(process.execPath, '..', '..', 'Update.exe');
  const exeName = path.basename(process.execPath);
  spawnSync(updateExe, ['--createShortcut', exeName]);
  process.exit(0);
} else if (squirrelArg === '--squirrel-uninstall') {
  const updateExe = path.join(process.execPath, '..', '..', 'Update.exe');
  const exeName = path.basename(process.execPath);
  spawnSync(updateExe, ['--removeShortcut', exeName]);
  process.exit(0);
} else if (squirrelArg === '--squirrel-obsolete') {
  process.exit(0);
}

// Vite injects these at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const settings = loadSettings();
  const windowed = settings.general.windowedMode;

  const primaryDisplay = screen.getPrimaryDisplay();
  const fullBounds = primaryDisplay.bounds;
  const workArea = primaryDisplay.workArea;

  const winWidth = windowed ? Math.round(workArea.width * 0.7) : fullBounds.width;
  const winHeight = windowed ? Math.round(workArea.height * 0.7) : fullBounds.height;
  const winX = windowed ? Math.round(workArea.x + (workArea.width - winWidth) / 2) : fullBounds.x;
  const winY = windowed ? Math.round(workArea.y + (workArea.height - winHeight) / 2) : fullBounds.y;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    frame: windowed,
    alwaysOnTop: !windowed,
    skipTaskbar: false,
    transparent: false,
    resizable: windowed,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'athena.ico')
      : path.join(app.getAppPath(), 'athena.ico'),
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  if (!windowed) {
    // Force full display bounds — Windows clips frameless windows to work area
    mainWindow.setBounds(fullBounds);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  registerIpcHandlers(mainWindow);
  startPoller(mainWindow);

  registerOverlayHotkey(settings.keybinds.toggleOverlay, mainWindow);
  registerPttHotkey(settings.keybinds.pushToTalk, mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  registerTileProtocol();
  createWindow();
});

ipcMain.on('quit', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopPoller();
  unmuteOtherApps();
});

app.on('window-all-closed', () => {
  app.quit();
});
