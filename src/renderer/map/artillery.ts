import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { MapPoint } from '../data/coords';
import { toMapPoint, mapPointToLngLat, lngLatToMapPoint } from '../data/coords';
import type { SavedArtilleryState } from '../data/store';
import { ARTILLERY_PLATFORMS, DEFAULT_PLATFORM_INDEX } from '../data/artilleryPlatforms';
import { crsDistanceMeters, crsAzimuth, metersToRadius, calculateCorrection, interpolateInaccuracy, windCompensatedTarget, interpolateWindDrift, windOffset } from '../data/artilleryCalc';
import { useArtilleryStore, type ArtillerySolution } from '../stores/artilleryStore';
import {
  syncWindOnly,
  syncGunCreate,
  syncGunDelete,
  syncGunUpdate,
  syncTargetSet,
  syncTargetDelete,
  syncTargetUpdate,
  syncImpactSet,
  syncImpactDelete,
  syncImpactUpdate,
  syncArtilleryClearAll,
} from '../multiplayer/artillerySync';
import { useMapStore } from '../stores/mapStore';
import { useLayerStore } from '../stores/layerStore';
import { useQuickControlsStore, getSpotterDisplayValues } from '../stores/quickControlsStore';
import { useUndoStore } from '../stores/undoStore';
const CIRCLE_SEGMENTS = 64;

interface ArtyPosition {
  id: number;
  point: MapPoint;
  label: string;
  platformIndex?: number;
  entityId?: string;
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
  nextId: number;
  nextLabelNum: number;
  targetEntityId: string | null;
  impactEntityId: string | null;
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
  nextId: 1,
  nextLabelNum: 1,
  targetEntityId: null,
  impactEntityId: null,
  markers: [],
  sourcesAdded: false,
};

// Wind drift marker (managed separately for lightweight wind recalc)
let windDriftMarker: maplibregl.Marker | null = null;

// Drag state
let dragInfo: { type: 'gun' | 'target' | 'impact'; gunIndex: number } | null = null;
let dragOccurred = false;
let dragStartSnapshot: { position: [number, number]; impactPosition?: [number, number] | null } | null = null;

// When true, mutations skip pushing to undo stack (used by undo executor)
let suppressUndoPush = false;
export function setSuppressUndoPush(v: boolean) { suppressUndoPush = v; }

let artilleryHexId: string = '';

export function setArtilleryHexId(hexId: string) { artilleryHexId = hexId; }
export function getArtilleryHexId(): string { return artilleryHexId; }

// Click handler reference
let clickHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;


export function refreshPinnedData(): void {
  const { pinnedGuns } = useArtilleryStore.getState();
  // Track which hex owns the pinned guns
  if (pinnedGuns.size > 0 && artilleryHexId) {
    useArtilleryStore.getState().setPinnedHexId(artilleryHexId);
  } else if (pinnedGuns.size === 0) {
    useArtilleryStore.getState().setPinnedHexId('');
  }
  const targetPos = state.corrected ?? state.target;
  if (!targetPos) {
    // No target — send pinned guns with null values
    const pinnedData = state.positions
      .map((p, i) => ({ label: p.label, i }))
      .filter((p) => pinnedGuns.has(p.i))
      .map((p) => ({ label: p.label, distanceM: null as number | null, azimuthDeg: null as number | null, inRange: false }));
    window.athena.updatePinnedArtillery(pinnedData);
    return;
  }
  const solutions = computeSolutions();
  const pinnedData = solutions
    .filter((s) => pinnedGuns.has(s.posIndex))
    .map((s) => ({ label: s.label, distanceM: s.distanceM, azimuthDeg: s.azimuthDeg, inRange: s.inRange }));
  window.athena.updatePinnedArtillery(pinnedData);
}

export function refreshPinnedFromCache(saved: SavedArtilleryState): void {
  const { pinnedGuns, windDirection, windStrength } = useArtilleryStore.getState();
  if (pinnedGuns.size === 0) return;

  const target = saved.target ? toMapPoint(saved.target[0], saved.target[1]) : null;

  const positions = saved.positions.map((p) => ({
    point: toMapPoint(p.latlng[0], p.latlng[1]),
    label: p.label,
    platformIndex: p.platformIndex,
  }));

  const hasWind = windDirection !== null && windStrength > 0;
  const pinnedData: { label: string; distanceM: number | null; azimuthDeg: number | null; inRange: boolean }[] = [];

  for (let i = 0; i < positions.length; i++) {
    if (!pinnedGuns.has(i)) continue;
    const pos = positions[i];

    if (!target) {
      pinnedData.push({ label: pos.label, distanceM: null, azimuthDeg: null, inRange: false });
      continue;
    }

    const platformIndex = pos.platformIndex ?? DEFAULT_PLATFORM_INDEX;
    const platform = ARTILLERY_PLATFORMS[platformIndex];

    let distanceM = 0;
    let azimuthDeg = 0;
    let inRange = false;

    if (hasWind && platform) {
      const rawDist = crsDistanceMeters(pos.point, target);
      const compensated = windCompensatedTarget(target, windDirection, windStrength, platform, rawDist);
      distanceM = crsDistanceMeters(pos.point, compensated);
      azimuthDeg = crsAzimuth(pos.point, compensated);
    } else {
      distanceM = crsDistanceMeters(pos.point, target);
      azimuthDeg = crsAzimuth(pos.point, target);
    }
    inRange = platform ? distanceM >= platform.minRange && distanceM <= platform.maxRange : false;

    pinnedData.push({ label: pos.label, distanceM, azimuthDeg, inRange });
  }

  window.athena.updatePinnedArtillery(pinnedData);
}

export function getArtilleryState() {
  return {
    active: state.active,
    placementMode: state.placementMode,
  };
}

/** Return the current main gun, target and impact positions for the spotter HUD. */
export function getLiveSpotterPositions(): { gun: [number, number] | null; target: [number, number] | null; impact: [number, number] | null; impactEntityId: string | null } {
  const mainPos = state.positions[state.mainGunIndex];
  return {
    gun: mainPos ? [mainPos.point.x, mainPos.point.y] : null,
    target: state.target ? [state.target.x, state.target.y] : null,
    impact: state.impact ? [state.impact.x, state.impact.y] : null,
    impactEntityId: state.impactEntityId,
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
  if (windDriftMarker) windDriftMarker.getElement().style.display = '';
}

export function hideArtillery(map: maplibregl.Map): void {
  for (const id of ARTY_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  }
  for (const m of state.markers) m.getElement().style.display = 'none';
  if (windDriftMarker) windDriftMarker.getElement().style.display = 'none';
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
  if (windDriftMarker) { windDriftMarker.remove(); windDriftMarker = null; }

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
  state.targetEntityId = null;
  state.impactEntityId = null;
}

export function activateArtillery(map: maplibregl.Map): void {
  state.active = true;
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
  const entityId = pos.entityId;
  const idx = state.positions.findIndex((p) => p.id === id);
  if (idx === -1) return;

  // Capture snapshot before removal for undo
  const gunSnapshot = {
    entityId: entityId ?? '',
    position: [pos.point.x, pos.point.y] as [number, number],
    label: pos.label,
    platformIndex: pos.platformIndex,
    wasMain: idx === state.mainGunIndex,
    posIndex: idx,
  };

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
  if (entityId && artilleryHexId) syncGunDelete(artilleryHexId, entityId);
  if (!suppressUndoPush) {
    useUndoStore.getState().pushAction({
      type: 'gun-removed',
      hexId: artilleryHexId,
      gun: gunSnapshot,
    });
  }
}

export function setMainGun(index: number, map: maplibregl.Map): void {
  if (index >= 0 && index < state.positions.length) {
    const oldMain = state.positions[state.mainGunIndex];
    state.mainGunIndex = index;
    const newMain = state.positions[index];
    refreshAll(map);
    if (artilleryHexId) {
      if (oldMain?.entityId) syncGunUpdate(artilleryHexId, oldMain.entityId, { isMain: false });
      if (newMain?.entityId) syncGunUpdate(artilleryHexId, newMain.entityId, { isMain: true });
    }
    }
}

export function renameGun(index: number, newLabel: string, map: maplibregl.Map): void {
  if (index >= 0 && index < state.positions.length) {
    const pos = state.positions[index];
    pos.label = newLabel;
    refreshAll(map);
    if (pos.entityId && artilleryHexId) syncGunUpdate(artilleryHexId, pos.entityId, { label: newLabel });
  }
}

export function setPlatformFromUI(index: number, map: maplibregl.Map): void {
  useArtilleryStore.getState().setPlatformIndex(index);
  refreshAll(map);
}

export function setGunPlatform(posIndex: number, platformIndex: number, map: maplibregl.Map): void {
  if (posIndex >= 0 && posIndex < state.positions.length) {
    const pos = state.positions[posIndex];
    pos.platformIndex = platformIndex;
    refreshAll(map);
    if (pos.entityId && artilleryHexId) syncGunUpdate(artilleryHexId, pos.entityId, { platformIndex });
  }
}

export function clearTarget(map: maplibregl.Map): void {
  const oldTargetEntityId = state.targetEntityId;
  const oldImpactEntityId = state.impactEntityId;
  state.target = null;
  state.impact = null;
  state.corrected = null;
  state.targetEntityId = null;
  state.impactEntityId = null;
  refreshAll(map);
  if (artilleryHexId) {
    if (oldTargetEntityId) syncTargetDelete(artilleryHexId, oldTargetEntityId);
    if (oldImpactEntityId) syncImpactDelete(artilleryHexId, oldImpactEntityId);
  }
}

export function clearImpact(map: maplibregl.Map): void {
  const oldImpactEntityId = state.impactEntityId;
  state.impact = null;
  state.corrected = null;
  state.impactEntityId = null;
  refreshAll(map);
  if (oldImpactEntityId && artilleryHexId) syncImpactDelete(artilleryHexId, oldImpactEntityId);
}

export function recalcWind(map: maplibregl.Map): void {
  const { windDirection, windStrength } = useArtilleryStore.getState();
  refreshWindOnly(map);
  if (artilleryHexId) syncWindOnly(windDirection, windStrength, artilleryHexId);
}

export function clearAll(map: maplibregl.Map): void {
  resetState();
  refreshAll(map);
  useArtilleryStore.getState().setStatusText('');
  if (artilleryHexId) syncArtilleryClearAll(artilleryHexId);
}

function handleMapClick(e: maplibregl.MapMouseEvent, map: maplibregl.Map): void {
  if (dragOccurred) return;
  if (!state.active) return;
  if (state.placementMode === 'idle') return;
  if (e.originalEvent.button !== 0) return;

  const point = lngLatToMapPoint(e.lngLat.lng, e.lngLat.lat);

  switch (state.placementMode) {
    case 'placing-arty': {
      if (state.positions.length >= 32) {
        useArtilleryStore.getState().setStatusText('Max 32 gun positions');
        setPlacementMode('idle');
        return;
      }
      const entityId = crypto.randomUUID();
      const isMain = state.positions.length === 0;
      const label = `A${state.nextLabelNum++}`;
      const platformIndex = useArtilleryStore.getState().platformIndex;
      state.positions.push({
        id: state.nextId++,
        point,
        label,
        platformIndex,
        entityId,
      });
      if (isMain) {
        state.mainGunIndex = 0;
      }
      refreshAll(map);
      if (artilleryHexId) syncGunCreate(artilleryHexId, {
        entityId,
        position: [point.x, point.y],
        label,
        platformIndex,
        isMain,
      });
      if (!suppressUndoPush) {
        useUndoStore.getState().pushAction({
          type: 'gun-added',
          hexId: artilleryHexId,
          gun: { entityId, position: [point.x, point.y], label, platformIndex, wasMain: isMain, posIndex: state.positions.length - 1 },
        });
      }
      return;
    }

    case 'placing-target': {
      const prevTarget: [number, number] | null = state.target ? [state.target.x, state.target.y] : null;
      const prevTargetEntityId = state.targetEntityId;
      const prevImpact: [number, number] | null = state.impact ? [state.impact.x, state.impact.y] : null;
      const prevImpactEntityId = state.impactEntityId;
      const targetEntityId = crypto.randomUUID();
      state.target = point;
      state.impact = null;
      state.corrected = null;
      state.targetEntityId = targetEntityId;
      state.impactEntityId = null;
      setPlacementMode('idle');
      refreshAll(map);
      if (artilleryHexId) {
        if (prevImpactEntityId) syncImpactDelete(artilleryHexId, prevImpactEntityId);
        if (prevTargetEntityId) syncTargetDelete(artilleryHexId, prevTargetEntityId);
        syncTargetSet(artilleryHexId, targetEntityId, [point.x, point.y]);
      }
      if (!suppressUndoPush) {
        useUndoStore.getState().pushAction({
          type: 'target-set',
          hexId: artilleryHexId,
          position: [point.x, point.y],
          entityId: targetEntityId,
          prevTarget,
          prevTargetEntityId,
          prevImpact,
          prevImpactEntityId,
        });
      }
      return;
    }

    case 'placing-impact': {
      if (!state.target) {
        useArtilleryStore.getState().setStatusText('Set a target first');
        setPlacementMode('idle');
        return;
      }
      const prevImpact2: [number, number] | null = state.impact ? [state.impact.x, state.impact.y] : null;
      const prevImpactEntityId2 = state.impactEntityId;
      const impactEntityId = crypto.randomUUID();
      state.impact = point;
      const correction = calculateCorrection(state.target, state.impact);
      state.corrected = correction.corrected;
      state.impactEntityId = impactEntityId;
      setPlacementMode('idle');
      refreshAll(map);
      if (artilleryHexId) {
        if (prevImpactEntityId2) syncImpactDelete(artilleryHexId, prevImpactEntityId2);
        syncImpactSet(artilleryHexId, impactEntityId, [point.x, point.y]);
      }
      if (!suppressUndoPush) {
        useUndoStore.getState().pushAction({
          type: 'impact-set',
          hexId: artilleryHexId,
          position: [point.x, point.y],
          entityId: impactEntityId,
          prevImpact: prevImpact2,
          prevImpactEntityId: prevImpactEntityId2,
        });
      }
      return;
    }
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

function computeOorSet(): Set<number> {
  const targetPos = state.corrected ?? state.target;
  const oorSet = new Set<number>();
  if (!targetPos) return oorSet;
  const { windDirection, windStrength } = useArtilleryStore.getState();
  const hasWind = windDirection !== null && windStrength > 0;
  for (let i = 0; i < state.positions.length; i++) {
    const gunPlatform = ARTILLERY_PLATFORMS[state.positions[i].platformIndex ?? useArtilleryStore.getState().platformIndex];
    if (!gunPlatform) continue;
    let dist: number;
    if (hasWind) {
      const rawDist = crsDistanceMeters(state.positions[i].point, targetPos);
      const compensated = windCompensatedTarget(targetPos, windDirection, windStrength, gunPlatform, rawDist);
      dist = crsDistanceMeters(state.positions[i].point, compensated);
    } else {
      dist = crsDistanceMeters(state.positions[i].point, targetPos);
    }
    if (dist < gunPlatform.minRange || dist > gunPlatform.maxRange) oorSet.add(i);
  }
  return oorSet;
}

/** Where the main gun's shell would land if wind isn't compensated for. */
function computeWindDriftPoint(): MapPoint | null {
  const target = state.corrected ?? state.target;
  if (!target || state.positions.length === 0) return null;
  const { windDirection, windStrength } = useArtilleryStore.getState();
  if (windDirection === null || windStrength <= 0) return null;
  const mainPos = state.positions[state.mainGunIndex];
  if (!mainPos) return null;
  const platform = ARTILLERY_PLATFORMS[mainPos.platformIndex ?? useArtilleryStore.getState().platformIndex];
  if (!platform) return null;
  const dist = crsDistanceMeters(mainPos.point, target);
  const off = windOffset(windDirection, windStrength, platform, dist);
  return { x: target.x + off.dx, y: target.y + off.dy };
}

function updateWindDriftMarker(map: maplibregl.Map): void {
  if (windDriftMarker) {
    windDriftMarker.remove();
    windDriftMarker = null;
  }
  const driftPt = computeWindDriftPoint();
  if (!driftPt) return;
  const el = createDotElement(12, 'arty-dot-wind-drift', false);
  windDriftMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(mapPointToLngLat(driftPt))
    .addTo(map);
  // Respect artillery layer visibility
  const artilleryLayerVisible = useLayerStore.getState().layers.artillery?.visible ?? true;
  if (!artilleryLayerVisible) {
    windDriftMarker.getElement().style.display = 'none';
  }
}

function refreshWindOnly(map: maplibregl.Map): void {
  if (!state.sourcesAdded) return;
  const targetPos = state.corrected ?? state.target;
  const oorSet = computeOorSet();

  // Rebuild only ring GeoJSON (colors may change with OOR)
  const ringFeatures: GeoJSON.Feature[] = [];
  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;
    const isOOR = targetPos !== null && oorSet.has(i);
    const gunPlatform = ARTILLERY_PLATFORMS[pos.platformIndex ?? useArtilleryStore.getState().platformIndex];
    if (gunPlatform) {
      const maxRadius = metersToRadius(gunPlatform.maxRange);
      const minRadius = metersToRadius(gunPlatform.minRange);
      const outerRing = circleCoords(pos.point, maxRadius);
      const innerRing = [...circleCoords(pos.point, minRadius)].reverse();
      const ringColor = isOOR ? '#b33030' : isMain ? '#003380' : '#4488cc';
      ringFeatures.push({
        type: 'Feature',
        properties: { color: ringColor, fillOpacity: isOOR ? 0.12 : 0.2 },
        geometry: { type: 'Polygon', coordinates: [outerRing, innerRing] },
      });
    }
  }
  (map.getSource('arty-rings') as GeoJSONSource).setData({ type: 'FeatureCollection', features: ringFeatures });
  map.triggerRepaint();

  // Recompute solutions + update store + pinned data
  const solutions = computeSolutions();
  useArtilleryStore.getState().setSolutions(solutions, state.target !== null, state.impact !== null);
  const { pinnedHexId } = useArtilleryStore.getState();
  if (!pinnedHexId || pinnedHexId === artilleryHexId) {
    const pinnedData = solutions
      .filter((s) => s.isPinned)
      .map((s) => ({
        label: s.label,
        distanceM: state.target !== null ? s.distanceM : null,
        azimuthDeg: state.target !== null ? s.azimuthDeg : null,
        inRange: s.inRange,
      }));
    window.athena.updatePinnedArtillery(pinnedData);
  }

  // Update wind drift marker (shows where shells land without wind compensation)
  updateWindDriftMarker(map);
}

function refreshAll(map: maplibregl.Map): void {
  if (!state.sourcesAdded) return;

  // Clear old markers (including wind drift marker tracked separately)
  for (const m of state.markers) m.remove();
  state.markers = [];
  if (windDriftMarker) { windDriftMarker.remove(); windDriftMarker = null; }

  const targetPos = state.corrected ?? state.target;

  const oorSet = computeOorSet();

  // Build ring GeoJSON
  const ringFeatures: GeoJSON.Feature[] = [];
  const lineFeatures: GeoJSON.Feature[] = [];
  const inaccFeatures: GeoJSON.Feature[] = [];

  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    const isMain = i === state.mainGunIndex;
    const isOOR = targetPos !== null && oorSet.has(i);
    const gunPlatform = ARTILLERY_PLATFORMS[pos.platformIndex ?? useArtilleryStore.getState().platformIndex];

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
      const gunPlat = ARTILLERY_PLATFORMS[pos.platformIndex ?? useArtilleryStore.getState().platformIndex];
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
  const ringSrc = map.getSource('arty-rings') as GeoJSONSource | undefined;
  const lineSrc = map.getSource('arty-lines') as GeoJSONSource | undefined;
  const inaccSrc = map.getSource('arty-inaccuracy') as GeoJSONSource | undefined;
  if (!ringSrc || !lineSrc || !inaccSrc) return;
  ringSrc.setData({ type: 'FeatureCollection', features: ringFeatures });
  lineSrc.setData({ type: 'FeatureCollection', features: lineFeatures });
  inaccSrc.setData({ type: 'FeatureCollection', features: inaccFeatures });
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

  // Wind drift dot (where shells land without wind compensation)
  updateWindDriftMarker(map);

  // Hide newly created markers if artillery layer is toggled off
  const artilleryLayerVisible = useLayerStore.getState().layers.artillery?.visible ?? true;
  if (!artilleryLayerVisible) {
    for (const m of state.markers) m.getElement().style.display = 'none';
  }

  // Push solutions to Zustand store
  const solutions = computeSolutions();
  useArtilleryStore.getState().setSolutions(solutions, state.target !== null, state.impact !== null);

  // Send pinned solutions to main process for pip window (only if this hex owns the pins)
  const { pinnedHexId: pHex } = useArtilleryStore.getState();
  if (!pHex || pHex === artilleryHexId) {
    const pinnedData = solutions
      .filter((s) => s.isPinned)
      .map((s) => ({
        label: s.label,
        distanceM: state.target !== null ? s.distanceM : null,
        azimuthDeg: state.target !== null ? s.azimuthDeg : null,
        inRange: s.inRange,
      }));
    window.athena.updatePinnedArtillery(pinnedData);
  }

  // Sync is now handled granularly at each mutation point

  // Push updated display values to spotter QC window if active
  const qcStore = useQuickControlsStore.getState();
  if (qcStore.mode === 'spotting' && qcStore.spotterCtx?.hexId === artilleryHexId) {
    window.athena.sendQcSpotterUpdate(getSpotterDisplayValues());
  }
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
    const mainPlatform = ARTILLERY_PLATFORMS[state.positions[state.mainGunIndex].platformIndex ?? useArtilleryStore.getState().platformIndex];
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
    const resolvedPlatformIndex = pos.platformIndex ?? useArtilleryStore.getState().platformIndex;
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

  // Capture starting position for undo
  if (type === 'gun' && gunIndex >= 0 && gunIndex < state.positions.length) {
    const p = state.positions[gunIndex].point;
    dragStartSnapshot = { position: [p.x, p.y] };
  } else if (type === 'target' && state.target) {
    dragStartSnapshot = {
      position: [state.target.x, state.target.y],
      impactPosition: state.impact ? [state.impact.x, state.impact.y] : null,
    };
  } else if (type === 'impact' && state.impact) {
    dragStartSnapshot = { position: [state.impact.x, state.impact.y] };
  } else {
    dragStartSnapshot = null;
  }
}

export function saveArtilleryState(): SavedArtilleryState {
  const { windDirection, windStrength } = useArtilleryStore.getState();
  return {
    positions: state.positions.map((p) => ({
      id: p.id,
      latlng: [p.point.x, p.point.y] as [number, number],
      label: p.label,
      platformIndex: p.platformIndex,
      entityId: p.entityId,
    })),
    target: state.target ? [state.target.x, state.target.y] : null,
    impact: state.impact ? [state.impact.x, state.impact.y] : null,
    mainGunIndex: state.mainGunIndex,
    defaultPlatformIndex: useArtilleryStore.getState().platformIndex,
    nextId: state.nextId,
    nextLabelNum: state.nextLabelNum,
    targetEntityId: state.targetEntityId,
    impactEntityId: state.impactEntityId,
    windDirection,
    windStrength,
  };
}

export function restoreArtilleryState(saved: SavedArtilleryState, map: maplibregl.Map): void {
  useArtilleryStore.getState().setWind(saved.windDirection ?? null, saved.windStrength ?? 0);
  state.positions = saved.positions.map((p) => ({
    id: p.id,
    point: toMapPoint(p.latlng[0], p.latlng[1]),
    label: p.label,
    platformIndex: p.platformIndex,
    entityId: p.entityId,
  }));
  state.target = saved.target ? toMapPoint(saved.target[0], saved.target[1]) : null;
  state.impact = saved.impact ? toMapPoint(saved.impact[0], saved.impact[1]) : null;
  state.mainGunIndex = saved.mainGunIndex;
  useArtilleryStore.getState().setPlatformIndex(saved.defaultPlatformIndex);
  state.nextId = saved.nextId;
  state.nextLabelNum = saved.nextLabelNum;
  state.targetEntityId = saved.targetEntityId ?? null;
  state.impactEntityId = saved.impactEntityId ?? null;
  recalcCorrected();
  refreshAll(map);
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
      case 'target': {
        const oldTarget = state.target;
        state.target = point;
        if (state.impact && oldTarget) {
          const dx = point.x - oldTarget.x;
          const dy = point.y - oldTarget.y;
          state.impact = { x: state.impact.x + dx, y: state.impact.y + dy };
        }
        recalcCorrected();
        break;
      }
      case 'impact':
        state.impact = point;
        recalcCorrected();
        break;
    }

    refreshAll(map); // Render locally; sync happens on mouseup
  });

  document.addEventListener('mouseup', () => {
    if (!dragInfo) return;
    const wasDrag = dragOccurred;
    const finishedDrag = dragInfo;
    dragInfo = null;
    map.dragPan.enable();
    useMapStore.getState().setMapCursor(
      state.placementMode !== 'idle' ? 'crosshair' : ''
    );

    if (wasDrag) {
      refreshAll(map);
      // Sync final position to server on drop
      if (artilleryHexId) {
        switch (finishedDrag.type) {
          case 'gun': {
            const pos = state.positions[finishedDrag.gunIndex];
            if (pos?.entityId) syncGunUpdate(artilleryHexId, pos.entityId, { position: [pos.point.x, pos.point.y] });
            break;
          }
          case 'target': {
            if (state.target && state.targetEntityId) {
              syncTargetUpdate(artilleryHexId, state.targetEntityId, { position: [state.target.x, state.target.y] });
              if (state.impact && state.impactEntityId) {
                syncImpactUpdate(artilleryHexId, state.impactEntityId, { position: [state.impact.x, state.impact.y] });
              }
            }
            break;
          }
          case 'impact': {
            if (state.impact && state.impactEntityId) {
              syncImpactUpdate(artilleryHexId, state.impactEntityId, { position: [state.impact.x, state.impact.y] });
            }
            break;
          }
        }
      }
      // Push undo action for the completed drag
      if (!suppressUndoPush && dragStartSnapshot && artilleryHexId) {
        switch (finishedDrag.type) {
          case 'gun': {
            const pos = state.positions[finishedDrag.gunIndex];
            if (pos?.entityId) {
              useUndoStore.getState().pushAction({
                type: 'gun-moved',
                hexId: artilleryHexId,
                entityId: pos.entityId,
                from: dragStartSnapshot.position,
                to: [pos.point.x, pos.point.y],
              });
            }
            break;
          }
          case 'target': {
            if (state.target && state.targetEntityId) {
              useUndoStore.getState().pushAction({
                type: 'target-moved',
                hexId: artilleryHexId,
                entityId: state.targetEntityId,
                from: dragStartSnapshot.position,
                to: [state.target.x, state.target.y],
                impactEntityId: state.impactEntityId,
                impactFrom: dragStartSnapshot.impactPosition ?? null,
                impactTo: state.impact ? [state.impact.x, state.impact.y] : null,
              });
            }
            break;
          }
          case 'impact': {
            if (state.impact && state.impactEntityId) {
              useUndoStore.getState().pushAction({
                type: 'impact-moved',
                hexId: artilleryHexId,
                entityId: state.impactEntityId,
                from: dragStartSnapshot.position,
                to: [state.impact.x, state.impact.y],
              });
            }
            break;
          }
        }
        dragStartSnapshot = null;
      }

      setTimeout(() => { dragOccurred = false; }, 50);
    }
  });
}

// ── Remote mutation functions (called by artillerySync for inbound messages) ──

export function addRemoteGun(
  map: maplibregl.Map,
  entityId: string,
  point: [number, number],
  label: string,
  platformIndex: number | undefined,
  isMain: boolean,
): void {
  state.positions.push({
    id: state.nextId++,
    point: toMapPoint(point[0], point[1]),
    label,
    platformIndex,
    entityId,
  });
  state.nextLabelNum = Math.max(state.nextLabelNum, parseInt(label.replace(/\D/g, ''), 10) + 1 || state.nextLabelNum);
  if (isMain) {
    state.mainGunIndex = state.positions.length - 1;
    }
  scheduleRefresh(map);
}

export function updateRemoteGun(
  map: maplibregl.Map,
  entityId: string,
  changes: Record<string, unknown>,
): void {
  // Skip if we're currently dragging this entity
  if (dragInfo?.type === 'gun') {
    const draggedPos = state.positions[dragInfo.gunIndex];
    if (draggedPos?.entityId === entityId) return;
  }

  const pos = state.positions.find((p) => p.entityId === entityId);
  if (!pos) return;

  if ('position' in changes) {
    const [x, y] = changes.position as [number, number];
    pos.point = toMapPoint(x, y);
  }
  if ('label' in changes) pos.label = changes.label as string;
  if ('platformIndex' in changes) pos.platformIndex = changes.platformIndex as number;
  if ('isMain' in changes && changes.isMain) {
    const idx = state.positions.indexOf(pos);
    if (idx !== -1) state.mainGunIndex = idx;
  }
  scheduleRefresh(map);
  // If this affected the main gun (position moved, or isMain changed), update spotter
  const idx = state.positions.indexOf(pos);
  if (idx === state.mainGunIndex || ('isMain' in changes && changes.isMain)) {
    }
}

export function removeRemoteGun(map: maplibregl.Map, entityId: string): void {
  const idx = state.positions.findIndex((p) => p.entityId === entityId);
  if (idx === -1) return;
  const wasMain = idx === state.mainGunIndex;
  state.positions.splice(idx, 1);

  if (state.positions.length === 0) {
    state.mainGunIndex = 0;
  } else if (state.mainGunIndex >= state.positions.length) {
    state.mainGunIndex = 0;
  } else if (idx < state.mainGunIndex) {
    state.mainGunIndex--;
  }
  scheduleRefresh(map);
}

export function setRemoteTarget(map: maplibregl.Map, entityId: string, position: [number, number]): void {
  state.target = toMapPoint(position[0], position[1]);
  state.targetEntityId = entityId;
  state.impact = null;
  state.corrected = null;
  state.impactEntityId = null;
  scheduleRefresh(map);
}

export function removeRemoteTarget(map: maplibregl.Map): void {
  state.target = null;
  state.impact = null;
  state.corrected = null;
  state.targetEntityId = null;
  state.impactEntityId = null;
  scheduleRefresh(map);
}

export function setRemoteImpact(map: maplibregl.Map, entityId: string, position: [number, number]): void {
  state.impact = toMapPoint(position[0], position[1]);
  state.impactEntityId = entityId;
  recalcCorrected();
  scheduleRefresh(map);
}

export function removeRemoteImpact(map: maplibregl.Map): void {
  state.impact = null;
  state.corrected = null;
  state.impactEntityId = null;
  scheduleRefresh(map);
}

export function updateRemoteTarget(map: maplibregl.Map, entityId: string, changes: Record<string, unknown>): void {
  if (dragInfo?.type === 'target') return;
  if ('position' in changes) {
    const [x, y] = changes.position as [number, number];
    state.target = toMapPoint(x, y);
  }
  recalcCorrected();
  scheduleRefresh(map);
}

export function updateRemoteImpact(map: maplibregl.Map, entityId: string, changes: Record<string, unknown>): void {
  if (dragInfo?.type === 'impact') return;
  if ('position' in changes) {
    const [x, y] = changes.position as [number, number];
    state.impact = toMapPoint(x, y);
    state.impactEntityId = entityId;
  }
  recalcCorrected();
  scheduleRefresh(map);
}

// RAF-based debounce: batch multiple inbound messages into one refreshAll per frame
let refreshScheduled = false;
let refreshMap: maplibregl.Map | null = null;

function scheduleRefresh(map: maplibregl.Map): void {
  refreshMap = map;
  if (refreshScheduled) return;
  refreshScheduled = true;
  requestAnimationFrame(() => {
    refreshScheduled = false;
    if (refreshMap) refreshAll(refreshMap);
  });
}

let windRefreshScheduled = false;

export function scheduleWindRefresh(map: maplibregl.Map): void {
  refreshMap = map;
  if (windRefreshScheduled) return;
  windRefreshScheduled = true;
  requestAnimationFrame(() => {
    windRefreshScheduled = false;
    if (refreshMap) refreshWindOnly(refreshMap);
  });
}

// ── Raw undo mutation helpers (no sync, no undo push) ──

export function undoRemoveGunByEntityId(entityId: string, map: maplibregl.Map): void {
  const idx = state.positions.findIndex((p) => p.entityId === entityId);
  if (idx === -1) return;
  if (idx === state.mainGunIndex && state.positions.length > 1) {
    state.mainGunIndex = 0;
  }
  state.positions.splice(idx, 1);
  if (state.positions.length === 0) {
    state.mainGunIndex = 0;
  } else if (state.mainGunIndex >= state.positions.length) {
    state.mainGunIndex = 0;
  } else if (idx < state.mainGunIndex) {
    state.mainGunIndex--;
  }
  refreshAll(map);
}

export function undoAddGun(
  entityId: string,
  position: [number, number],
  label: string,
  platformIndex: number | undefined,
  wasMain: boolean,
  map: maplibregl.Map,
): void {
  state.positions.push({
    id: state.nextId++,
    point: toMapPoint(position[0], position[1]),
    label,
    platformIndex,
    entityId,
  });
  state.nextLabelNum = Math.max(state.nextLabelNum, parseInt(label.replace(/\D/g, ''), 10) + 1 || state.nextLabelNum);
  if (wasMain) {
    state.mainGunIndex = state.positions.length - 1;
  }
  refreshAll(map);
}

export function undoSetTarget(point: [number, number] | null, entityId: string | null, map: maplibregl.Map): void {
  if (point) {
    state.target = toMapPoint(point[0], point[1]);
    state.targetEntityId = entityId;
  } else {
    state.target = null;
    state.targetEntityId = null;
  }
  recalcCorrected();
  refreshAll(map);
}

export function undoSetImpact(point: [number, number] | null, entityId: string | null, map: maplibregl.Map): void {
  if (point) {
    state.impact = toMapPoint(point[0], point[1]);
    state.impactEntityId = entityId;
  } else {
    state.impact = null;
    state.corrected = null;
    state.impactEntityId = null;
  }
  recalcCorrected();
  refreshAll(map);
}

export function undoMoveGun(entityId: string, position: [number, number], map: maplibregl.Map): void {
  const pos = state.positions.find((p) => p.entityId === entityId);
  if (!pos) return;
  pos.point = toMapPoint(position[0], position[1]);
  refreshAll(map);
}

export function undoMoveTarget(position: [number, number], impactPosition: [number, number] | null, map: maplibregl.Map): void {
  state.target = toMapPoint(position[0], position[1]);
  if (impactPosition) {
    state.impact = toMapPoint(impactPosition[0], impactPosition[1]);
  }
  recalcCorrected();
  refreshAll(map);
}

export function undoMoveImpact(position: [number, number], map: maplibregl.Map): void {
  state.impact = toMapPoint(position[0], position[1]);
  recalcCorrected();
  refreshAll(map);
}
