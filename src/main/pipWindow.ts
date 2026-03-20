import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { PinnedSolution } from '../shared/types';
import { createOverlayWindow, isAlive, safeExec, safeExecAndResize } from './overlayWindow';

let pipWin: BrowserWindow | null = null;
let latestData: PinnedSolution[] = [];
let prevFingerprint = '';
let prevRowCount = -1;
let latestLobbyConnected = false;

const PIP_INITIAL_WIDTH = 240;
const PIP_INITIAL_HEIGHT = 130;
const PIP_MARGIN = 16;

const PIP_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    background: transparent;
    overflow: visible;
  }
  body {
    padding: 4px;
  }
  .panel {
    display: inline-block;
    background: rgba(12, 12, 16, 0.85);
    color: #fff;
    font-family: 'Cascadia Code', 'Consolas', 'SF Mono', monospace;
    font-size: 13px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 213, 79, 0.2);
    -webkit-font-smoothing: antialiased;
    transition: background 600ms ease-out, border-color 600ms ease-out, box-shadow 600ms ease-out;
    cursor: grab;
    -webkit-app-region: drag;
  }
  .panel:active { cursor: grabbing; }
  .title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #ffd54f;
    margin-bottom: 8px;
    opacity: 0.8;
  }
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
      <button id="btn-spot" onclick="window.pipBridge.openSpotter()">Spot</button>
    </div>
    <div id="root"></div>
  </div>
</body>
</html>`;

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
    const script = `document.getElementById('root').innerHTML = ${JSON.stringify(html)};` +
      `(() => { const d = document.documentElement; return { w: d.scrollWidth, h: d.scrollHeight }; })()`;
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
    if (needsResize) {
      safeExecAndResize(pipWin, script);
    } else {
      safeExec(pipWin, script);
    }
    if (changed) {
      safeExec(pipWin, FLASH_SCRIPT);
    }
  }
}

export function showPip(): void {
  const freshlyCreated = !isAlive(pipWin);
  if (freshlyCreated) {
    createPipWindow();
  }

  const win = pipWin!;

  // Force full rebuild on show (window may be fresh or stale)
  prevRowCount = -1;
  const { script } = renderDataScript(latestData);

  const lobbyScript = latestLobbyConnected
    ? `document.getElementById('btns').classList.add('visible')`
    : `document.getElementById('btns').classList.remove('visible')`;

  if (freshlyCreated || win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      safeExec(pipWin, lobbyScript);
      safeExecAndResize(pipWin, script);
    });
  } else {
    safeExec(pipWin, lobbyScript);
    safeExecAndResize(pipWin, script);
  }

  win.showInactive();
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

export function updatePipLobbyStatus(connected: boolean): void {
  latestLobbyConnected = connected;
  if (!isAlive(pipWin)) return;
  const script = connected
    ? `document.getElementById('btns').classList.add('visible'); (() => { const d = document.documentElement; return { w: d.scrollWidth, h: d.scrollHeight }; })()`
    : `document.getElementById('btns').classList.remove('visible'); (() => { const d = document.documentElement; return { w: d.scrollWidth, h: d.scrollHeight }; })()`;
  safeExecAndResize(pipWin, script);
}
