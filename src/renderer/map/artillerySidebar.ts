import L from 'leaflet';
import { ARTILLERY_PLATFORMS, platformDisplayName } from '../data/artilleryPlatforms';

export interface ArtillerySolution {
  posIndex: number;
  label: string;
  distanceM: number;
  azimuthDeg: number;
  inRange: boolean;
  platformName: string;
  relDist: number;
  relAz: number;
  isMain: boolean;
}

// Callbacks wired by setupSidebarEvents
let onPlaceGun: (() => void) | null = null;
let onSetTarget: (() => void) | null = null;
let onMarkImpact: (() => void) | null = null;
let onClearAll: (() => void) | null = null;
let onSetMainGun: ((index: number) => void) | null = null;
let onRemoveGun: ((index: number) => void) | null = null;
let onRenameGun: ((index: number, newLabel: string) => void) | null = null;
let onPlatformChange: ((index: number) => void) | null = null;

export function populatePlatformDropdown(): void {
  const dropdown = document.getElementById('arty-platform-dropdown') as HTMLSelectElement | null;
  if (!dropdown) return;
  dropdown.innerHTML = '';

  ARTILLERY_PLATFORMS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = platformDisplayName(p);
    if (p.faction === 'WARDEN') opt.className = 'arty-faction-warden';
    else if (p.faction === 'COLONIAL') opt.className = 'arty-faction-colonial';
    else opt.className = 'arty-faction-both';
    dropdown.appendChild(opt);
  });
}

export function updateSolutionTable(
  solutions: ArtillerySolution[],
  hasTarget: boolean,
): void {
  const tbody = document.getElementById('arty-solution-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const sol of solutions) {
    const tr = document.createElement('tr');

    // Row class — OOR takes priority over main-gun styling
    if (hasTarget && !sol.inRange) tr.classList.add('arty-row-oor');
    else if (sol.isMain) tr.classList.add('arty-row-main');

    // Star column
    const tdStar = document.createElement('td');
    tdStar.className = 'arty-col-star';
    const starBtn = document.createElement('button');
    starBtn.className = sol.isMain ? 'arty-star-btn main-gun' : 'arty-star-btn';
    starBtn.textContent = sol.isMain ? '\u2605' : '\u2606';
    starBtn.title = 'Set as main gun';
    const idx = sol.posIndex;
    starBtn.addEventListener('click', () => onSetMainGun?.(idx));
    tdStar.appendChild(starBtn);
    tr.appendChild(tdStar);

    // # column (double-click to rename)
    const tdNum = document.createElement('td');
    tdNum.className = 'arty-col-num';
    tdNum.textContent = String(sol.label);
    tdNum.title = 'Double-click to rename';
    tdNum.style.cursor = 'pointer';
    const renameIdx = sol.posIndex;
    tdNum.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = tdNum.textContent || '';
      input.className = 'arty-rename-input';
      const commit = () => {
        const val = input.value.trim();
        if (val && val !== sol.label) {
          onRenameGun?.(renameIdx, val);
        } else {
          tdNum.textContent = sol.label;
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = sol.label; input.blur(); }
      });
      tdNum.textContent = '';
      tdNum.appendChild(input);
      input.focus();
      input.select();
    });
    tr.appendChild(tdNum);

    if (hasTarget) {
      // Dist
      const tdDist = document.createElement('td');
      tdDist.className = 'arty-col-dist';
      tdDist.textContent = sol.distanceM.toFixed(1) + 'm';
      tr.appendChild(tdDist);

      // Az
      const tdAz = document.createElement('td');
      tdAz.className = 'arty-col-az';
      tdAz.textContent = sol.azimuthDeg.toFixed(1) + '\u00b0';
      tr.appendChild(tdAz);

      // Rel.D
      const tdRelD = document.createElement('td');
      tdRelD.className = 'arty-col-reld';
      tdRelD.textContent = sol.isMain ? '--' : (sol.relDist >= 0 ? '+' : '') + sol.relDist.toFixed(1) + 'm';
      tr.appendChild(tdRelD);

      // Rel.Az
      const tdRelAz = document.createElement('td');
      tdRelAz.className = 'arty-col-relaz';
      tdRelAz.textContent = sol.isMain ? '--' : (sol.relAz >= 0 ? '+' : '') + sol.relAz.toFixed(1) + '\u00b0';
      tr.appendChild(tdRelAz);
    } else {
      // No target: span remaining columns
      const tdEmpty = document.createElement('td');
      tdEmpty.colSpan = 4;
      tdEmpty.className = 'arty-no-target';
      tdEmpty.textContent = 'NO TARGET';
      tr.appendChild(tdEmpty);
    }

    // Delete column
    const tdDel = document.createElement('td');
    tdDel.className = 'arty-col-del';
    const delBtn = document.createElement('button');
    delBtn.className = 'arty-del-btn';
    delBtn.textContent = '\u2715';
    delBtn.title = 'Remove gun';
    const posIdx = sol.posIndex;
    delBtn.addEventListener('click', () => onRemoveGun?.(posIdx));
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  }
}

export function updateStatusText(text: string): void {
  const el = document.getElementById('arty-status-text');
  if (el) el.textContent = text;
}

export function highlightActionButton(mode: 'idle' | 'placing-arty' | 'placing-target' | 'placing-impact'): void {
  const placeBtn = document.getElementById('arty-place-gun-btn');
  const targetBtn = document.getElementById('arty-set-target-btn');
  const impactBtn = document.getElementById('arty-mark-impact-btn');

  placeBtn?.classList.remove('active-mode');
  targetBtn?.classList.remove('active-mode');
  impactBtn?.classList.remove('active-mode');

  if (mode === 'placing-arty') placeBtn?.classList.add('active-mode');
  else if (mode === 'placing-target') targetBtn?.classList.add('active-mode');
  else if (mode === 'placing-impact') impactBtn?.classList.add('active-mode');
}

export function setupSidebarEvents(
  callbacks: {
    onPlaceGun: () => void;
    onSetTarget: () => void;
    onMarkImpact: () => void;
    onClearAll: () => void;
    onSetMainGun: (index: number) => void;
    onRemoveGun: (index: number) => void;
    onRenameGun: (index: number, newLabel: string) => void;
    onPlatformChange: (index: number) => void;
  },
): void {
  onPlaceGun = callbacks.onPlaceGun;
  onSetTarget = callbacks.onSetTarget;
  onMarkImpact = callbacks.onMarkImpact;
  onClearAll = callbacks.onClearAll;
  onSetMainGun = callbacks.onSetMainGun;
  onRemoveGun = callbacks.onRemoveGun;
  onRenameGun = callbacks.onRenameGun;
  onPlatformChange = callbacks.onPlatformChange;

  document.getElementById('arty-place-gun-btn')?.addEventListener('click', () => onPlaceGun?.());
  document.getElementById('arty-set-target-btn')?.addEventListener('click', () => onSetTarget?.());
  document.getElementById('arty-mark-impact-btn')?.addEventListener('click', () => onMarkImpact?.());
  document.getElementById('arty-clear-all-btn')?.addEventListener('click', () => onClearAll?.());

  const dropdown = document.getElementById('arty-platform-dropdown') as HTMLSelectElement | null;
  dropdown?.addEventListener('change', () => {
    onPlatformChange?.(Number(dropdown.value));
  });
}
