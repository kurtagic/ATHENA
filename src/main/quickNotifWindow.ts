import { BrowserWindow, globalShortcut, screen } from 'electron';

let quickNotifWin: BrowserWindow | null = null;
let reRegisterCallback: (() => void) | null = null;

function buildQuickNotifHTML(): string {
  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; }
  body {
    display: flex; align-items: center; justify-content: center;
    width: 100vw; height: 100vh;
  }
  input {
    width: 380px;
    background: rgba(20, 16, 4, 0.95);
    border: 1px solid rgba(255, 213, 79, 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 500;
    color: #ffd54f;
    outline: none;
    caret-color: #ffd54f;
    box-shadow: 0 0 20px rgba(255, 213, 79, 0.1), 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  input::placeholder { color: rgba(255, 213, 79, 0.3); }
  input:focus { border-color: rgba(255, 213, 79, 0.5); }
</style></head><body>
  <input id="msg" type="text" placeholder="Notification..." maxlength="200" autofocus />
  <script>
    function getValue() {
      return document.getElementById('msg').value;
    }
  </script>
</body></html>`;
}

export function showQuickNotifWindow(
  mainWindow: BrowserWindow,
  accelerator: string | null,
  onReRegister: () => void,
): void {
  // Toggle: if already open, close it
  if (quickNotifWin && !quickNotifWin.isDestroyed()) {
    quickNotifWin.destroy();
    return;
  }

  reRegisterCallback = onReRegister;

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().bounds;
  const winW = 420;
  const winH = 52;

  quickNotifWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round(screenH * 0.3),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  quickNotifWin.setAlwaysOnTop(true, 'screen-saver');

  // Temporarily unregister the hotkey so user can type that character
  if (accelerator) {
    globalShortcut.unregister(accelerator);
  }

  const html = buildQuickNotifHTML();
  quickNotifWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  quickNotifWin.webContents.once('did-finish-load', () => {
    if (quickNotifWin && !quickNotifWin.isDestroyed()) {
      quickNotifWin.show();
      quickNotifWin.focus();
    }
  });

  // Handle Enter/Escape via before-input-event
  quickNotifWin.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'Escape') {
      event.preventDefault();
      if (quickNotifWin && !quickNotifWin.isDestroyed()) {
        quickNotifWin.destroy();
      }
      return;
    }

    if (input.key === 'Enter') {
      event.preventDefault();
      if (!quickNotifWin || quickNotifWin.isDestroyed()) return;

      quickNotifWin.webContents.executeJavaScript('getValue()').then((value: string) => {
        const text = (value || '').trim();
        if (text && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('send-quick-notification', text);
        }
        if (quickNotifWin && !quickNotifWin.isDestroyed()) {
          quickNotifWin.destroy();
        }
      }).catch(() => {
        if (quickNotifWin && !quickNotifWin.isDestroyed()) {
          quickNotifWin.destroy();
        }
      });
      return;
    }
  });

  quickNotifWin.on('closed', () => {
    quickNotifWin = null;
    // Re-register the hotkey
    if (reRegisterCallback) {
      reRegisterCallback();
      reRegisterCallback = null;
    }
  });

  // Close if window loses focus
  quickNotifWin.on('blur', () => {
    if (quickNotifWin && !quickNotifWin.isDestroyed()) {
      quickNotifWin.destroy();
    }
  });
}

export function destroyQuickNotifWindow(): void {
  if (quickNotifWin && !quickNotifWin.isDestroyed()) {
    quickNotifWin.destroy();
    quickNotifWin = null;
  }
}
