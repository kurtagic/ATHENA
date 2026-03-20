import { BrowserWindow, screen } from 'electron';
import { createOverlayWindow, isAlive } from './overlayWindow';

let quickNotifWin: BrowserWindow | null = null;

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
  <input id="msg" type="text" placeholder="Notification..." maxlength="256" autofocus />
  <script>
    function getValue() {
      return document.getElementById('msg').value;
    }
  </script>
</body></html>`;
}

export function showQuickNotifWindow(
  mainWindow: BrowserWindow,
): void {
  // Toggle: if already open, close it
  if (isAlive(quickNotifWin)) {
    quickNotifWin.destroy();
    return;
  }

  const { height: screenH } = screen.getPrimaryDisplay().bounds;

  quickNotifWin = createOverlayWindow(buildQuickNotifHTML(), {
    width: 420,
    height: 52,
    position: { x: Math.round((screen.getPrimaryDisplay().bounds.width - 420) / 2), y: Math.round(screenH * 0.3) },
    focusable: true,
    webPreferences: {
      contextIsolation: false,
    },
  });

  quickNotifWin.webContents.once('did-finish-load', () => {
    if (isAlive(quickNotifWin)) {
      quickNotifWin.show();
      quickNotifWin.focus();
    }
  });

  // Handle Enter/Escape via before-input-event
  quickNotifWin.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'Escape') {
      event.preventDefault();
      if (isAlive(quickNotifWin)) {
        quickNotifWin.destroy();
      }
      return;
    }

    if (input.key === 'Enter') {
      event.preventDefault();
      if (!isAlive(quickNotifWin)) return;

      quickNotifWin.webContents.executeJavaScript('getValue()').then((value: string) => {
        const text = (value || '').trim();
        if (text && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('send-quick-notification', text);
        }
        if (isAlive(quickNotifWin)) {
          quickNotifWin.destroy();
        }
      }).catch(() => {
        if (isAlive(quickNotifWin)) {
          quickNotifWin.destroy();
        }
      });
      return;
    }
  });

  quickNotifWin.on('closed', () => {
    quickNotifWin = null;
  });

  // Close if window loses focus
  quickNotifWin.on('blur', () => {
    if (isAlive(quickNotifWin)) {
      quickNotifWin.destroy();
    }
  });
}

export function destroyQuickNotifWindow(): void {
  if (isAlive(quickNotifWin)) {
    quickNotifWin.destroy();
    quickNotifWin = null;
  }
}
