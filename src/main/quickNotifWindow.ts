import { BrowserWindow, screen } from 'electron';
import { createOverlayWindow, isAlive } from './overlayWindow';

let quickNotifWin: BrowserWindow | null = null;

export interface NotifContext {
  isOfficer: boolean;
  crews: { id: string; name: string }[];
}

function buildQuickNotifHTML(context?: NotifContext): string {
  const isOfficer = context?.isOfficer ?? false;
  const crews = context?.crews ?? [];

  const pillsHTML = isOfficer ? `
    <div id="pills" style="display:flex;gap:5px;margin-top:8px;justify-content:center;flex-wrap:wrap;">
      <button class="pill pill-active" data-kind="everyone" data-crew="" style="--pill-color:#ffd54f;">Everyone</button>
      <button class="pill" data-kind="officers" data-crew="" style="--pill-color:#c084fc;">Officers</button>
      ${crews.map(c => `<button class="pill" data-kind="crew" data-crew="${c.id}" style="--pill-color:#f87171;">${c.name}</button>`).join('')}
    </div>` : '';

  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    width: 100vw; height: 100vh; padding: 6px;
  }
  .pill {
    background: rgba(30, 28, 24, 0.95);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 3px 12px;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.55);
    cursor: pointer;
    outline: none;
    transition: all 0.15s;
  }
  .pill:hover { background: rgba(50, 46, 38, 0.95); color: rgba(255,255,255,0.75); }
  .pill-active {
    background: color-mix(in srgb, var(--pill-color) 25%, rgba(20, 16, 4, 0.95));
    border-color: color-mix(in srgb, var(--pill-color) 60%, transparent);
    color: var(--pill-color);
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
    transition: border-color 0.15s, color 0.15s;
  }
  input::placeholder { color: rgba(255, 213, 79, 0.3); }
  input:focus { border-color: rgba(255, 213, 79, 0.5); }
</style></head><body>
  <input id="msg" type="text" placeholder="Notification..." maxlength="256" autofocus />
  ${pillsHTML}
  <script>
    var selectedTarget = { kind: 'everyone' };
    var colorMap = { everyone: '#ffd54f', officers: '#c084fc', crew: '#f87171' };

    function applyColor(kind) {
      var c = colorMap[kind] || '#ffd54f';
      var inp = document.getElementById('msg');
      inp.style.color = c;
      inp.style.caretColor = c;
      inp.style.borderColor = c.replace(')', ',0.3)').replace('rgb', 'rgba');
    }

    var pills = document.querySelectorAll('.pill');
    pills.forEach(function(pill) {
      pill.addEventListener('click', function(e) {
        e.preventDefault();
        pills.forEach(function(p) { p.classList.remove('pill-active'); });
        pill.classList.add('pill-active');
        var kind = pill.dataset.kind;
        if (kind === 'crew') {
          selectedTarget = { kind: 'crew', crewId: pill.dataset.crew };
        } else {
          selectedTarget = { kind: kind };
        }
        applyColor(kind);
        document.getElementById('msg').focus();
      });
    });

    function getValue() {
      return JSON.stringify({ text: document.getElementById('msg').value, target: selectedTarget });
    }
  </script>
</body></html>`;
}

export function showQuickNotifWindow(
  mainWindow: BrowserWindow,
  context?: NotifContext,
): void {
  // Toggle: if already open, close it
  if (isAlive(quickNotifWin)) {
    quickNotifWin.destroy();
    return;
  }

  const { height: screenH, width: screenW } = screen.getPrimaryDisplay().bounds;
  const isOfficer = context?.isOfficer ?? false;
  const winHeight = isOfficer ? 96 : 52;

  quickNotifWin = createOverlayWindow(buildQuickNotifHTML(context), {
    width: 420,
    height: winHeight,
    position: { x: Math.round((screenW - 420) / 2), y: Math.round(screenH * 0.3) },
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
        let parsed: { text: string; target?: { kind: string; crewId?: string } };
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = { text: value };
        }
        const text = (parsed.text || '').trim();
        if (text && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('send-quick-notification', parsed);
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
