import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';

let qcWin: BrowserWindow | null = null;
let reRegisterCallback: (() => void) | null = null;
let spotterArrowsRegistered = false;

function registerSpotterArrows(mainWindow: BrowserWindow) {
  if (spotterArrowsRegistered) return;
  const keys = [
    { key: 'Left', azDelta: -4, distDelta: 0 },
    { key: 'Right', azDelta: 4, distDelta: 0 },
    { key: 'Up', azDelta: 0, distDelta: 8 },
    { key: 'Down', azDelta: 0, distDelta: -8 },
  ];
  for (const k of keys) {
    globalShortcut.register(k.key, () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('qc-spotter-adjust', { azDelta: k.azDelta, distDelta: k.distDelta });
      }
    });
  }
  spotterArrowsRegistered = true;
}

function unregisterSpotterArrows() {
  if (!spotterArrowsRegistered) return;
  for (const key of ['Left', 'Right', 'Up', 'Down']) {
    globalShortcut.unregister(key);
  }
  spotterArrowsRegistered = false;
}

function buildQuickControlsHTML(): string {
  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; }
  body {
    display: flex; align-items: flex-start; justify-content: center;
    width: 100vw; height: 100vh;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e0e0;
  }
  .container {
    background: rgba(14, 14, 18, 0.96);
    border: 1px solid rgba(255, 213, 79, 0.2);
    border-radius: 12px;
    padding: 16px;
    min-width: 300px;
    max-width: 360px;
    box-shadow: 0 0 24px rgba(0,0,0,0.6), 0 0 12px rgba(255,213,79,0.06);
    -webkit-app-region: drag;
  }
  button, .btn, .back-btn, .item-btn {
    -webkit-app-region: no-drag;
  }
  h2 {
    font-size: 13px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #ffd54f;
    text-align: center; margin-bottom: 12px;
  }
  .btn {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 10px 14px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02); color: #e0e0e0;
    cursor: pointer; margin-bottom: 8px;
    transition: background 0.15s, border-color 0.15s;
    font-size: 13px; font-weight: 600; text-align: left;
  }
  .btn:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,213,79,0.25); }
  .btn-icon { color: #ffd54f; font-size: 18px; }
  .btn-sub { font-size: 11px; color: rgba(255,255,255,0.35); font-weight: 400; }
  .back-btn {
    background: none; border: none; color: rgba(255,255,255,0.35);
    cursor: pointer; font-size: 14px; padding: 2px 4px; margin-right: 4px;
    transition: color 0.15s;
  }
  .back-btn:hover { color: rgba(255,255,255,0.7); }
  .header-row { display: flex; align-items: center; margin-bottom: 12px; }
  .hex-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: rgba(255,255,255,0.25); padding: 0 4px; margin-bottom: 4px;
  }
  .item-btn {
    display: block; width: 100%; padding: 8px 12px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.75);
    cursor: pointer; font-size: 12px; font-weight: 500;
    text-align: left; margin-bottom: 4px;
    transition: background 0.15s, border-color 0.15s;
  }
  .item-btn:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,213,79,0.25); }
  .empty { text-align: center; color: rgba(255,255,255,0.25); font-size: 12px; padding: 16px 0; }
  .hint { text-align: center; font-size: 10px; color: rgba(255,255,255,0.18); margin-top: 8px; }
  .hex-group { margin-bottom: 8px; }

  /* HUD styles */
  .hud-row {
    display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
  }
  .hud-icon { color: #ffd54f; font-size: 16px; }
  .hud-label { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); }
  .hud-vals {
    display: flex; gap: 16px; justify-content: center;
    margin: 12px 0;
  }
  .hud-val-block { text-align: center; }
  .hud-val-num {
    font-size: 20px; font-family: 'Consolas', monospace;
    font-weight: 700; color: #ffd54f;
  }
  .hud-val-unit {
    font-size: 10px; color: rgba(255,255,255,0.3);
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .delta-row {
    display: flex; gap: 16px; justify-content: center;
    margin-bottom: 4px;
  }
  .delta-val {
    font-size: 12px; font-family: 'Consolas', monospace;
    color: rgba(255,255,255,0.45);
  }
  .delta-pos { color: rgba(255,160,60,0.8); }
  .delta-neg { color: rgba(100,180,255,0.8); }
  .delta-zero { color: rgba(255,255,255,0.25); }
</style></head><body>
  <div class="container" id="root"></div>
  <script>
    const { ipcRenderer } = require('electron');
    let currentMode = 'menu';
    let artilleryData = {};

    // Spotter state
    let spotterHexName = '';

    function resize() {
      setTimeout(() => {
        ipcRenderer.send('qc-resize', document.body.scrollHeight);
      }, 10);
    }

    function render() {
      const root = document.getElementById('root');

      if (currentMode === 'menu') {
        ipcRenderer.send('qc-mode-change', 'menu');
        root.innerHTML =
          '<h2>Quick Controls</h2>' +
          '<button class="btn" id="btn-spotter">' +
            '<span class="btn-icon">\\u2316</span>' +
            '<div><div>Spotter</div><div class="btn-sub">Adjust impact with arrow keys</div></div>' +
          '</button>' +
          '<div class="hint">Press Escape to close</div>';
        document.getElementById('btn-spotter').onclick = () => {
          ipcRenderer.send('qc-request-artillery-data');
          ipcRenderer.once('qc-artillery-data', (e, data) => {
            artilleryData = data || {};
            currentMode = 'spotter-select';
            render();
          });
        };
        resize();
        return;
      }

      if (currentMode === 'spotter-select') {
        let items = '';
        let hasAny = false;
        for (const [hexId, data] of Object.entries(artilleryData)) {
          if (data.target && data.targetEntityId) {
            hasAny = true;
            const mainGun = (data.positions && data.positions.length > 0)
              ? data.positions[data.mainGunIndex || 0]?.latlng || null
              : null;
            items += '<button class="item-btn" data-hex="' + hexId + '" data-hex-name="' + data.hexName + '"' +
              " data-target='" + JSON.stringify(data.target) + "'" +
              ' data-target-eid="' + data.targetEntityId + '"' +
              " data-impact='" + JSON.stringify(data.impact) + "'" +
              ' data-impact-eid="' + (data.impactEntityId || '') + '"' +
              " data-main-gun='" + JSON.stringify(mainGun) + "'>" + data.hexName + '</button>';
          }
        }
        root.innerHTML =
          '<div class="header-row">' +
            '<button class="back-btn" id="back">\\u2190</button>' +
            '<h2 style="margin:0">Select Target</h2>' +
          '</div>' +
          (hasAny ? items : '<div class="empty">No active targets</div>');
        document.getElementById('back').onclick = () => { currentMode = 'menu'; render(); };
        root.querySelectorAll('.item-btn').forEach(btn => {
          btn.onclick = () => {
            spotterHexName = btn.dataset.hexName;
            ipcRenderer.send('qc-select-spotter', {
              hexId: btn.dataset.hex, hexName: btn.dataset.hexName,
              target: JSON.parse(btn.dataset.target),
              targetEntityId: btn.dataset.targetEid,
              impact: JSON.parse(btn.dataset.impact),
              impactEntityId: btn.dataset.impactEid || null,
              mainGunPosition: JSON.parse(btn.dataset.mainGun || 'null'),
            });
            currentMode = 'spotting';
            render();
          };
        });
        resize();
        return;
      }

      if (currentMode === 'spotting') {
        ipcRenderer.send('qc-mode-change', 'spotting');
        root.innerHTML =
          '<div class="header-row">' +
            '<button class="back-btn" id="back">\\u2190</button>' +
            '<h2 style="margin:0">Spotting: ' + spotterHexName + '</h2>' +
          '</div>' +
          '<div class="hud-vals">' +
            '<div class="hud-val-block"><div class="hud-val-num" id="abs-dist">--</div><div class="hud-val-unit">Distance</div></div>' +
            '<div class="hud-val-block"><div class="hud-val-num" id="abs-az">--</div><div class="hud-val-unit">Azimuth</div></div>' +
          '</div>' +
          '<div class="delta-row">' +
            '<span class="delta-val delta-zero" id="delta-dist">0m</span>' +
            '<span class="delta-val delta-zero" id="delta-az">0\\u00B0</span>' +
          '</div>' +
          '<div class="hint">\\u2190\\u2192 Azimuth \\u00B7 \\u2191\\u2193 Distance \\u00B7 Esc to stop</div>';
        document.getElementById('back').onclick = () => { currentMode = 'menu'; render(); };
        resize();
        return;
      }

    }

    // Listen for display values from renderer
    ipcRenderer.on('qc-spotter-update', (e, data) => {
      const absDistEl = document.getElementById('abs-dist');
      const absAzEl = document.getElementById('abs-az');
      const dDistEl = document.getElementById('delta-dist');
      const dAzEl = document.getElementById('delta-az');
      if (absDistEl) absDistEl.textContent = Math.round(data.absDist) + 'm';
      if (absAzEl) absAzEl.textContent = Math.round(data.absAz) + '\\u00B0';
      if (dDistEl) {
        const d = Math.round(data.deltaDist);
        dDistEl.textContent = d + 'm';
        dDistEl.className = 'delta-val ' + (d > 0 ? 'delta-pos' : 'delta-zero');
      }
      if (dAzEl) {
        const d = Math.round(data.deltaAz);
        dAzEl.textContent = d + '\\u00B0';
        dAzEl.className = 'delta-val ' + (d > 0 ? 'delta-pos' : 'delta-zero');
      }
    });

    render();
  </script>
</body></html>`;
}

export function showQuickControlsWindow(
  mainWindow: BrowserWindow,
  accelerator: string | null,
  onReRegister: () => void,
): void {
  if (qcWin && !qcWin.isDestroyed()) {
    qcWin.destroy();
    return;
  }

  reRegisterCallback = onReRegister;

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().bounds;
  const winW = 380;
  const winH = 260;

  qcWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round(screenH * 0.25),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  qcWin.setAlwaysOnTop(true, 'screen-saver');

  if (accelerator) {
    globalShortcut.unregister(accelerator);
  }

  const html = buildQuickControlsHTML();
  qcWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  qcWin.webContents.once('did-finish-load', () => {
    if (qcWin && !qcWin.isDestroyed()) {
      qcWin.show();
      qcWin.focus();
    }
  });

  // Track current mode to decide blur behavior
  let currentHudMode = 'menu';

  // IPC: request artillery data from renderer
  const onRequestData = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-request-artillery-data');
    }
  };
  ipcMain.on('qc-request-artillery-data', onRequestData);

  // IPC: renderer replies with data, forward to qc window
  const onDataReply = (_event: Electron.IpcMainEvent, data: any) => {
    if (qcWin && !qcWin.isDestroyed()) {
      qcWin.webContents.send('qc-artillery-data', data);
    }
  };
  ipcMain.on('qc-artillery-data-reply', onDataReply);

  // IPC: spotter selected — forward to renderer, keep window open
  const onSelectSpotter = (_event: Electron.IpcMainEvent, payload: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-select-spotter', payload);
    }
  };
  ipcMain.on('qc-select-spotter', onSelectSpotter);

  // IPC: mode change — track for blur behavior
  const onModeChange = (_event: Electron.IpcMainEvent, mode: string) => {
    currentHudMode = mode;
    if (mode === 'spotting') {
      registerSpotterArrows(mainWindow);
    } else {
      unregisterSpotterArrows();
    }
  };
  ipcMain.on('qc-mode-change', onModeChange);

  // IPC: spotter update from renderer — forward to qc window
  const onSpotterUpdate = (_event: Electron.IpcMainEvent, data: any) => {
    if (qcWin && !qcWin.isDestroyed()) {
      qcWin.webContents.send('qc-spotter-update', data);
    }
  };
  ipcMain.on('qc-spotter-update', onSpotterUpdate);

  // IPC: resize window
  const onResize = (_event: Electron.IpcMainEvent, height: number) => {
    if (qcWin && !qcWin.isDestroyed()) {
      qcWin.setSize(winW, Math.min(Math.max(height + 20, 100), 500));
    }
  };
  ipcMain.on('qc-resize', onResize);

  // Arrow keys in spotting mode — forward to renderer
  qcWin.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'Escape') {
      event.preventDefault();
      // In HUD modes, go back to menu instead of closing
      if (currentHudMode === 'spotting') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('qc-close-mode');
        }
        if (qcWin && !qcWin.isDestroyed()) {
          qcWin.webContents.executeJavaScript('currentMode = "menu"; render();');
        }
        return;
      }
      if (qcWin && !qcWin.isDestroyed()) qcWin.destroy();
      return;
    }

  });

  const cleanup = () => {
    ipcMain.removeListener('qc-request-artillery-data', onRequestData);
    ipcMain.removeListener('qc-artillery-data-reply', onDataReply);
    ipcMain.removeListener('qc-select-spotter', onSelectSpotter);
    ipcMain.removeListener('qc-mode-change', onModeChange);
    ipcMain.removeListener('qc-spotter-update', onSpotterUpdate);
    ipcMain.removeListener('qc-resize', onResize);
    unregisterSpotterArrows();
    // Tell renderer to clean up
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-close-mode');
    }
    if (reRegisterCallback) {
      reRegisterCallback();
      reRegisterCallback = null;
    }
  };

  qcWin.on('closed', () => {
    qcWin = null;
    cleanup();
  });

  // Only close on blur when in menu/select modes, not in HUD modes
  qcWin.on('blur', () => {
    if (currentHudMode === 'spotting') return;
    if (qcWin && !qcWin.isDestroyed()) qcWin.destroy();
  });
}

export function destroyQuickControlsWindow(): void {
  if (qcWin && !qcWin.isDestroyed()) {
    qcWin.destroy();
    qcWin = null;
  }
}
