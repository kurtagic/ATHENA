import L from 'leaflet';
import type { SavedArtilleryState } from '../data/store';
import { ARTILLERY_PLATFORMS } from '../data/artilleryPlatforms';
import { crsDistanceMeters, crsAzimuth, metersToRadius, calculateCorrection, interpolateInaccuracy } from '../data/artilleryCalc';
import {
  updateSolutionTable,
  updateStatusText,
  highlightActionButton,
  populatePlatformDropdown,
  setupSidebarEvents,
  type ArtillerySolution,
} from './artillerySidebar';
import { pushUndoAction } from '../data/undoStack';

const CIRCLE_SEGMENTS = 64;

const DOT_WRAP_SIZE = 60;

function createDotMarker(
  latlng: L.LatLng,
  dotSize: number,
  cssClass: string,
  interactive: boolean,
): L.Marker {
  const dotClasses = ['arty-dot', cssClass];
  if (interactive) dotClasses.push('arty-draggable');
  return L.marker(latlng, {
    icon: L.divIcon({
      className: 'arty-dot-wrap',
      iconSize: [DOT_WRAP_SIZE, DOT_WRAP_SIZE],
      iconAnchor: [DOT_WRAP_SIZE / 2, DOT_WRAP_SIZE / 2],
      html: `<div class="${dotClasses.join(' ')}" style="width:${dotSize}px;height:${dotSize}px"></div>`,
    }),
    pane: 'artilleryPane',
    interactive,
  });
}

interface ArtyPosition {
  id: number;
  latlng: L.LatLng;
  label: string;
}

type PlacementMode = 'idle' | 'placing-arty' | 'placing-target' | 'placing-impact';

interface ArtyState {
  active: boolean;
  placementMode: PlacementMode;
  positions: ArtyPosition[];
  target: L.LatLng | null;
  impact: L.LatLng | null;
  corrected: L.LatLng | null;
  mainGunIndex: number;
  defaultPlatformIndex: number;
  ringLayer: L.LayerGroup | null;
  artyLayer: L.LayerGroup | null;
  targetLayer: L.LayerGroup | null;
  nextId: number;
  nextLabelNum: number;
}

const state: ArtyState = {
  active: false,
  placementMode: 'idle',
  positions: [],
  target: null,
  impact: null,
  corrected: null,
  mainGunIndex: 0,
  defaultPlatformIndex: 0,
  ringLayer: null,
  artyLayer: null,
  targetLayer: null,
  nextId: 1,
  nextLabelNum: 1,
};

// Click handler reference for cleanup
let clickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;

// Drag state
let dragInfo: { type: 'gun' | 'target' | 'impact'; gunIndex: number } | null = null;
let dragOccurred = false;

// Undo stack
export interface ArtySnapshot {
  positions: { id: number; latlng: [number, number]; label: string }[];
  target: [number, number] | null;
  impact: [number, number] | null;
  mainGunIndex: number;
  nextId: number;
  nextLabelNum: number;
}

function takeSnapshot(): ArtySnapshot {
  return {
    positions: state.positions.map(p => ({ id: p.id, latlng: [p.latlng.lat, p.latlng.lng], label: p.label })),
    target: state.target ? [state.target.lat, state.target.lng] : null,
    impact: state.impact ? [state.impact.lat, state.impact.lng] : null,
    mainGunIndex: state.mainGunIndex,
    nextId: state.nextId,
    nextLabelNum: state.nextLabelNum,
  };
}

function pushUndo(): void {
  pushUndoAction({ type: 'artillery', snapshot: takeSnapshot() });
}

export function restoreArtySnapshot(snap: ArtySnapshot, map: L.Map): void {
  state.positions = snap.positions.map(p => ({ id: p.id, latlng: L.latLng(p.latlng[0], p.latlng[1]), label: p.label }));
  state.target = snap.target ? L.latLng(snap.target[0], snap.target[1]) : null;
  state.impact = snap.impact ? L.latLng(snap.impact[0], snap.impact[1]) : null;
  state.mainGunIndex = snap.mainGunIndex;
  state.nextId = snap.nextId;
  state.nextLabelNum = snap.nextLabelNum;
  recalcCorrected();
  refreshAll(map);
}

export function getArtilleryState() {
  return {
    active: state.active,
    placementMode: state.placementMode,
  };
}

export function initArtilleryLayer(map: L.Map): void {
  if (!map.getPane('artilleryRingPane')) {
    const pane = map.createPane('artilleryRingPane');
    pane.style.zIndex = '635'; // lowest — range rings underneath everything
  }
  if (!map.getPane('artilleryPane')) {
    const pane = map.createPane('artilleryPane');
    pane.style.zIndex = '640';
  }
  if (!map.getPane('artilleryTargetPane')) {
    const pane = map.createPane('artilleryTargetPane');
    pane.style.zIndex = '645'; // above gun rings, below drawPane (650)
  }
  state.ringLayer = L.layerGroup([], { pane: 'artilleryRingPane' }).addTo(map);
  state.artyLayer = L.layerGroup([], { pane: 'artilleryPane' }).addTo(map);
  state.targetLayer = L.layerGroup([], { pane: 'artilleryTargetPane' }).addTo(map);
}

export function cleanupArtillery(map: L.Map): void {
  if (state.active) deactivateArtillery(map);
  if (state.ringLayer) {
    map.removeLayer(state.ringLayer);
    state.ringLayer = null;
  }
  if (state.artyLayer) {
    map.removeLayer(state.artyLayer);
    state.artyLayer = null;
  }
  if (state.targetLayer) {
    map.removeLayer(state.targetLayer);
    state.targetLayer = null;
  }
  resetState();
}

function recalcCorrected(): void {
  if (state.target && state.impact) {
    state.corrected = calculateCorrection(state.target, state.impact).corrected;
  } else {
    state.corrected = null;
  }
}

function resetState(): void {
  state.positions = [];
  state.target = null;
  state.impact = null;
  state.corrected = null;
  state.mainGunIndex = 0;
  state.placementMode = 'idle';
  state.nextId = 1;
  state.nextLabelNum = 1;
}

export function activateArtillery(map: L.Map): void {
  state.active = true;
  populatePlatformDropdown();

  // Restore dropdown to saved selection
  const dropdown = document.getElementById('arty-platform-dropdown') as HTMLSelectElement | null;
  if (dropdown) dropdown.value = String(state.defaultPlatformIndex);

  updateStatusText('');
  refreshAll(map);
}

export function deactivateArtillery(map: L.Map): void {
  state.active = false;
  state.placementMode = 'idle';
  document.getElementById('map')!.style.cursor = '';
  highlightActionButton('idle');
}

export function setPlacementMode(mode: PlacementMode): void {
  state.placementMode = mode;
  highlightActionButton(mode);

  const mapEl = document.getElementById('map')!;
  if (mode !== 'idle') {
    mapEl.style.cursor = 'crosshair';
  } else {
    mapEl.style.cursor = '';
  }

  switch (mode) {
    case 'placing-arty':
      updateStatusText('Click map to place gun position');
      break;
    case 'placing-target':
      updateStatusText('Click map to set target');
      break;
    case 'placing-impact':
      updateStatusText('Click map to mark impact point');
      break;
    default:
      updateStatusText('');
  }
}

export function removeArtillery(id: number, map: L.Map): void {
  const idx = state.positions.findIndex((p) => p.id === id);
  if (idx === -1) return;
  state.positions.splice(idx, 1);

  // Adjust main gun index
  if (state.positions.length === 0) {
    state.mainGunIndex = 0;
  } else if (state.mainGunIndex >= state.positions.length) {
    state.mainGunIndex = 0;
  } else if (idx < state.mainGunIndex) {
    state.mainGunIndex--;
  }

  refreshAll(map);
}

export function setMainGun(index: number, map: L.Map): void {
  if (index >= 0 && index < state.positions.length) {
    state.mainGunIndex = index;
    refreshAll(map);
  }
}

export function clearAll(map: L.Map): void {
  pushUndo();
  resetState();
  refreshAll(map);
  updateStatusText('');
}

function handleMapClick(e: L.LeafletMouseEvent, map: L.Map): void {
  if (dragOccurred) return;
  if (!state.active) return;
  if (state.placementMode === 'idle') return;
  if (e.originalEvent.button !== 0) return;

  const latlng = e.latlng;
  pushUndo();

  switch (state.placementMode) {
    case 'placing-arty':
      state.positions.push({
        id: state.nextId++,
        latlng,
        label: `A${state.nextLabelNum++}`,
      });
      if (state.positions.length === 1) {
        state.mainGunIndex = 0;
      }
      refreshAll(map);
      return;

    case 'placing-target':
      state.target = latlng;
      state.impact = null;
      state.corrected = null;
      break;

    case 'placing-impact':
      if (!state.target) {
        updateStatusText('Set a target first');
        setPlacementMode('idle');
        return;
      }
      state.impact = latlng;
      const correction = calculateCorrection(state.target, state.impact);
      state.corrected = correction.corrected;
      break;
  }

  setPlacementMode('idle');
  refreshAll(map);
}

// Generate circle vertices as a polygon (safer than L.circle in CRS.Simple)
function circleVertices(center: L.LatLng, radiusCRS: number): L.LatLngTuple[] {
  const pts: L.LatLngTuple[] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    pts.push([
      center.lat + radiusCRS * Math.cos(angle),
      center.lng + radiusCRS * Math.sin(angle),
    ]);
  }
  return pts;
}

function refreshAll(map: L.Map): void {
  if (!state.artyLayer) return;
  state.ringLayer?.clearLayers();
  state.artyLayer.clearLayers();
  state.targetLayer?.clearLayers();

  const platform = ARTILLERY_PLATFORMS[state.defaultPlatformIndex];
  const targetPos = state.corrected ?? state.target;

  // === Compute per-gun in-range status ===

  const oorSet = new Set<number>();
  if (platform && targetPos) {
    for (let i = 0; i < state.positions.length; i++) {
      const dist = crsDistanceMeters(state.positions[i].latlng, targetPos);
      if (dist < platform.minRange || dist > platform.maxRange) {
        oorSet.add(i);
      }
    }
  }

  // === Non-interactive shapes (drawn first, underneath markers) ===

  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;
    const isOOR = targetPos !== null && oorSet.has(i);

    // Range ring (filled area between min and max range)
    if (platform) {
      const maxRadius = metersToRadius(platform.maxRange);
      const minRadius = metersToRadius(platform.minRange);
      const outerRing = circleVertices(pos.latlng, maxRadius);
      const innerRing = circleVertices(pos.latlng, minRadius).reverse();

      const ringColor = isOOR ? '#b33030' : isMain ? '#003380' : '#4488cc';
      L.polygon([outerRing, innerRing], {
        color: ringColor,
        weight: 2,
        opacity: 1,
        fillColor: ringColor,
        fillOpacity: isOOR ? 0.12 : 0.2,
        interactive: false,
        pane: 'artilleryRingPane',
      }).addTo(state.ringLayer!);
    }

    // Connection line to target (always points at target, not corrected)
    if (state.target) {
      L.polyline([pos.latlng, state.target], {
        color: '#333333',
        weight: 1.5,
        opacity: 0.55,
        dashArray: '4, 4',
        interactive: false,
        pane: 'artilleryPane',
      }).addTo(state.artyLayer!);
    }
  }

  // === Target-area elements (on higher pane, above gun rings) ===

  // Reference circles (min/max inaccuracy bounds) + averaged inaccuracy circle — target only
  if (platform && state.positions.length > 0 && state.target) {
    // Reference circles — min and max inaccuracy at target
    const minInaccRadius = metersToRadius(platform.minInaccuracy);
    const maxInaccRadius = metersToRadius(platform.maxInaccuracy);
    for (const r of [minInaccRadius, maxInaccRadius]) {
      L.polygon(circleVertices(state.target, r), {
        color: '#444444',
        weight: 1,
        opacity: 0.5,
        fill: false,
        dashArray: '4, 3',
        interactive: false,
        pane: 'artilleryTargetPane',
      }).addTo(state.targetLayer!);
    }

    // Averaged interpolated inaccuracy circle at target
    let totalInaccuracy = 0;
    for (const pos of state.positions) {
      const dist = crsDistanceMeters(pos.latlng, state.target);
      totalInaccuracy += interpolateInaccuracy(platform, dist);
    }
    const avgInaccuracy = totalInaccuracy / state.positions.length;
    const avgRadius = metersToRadius(avgInaccuracy);

    L.polygon(circleVertices(state.target, avgRadius), {
      color: '#ef5350',
      weight: 1.5,
      opacity: 1,
      fillColor: '#ef5350',
      fillOpacity: 0.05,
      dashArray: '4, 3',
      interactive: false,
      pane: 'artilleryTargetPane',
    }).addTo(state.targetLayer!);
  }

  // Connection line: target → corrected
  if (state.target && state.corrected) {
    L.polyline([state.target, state.corrected], {
      color: '#66bb6a',
      weight: 1.5,
      opacity: 0.7,
      dashArray: '4, 4',
      interactive: false,
      pane: 'artilleryTargetPane',
    }).addTo(state.targetLayer!);
  }

  // Connection line: target → impact
  if (state.target && state.impact) {
    L.polyline([state.target, state.impact], {
      color: '#ffd54f',
      weight: 1,
      opacity: 0.5,
      dashArray: '4, 4',
      interactive: false,
      pane: 'artilleryTargetPane',
    }).addTo(state.targetLayer!);
  }

  // Corrected marker (not draggable — computed)
  if (state.corrected) {
    createDotMarker(state.corrected, 12, 'arty-dot-corrected', false)
      .addTo(state.targetLayer!);
  }

  // === Interactive markers (drawn last, on top) ===

  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;
    const isOOR = targetPos !== null && oorSet.has(i);

    let dotClass: string;
    if (isOOR) dotClass = 'arty-dot-oor';
    else if (isMain) dotClass = 'arty-dot-main-gun';
    else dotClass = 'arty-dot-gun';

    const gunMarker = createDotMarker(
      pos.latlng,
      isMain ? 16 : 12,
      dotClass,
      true,
    ).addTo(state.artyLayer!);
    const gi = i;
    gunMarker.on('mousedown', (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      startDrag(map, 'gun', gi, e);
    });

    // Gun label
    L.marker(pos.latlng, {
      interactive: false,
      icon: L.divIcon({
        className: 'arty-gun-label',
        html: pos.label,
        iconSize: [30, 14],
        iconAnchor: [-6, 20],
      }),
      pane: 'artilleryPane',
    }).addTo(state.artyLayer!);
  }

  if (state.target) {
    const targetMarker = createDotMarker(state.target, 14, 'arty-dot-target', true)
      .addTo(state.targetLayer!);
    targetMarker.on('mousedown', (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      startDrag(map, 'target', -1, e);
    });
  }

  if (state.impact) {
    const impactMarker = createDotMarker(state.impact, 12, 'arty-dot-impact', true)
      .addTo(state.targetLayer!);
    impactMarker.on('mousedown', (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      startDrag(map, 'impact', -1, e);
    });
  }

  // Compute solutions
  const solutions = computeSolutions();
  updateSolutionTable(solutions, state.target !== null);
}

function computeSolutions(): ArtillerySolution[] {
  const platform = ARTILLERY_PLATFORMS[state.defaultPlatformIndex];
  const targetPos = state.corrected ?? state.target;
  const solutions: ArtillerySolution[] = [];

  // Compute main gun distance/azimuth first
  let mainDist = 0;
  let mainAz = 0;
  if (targetPos && state.positions.length > 0 && state.mainGunIndex < state.positions.length) {
    const mainPos = state.positions[state.mainGunIndex];
    mainDist = crsDistanceMeters(mainPos.latlng, targetPos);
    mainAz = crsAzimuth(mainPos.latlng, targetPos);
  }

  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;

    let distanceM = 0;
    let azimuthDeg = 0;
    let inRange = false;
    let relDist = 0;
    let relAz = 0;

    if (targetPos) {
      distanceM = crsDistanceMeters(pos.latlng, targetPos);
      azimuthDeg = crsAzimuth(pos.latlng, targetPos);
      inRange = platform
        ? distanceM >= platform.minRange && distanceM <= platform.maxRange
        : false;

      relDist = distanceM - mainDist;
      const rawRelAz = azimuthDeg - mainAz;
      relAz = ((rawRelAz + 540) % 360) - 180; // normalize to [-180, 180]
    }

    solutions.push({
      posIndex: i,
      label: pos.label,
      distanceM,
      azimuthDeg,
      inRange,
      platformName: platform ? platform.name : '',
      relDist,
      relAz,
      isMain,
    });
  }

  return solutions;
}

function startDrag(map: L.Map, type: 'gun' | 'target' | 'impact', gunIndex: number, e: L.LeafletMouseEvent): void {
  if (state.placementMode !== 'idle') return; // don't drag while placing
  e.originalEvent.stopPropagation();
  e.originalEvent.preventDefault();
  pushUndo();
  dragInfo = { type, gunIndex };
  dragOccurred = false;
  map.dragging.disable();
  document.getElementById('map')!.style.cursor = 'grabbing';
}

export function saveArtilleryState(): SavedArtilleryState {
  return {
    positions: state.positions.map((p) => ({
      id: p.id,
      latlng: [p.latlng.lat, p.latlng.lng] as [number, number],
      label: p.label,
    })),
    target: state.target ? [state.target.lat, state.target.lng] : null,
    impact: state.impact ? [state.impact.lat, state.impact.lng] : null,
    mainGunIndex: state.mainGunIndex,
    defaultPlatformIndex: state.defaultPlatformIndex,
    nextId: state.nextId,
    nextLabelNum: state.nextLabelNum,
  };
}

export function restoreArtilleryState(saved: SavedArtilleryState, map: L.Map): void {
  state.positions = saved.positions.map((p) => ({
    id: p.id,
    latlng: L.latLng(p.latlng[0], p.latlng[1]),
    label: p.label,
  }));
  state.target = saved.target ? L.latLng(saved.target[0], saved.target[1]) : null;
  state.impact = saved.impact ? L.latLng(saved.impact[0], saved.impact[1]) : null;
  state.mainGunIndex = saved.mainGunIndex;
  state.defaultPlatformIndex = saved.defaultPlatformIndex;
  state.nextId = saved.nextId;
  state.nextLabelNum = saved.nextLabelNum;
  recalcCorrected();
  refreshAll(map);
}

export function setupArtilleryEvents(map: L.Map): void {
  // Map click handler
  clickHandler = (e: L.LeafletMouseEvent) => handleMapClick(e, map);
  map.on('click', clickHandler);

  // Drag: mousemove
  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    if (!dragInfo) return;
    dragOccurred = true;

    switch (dragInfo.type) {
      case 'gun':
        if (dragInfo.gunIndex >= 0 && dragInfo.gunIndex < state.positions.length) {
          state.positions[dragInfo.gunIndex].latlng = e.latlng;
        }
        break;
      case 'target':
        state.target = e.latlng;
        state.impact = null;
        state.corrected = null;
        break;
      case 'impact':
        state.impact = e.latlng;
        recalcCorrected();
        break;
    }

    refreshAll(map);
  });

  // Drag: mouseup
  document.addEventListener('mouseup', () => {
    if (!dragInfo) return;
    dragInfo = null;
    map.dragging.enable();
    document.getElementById('map')!.style.cursor =
      state.placementMode !== 'idle' ? 'crosshair' : '';

    // Suppress the click event that fires after drag release
    if (dragOccurred) {
      setTimeout(() => { dragOccurred = false; }, 50);
    }
  });

  // Sidebar button callbacks
  setupSidebarEvents({
    onPlaceGun: () => {
      setPlacementMode(state.placementMode === 'placing-arty' ? 'idle' : 'placing-arty');
    },
    onSetTarget: () => {
      setPlacementMode(state.placementMode === 'placing-target' ? 'idle' : 'placing-target');
    },
    onMarkImpact: () => {
      setPlacementMode(state.placementMode === 'placing-impact' ? 'idle' : 'placing-impact');
    },
    onClearAll: () => {
      clearAll(map);
    },
    onSetMainGun: (index: number) => {
      setMainGun(index, map);
    },
    onRemoveGun: (index: number) => {
      const pos = state.positions[index];
      if (pos) removeArtillery(pos.id, map);
    },
    onRenameGun: (index: number, newLabel: string) => {
      if (index >= 0 && index < state.positions.length) {
        state.positions[index].label = newLabel;
        refreshAll(map);
      }
    },
    onPlatformChange: (index: number) => {
      state.defaultPlatformIndex = index;
      refreshAll(map);
    },
  });
}
