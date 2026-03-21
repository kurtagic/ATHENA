import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'node:path';
import type { PinnedSolution } from '../shared/types';
import { createOverlayWindow, isAlive, safeExec, safeExecAndResize, resizeToPanel } from './overlayWindow';

let pipWin: BrowserWindow | null = null;
let latestData: PinnedSolution[] = [];
let prevFingerprint = '';
let prevRowCount = -1;
let latestLobbyConnected = false;
let spotterArrowsRegistered = false;

const PIP_INITIAL_WIDTH = 240;
const PIP_INITIAL_HEIGHT = 130;
const PIP_MARGIN = 16;

const PIP_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
  html, body {
    background: transparent;
    overflow: visible;
  }
  body {
    padding: 4px;
  }
  .panel {
    display: inline-block;
    background: rgba(12, 12, 16, 0.95);
    color: #fff;
    font-family: 'Cascadia Code', 'Consolas', 'SF Mono', monospace;
    font-size: 13px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 213, 79, 0.2);
    -webkit-font-smoothing: antialiased;
    transition: background 600ms ease-out, border-color 600ms ease-out, box-shadow 600ms ease-out;
  }
  .title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #ffd54f;
    margin-bottom: 8px;
    opacity: 0.8;
    cursor: grab;
    -webkit-app-region: drag;
  }
  .title:active { cursor: grabbing; }
  #btns {
    display: none;
    gap: 6px;
    margin-bottom: 8px;
    -webkit-app-region: no-drag;
  }
  #btns.visible { display: flex; }
  #btns button {
    flex: 1;
    padding: 5px 10px;
    border-radius: 6px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
    border: 1px solid;
    transition: background 150ms, border-color 150ms;
  }
  #btn-fire {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.5);
  }
  #btn-fire:hover {
    background: rgba(16, 185, 129, 0.3);
    border-color: rgba(16, 185, 129, 0.7);
  }
  #btn-stop {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.5);
  }
  #btn-stop:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.7);
  }
  #btn-spot {
    background: rgba(255, 213, 79, 0.15);
    color: #ffd54f;
    border-color: rgba(255, 213, 79, 0.5);
  }
  #btn-spot:hover {
    background: rgba(255, 213, 79, 0.3);
    border-color: rgba(255, 213, 79, 0.7);
  }
  #spotter {
    display: none;
    margin-bottom: 8px;
    -webkit-app-region: no-drag;
  }
  #spotter.visible { display: block; }
  #spotter .back-btn {
    background: rgba(255, 213, 79, 0.1);
    border: 1px solid rgba(255, 213, 79, 0.25);
    border-radius: 6px;
    color: rgba(255, 213, 79, 0.7);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    margin-right: 4px;
    transition: background 0.15s, color 0.15s;
  }
  #spotter .back-btn:hover { background: rgba(255, 213, 79, 0.2); color: rgba(255, 213, 79, 0.5); }
  #spotter .header-row { display: flex; align-items: center; margin-bottom: 8px; }
  #spotter .header-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #ffd54f; margin: 0;
  }
  #spotter .item-btn {
    display: block; width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid rgba(255, 213, 79, 0.15);
    background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.75);
    cursor: pointer; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    text-align: left; margin-bottom: 4px;
    transition: background 0.15s, border-color 0.15s;
    font-family: inherit;
  }
  #spotter .item-btn:hover { background: rgba(255, 213, 79, 0.15); border-color: rgba(255, 213, 79, 0.5); }
  #spotter .empty { text-align: center; color: rgba(255,255,255,0.25); font-size: 12px; padding: 12px 0; }
  #spotter .hint { text-align: center; font-size: 10px; color: rgba(255, 213, 79, 0.3); letter-spacing: 0.05em; margin-top: 6px; }
  #spotter .gun-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 6px;
    font-family: 'Consolas', monospace; font-size: 14px;
    color: rgba(255,255,255,0.75);
  }
  #spotter .gun-star { color: #ffd54f; font-size: 14px; }
  #spotter .gun-label { font-weight: 600; min-width: 30px; }
  #spotter .gun-val { color: #ffd54f; font-weight: 700; font-size: 16px; }
  .row {
    display: flex;
    align-items: center;
    padding: 4px 0;
    gap: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .row:last-child { border-bottom: none; }
  .label { color: #ffd54f; font-weight: 600; min-width: 32px; }
  .dist { color: #e0e0e0; }
  .az { color: #e0e0e0; }
  .oor { color: #ef5350 !important; }
  .oor .dist, .oor .az { color: #ef5350; }
</style>
</head>
<body>
  <div class="panel">
    <div class="title">Pinned Artillery</div>
    <div id="btns">
      <button id="btn-fire" onclick="window.pipBridge.sendCommand('fire')">Fire</button>
      <button id="btn-stop" onclick="window.pipBridge.sendCommand('stop')">Stop</button>
      <button id="btn-spot" onclick="triggerSpotter()">Spot</button>
    </div>
    <div id="spotter"></div>
    <div id="root"></div>
  </div>
  <script>
    let spotterHexName = '';

    function resizePip() {
      setTimeout(() => window.pipBridge.requestResize(), 10);
    }

    function triggerSpotter() {
      window.pipBridge.requestArtilleryData();
    }

    function renderSpotterSelect(data) {
      const el = document.getElementById('spotter');
      let items = '';
      let hasAny = false;
      for (const [hexId, d] of Object.entries(data)) {
        if (d.target && d.targetEntityId) {
          hasAny = true;
          items += '<button class="item-btn" data-hex="' + hexId +
            '" data-hex-name="' + d.hexName + '"' +
            " data-target='" + JSON.stringify(d.target) + "'" +
            ' data-target-eid="' + d.targetEntityId + '"' +
            " data-main-gun='" + JSON.stringify(
              (d.positions && d.positions.length > 0)
                ? d.positions[d.mainGunIndex || 0]?.latlng || null
                : null
            ) + "'>" + d.hexName + '</button>';
        }
      }
      el.innerHTML =
        '<div class="header-row">' +
          '<button class="back-btn" id="spotter-back">\\u2190</button>' +
          '<div class="header-title">Select Target</div>' +
        '</div>' +
        (hasAny ? items : '<div class="empty">No active targets</div>');
      el.classList.add('visible');

      document.getElementById('spotter-back').onclick = closeSpotter;
      resizePip();
      el.querySelectorAll('.item-btn').forEach(function(btn) {
        btn.onclick = function() {
          spotterHexName = btn.dataset.hexName;
          window.pipBridge.selectSpotter({
            hexId: btn.dataset.hex,
            hexName: btn.dataset.hexName,
            target: JSON.parse(btn.dataset.target),
            targetEntityId: btn.dataset.targetEid,
            mainGunPosition: JSON.parse(btn.dataset.mainGun || 'null'),
          });
          window.pipBridge.sendModeChange('spotting');
          renderSpotting(spotterHexName);
        };
      });
    }

    function renderSpotting(hexName) {
      const el = document.getElementById('spotter');
      el.innerHTML =
        '<div class="header-row">' +
          '<button class="back-btn" id="spotter-back">\\u2190</button>' +
          '<div class="header-title">Spotting: ' + hexName + '</div>' +
        '</div>' +
        '<div id="gun-list"></div>' +
        '<div class="hint">\\u2190\\u2192 Azimuth \\u00B7 \\u2191\\u2193 Distance</div>';
      el.classList.add('visible');
      document.getElementById('spotter-back').onclick = closeSpotter;
      resizePip();
    }

    function closeSpotter() {
      const el = document.getElementById('spotter');
      el.classList.remove('visible');
      el.innerHTML = '';
      window.pipBridge.sendModeChange('normal');
      window.pipBridge.closeSpotter();
      resizePip();
    }

    // Listen for artillery data reply
    window.pipBridge.onArtilleryData(function(data) {
      renderSpotterSelect(data || {});
    });

    // Listen for spotter display updates
    window.pipBridge.onSpotterUpdate(function(data) {
      const list = document.getElementById('gun-list');
      if (!list) return;
      var main = (data.guns || []).find(function(g) { return g.isMain; });
      if (!main) {
        list.innerHTML = '<div class="empty">No main gun</div>';
        return;
      }
      list.innerHTML = '<div class="gun-row">' +
        '<span class="gun-star">\\u2605</span>' +
        '<span class="gun-label">' + main.label + '</span>' +
        '<span class="gun-val">' + Math.round(main.distanceM) + 'm</span>' +
        '<span class="gun-val">' + Math.round(main.azimuthDeg) + '\\u00B0</span>' +
      '</div>';
    });

    // External trigger (e.g. from IPC)
    window.pipBridge.onStartSpotter(function() {
      triggerSpotter();
    });
  </script>
</body>
</html>`;

function registerSpotterArrows(mainWindow: BrowserWindow) {
  if (spotterArrowsRegistered) return;
  const keys = [
    { key: 'Left', azDelta: -2, distDelta: 0 },
    { key: 'Right', azDelta: 2, distDelta: 0 },
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

function createPipWindow(): BrowserWindow {
  const { width: screenW } = screen.getPrimaryDisplay().bounds;

  pipWin = createOverlayWindow(PIP_HTML, {
    width: PIP_INITIAL_WIDTH,
    height: PIP_INITIAL_HEIGHT,
    position: { x: screenW - PIP_INITIAL_WIDTH - 200, y: PIP_MARGIN },
    webPreferences: {
      preload: path.join(__dirname, 'pipPreload.js'),
    },
  });

  pipWin.on('closed', () => {
    pipWin = null;
  });

  return pipWin;
}

function buildFullHTML(data: PinnedSolution[]): string {
  return data.map((d) => {
    const oorClass = d.distanceM !== null && !d.inRange ? ' oor' : '';
    const distText = d.distanceM !== null ? `${d.distanceM.toFixed(1)}m` : '--';
    const azText = d.azimuthDeg !== null ? `${d.azimuthDeg.toFixed(1)}&deg;` : '--';
    return `<div class="row${oorClass}">` +
      `<span class="label">${escapeHtml(d.label)}</span>` +
      `<span class="dist">${distText}</span>` +
      `<span class="az">${azText}</span>` +
      `</div>`;
  }).join('');
}

function renderDataScript(data: PinnedSolution[]): { script: string; needsResize: boolean } {
  const rowCountChanged = data.length !== prevRowCount;
  prevRowCount = data.length;

  if (rowCountChanged) {
    const html = buildFullHTML(data);
    const script = `document.getElementById('root').innerHTML = ${JSON.stringify(html)}; void 0`;
    return { script, needsResize: true };
  }

  const updates = data.map((d, i) => {
    const distText = d.distanceM !== null ? `${d.distanceM.toFixed(1)}m` : '--';
    const azText = d.azimuthDeg !== null ? `${d.azimuthDeg.toFixed(1)}°` : '--';
    const oorClass = d.distanceM !== null && !d.inRange;
    return `(() => {
      const row = rows[${i}];
      if (!row) return;
      row.querySelector('.label').textContent = ${JSON.stringify(d.label)};
      row.querySelector('.dist').textContent = ${JSON.stringify(distText)};
      row.querySelector('.az').textContent = ${JSON.stringify(azText)};
      ${oorClass ? "row.classList.add('oor');" : "row.classList.remove('oor');"}
    })();`;
  }).join('\n');

  const script = `(() => {
    const rows = document.getElementById('root').querySelectorAll('.row');
    ${updates}
  })(); void 0`;
  return { script, needsResize: false };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fingerprint(data: PinnedSolution[]): string {
  return data.map((d) => `${d.label}:${d.distanceM !== null ? d.distanceM.toFixed(1) : '--'}:${d.azimuthDeg !== null ? d.azimuthDeg.toFixed(1) : '--'}`).join('|');
}

function hasValuesChanged(data: PinnedSolution[]): boolean {
  const fp = fingerprint(data);
  if (fp === prevFingerprint) return false;
  if (fp === '') return false;
  const changed = prevFingerprint !== '';
  prevFingerprint = fp;
  return changed;
}

const FLASH_SCRIPT = `(() => {
  const p = document.querySelector('.panel');
  p.style.background = 'rgba(76, 175, 80, 0.35)';
  p.style.borderColor = 'rgba(76, 175, 80, 0.9)';
  p.style.boxShadow = '0 0 12px rgba(76, 175, 80, 0.6), 0 0 24px rgba(76, 175, 80, 0.3)';
  setTimeout(() => {
    p.style.background = '';
    p.style.borderColor = '';
    p.style.boxShadow = '';
  }, 150);
})()`;

export function updatePipData(data: PinnedSolution[]): void {
  const changed = hasValuesChanged(data);
  latestData = data;

  if (isAlive(pipWin) && pipWin.isVisible()) {
    const { script, needsResize } = renderDataScript(data);
    safeExec(pipWin, script);
    if (needsResize) {
      resizeToPanel(pipWin);
    }
    if (changed) {
      safeExec(pipWin, FLASH_SCRIPT);
    }
  }
}

export function showPip(mainWindow?: BrowserWindow): void {
  const freshlyCreated = !isAlive(pipWin);
  if (freshlyCreated) {
    createPipWindow();
  }

  const win = pipWin!;

  // Set up spotter IPC relay if mainWindow provided
  if (mainWindow) {
    setupSpotterRelay(win, mainWindow);
  }

  // Force full rebuild on show (window may be fresh or stale)
  prevRowCount = -1;
  const { script } = renderDataScript(latestData);

  const lobbyScript = latestLobbyConnected
    ? `document.getElementById('btns').classList.add('visible')`
    : `document.getElementById('btns').classList.remove('visible')`;

  if (freshlyCreated || win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      safeExec(pipWin, lobbyScript);
      safeExec(pipWin, script);
      resizeToPanel(pipWin);
    });
  } else {
    safeExec(pipWin, lobbyScript);
    safeExec(pipWin, script);
    resizeToPanel(pipWin);
  }

  win.showInactive();
}

// Spotter IPC relay between PIP and renderer
let spotterRelayCleanup: (() => void) | null = null;

function setupSpotterRelay(pip: BrowserWindow, mainWindow: BrowserWindow) {
  // Clean up any previous relay
  if (spotterRelayCleanup) {
    spotterRelayCleanup();
    spotterRelayCleanup = null;
  }

  // PIP requests artillery data → forward to renderer
  const onRequestData = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-request-artillery-data');
    }
  };
  ipcMain.on('pip-request-artillery-data', onRequestData);

  // Renderer replies with artillery data → forward to PIP
  const onDataReply = (_event: Electron.IpcMainEvent, data: any) => {
    if (isAlive(pip)) {
      pip.webContents.send('pip-artillery-data', data);
    }
  };
  ipcMain.on('qc-artillery-data-reply', onDataReply);

  // PIP selects spotter target → forward to renderer
  const onSelectSpotter = (_event: Electron.IpcMainEvent, payload: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-select-spotter', payload);
    }
  };
  ipcMain.on('pip-select-spotter', onSelectSpotter);

  // Renderer sends spotter update → forward to PIP
  const onSpotterUpdate = (_event: Electron.IpcMainEvent, data: any) => {
    if (isAlive(pip)) {
      pip.webContents.send('pip-spotter-update', data);
    }
  };
  ipcMain.on('qc-spotter-update', onSpotterUpdate);

  // PIP mode change → register/unregister arrows
  const onModeChange = (_event: Electron.IpcMainEvent, mode: string) => {
    if (mode === 'spotting') {
      registerSpotterArrows(mainWindow);
    } else {
      unregisterSpotterArrows();
    }
  };
  ipcMain.on('pip-mode-change', onModeChange);

  // PIP closes spotter → tell renderer
  const onCloseSpotter = () => {
    unregisterSpotterArrows();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qc-close-mode');
    }
  };
  ipcMain.on('pip-close-spotter', onCloseSpotter);

  // PIP requests resize after spotter UI changes
  const onRequestResize = () => {
    if (isAlive(pip)) {
      resizeToPanel(pip);
    }
  };
  ipcMain.on('pip-request-resize', onRequestResize);

  const cleanup = () => {
    ipcMain.removeListener('pip-request-artillery-data', onRequestData);
    ipcMain.removeListener('qc-artillery-data-reply', onDataReply);
    ipcMain.removeListener('pip-select-spotter', onSelectSpotter);
    ipcMain.removeListener('qc-spotter-update', onSpotterUpdate);
    ipcMain.removeListener('pip-mode-change', onModeChange);
    ipcMain.removeListener('pip-close-spotter', onCloseSpotter);
    ipcMain.removeListener('pip-request-resize', onRequestResize);
    unregisterSpotterArrows();
  };

  pip.on('closed', cleanup);
  spotterRelayCleanup = cleanup;
}

export function hidePip(): void {
  if (isAlive(pipWin)) {
    pipWin.hide();
  }
}

export function destroyPip(): void {
  if (isAlive(pipWin)) {
    pipWin.destroy();
    pipWin = null;
  }
}

export function getPipWin(): BrowserWindow | null {
  return isAlive(pipWin) ? pipWin : null;
}

export function updatePipLobbyStatus(connected: boolean): void {
  latestLobbyConnected = connected;
  if (!isAlive(pipWin)) return;
  const script = connected
    ? `document.getElementById('btns').classList.add('visible'); void 0`
    : `document.getElementById('btns').classList.remove('visible'); void 0`;
  safeExec(pipWin, script);
  resizeToPanel(pipWin);
}
