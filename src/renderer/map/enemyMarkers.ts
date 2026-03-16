import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { MapPoint } from '../data/coords';
import { toMapPoint, mapPointToLngLat, lngLatToMapPoint } from '../data/coords';
import { ARTILLERY_PLATFORMS } from '../data/artilleryPlatforms';
import { metersToRadius } from '../data/artilleryCalc';
import { useEnemyMarkerStore } from '../stores/enemyMarkerStore';
import { useMapStore } from '../stores/mapStore';
import { useDrawStore } from '../stores/drawStore';
import { useUndoStore } from '../stores/undoStore';
import { useLayerStore } from '../stores/layerStore';
import {
  syncEnemyMarkerCreate,
  syncEnemyMarkerDelete,
  syncEnemyMarkerUpdate,
} from '../multiplayer/enemyMarkerSync';
import { debugLog } from '../stores/debugStore';

const CIRCLE_SEGMENTS = 64;

interface EnemyMarker {
  entityId: string;
  point: MapPoint;
  platformIndex: number;
  label: string;
  domMarker: maplibregl.Marker;
  labelMarker: maplibregl.Marker;
}

// ── Module state ──
const markers: EnemyMarker[] = [];
let currentHexId = '';
let suppressUndoPush = false;
let clickHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;

// Drag state
let dragInfo: { entityId: string } | null = null;
let dragOccurred = false;
let dragStartPos: [number, number] | null = null;

export function setEnemyMarkerHexId(hexId: string): void {
  currentHexId = hexId;
}

export function showEnemyMarkers(map: maplibregl.Map): void {
  for (const m of markers) {
    m.domMarker.getElement().style.display = '';
    m.labelMarker.getElement().style.display = '';
  }
  if (map.getLayer('enemy-rings-fill')) map.setLayoutProperty('enemy-rings-fill', 'visibility', 'visible');
  if (map.getLayer('enemy-rings-line')) map.setLayoutProperty('enemy-rings-line', 'visibility', 'visible');
}

export function hideEnemyMarkers(map: maplibregl.Map): void {
  for (const m of markers) {
    m.domMarker.getElement().style.display = 'none';
    m.labelMarker.getElement().style.display = 'none';
  }
  if (map.getLayer('enemy-rings-fill')) map.setLayoutProperty('enemy-rings-fill', 'visibility', 'none');
  if (map.getLayer('enemy-rings-line')) map.setLayoutProperty('enemy-rings-line', 'visibility', 'none');
}

// ── SVG Icon ──

const ARTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;

function createMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'enemy-marker-dot';
  el.style.cssText = 'width:20px;height:20px;color:#000;cursor:grab;pointer-events:auto;';
  el.innerHTML = ARTY_SVG;
  return el;
}

function createLabelElement(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'enemy-marker-label';
  el.style.cssText = 'font-size:11px;color:#000;font-weight:600;white-space:nowrap;text-shadow:0 0 3px rgba(255,255,255,0.8);pointer-events:none;';
  el.textContent = label;
  return el;
}

// ── Circle coordinates ──

function circleCoords(center: MapPoint, radiusCRS: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    const cx = center.x + radiusCRS * Math.sin(angle);
    const cy = center.y + radiusCRS * Math.cos(angle);
    pts.push(mapPointToLngLat({ x: cx, y: cy }));
  }
  return pts;
}

// ── Layer init / cleanup ──

export function initEnemyMarkerLayer(map: maplibregl.Map): void {
  if (map.getSource('enemy-rings')) return;

  map.addSource('enemy-rings', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'enemy-rings-fill',
    type: 'fill',
    source: 'enemy-rings',
    paint: {
      'fill-color': '#000000',
      'fill-opacity': 0.06,
    },
  });

  map.addLayer({
    id: 'enemy-rings-line',
    type: 'line',
    source: 'enemy-rings',
    paint: {
      'line-color': '#000000',
      'line-width': 1.5,
      'line-dasharray': [4, 3],
      'line-opacity': 0.6,
    },
  });
}

export function cleanupEnemyMarkers(map: maplibregl.Map): void {
  deactivateEnemyMarkers(map);

  // Remove all DOM markers
  for (const m of markers) {
    m.domMarker.remove();
    m.labelMarker.remove();
  }
  markers.length = 0;

  // Remove layers and source
  if (map.getLayer('enemy-rings-fill')) map.removeLayer('enemy-rings-fill');
  if (map.getLayer('enemy-rings-line')) map.removeLayer('enemy-rings-line');
  if (map.getSource('enemy-rings')) map.removeSource('enemy-rings');
}

// ── Activate / deactivate click handler ──

export function activateEnemyMarkers(map: maplibregl.Map): void {
  if (clickHandler) return;

  clickHandler = (e: maplibregl.MapMouseEvent) => {
    if (dragOccurred) return;
    const store = useEnemyMarkerStore.getState();
    if (!store.placingMarker) return;
    if (useDrawStore.getState().activeTool !== 'enemy-marker') return;

    const point = lngLatToMapPoint(e.lngLat.lng, e.lngLat.lat);
    placeEnemyMarker(point, store.selectedPlatformIndex, map);
  };

  map.on('contextmenu', clickHandler);
}

export function deactivateEnemyMarkers(map: maplibregl.Map): void {
  if (clickHandler) {
    map.off('contextmenu', clickHandler);
    clickHandler = null;
  }
}

// ── Place / Remove / Move ──

export function placeEnemyMarker(
  point: MapPoint,
  platformIndex: number,
  map: maplibregl.Map,
  entityId?: string,
): void {
  const id = entityId ?? crypto.randomUUID();
  const platform = ARTILLERY_PLATFORMS[platformIndex];
  const label = platform?.name ?? 'Unknown';

  // Create DOM marker
  const el = createMarkerElement();
  const domMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(mapPointToLngLat(point))
    .addTo(map);

  // Create label marker
  const labelEl = createLabelElement(label);
  const labelMarker = new maplibregl.Marker({ element: labelEl, anchor: 'bottom', offset: [0, -12] })
    .setLngLat(mapPointToLngLat(point))
    .addTo(map);

  const marker: EnemyMarker = { entityId: id, point, platformIndex, label, domMarker, labelMarker };
  markers.push(marker);

  // Hide if drawings layer is toggled off
  if (!useLayerStore.getState().layers.drawings?.visible) {
    el.style.display = 'none';
    labelEl.style.display = 'none';
  }

  // Drag handling
  el.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    startDrag(map, id, e);
  });

  // Right-click to delete
  el.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeEnemyMarker(id, map);
  });

  refreshEnemyRings(map);

  // Sync
  if (!suppressUndoPush && currentHexId) {
    syncEnemyMarkerCreate(currentHexId, {
      entityId: id,
      position: [point.x, point.y],
      platformIndex,
      label,
    });
  }

  // Undo
  if (!suppressUndoPush) {
    useUndoStore.getState().pushAction({
      type: 'enemy-marker-added',
      hexId: currentHexId,
      entityId: id,
      position: [point.x, point.y],
      platformIndex,
      label,
    });
  }
}

export function removeEnemyMarker(entityId: string, map: maplibregl.Map): void {
  const idx = markers.findIndex((m) => m.entityId === entityId);
  if (idx === -1) return;

  const marker = markers[idx];
  const snapshot = {
    entityId: marker.entityId,
    position: [marker.point.x, marker.point.y] as [number, number],
    platformIndex: marker.platformIndex,
    label: marker.label,
  };

  marker.domMarker.remove();
  marker.labelMarker.remove();
  markers.splice(idx, 1);

  refreshEnemyRings(map);

  // Sync
  if (!suppressUndoPush && currentHexId) {
    syncEnemyMarkerDelete(currentHexId, entityId);
  }

  // Undo
  if (!suppressUndoPush) {
    useUndoStore.getState().pushAction({
      type: 'enemy-marker-removed',
      hexId: currentHexId,
      entityId: snapshot.entityId,
      position: snapshot.position,
      platformIndex: snapshot.platformIndex,
      label: snapshot.label,
    });
  }
}

export function moveEnemyMarker(entityId: string, newPoint: MapPoint, map: maplibregl.Map): void {
  const marker = markers.find((m) => m.entityId === entityId);
  if (!marker) return;

  marker.point = newPoint;
  marker.domMarker.setLngLat(mapPointToLngLat(newPoint));
  marker.labelMarker.setLngLat(mapPointToLngLat(newPoint));
  refreshEnemyRings(map);
}

// ── Drag ──

function startDrag(map: maplibregl.Map, entityId: string, e: MouseEvent): void {
  e.stopPropagation();
  e.preventDefault();
  dragInfo = { entityId };
  dragOccurred = false;
  map.dragPan.disable();
  useMapStore.getState().setMapCursor('grabbing');

  const marker = markers.find((m) => m.entityId === entityId);
  if (marker) {
    dragStartPos = [marker.point.x, marker.point.y];
  }

  const onMove = (ev: maplibregl.MapMouseEvent) => {
    if (!dragInfo) return;
    dragOccurred = true;
    const pt = lngLatToMapPoint(ev.lngLat.lng, ev.lngLat.lat);
    moveEnemyMarker(dragInfo.entityId, pt, map);
  };

  const onUp = () => {
    map.off('mousemove', onMove);
    map.off('mouseup', onUp);
    map.dragPan.enable();
    useMapStore.getState().setMapCursor(
      useEnemyMarkerStore.getState().placingMarker ? 'crosshair' : ''
    );

    if (dragInfo && dragOccurred) {
      const marker = markers.find((m) => m.entityId === dragInfo!.entityId);
      if (marker && dragStartPos) {
        const to: [number, number] = [marker.point.x, marker.point.y];
        if (currentHexId) {
          syncEnemyMarkerUpdate(currentHexId, dragInfo.entityId, { position: to });
        }
        useUndoStore.getState().pushAction({
          type: 'enemy-marker-moved',
          hexId: currentHexId,
          entityId: dragInfo.entityId,
          from: dragStartPos,
          to,
        });
      }
    }

    dragInfo = null;
    dragStartPos = null;
    // Reset dragOccurred after a tick so click handler can check it
    setTimeout(() => { dragOccurred = false; }, 0);
  };

  map.on('mousemove', onMove);
  map.on('mouseup', onUp);
}

// ── Ring refresh ──

export function refreshEnemyRings(map: maplibregl.Map): void {
  const source = map.getSource('enemy-rings') as GeoJSONSource | undefined;
  if (!source) return;

  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  for (const marker of markers) {
    const platform = ARTILLERY_PLATFORMS[marker.platformIndex];
    if (!platform) continue;

    const maxRadius = metersToRadius(platform.maxRange);
    const ring = circleCoords(marker.point, maxRadius);

    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    });
  }

  source.setData({ type: 'FeatureCollection', features });
}

// ── Save / Restore for view transitions ──

export interface SavedEnemyMarkerState {
  markers: { entityId: string; position: [number, number]; platformIndex: number; label: string }[];
}

export function saveEnemyMarkerState(): SavedEnemyMarkerState {
  return {
    markers: markers.map((m) => ({
      entityId: m.entityId,
      position: [m.point.x, m.point.y],
      platformIndex: m.platformIndex,
      label: m.label,
    })),
  };
}

export function restoreEnemyMarkerState(saved: SavedEnemyMarkerState, map: maplibregl.Map): void {
  // Clear existing
  for (const m of markers) {
    m.domMarker.remove();
    m.labelMarker.remove();
  }
  markers.length = 0;

  suppressUndoPush = true;
  for (const s of saved.markers) {
    placeEnemyMarker(toMapPoint(s.position[0], s.position[1]), s.platformIndex, map, s.entityId);
  }
  suppressUndoPush = false;
}

// ── Remote callbacks (Yjs observer) ──

export function addRemoteEnemyMarker(
  entityId: string,
  data: { position: [number, number]; platformIndex: number; label: string },
  map: maplibregl.Map,
): void {
  // Skip if already exists
  if (markers.some((m) => m.entityId === entityId)) return;
  suppressUndoPush = true;
  placeEnemyMarker(toMapPoint(data.position[0], data.position[1]), data.platformIndex, map, entityId);
  suppressUndoPush = false;
}

export function removeRemoteEnemyMarker(entityId: string, map: maplibregl.Map): void {
  suppressUndoPush = true;
  removeEnemyMarker(entityId, map);
  suppressUndoPush = false;
}

export function updateRemoteEnemyMarker(
  entityId: string,
  data: { position: [number, number]; platformIndex: number; label: string },
  map: maplibregl.Map,
): void {
  const marker = markers.find((m) => m.entityId === entityId);
  if (!marker) {
    addRemoteEnemyMarker(entityId, data, map);
    return;
  }
  marker.point = toMapPoint(data.position[0], data.position[1]);
  marker.platformIndex = data.platformIndex;
  marker.label = data.label;
  marker.domMarker.setLngLat(mapPointToLngLat(marker.point));
  marker.labelMarker.setLngLat(mapPointToLngLat(marker.point));
  (marker.labelMarker.getElement() as HTMLDivElement).textContent = data.label;
  refreshEnemyRings(map);
}

// ── Undo helpers (called by undoExecutor) ──

export function setSuppressUndoPush(v: boolean): void {
  suppressUndoPush = v;
}

export function undoPlaceEnemyMarker(
  entityId: string,
  position: [number, number],
  platformIndex: number,
  map: maplibregl.Map,
): void {
  suppressUndoPush = true;
  placeEnemyMarker(toMapPoint(position[0], position[1]), platformIndex, map, entityId);
  suppressUndoPush = false;
}

export function undoRemoveEnemyMarker(entityId: string, map: maplibregl.Map): void {
  suppressUndoPush = true;
  removeEnemyMarker(entityId, map);
  suppressUndoPush = false;
}

export function undoMoveEnemyMarker(entityId: string, position: [number, number], map: maplibregl.Map): void {
  moveEnemyMarker(entityId, toMapPoint(position[0], position[1]), map);
}

// ── Eraser support ──

export function eraseEnemyMarkersAtPoint(point: MapPoint, radiusSq: number, map: maplibregl.Map): void {
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    const dSq = (m.point.x - point.x) ** 2 + (m.point.y - point.y) ** 2;
    if (dSq <= radiusSq) {
      removeEnemyMarker(m.entityId, map);
    }
  }
}
