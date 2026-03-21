import { BrowserWindow, ipcMain, screen } from 'electron';
import { createOverlayWindow, isAlive, resizeToPanel } from './overlayWindow';

let qcWin: BrowserWindow | null = null;

function buildQuickControlsHTML(): string {
  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
  html, body { background: transparent; overflow: visible; }
  body {
    padding: 4px;
    font-family: 'Cascadia Code', 'Consolas', 'SF Mono', monospace;
    color: #e0e0e0;
  }
  .panel {
    display: inline-block;
    background: rgba(12, 12, 16, 0.95);
    border: 1px solid rgba(255, 213, 79, 0.2);
    border-radius: 8px;
    padding: 16px;
    min-width: 300px;
    max-width: 360px;
    box-shadow: 0 0 24px rgba(0,0,0,0.6), 0 0 12px rgba(255,213,79,0.06);
    -webkit-app-region: drag;
    -webkit-font-smoothing: antialiased;
  }
  button, .btn, .item-btn {
    -webkit-app-region: no-drag;
  }
  h2 {
    font-size: 13px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #ffd54f;
    text-align: center; margin-bottom: 12px;
  }
  .item-btn {
    display: block; width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid rgba(255, 213, 79, 0.15);
    background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.75);
    cursor: pointer; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    text-align: left; margin-bottom: 4px;
    transition: background 0.15s, border-color 0.15s;
  }
  .item-btn:hover { background: rgba(255, 213, 79, 0.15); border-color: rgba(255, 213, 79, 0.5); }
  .hint { text-align: center; font-size: 10px; color: rgba(255, 213, 79, 0.3); letter-spacing: 0.05em; margin-top: 8px; }
  .section-header {
    display: flex; align-items: center; gap: 8px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.12em; color: #ffd54f;
    margin-bottom: 6px; padding: 0 2px;
  }
  .section-header::after {
    content: ''; flex: 1; height: 1px;
    background: linear-gradient(to right, rgba(255, 213, 79, 0.15), transparent);
  }
  .pin-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; margin-bottom: 8px; }
  .pin-btn {
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px; padding: 6px 10px; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid rgba(255, 213, 79, 0.15); background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.6); cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    -webkit-app-region: no-drag;
  }
  .pin-btn:hover { background: rgba(255, 213, 79, 0.15); border-color: rgba(255, 213, 79, 0.5); }
  .pin-btn.active {
    background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.5);
    color: #34d399;
  }
</style></head><body>
  <div class="panel" id="root"></div>
  <script>
    const { ipcRenderer } = require('electron');
    let crewData = null;

    // Pin states
    let pinStates = { artillery: false, notes: false, crew: false, minimap: false };

    function buildPinnedWindowsSection() {
      return '<div class="section-header" style="margin-top:8px">Pinned Windows</div>' +
        '<div class="pin-grid">' +
        '<button class="pin-btn' + (pinStates.artillery ? ' active' : '') + '" data-pin="artillery">Artillery</button>' +
        '<button class="pin-btn' + (pinStates.notes ? ' active' : '') + '" data-pin="notes">Notes</button>' +
        '<button class="pin-btn' + (pinStates.crew ? ' active' : '') + '" data-pin="crew">Crew</button>' +
        '<button class="pin-btn' + (pinStates.minimap ? ' active' : '') + '" data-pin="minimap">Minimap</button>' +
        '</div>';
    }

    function bindPinButtons() {
      document.querySelectorAll('[data-pin]').forEach(function(btn) {
        btn.onclick = function() {
          const pin = btn.dataset.pin;
          if (pin === 'artillery') ipcRenderer.send('qc-toggle-pip');
          else if (pin === 'notes') ipcRenderer.send('qc-toggle-notes-pip');
          else if (pin === 'crew') ipcRenderer.send('qc-toggle-crew-pip');
          else if (pin === 'minimap') ipcRenderer.send('qc-toggle-minimap-pip');
        };
      });
    }

    function updatePinButtons() {
      document.querySelectorAll('[data-pin]').forEach(function(btn) {
        const pin = btn.dataset.pin;
        if (pinStates[pin]) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }

    // Listen for pin state updates from renderer
    ipcRenderer.on('qc-pin-states', (e, data) => {
      pinStates = data;
      updatePinButtons();
    });

    const statusColors = {
      afk: [75,90,97], ready: [46,125,50], holding: [42,93,168], standby: [26,122,158],
      withdraw: [181,114,26], prepping: [61,122,64], engaging: [176,48,48], reposition: [181,144,26],
      at: [165,42,42], pve: [85,58,138], 'refuel-rearm': [26,138,150], downed: [165,37,37],
      repairing: [122,52,144], 'armour-repair': [94,72,61], 'out-of-ammo': [181,80,42],
      'turret-damaged': [165,48,90], 'large-hole': [139,26,26]
    };

    const genericIds = new Set(['afk','standby','withdraw','prepping','engaging','reposition']);

    function buildStatusGrid(statuses, label) {
      if (!statuses.length) return '';
      let html = '<div style="font-size:10px;color:rgba(255,213,79,0.5);font-weight:700;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:3px;padding:0 2px">' + label + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">';
      statuses.forEach(function(s) {
        const active = s.id === crewData.currentStatus;
        const rgb = statusColors[s.id] || [136,136,136];
        const r = rgb[0], g = rgb[1], b = rgb[2];
        const bg = active ? 'rgba(' + r + ',' + g + ',' + b + ',0.35)' : 'rgba(' + r + ',' + g + ',' + b + ',0.15)';
        const textColor = active ? 'rgba(' + Math.min(r+80,255) + ',' + Math.min(g+80,255) + ',' + Math.min(b+80,255) + ',1)' : 'rgba(' + Math.min(r+60,255) + ',' + Math.min(g+60,255) + ',' + Math.min(b+60,255) + ',0.9)';
        const borderColor = active ? 'rgba(' + r + ',' + g + ',' + b + ',0.9)' : 'rgba(' + r + ',' + g + ',' + b + ',0.5)';
        html += '<button class="item-btn" data-status="' + s.id + '" style="text-align:center;display:flex;align-items:center;justify-content:center;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:' + textColor + ';background:' + bg + ';border-color:' + borderColor + '">' +
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

      ipcRenderer.send('qc-mode-change', 'menu');
      // Request crew data first
      ipcRenderer.send('qc-request-crew-data');
      ipcRenderer.send('qc-request-pin-states');
      ipcRenderer.once('qc-crew-data', (e, data) => {
        crewData = data;
        root.innerHTML =
          '<h2>Quick Controls</h2>' +
          (crewData ? '<div class="section-header">Crew Status</div>' : '') +
          buildCrewStatusSection() +
          buildPinnedWindowsSection() +
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
        bindPinButtons();
        ipcRenderer.send('qc-content-ready');
      });
    }

    render();
  </script>
</body></html>`;
}

export function showQuickControlsWindow(
  mainWindow: BrowserWindow,
): void {
  // If already open, toggle off
  if (isAlive(qcWin)) {
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
      // Initial resize after crew data arrives (via qc-content-ready),
      // but also do a delayed fallback resize in case content renders without IPC
      setTimeout(() => resizeToPanel(qcWin), 150);
    }
  });

  // IPC: mode change — track for blur behavior
  const onModeChange = (_event: Electron.IpcMainEvent, _mode: string) => {
    // No-op now that spotter is handled in PIP, but keep for future modes
  };
  ipcMain.on('qc-mode-change', onModeChange);

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

  // IPC: toggle PIPs from QC window
  const onTogglePip = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-toggle-pip');
    }
  };
  ipcMain.on('qc-toggle-pip', onTogglePip);

  const onToggleNotesPip = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-toggle-notes-pip');
    }
  };
  ipcMain.on('qc-toggle-notes-pip', onToggleNotesPip);

  const onToggleCrewPip = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-toggle-crew-pip');
    }
  };
  ipcMain.on('qc-toggle-crew-pip', onToggleCrewPip);

  const onToggleMinimapPip = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-toggle-minimap-pip');
    }
  };
  ipcMain.on('qc-toggle-minimap-pip', onToggleMinimapPip);

  // IPC: request pin states from renderer
  const onRequestPinStates = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-request-pin-states');
    }
  };
  ipcMain.on('qc-request-pin-states', onRequestPinStates);

  // IPC: renderer replies with pin states, forward to qc window
  const onPinStatesReply = (_event: Electron.IpcMainEvent, data: any) => {
    if (isAlive(qcWin)) {
      qcWin.webContents.send('qc-pin-states', data);
    }
  };
  ipcMain.on('qc-pin-states-reply', onPinStatesReply);

  // IPC: renderer sends pin state updates (from overlay UI), forward to qc window
  const onPinStatesUpdate = (_event: Electron.IpcMainEvent, data: any) => {
    if (isAlive(qcWin)) {
      qcWin.webContents.send('qc-pin-states', data);
    }
  };
  ipcMain.on('qc-pin-states-update', onPinStatesUpdate);

  // IPC: content ready — resize to fit panel
  const onContentReady = () => {
    setTimeout(() => resizeToPanel(qcWin), 20);
  };
  ipcMain.on('qc-content-ready', onContentReady);

  const cleanup = () => {
    ipcMain.removeListener('qc-mode-change', onModeChange);
    ipcMain.removeListener('qc-content-ready', onContentReady);
    ipcMain.removeListener('qc-request-crew-data', onRequestCrewData);
    ipcMain.removeListener('qc-crew-data-reply', onCrewDataReply);
    ipcMain.removeListener('qc-crew-set-status', onCrewSetStatus);
    ipcMain.removeListener('qc-toggle-pip', onTogglePip);
    ipcMain.removeListener('qc-toggle-notes-pip', onToggleNotesPip);
    ipcMain.removeListener('qc-toggle-crew-pip', onToggleCrewPip);
    ipcMain.removeListener('qc-toggle-minimap-pip', onToggleMinimapPip);
    ipcMain.removeListener('qc-request-pin-states', onRequestPinStates);
    ipcMain.removeListener('qc-pin-states-reply', onPinStatesReply);
    ipcMain.removeListener('qc-pin-states-update', onPinStatesUpdate);
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
