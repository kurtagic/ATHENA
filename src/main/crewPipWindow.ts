import { BrowserWindow, screen } from 'electron';
import { createOverlayWindow, isAlive, safeExecAndResize } from './overlayWindow';

let crewPipWin: BrowserWindow | null = null;

const CREW_PIP_WIDTH = 320;
const CREW_PIP_HEIGHT = 120;
const CREW_PIP_MARGIN = 16;

const STATUS_COLORS: Record<string, string> = {
  afk: '#78909c',
  ready: '#4caf50',
  holding: '#42a5f5',
  standby: '#29b6f6',
  withdraw: '#ffa726',
  prepping: '#66bb6a',
  engaging: '#ef5350',
  reposition: '#ffca28',
  at: '#f44336',
  pve: '#7e57c2',
  'refuel-rearm': '#26c6da',
  downed: '#e53935',
  repairing: '#ab47bc',
  'armour-repair': '#8d6e63',
  'out-of-ammo': '#ff7043',
  'turret-damaged': '#ec407a',
  'large-hole': '#d32f2f',
};

const CREW_PIP_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    background: transparent;
    overflow: visible;
  }
  body { padding: 4px; }
  .panel {
    display: inline-block;
    background: rgba(12, 12, 16, 0.85);
    color: #fff;
    font-family: 'Cascadia Code', 'Consolas', 'SF Mono', monospace;
    font-size: 14px;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 213, 79, 0.2);
    -webkit-font-smoothing: antialiased;
    min-width: 240px;
    max-width: 400px;
  }
  .title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #ffd54f;
    margin-bottom: 8px;
    opacity: 0.8;
    cursor: grab;
    -webkit-app-region: drag;
    user-select: none;
  }
  .title:active { cursor: grabbing; }
  .crew-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
  }
  .crew-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-label {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    min-width: 80px;
    text-align: right;
  }
  .empty {
    color: rgba(255, 255, 255, 0.25);
    font-size: 13px;
    text-align: center;
    padding: 10px 0;
  }
</style>
</head>
<body>
  <div class="panel">
    <div class="title">Crews</div>
    <div id="crew-list"><div class="empty">No crews</div></div>
  </div>
</body>
</html>`;

function buildCrewListScript(crews: any[]): string {
  const escaped = JSON.stringify(crews);
  const colorsJson = JSON.stringify(STATUS_COLORS);
  return `(() => {
    const crews = ${escaped};
    const colors = ${colorsJson};
    const list = document.getElementById('crew-list');
    if (crews.length === 0) {
      list.innerHTML = '<div class="empty">No crews</div>';
    } else {
      list.innerHTML = crews.map(c => {
        const color = colors[c.status] || '#888';
        const label = c.status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return '<div class="crew-row">' +
          '<span class="crew-name">' + c.name + '</span>' +
          '<span class="status-dot" style="background:' + color + '"></span>' +
          '<span class="status-label">' + label + '</span>' +
        '</div>';
      }).join('');
    }
    const d = document.documentElement;
    return { w: d.scrollWidth, h: d.scrollHeight };
  })()`;
}

function createCrewPipWindow(): BrowserWindow {
  const { width: screenW } = screen.getPrimaryDisplay().bounds;

  crewPipWin = createOverlayWindow(CREW_PIP_HTML, {
    width: CREW_PIP_WIDTH,
    height: CREW_PIP_HEIGHT,
    position: { x: screenW - CREW_PIP_WIDTH - 200, y: CREW_PIP_MARGIN + 320 },
  });

  crewPipWin.on('closed', () => {
    crewPipWin = null;
  });

  return crewPipWin;
}

export function updateCrewPipData(crews: any[]): void {
  if (!isAlive(crewPipWin)) return;
  safeExecAndResize(crewPipWin, buildCrewListScript(crews));
}

export function showCrewPip(crews?: any[]): void {
  const freshlyCreated = !isAlive(crewPipWin);
  if (freshlyCreated) {
    createCrewPipWindow();
  }

  const win = crewPipWin!;
  const crewData = crews ?? [];
  const script = buildCrewListScript(crewData);

  if (freshlyCreated || win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      safeExecAndResize(crewPipWin, script);
    });
  } else {
    safeExecAndResize(crewPipWin, script);
  }

  win.showInactive();
}

export function destroyCrewPip(): void {
  if (isAlive(crewPipWin)) {
    crewPipWin.destroy();
    crewPipWin = null;
  }
}
