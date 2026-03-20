import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { createOverlayWindow, isAlive } from './overlayWindow';

let qcWin: BrowserWindow | null = null;
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
  * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
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
  .gun-list { margin: 8px 0; }
  .gun-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 6px;
    font-family: 'Consolas', monospace; font-size: 14px;
    color: rgba(255,255,255,0.75);
  }
  .gun-star { color: rgba(255,255,255,0.25); font-size: 14px; }
  .gun-star.main { color: #ffd54f; }
  .gun-label { font-weight: 600; min-width: 30px; }
  .gun-val { color: #ffd54f; font-weight: 700; font-size: 16px; }
</style></head><body>
  <div class="container" id="root"></div>
  <script>
    const { ipcRenderer } = require('electron');
    let currentMode = 'menu';
    let artilleryData = {};
    let crewData = null;

    // Spotter state
    let spotterHexName = '';

    function resize() {
      setTimeout(() => {
        ipcRenderer.send('qc-resize', document.body.scrollHeight);
      }, 10);
    }

    const statusColors = {
      afk: '#4b5a61', ready: '#2e7d32', holding: '#2a5da8', standby: '#1a7a9e',
      withdraw: '#b5721a', prepping: '#3d7a40', engaging: '#b03030', reposition: '#b5901a',
      at: '#a52a2a', pve: '#553a8a', 'refuel-rearm': '#1a8a96', downed: '#a52525',
      repairing: '#7a3490', 'armour-repair': '#5e483d', 'out-of-ammo': '#b5502a',
      'turret-damaged': '#a5305a', 'large-hole': '#8b1a1a'
    };

    const genericIds = new Set(['afk','ready','holding','standby','withdraw','prepping','engaging','reposition']);

    function buildStatusGrid(statuses, label) {
      if (!statuses.length) return '';
      let html = '<div style="font-size:9px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;padding:0 2px">' + label + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">';
      statuses.forEach(function(s) {
        const active = s.id === crewData.currentStatus;
        const color = statusColors[s.id] || '#888';
        const activeStyle = active ? 'border-color:#ffd54f;box-shadow:0 0 8px rgba(255,213,79,0.4),inset 0 0 4px rgba(255,213,79,0.15)' : 'border-color:transparent';
        html += '<button class="item-btn" data-status="' + s.id + '" style="text-align:center;display:flex;align-items:center;justify-content:center;border-radius:20px;padding:5px 10px;font-size:11px;font-weight:600;color:#000;background:' + color + ';' + activeStyle + '">' +
          s.label + '</button>';
      });
      html += '</div>';
      return html;
    }

    function buildCrewStatusSection() {
      if (!crewData) return '';
      const typeLabels = { infantry: 'Infantry', air: 'Air', tank: 'Tank', artillery: 'Artillery', naval: 'Naval' };
      const typeLabel = typeLabels[crewData.crewType] || crewData.crewType;
      const statuses = crewData.statuses || [];
      const generic = statuses.filter(function(s) { return genericIds.has(s.id); });
      const specific = statuses.filter(function(s) { return !genericIds.has(s.id); });
      let html = '<div class="crew-status-section" style="margin-bottom:10px">' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px;text-align:center">' +
        crewData.crewName + ' \\u00B7 ' + typeLabel + '</div>' +
        buildStatusGrid(generic, 'General') +
        buildStatusGrid(specific, typeLabel) +
        '</div>';
      return html;
    }

    function render() {
      const root = document.getElementById('root');

      if (currentMode === 'menu') {
        ipcRenderer.send('qc-mode-change', 'menu');
        // Request crew data first
        ipcRenderer.send('qc-request-crew-data');
        ipcRenderer.once('qc-crew-data', (e, data) => {
          crewData = data;
          root.innerHTML =
            '<h2>Quick Controls</h2>' +
            buildCrewStatusSection() +
            '<div class="hint">Press F2 to close</div>';
          // Bind crew status buttons
          function bindStatusButtons() {
            root.querySelectorAll('[data-status]').forEach(function(btn) {
              btn.onclick = function() {
                ipcRenderer.send('qc-crew-set-status', btn.dataset.status);
                crewData.currentStatus = btn.dataset.status;
                // Update just the crew section without re-fetching
                var crewSection = root.querySelector('.crew-status-section');
                if (crewSection) {
                  crewSection.outerHTML = buildCrewStatusSection();
                  bindStatusButtons();
                }
              };
            });
          }
          bindStatusButtons();
          resize();
          if (pendingSpotterTrigger) {
            pendingSpotterTrigger = false;
            triggerSpotter();
          }
        });
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
          '<div id="gun-list" class="gun-list"></div>' +
          '<div class="hint">\\u2190\\u2192 Azimuth \\u00B7 \\u2191\\u2193 Distance \\u00B7 F2 to close</div>';
        document.getElementById('back').onclick = () => { currentMode = 'menu'; render(); };
        resize();
        return;
      }

    }

    // Listen for display values from renderer
    ipcRenderer.on('qc-spotter-update', (e, data) => {
      const list = document.getElementById('gun-list');
      if (!list) return;
      var main = (data.guns || []).find(function(g) { return g.isMain; });
      if (!main) {
        list.innerHTML = '<div class="empty">No main gun</div>';
        return;
      }
      list.innerHTML = '<div class="gun-row">' +
        '<span class="gun-star main">\\u2605</span>' +
        '<span class="gun-label">' + main.label + '</span>' +
        '<span class="gun-val">' + Math.round(main.distanceM) + 'm</span>' +
        '<span class="gun-val">' + Math.round(main.azimuthDeg) + '\\u00B0</span>' +
      '</div>';
    });

    function triggerSpotter() {
      ipcRenderer.send('qc-request-artillery-data');
      ipcRenderer.once('qc-artillery-data', (e, data) => {
        artilleryData = data || {};
        currentMode = 'spotter-select';
        render();
      });
    }

    // Auto-trigger spotter when requested from PIP
    let pendingSpotterTrigger = false;
    ipcRenderer.on('qc-start-spotter', () => {
      if (currentMode === 'spotter-select' || currentMode === 'spotting') return;
      if (currentMode === 'menu' && document.getElementById('root').innerHTML) {
        triggerSpotter();
      } else {
        pendingSpotterTrigger = true;
      }
    });

    render();
  </script>
</body></html>`;
}

export function showQuickControlsWindow(
  mainWindow: BrowserWindow,
  initialMode?: 'spotter',
): void {
  // If already open and spotter requested, just trigger spotter mode
  if (isAlive(qcWin)) {
    if (initialMode === 'spotter') {
      qcWin.webContents.send('qc-start-spotter');
      return;
    }
    qcWin.destroy();
    return;
  }

  const { height: screenH } = screen.getPrimaryDisplay().bounds;
  const winW = 380;

  qcWin = createOverlayWindow(buildQuickControlsHTML(), {
    width: winW,
    height: 260,
    position: { x: Math.round((screen.getPrimaryDisplay().bounds.width - winW) / 2), y: Math.round(screenH * 0.25) },
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  qcWin.webContents.once('did-finish-load', () => {
    if (isAlive(qcWin)) {
      qcWin.showInactive();
      if (initialMode === 'spotter') {
        qcWin.webContents.send('qc-start-spotter');
      }
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
    if (isAlive(qcWin)) {
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
    if (isAlive(qcWin)) {
      qcWin.webContents.send('qc-spotter-update', data);
    }
  };
  ipcMain.on('qc-spotter-update', onSpotterUpdate);

  // IPC: request crew data from renderer
  const onRequestCrewData = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-request-crew-data');
    }
  };
  ipcMain.on('qc-request-crew-data', onRequestCrewData);

  // IPC: renderer replies with crew data, forward to qc window
  const onCrewDataReply = (_event: Electron.IpcMainEvent, data: any) => {
    if (isAlive(qcWin)) {
      qcWin.webContents.send('qc-crew-data', data);
    }
  };
  ipcMain.on('qc-crew-data-reply', onCrewDataReply);

  // IPC: crew set status — forward to renderer
  const onCrewSetStatus = (_event: Electron.IpcMainEvent, status: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-crew-set-status', status);
    }
  };
  ipcMain.on('qc-crew-set-status', onCrewSetStatus);

  // IPC: resize window
  const onResize = (_event: Electron.IpcMainEvent, height: number) => {
    if (isAlive(qcWin)) {
      qcWin.setSize(winW, Math.min(Math.max(height + 20, 100), 500));
    }
  };
  ipcMain.on('qc-resize', onResize);

  const cleanup = () => {
    ipcMain.removeListener('qc-request-artillery-data', onRequestData);
    ipcMain.removeListener('qc-artillery-data-reply', onDataReply);
    ipcMain.removeListener('qc-select-spotter', onSelectSpotter);
    ipcMain.removeListener('qc-mode-change', onModeChange);
    ipcMain.removeListener('qc-spotter-update', onSpotterUpdate);
    ipcMain.removeListener('qc-resize', onResize);
    ipcMain.removeListener('qc-request-crew-data', onRequestCrewData);
    ipcMain.removeListener('qc-crew-data-reply', onCrewDataReply);
    ipcMain.removeListener('qc-crew-set-status', onCrewSetStatus);
    unregisterSpotterArrows();
    // Tell renderer to clean up
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-close-mode');
    }
  };

  qcWin.on('closed', () => {
    qcWin = null;
    cleanup();
  });

  // Window is non-focusable so no blur handler needed
}

export function destroyQuickControlsWindow(): void {
  if (isAlive(qcWin)) {
    qcWin.destroy();
    qcWin = null;
  }
}
