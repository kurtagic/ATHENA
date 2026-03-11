import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { MapPoint } from '../data/coords';
import { toMapPoint, mapPointToLngLat, lngLatToMapPoint } from '../data/coords';
import type { SavedArtilleryState } from '../data/store';
import { ARTILLERY_PLATFORMS, DEFAULT_PLATFORM_INDEX } from '../data/artilleryPlatforms';
import { crsDistanceMeters, crsAzimuth, metersToRadius, calculateCorrection, interpolateInaccuracy, windCompensatedTarget, interpolateWindDrift } from '../data/artilleryCalc';
import { useArtilleryStore, type ArtillerySolution } from '../stores/artilleryStore';
import { syncWindOnly } from '../multiplayer/artillerySync';
import { useMapStore } from '../stores/mapStore';
import { useLayerStore } from '../stores/layerStore';
const CIRCLE_SEGMENTS = 64;

interface ArtyPosition {
  id: number;
  point: MapPoint;
  label: string;
  platformIndex?: number;
}

type PlacementMode = 'idle' | 'placing-arty' | 'placing-target' | 'placing-impact';

interface ArtyState {
  active: boolean;
  placementMode: PlacementMode;
  positions: ArtyPosition[];
  target: MapPoint | null;
  impact: MapPoint | null;
  corrected: MapPoint | null;
  mainGunIndex: number;
  defaultPlatformIndex: number;
  nextId: number;
  nextLabelNum: number;
  // MapLibre refs
  markers: maplibregl.Marker[];
  sourcesAdded: boolean;
}

const state: ArtyState = {
  active: false,
  placementMode: 'idle',
  positions: [],
  target: null,
  impact: null,
  corrected: null,
  mainGunIndex: 0,
  defaultPlatformIndex: DEFAULT_PLATFORM_INDEX,
  nextId: 1,
  nextLabelNum: 1,
  markers: [],
  sourcesAdded: false,
};

// Drag state
let dragInfo: { type: 'gun' | 'target' | 'impact'; gunIndex: number } | null = null;
let dragOccurred = false;

// Sync callback
let onArtilleryChanged: ((state: SavedArtilleryState, hexId: string) => void) | null = null;
let artilleryHexId: string = '';

export function setArtilleryChangedCallback(cb: typeof onArtilleryChanged) { onArtilleryChanged = cb; }
export function setArtilleryHexId(hexId: string) { artilleryHexId = hexId; }

// Click handler reference
let clickHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;

export function refreshPinnedData(): void {
  const { pinnedGuns } = useArtilleryStore.getState();
  const targetPos = state.corrected ?? state.target;
  if (!targetPos) {
    window.athena.updatePinnedArtillery([]);
    return;
  }
  const solutions = computeSolutions();
  const pinnedData = solutions
    .filter((s) => pinnedGuns.has(s.posIndex))
    .map((s) => ({ label: s.label, distanceM: s.distanceM, azimuthDeg: s.azimuthDeg, inRange: s.inRange }));
  window.athena.updatePinnedArtillery(pinnedData);
}

export function getArtilleryState() {
  return {
    active: state.active,
    placementMode: state.placementMode,
  };
}

function emptyGeoJSON(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export function initArtilleryLayer(map: maplibregl.Map): void {
  if (state.sourcesAdded) return;

  map.addSource('arty-rings', { type: 'geojson', data: emptyGeoJSON() });
  map.addSource('arty-lines', { type: 'geojson', data: emptyGeoJSON() });
  map.addSource('arty-inaccuracy', { type: 'geojson', data: emptyGeoJSON() });

  // Range ring fill
  map.addLayer({
    id: 'arty-ring-fill',
    type: 'fill',
    source: 'arty-rings',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['get', 'fillOpacity'],
    },
  });
  // Range ring outline
  map.addLayer({
    id: 'arty-ring-line',
    type: 'line',
    source: 'arty-rings',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2,
    },
  });
  // Connection / correction lines
  map.addLayer({
    id: 'arty-connection-lines',
    type: 'line',
    source: 'arty-lines',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['get', 'weight'],
      'line-opacity': ['get', 'opacity'],
      'line-dasharray': [4, 4],
    },
  });
  // Inaccuracy circles
  map.addLayer({
    id: 'arty-inaccuracy-lines',
    type: 'line',
    source: 'arty-inaccuracy',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['get', 'weight'],
      'line-opacity': ['get', 'opacity'],
      'line-dasharray': [4, 3],
    },
  });
  map.addLayer({
    id: 'arty-inaccuracy-fill',
    type: 'fill',
    source: 'arty-inaccuracy',
    paint: {
      'fill-color': ['get', 'fillColor'],
      'fill-opacity': ['get', 'fillOpacity'],
    },
  });

  state.sourcesAdded = true;
}

const ARTY_LAYER_IDS = ['arty-ring-fill', 'arty-ring-line', 'arty-connection-lines', 'arty-inaccuracy-lines', 'arty-inaccuracy-fill'] as const;
const ARTY_RING_LAYER_IDS = ['arty-ring-fill', 'arty-ring-line'] as const;

export function showArtillery(map: maplibregl.Map): void {
  for (const id of ARTY_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
  }
  for (const m of state.markers) m.getElement().style.display = '';
}

export function hideArtillery(map: maplibregl.Map): void {
  for (const id of ARTY_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  }
  for (const m of state.markers) m.getElement().style.display = 'none';
}

export function showArtilleryRings(map: maplibregl.Map): void {
  for (const id of ARTY_RING_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
  }
}

export function hideArtilleryRings(map: maplibregl.Map): void {
  for (const id of ARTY_RING_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  }
}

export function cleanupArtillery(map: maplibregl.Map): void {
  if (state.active) deactivateArtillery();

  // Remove markers
  for (const m of state.markers) m.remove();
  state.markers = [];

  // Remove layers and sources
  if (state.sourcesAdded) {
    for (const id of ['arty-ring-fill', 'arty-ring-line', 'arty-connection-lines', 'arty-inaccuracy-lines', 'arty-inaccuracy-fill']) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of ['arty-rings', 'arty-lines', 'arty-inaccuracy']) {
      if (map.getSource(id)) map.removeSource(id);
    }
    state.sourcesAdded = false;
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

export function activateArtillery(map: maplibregl.Map): void {
  state.active = true;
  useArtilleryStore.getState().setPlatformIndex(state.defaultPlatformIndex);
  useArtilleryStore.getState().setStatusText('');
  refreshAll(map);
}

export function deactivateArtillery(): void {
  state.active = false;
  state.placementMode = 'idle';
  useMapStore.getState().setMapCursor('');
  useArtilleryStore.getState().setPlacementMode('idle');
}

export function setPlacementMode(mode: PlacementMode): void {
  state.placementMode = mode;
  useArtilleryStore.getState().setPlacementMode(mode);
  useMapStore.getState().setMapCursor(mode !== 'idle' ? 'crosshair' : '');

  switch (mode) {
    case 'placing-arty':
      useArtilleryStore.getState().setStatusText('Click map to place gun position');
      break;
    case 'placing-target':
      useArtilleryStore.getState().setStatusText('Click map to set target');
      break;
    case 'placing-impact':
      useArtilleryStore.getState().setStatusText('Click map to mark impact point');
      break;
    default:
      useArtilleryStore.getState().setStatusText('');
  }
}

export function removeArtillery(posIndex: number, map: maplibregl.Map): void {
  const pos = state.positions[posIndex];
  if (!pos) return;
  const id = pos.id;
  const idx = state.positions.findIndex((p) => p.id === id);
  if (idx === -1) return;
  state.positions.splice(idx, 1);

  // Update pinned guns: remove the deleted index and shift down any above it
  const oldPinned = useArtilleryStore.getState().pinnedGuns;
  const newPinned = new Set<number>();
  for (const pi of oldPinned) {
    if (pi === idx) continue;
    newPinned.add(pi > idx ? pi - 1 : pi);
  }
  useArtilleryStore.setState({ pinnedGuns: newPinned });

  if (state.positions.length === 0) {
    state.mainGunIndex = 0;
  } else if (state.mainGunIndex >= state.positions.length) {
    state.mainGunIndex = 0;
  } else if (idx < state.mainGunIndex) {
    state.mainGunIndex--;
  }

  refreshAll(map);
}

export function setMainGun(index: number, map: maplibregl.Map): void {
  if (index >= 0 && index < state.positions.length) {
    state.mainGunIndex = index;
    refreshAll(map);
  }
}

export function renameGun(index: number, newLabel: string, map: maplibregl.Map): void {
  if (index >= 0 && index < state.positions.length) {
    state.positions[index].label = newLabel;
    refreshAll(map);
  }
}

export function setPlatformFromUI(index: number, map: maplibregl.Map): void {
  state.defaultPlatformIndex = index;
  useArtilleryStore.getState().setPlatformIndex(index);
  refreshAll(map);
}

export function setGunPlatform(posIndex: number, platformIndex: number, map: maplibregl.Map): void {
  if (posIndex >= 0 && posIndex < state.positions.length) {
    state.positions[posIndex].platformIndex = platformIndex;
    refreshAll(map);
  }
}

export function clearTarget(map: maplibregl.Map): void {
  state.target = null;
  state.impact = null;
  state.corrected = null;
  refreshAll(map);
}

export function clearImpact(map: maplibregl.Map): void {
  state.impact = null;
  state.corrected = null;
  refreshAll(map);
}

export function recalcWind(map: maplibregl.Map): void {
  const { windDirection, windStrength } = useArtilleryStore.getState();
  refreshAll(map, false);
  if (artilleryHexId) syncWindOnly(windDirection, windStrength, artilleryHexId);
}

export function clearAll(map: maplibregl.Map): void {
  resetState();
  refreshAll(map);
  useArtilleryStore.getState().setStatusText('');
}

function handleMapClick(e: maplibregl.MapMouseEvent, map: maplibregl.Map): void {
  if (dragOccurred) return;
  if (!state.active) return;
  if (state.placementMode === 'idle') return;
  if (e.originalEvent.button !== 0) return;

  const point = lngLatToMapPoint(e.lngLat.lng, e.lngLat.lat);

  switch (state.placementMode) {
    case 'placing-arty':
      if (state.positions.length >= 32) {
        useArtilleryStore.getState().setStatusText('Max 32 gun positions');
        setPlacementMode('idle');
        return;
      }
      state.positions.push({
        id: state.nextId++,
        point,
        label: `A${state.nextLabelNum++}`,
      });
      if (state.positions.length === 1) {
        state.mainGunIndex = 0;
      }
      refreshAll(map);
      return;

    case 'placing-target':
      state.target = point;
      state.impact = null;
      state.corrected = null;
      break;

    case 'placing-impact':
      if (!state.target) {
        useArtilleryStore.getState().setStatusText('Set a target first');
        setPlacementMode('idle');
        return;
      }
      state.impact = point;
      const correction = calculateCorrection(state.target, state.impact);
      state.corrected = correction.corrected;
      break;
  }

  setPlacementMode('idle');
  refreshAll(map);
}

function circleCoords(center: MapPoint, radiusCRS: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    const p: MapPoint = {
      x: center.x + radiusCRS * Math.sin(angle),
      y: center.y + radiusCRS * Math.cos(angle),
    };
    pts.push(mapPointToLngLat(p));
  }
  return pts;
}

function createDotElement(dotSize: number, cssClass: string, interactive: boolean): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'arty-dot-wrap';
  wrapper.style.width = `${dotSize + 20}px`;
  wrapper.style.height = `${dotSize + 20}px`;
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';

  const dotClasses = ['arty-dot', cssClass];
  if (interactive) dotClasses.push('arty-draggable');

  const dot = document.createElement('div');
  dot.className = dotClasses.join(' ');
  dot.style.width = `${dotSize}px`;
  dot.style.height = `${dotSize}px`;
  wrapper.appendChild(dot);

  return wrapper;
}

function refreshAll(map: maplibregl.Map, sync = true): void {
  if (!state.sourcesAdded) return;

  // Clear old markers
  for (const m of state.markers) m.remove();
  state.markers = [];

  const defaultPlatform = ARTILLERY_PLATFORMS[state.defaultPlatformIndex];
  const targetPos = state.corrected ?? state.target;

  const oorSet = new Set<number>();
  if (targetPos) {
    for (let i = 0; i < state.positions.length; i++) {
      const gunPlatform = ARTILLERY_PLATFORMS[state.positions[i].platformIndex ?? state.defaultPlatformIndex];
      if (!gunPlatform) continue;
      const dist = crsDistanceMeters(state.positions[i].point, targetPos);
      if (dist < gunPlatform.minRange || dist > gunPlatform.maxRange) {
        oorSet.add(i);
      }
    }
  }

  // Build ring GeoJSON
  const ringFeatures: GeoJSON.Feature[] = [];
  const lineFeatures: GeoJSON.Feature[] = [];
  const inaccFeatures: GeoJSON.Feature[] = [];

  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;
    const isOOR = targetPos !== null && oorSet.has(i);
    const gunPlatform = ARTILLERY_PLATFORMS[pos.platformIndex ?? state.defaultPlatformIndex];

    if (gunPlatform) {
      const maxRadius = metersToRadius(gunPlatform.maxRange);
      const minRadius = metersToRadius(gunPlatform.minRange);
      const outerRing = circleCoords(pos.point, maxRadius);
      const innerRing = [...circleCoords(pos.point, minRadius)].reverse();

      const ringColor = isOOR ? '#b33030' : isMain ? '#003380' : '#4488cc';
      ringFeatures.push({
        type: 'Feature',
        properties: { color: ringColor, fillOpacity: isOOR ? 0.12 : 0.2 },
        geometry: {
          type: 'Polygon',
          coordinates: [outerRing, innerRing],
        },
      });
    }

    // Connection line to target
    if (state.target) {
      lineFeatures.push({
        type: 'Feature',
        properties: { color: '#333333', weight: 1.5, opacity: 0.55 },
        geometry: {
          type: 'LineString',
          coordinates: [mapPointToLngLat(pos.point), mapPointToLngLat(state.target)],
        },
      });
    }
  }

  // Inaccuracy circles
  if (state.positions.length > 0 && state.target) {
    let overallMin = Infinity;
    let overallMax = -Infinity;
    let currentMax = -Infinity;

    for (const pos of state.positions) {
      const gunPlat = ARTILLERY_PLATFORMS[pos.platformIndex ?? state.defaultPlatformIndex];
      if (!gunPlat) continue;
      if (gunPlat.minInaccuracy < overallMin) overallMin = gunPlat.minInaccuracy;
      if (gunPlat.maxInaccuracy > overallMax) overallMax = gunPlat.maxInaccuracy;
      const dist = crsDistanceMeters(pos.point, state.target);
      const inacc = interpolateInaccuracy(gunPlat, dist);
      if (inacc > currentMax) currentMax = inacc;
    }

    // Min and max inaccuracy bounds across all guns (gray dashed)
    for (const r of [metersToRadius(overallMin), metersToRadius(overallMax)]) {
      inaccFeatures.push({
        type: 'Feature',
        properties: { color: '#444444', weight: 1, opacity: 0.5, fillColor: 'transparent', fillOpacity: 0 },
        geometry: {
          type: 'Polygon',
          coordinates: [circleCoords(state.target, r)],
        },
      });
    }

    // Current worst-case inaccuracy across all guns (red solid)
    inaccFeatures.push({
      type: 'Feature',
      properties: { color: '#ef5350', weight: 1.5, opacity: 1, fillColor: '#ef5350', fillOpacity: 0.05 },
      geometry: {
        type: 'Polygon',
        coordinates: [circleCoords(state.target, metersToRadius(currentMax))],
      },
    });
  }

  // Correction line (target -> corrected)
  if (state.target && state.corrected) {
    lineFeatures.push({
      type: 'Feature',
      properties: { color: '#66bb6a', weight: 1.5, opacity: 0.7 },
      geometry: {
        type: 'LineString',
        coordinates: [mapPointToLngLat(state.target), mapPointToLngLat(state.corrected)],
      },
    });
  }

  // Impact line (target -> impact)
  if (state.target && state.impact) {
    lineFeatures.push({
      type: 'Feature',
      properties: { color: '#ff8c00', weight: 1, opacity: 0.5 },
      geometry: {
        type: 'LineString',
        coordinates: [mapPointToLngLat(state.target), mapPointToLngLat(state.impact)],
      },
    });
  }

  // Update GeoJSON sources
  (map.getSource('arty-rings') as GeoJSONSource).setData({ type: 'FeatureCollection', features: ringFeatures });
  (map.getSource('arty-lines') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lineFeatures });
  (map.getSource('arty-inaccuracy') as GeoJSONSource).setData({ type: 'FeatureCollection', features: inaccFeatures });
  map.triggerRepaint();

  // Corrected dot marker
  if (state.corrected) {
    const el = createDotElement(16, 'arty-dot-corrected', false);
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(mapPointToLngLat(state.corrected))
      .addTo(map);
    state.markers.push(marker);
  }

  // Gun dot markers + labels
  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;
    const isOOR = targetPos !== null && oorSet.has(i);

    let dotClass: string;
    if (isOOR) dotClass = 'arty-dot-oor';
    else if (isMain) dotClass = 'arty-dot-main-gun';
    else dotClass = 'arty-dot-gun';

    const el = createDotElement(isMain ? 20 : 16, dotClass, true);
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(mapPointToLngLat(pos.point))
      .addTo(map);
    state.markers.push(marker);

    // Drag handling
    const gi = i;
    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      startDrag(map, 'gun', gi, e);
    });

    // Gun label
    const labelEl = document.createElement('div');
    labelEl.className = 'arty-gun-label';
    labelEl.textContent = pos.label;
    const labelMarker = new maplibregl.Marker({ element: labelEl, anchor: 'bottom', offset: [0, -12] })
      .setLngLat(mapPointToLngLat(pos.point))
      .addTo(map);
    state.markers.push(labelMarker);
  }

  // Target dot
  if (state.target) {
    const el = createDotElement(18, 'arty-dot-target', true);
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(mapPointToLngLat(state.target))
      .addTo(map);
    state.markers.push(marker);

    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      startDrag(map, 'target', -1, e);
    });
  }

  // Impact dot
  if (state.impact) {
    const el = createDotElement(16, 'arty-dot-impact', true);
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(mapPointToLngLat(state.impact))
      .addTo(map);
    state.markers.push(marker);

    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      startDrag(map, 'impact', -1, e);
    });
  }

  // Hide newly created markers if artillery layer is toggled off
  const artilleryLayerVisible = useLayerStore.getState().layers.artillery?.visible ?? true;
  if (!artilleryLayerVisible) {
    for (const m of state.markers) m.getElement().style.display = 'none';
  }

  // Push solutions to Zustand store
  const solutions = computeSolutions();
  useArtilleryStore.getState().setSolutions(solutions, state.target !== null, state.impact !== null);

  // Send pinned solutions to main process for pip window
  const pinnedData = solutions
    .filter((s) => s.isPinned && state.target !== null)
    .map((s) => ({ label: s.label, distanceM: s.distanceM, azimuthDeg: s.azimuthDeg, inRange: s.inRange }));
  window.athena.updatePinnedArtillery(pinnedData);

  if (sync && onArtilleryChanged && artilleryHexId) onArtilleryChanged(saveArtilleryState(), artilleryHexId);
}

function computeSolutions(): ArtillerySolution[] {
  const targetPos = state.corrected ?? state.target;
  const solutions: ArtillerySolution[] = [];
  const { windDirection, windStrength, pinnedGuns } = useArtilleryStore.getState();
  const hasWind = windDirection !== null && windStrength > 0;

  let mainDist = 0;
  let mainAz = 0;
  if (targetPos && state.positions.length > 0 && state.mainGunIndex < state.positions.length) {
    const mainPos = state.positions[state.mainGunIndex];
    const mainPlatform = ARTILLERY_PLATFORMS[state.positions[state.mainGunIndex].platformIndex ?? state.defaultPlatformIndex];
    if (hasWind && mainPlatform) {
      const rawDist = crsDistanceMeters(mainPos.point, targetPos);
      const compensated = windCompensatedTarget(targetPos, windDirection, windStrength, mainPlatform, rawDist);
      mainDist = crsDistanceMeters(mainPos.point, compensated);
      mainAz = crsAzimuth(mainPos.point, compensated);
    } else {
      mainDist = crsDistanceMeters(mainPos.point, targetPos);
      mainAz = crsAzimuth(mainPos.point, targetPos);
    }
  }

  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;
    const resolvedPlatformIndex = pos.platformIndex ?? state.defaultPlatformIndex;
    const platform = ARTILLERY_PLATFORMS[resolvedPlatformIndex];

    let distanceM = 0;
    let azimuthDeg = 0;
    let inRange = false;
    let relDist = 0;
    let relAz = 0;
    let windDriftM = 0;

    if (targetPos) {
      if (hasWind && platform) {
        const rawDist = crsDistanceMeters(pos.point, targetPos);
        windDriftM = interpolateWindDrift(platform, rawDist) * (windStrength / 5);
        const compensated = windCompensatedTarget(targetPos, windDirection, windStrength, platform, rawDist);
        distanceM = crsDistanceMeters(pos.point, compensated);
        azimuthDeg = crsAzimuth(pos.point, compensated);
      } else {
        distanceM = crsDistanceMeters(pos.point, targetPos);
        azimuthDeg = crsAzimuth(pos.point, targetPos);
      }
      inRange = platform
        ? distanceM >= platform.minRange && distanceM <= platform.maxRange
        : false;

      relDist = distanceM - mainDist;
      const rawRelAz = azimuthDeg - mainAz;
      relAz = ((rawRelAz + 540) % 360) - 180;
    }

    solutions.push({
      posIndex: i,
      label: pos.label,
      distanceM,
      azimuthDeg,
      inRange,
      platformName: platform ? platform.name : '',
      platformIndex: resolvedPlatformIndex,
      relDist,
      relAz,
      isMain,
      windDriftM,
      isPinned: pinnedGuns.has(i),
    });
  }

  return solutions;
}

function startDrag(map: maplibregl.Map, type: 'gun' | 'target' | 'impact', gunIndex: number, e: MouseEvent): void {
  if (state.placementMode !== 'idle') return;
  e.stopPropagation();
  e.preventDefault();
  dragInfo = { type, gunIndex };
  dragOccurred = false;
  map.dragPan.disable();
  useMapStore.getState().setMapCursor('grabbing');
}

export function saveArtilleryState(): SavedArtilleryState {
  const { windDirection, windStrength } = useArtilleryStore.getState();
  return {
    positions: state.positions.map((p) => ({
      id: p.id,
      latlng: [p.point.x, p.point.y] as [number, number],
      label: p.label,
      platformIndex: p.platformIndex,
    })),
    target: state.target ? [state.target.x, state.target.y] : null,
    impact: state.impact ? [state.impact.x, state.impact.y] : null,
    mainGunIndex: state.mainGunIndex,
    defaultPlatformIndex: state.defaultPlatformIndex,
    nextId: state.nextId,
    nextLabelNum: state.nextLabelNum,
    windDirection,
    windStrength,
  };
}

export function restoreArtilleryState(saved: SavedArtilleryState, map: maplibregl.Map, sync = false): void {
  if (saved.windDirection !== undefined) {
    useArtilleryStore.getState().setWind(saved.windDirection, saved.windStrength ?? 0);
  }
  state.positions = saved.positions.map((p) => ({
    id: p.id,
    point: toMapPoint(p.latlng[0], p.latlng[1]),
    label: p.label,
    platformIndex: p.platformIndex,
  }));
  state.target = saved.target ? toMapPoint(saved.target[0], saved.target[1]) : null;
  state.impact = saved.impact ? toMapPoint(saved.impact[0], saved.impact[1]) : null;
  state.mainGunIndex = saved.mainGunIndex;
  state.defaultPlatformIndex = saved.defaultPlatformIndex;
  state.nextId = saved.nextId;
  state.nextLabelNum = saved.nextLabelNum;
  recalcCorrected();
  refreshAll(map, sync);
}

export function setupArtilleryEvents(map: maplibregl.Map): void {
  clickHandler = (e: maplibregl.MapMouseEvent) => handleMapClick(e, map);
  map.on('click', clickHandler);

  map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
    if (!dragInfo) return;
    dragOccurred = true;

    const point = lngLatToMapPoint(e.lngLat.lng, e.lngLat.lat);

    switch (dragInfo.type) {
      case 'gun':
        if (dragInfo.gunIndex >= 0 && dragInfo.gunIndex < state.positions.length) {
          state.positions[dragInfo.gunIndex].point = point;
        }
        break;
      case 'target':
        state.target = point;
        state.impact = null;
        state.corrected = null;
        break;
      case 'impact':
        state.impact = point;
        recalcCorrected();
        break;
    }

    refreshAll(map, false); // Don't sync mid-drag, only render locally
  });

  document.addEventListener('mouseup', () => {
    if (!dragInfo) return;
    const wasDrag = dragOccurred;
    dragInfo = null;
    map.dragPan.enable();
    useMapStore.getState().setMapCursor(
      state.placementMode !== 'idle' ? 'crosshair' : ''
    );

    if (wasDrag) {
      // Sync final position to server on drop
      refreshAll(map, true);
      setTimeout(() => { dragOccurred = false; }, 50);
    }
  });
}
