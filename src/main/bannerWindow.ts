import { BrowserWindow, screen } from 'electron';

let bannerWin: BrowserWindow | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function buildBannerHTML(command: 'fire' | 'stop'): string {
  const isFire = command === 'fire';
  const text = isFire ? 'ARTILLERY FIRE' : 'ARTILLERY STOP';
  const color = isFire ? '#34d399' : '#ef4444';
  const glow = isFire
    ? '0 0 30px rgba(16,185,129,0.8), 0 0 60px rgba(16,185,129,0.4)'
    : '0 0 30px rgba(239,68,68,0.8), 0 0 60px rgba(239,68,68,0.4)';
  const borderColor = isFire ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
  const bgColor = isFire ? 'rgba(6,78,59,0.7)' : 'rgba(69,10,10,0.7)';

  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; }
  body {
    display: flex; align-items: center; justify-content: center;
    width: 100vw; height: 100vh;
  }
  .banner {
    padding: 32px 64px;
    border-radius: 12px;
    border: 2px solid ${borderColor};
    background: ${bgColor};
    backdrop-filter: blur(8px);
    animation: flash 1.5s ease-out forwards;
  }
  .text {
    font-family: 'Segoe UI', 'Inter', system-ui, sans-serif;
    font-size: 48px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: ${color};
    text-shadow: ${glow};
  }
  @keyframes flash {
    0% { opacity: 0; transform: scale(0.95); }
    10% { opacity: 1; transform: scale(1); }
    80% { opacity: 1; }
    100% { opacity: 0; transform: scale(1.02); }
  }
</style></head><body>
  <div class="banner"><div class="text">${text}</div></div>
</body></html>`;
}

export function showBannerWindow(command: 'fire' | 'stop'): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  if (bannerWin && !bannerWin.isDestroyed()) {
    bannerWin.destroy();
    bannerWin = null;
  }

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().bounds;
  const winW = 900;
  const winH = 200;

  bannerWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round((screenH - winH) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  bannerWin.setAlwaysOnTop(true, 'screen-saver');
  bannerWin.setIgnoreMouseEvents(true);

  const html = buildBannerHTML(command);
  bannerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  bannerWin.webContents.once('did-finish-load', () => {
    if (bannerWin && !bannerWin.isDestroyed()) {
      bannerWin.showInactive();
    }
  });

  bannerWin.on('closed', () => {
    bannerWin = null;
  });

  hideTimer = setTimeout(() => {
    if (bannerWin && !bannerWin.isDestroyed()) {
      bannerWin.destroy();
      bannerWin = null;
    }
    hideTimer = null;
  }, 1600);
}

export function destroyBannerWindow(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (bannerWin && !bannerWin.isDestroyed()) {
    bannerWin.destroy();
    bannerWin = null;
  }
}
