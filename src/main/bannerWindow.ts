import { BrowserWindow, screen } from 'electron';
import { createOverlayWindow, isAlive, safeExec } from './overlayWindow';

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

  if (isAlive(bannerWin)) {
    bannerWin.destroy();
    bannerWin = null;
  }

  const html = buildBannerHTML(command);

  bannerWin = createOverlayWindow(html, {
    width: 900,
    height: 200,
    position: 'center',
  });

  bannerWin.setIgnoreMouseEvents(true);

  bannerWin.webContents.once('did-finish-load', () => {
    if (isAlive(bannerWin)) {
      bannerWin.showInactive();
    }
  });

  bannerWin.on('closed', () => {
    bannerWin = null;
  });

  hideTimer = setTimeout(() => {
    if (isAlive(bannerWin)) {
      bannerWin.destroy();
      bannerWin = null;
    }
    hideTimer = null;
  }, 1600);
}

// ── Custom notification native window (single window, stacked cards) ──

let notifWin: BrowserWindow | null = null;
let notifId = 0;
const activeNotifs: { id: number; timer: ReturnType<typeof setTimeout> }[] = [];

const NOTIF_WIN_W = 600;
const NOTIF_WIN_H = 400;

function getNotifHTML(): string {
  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; }
  body {
    display: flex; flex-direction: column; align-items: center;
    width: 100vw; padding-top: 16px; gap: 8px;
  }
  .card {
    padding: 16px 32px;
    border-radius: 12px;
    border: 1px solid rgba(255, 213, 79, 0.4);
    background: linear-gradient(180deg, rgba(40, 32, 8, 0.85) 0%, rgba(24, 20, 6, 0.92) 100%);
    box-shadow: 0 0 20px rgba(255, 213, 79, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: notif-enter 3s ease-out forwards;
    max-width: 500px;
  }
  .card-officers {
    border-color: rgba(192, 132, 252, 0.4);
    background: linear-gradient(180deg, rgba(32, 16, 48, 0.85) 0%, rgba(18, 8, 32, 0.92) 100%);
    box-shadow: 0 0 20px rgba(192, 132, 252, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .card-officers .sender { color: rgba(192, 132, 252, 0.6); }
  .card-officers .text { color: #c084fc; }
  .card-crew {
    border-color: rgba(248, 113, 113, 0.4);
    background: linear-gradient(180deg, rgba(48, 16, 16, 0.85) 0%, rgba(32, 8, 8, 0.92) 100%);
    box-shadow: 0 0 20px rgba(248, 113, 113, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .card-crew .sender { color: rgba(248, 113, 113, 0.6); }
  .card-crew .text { color: #f87171; }
  .sender {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 213, 79, 0.6);
    font-weight: 600;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .arrow { font-size: 14px; opacity: 0.5; }
  .role-icon { font-size: 10px; }
  .text {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: #ffd54f;
    white-space: pre-wrap;
    word-break: break-word;
  }
  @keyframes notif-enter {
    0% { opacity: 0; transform: translateY(-12px); }
    8% { opacity: 1; transform: translateY(0); }
    75% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-4px); }
  }
</style></head><body>
<script>
  function addNotification(id, text, senderName, targetKind, senderRole, targetLabel) {
    const card = document.createElement('div');
    var cls = 'card';
    if (targetKind === 'officers') cls += ' card-officers';
    else if (targetKind === 'crew') cls += ' card-crew';
    card.className = cls;
    card.dataset.id = id;
    var star = (senderRole === 'owner' || senderRole === 'officer') ? '<span class="role-icon">\u2605</span> ' : '';
    var arrow = (targetLabel && targetKind !== 'everyone') ? ' <span class="arrow">\u2192</span> ' + esc(targetLabel) : '';
    card.innerHTML = '<div class="sender">' + star + esc(senderName) + arrow + '</div><div class="text">' + esc(text) + '</div>';
    document.body.appendChild(card);
  }
  function removeNotification(id) {
    const el = document.querySelector('[data-id="' + id + '"]');
    if (el) el.remove();
  }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
</script>
</body></html>`;
}

function ensureNotifWindow(): void {
  if (isAlive(notifWin)) return;

  notifWin = createOverlayWindow(getNotifHTML(), {
    width: NOTIF_WIN_W,
    height: NOTIF_WIN_H,
    position: 'top-center',
    webPreferences: {
      contextIsolation: false,
    },
  });

  notifWin.setIgnoreMouseEvents(true);

  notifWin.webContents.once('did-finish-load', () => {
    if (isAlive(notifWin)) {
      notifWin.showInactive();
    }
  });

  notifWin.on('closed', () => {
    notifWin = null;
    for (const n of activeNotifs) clearTimeout(n.timer);
    activeNotifs.length = 0;
  });
}

function removeNotif(id: number): void {
  const idx = activeNotifs.findIndex((n) => n.id === id);
  if (idx !== -1) activeNotifs.splice(idx, 1);

  safeExec(notifWin, `removeNotification(${id})`);

  // Destroy window when all notifications are gone
  if (activeNotifs.length === 0 && isAlive(notifWin)) {
    notifWin.destroy();
    notifWin = null;
  }
}

export function showNotificationWindow(text: string, senderName: string, targetKind?: string, senderRole?: string, targetLabel?: string): void {
  ensureNotifWindow();

  const id = ++notifId;
  const escaped = (s: string) => JSON.stringify(s);
  const tkArg = targetKind ? escaped(targetKind) : 'undefined';
  const srArg = senderRole ? escaped(senderRole) : 'undefined';
  const tlArg = targetLabel ? escaped(targetLabel) : 'undefined';

  const ready = () => {
    if (isAlive(notifWin)) {
      notifWin.webContents.executeJavaScript(
        `addNotification(${id}, ${escaped(text)}, ${escaped(senderName)}, ${tkArg}, ${srArg}, ${tlArg})`
      ).catch(() => {});
    }
  };

  // If window just created, wait for load; otherwise inject immediately
  if (isAlive(notifWin) && !notifWin.webContents.isLoading()) {
    ready();
  } else if (isAlive(notifWin)) {
    notifWin.webContents.once('did-finish-load', ready);
  }

  const timer = setTimeout(() => removeNotif(id), 3100);
  activeNotifs.push({ id, timer });
}

export function destroyNotificationWindow(): void {
  for (const n of activeNotifs) clearTimeout(n.timer);
  activeNotifs.length = 0;
  if (isAlive(notifWin)) {
    notifWin.destroy();
    notifWin = null;
  }
}

export function destroyBannerWindow(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (isAlive(bannerWin)) {
    bannerWin.destroy();
    bannerWin = null;
  }
}
