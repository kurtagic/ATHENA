import { BrowserWindow, screen } from 'electron';
import { createOverlayWindow, isAlive, safeExec, resizeToPanel } from './overlayWindow';

let crewPipWin: BrowserWindow | null = null;

const CREW_PIP_WIDTH = 320;
const CREW_PIP_HEIGHT = 120;
const CREW_PIP_MARGIN = 16;

let prevStatusMap: Record<string, string> = {};

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
  * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
  html, body {
    background: transparent;
    overflow: visible;
  }
  body { padding: 4px; }
  .panel {
    display: inline-block;
    background: rgba(12, 12, 16, 0.95);
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
  .status-pill {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    flex-shrink: 0;
    white-space: nowrap;
    border: 1px solid;
  }
  .empty {
    color: rgba(255, 255, 255, 0.25);
    font-size: 13px;
    text-align: center;
    padding: 10px 0;
  }
  @keyframes pill-flash {
    0%   { box-shadow: 0 0 0 2px currentColor, 0 0 10px currentColor; transform: scale(1.08); }
    100% { box-shadow: none; transform: scale(1); }
  }
  .status-pill.flash {
    animation: pill-flash 500ms ease-out forwards;
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

function getChangedCrewNames(crews: any[]): string[] {
  const changed: string[] = [];
  const isFirstLoad = Object.keys(prevStatusMap).length === 0;
  const newMap: Record<string, string> = {};
  for (const c of crews) {
    newMap[c.name] = c.status;
    if (!isFirstLoad && prevStatusMap[c.name] !== c.status) {
      changed.push(c.name);
    }
  }
  prevStatusMap = newMap;
  return changed;
}

function buildFlashScript(names: string[]): string {
  const escaped = JSON.stringify(names);
  return `(() => {
    const names = ${escaped};
    document.querySelectorAll('.crew-row').forEach(row => {
      if (names.includes(row.querySelector('.crew-name')?.textContent)) {
        const pill = row.querySelector('.status-pill');
        if (!pill) return;
        pill.classList.remove('flash');
        void pill.offsetWidth;
        pill.classList.add('flash');
        pill.addEventListener('animationend', () => pill.classList.remove('flash'), { once: true });
      }
    });
  })()`;
}

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
          '<span class="status-pill" style="background:' + color + '26;border-color:' + color + '80;color:' + color + '">' + label + '</span>' +
        '</div>';
      }).join('');
    }
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
  const changedNames = getChangedCrewNames(crews);
  if (!isAlive(crewPipWin)) return;
  safeExec(crewPipWin, buildCrewListScript(crews));
  resizeToPanel(crewPipWin);
  if (changedNames.length > 0) {
    safeExec(crewPipWin, buildFlashScript(changedNames));
  }
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
      safeExec(crewPipWin, script);
      resizeToPanel(crewPipWin);
    });
  } else {
    safeExec(crewPipWin, script);
    resizeToPanel(crewPipWin);
  }

  win.showInactive();
}

export function destroyCrewPip(): void {
  if (isAlive(crewPipWin)) {
    crewPipWin.destroy();
    crewPipWin = null;
  }
}
