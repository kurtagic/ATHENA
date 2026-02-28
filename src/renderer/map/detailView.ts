import L from 'leaflet';
import { hexLookup, hexImageUrl } from '../data/hexMapping';
import { hexStaticData, hexDynamicData, hexDrawingData, hexArtilleryData } from '../data/store';
import { buildMarkerHtml } from '../data/dataHandlers';
import { initDrawLayer, cleanupDrawing, setDrawColor, getDrawState, activateDrawing, saveDrawState, restoreDrawState } from './drawing';
import { initArtilleryLayer, cleanupArtillery, activateArtillery, saveArtilleryState, restoreArtilleryState } from './artillery';
import { clearUndoStack } from '../data/undoStack';

const IMG_W = 256;
const IMG_H = 256 * 1776 / 2048;
const GRID_COLS = 17; // A-Q
const GRID_ROWS = 15; // 1-15
const GRID_CELL = 125 / 2048 * IMG_W; // 15.625 CRS units

interface DetailModeState {
  hexId: string;
  apiName: string;
  overlay: L.ImageOverlay;
  labelLayer: L.LayerGroup;
  markerLayer: L.LayerGroup;
  gridLayer: L.LayerGroup;
  subGridLayer: L.LayerGroup;
  savedCenter: L.LatLng;
  savedZoom: number;
}

let detailMode: DetailModeState | null = null;

// References set during init
let _map: L.Map;
let _tileLayer: L.TileLayer;
let _hexGridLayer: L.LayerGroup;
let _hexLabelLayer: L.LayerGroup;
let _staticLabelLayer: L.LayerGroup;
let _onZoomChange: () => void;

/** Track container resizes during CSS grid transition, keeping Leaflet in sync. */
function duringShellTransition(cb: () => void): void {
  const shell = document.getElementById('ide-shell');
  const mapEl = document.getElementById('map');
  if (!shell || !mapEl) { cb(); return; }

  const ro = new ResizeObserver(() => {
    _map.invalidateSize();
  });
  ro.observe(mapEl);

  let fired = false;
  const done = () => {
    if (fired) return;
    fired = true;
    ro.disconnect();
    _map.invalidateSize();
    cb();
  };

  shell.addEventListener('transitionend', done, { once: true });
  // Fallback in case transitionend doesn't fire (e.g. no actual transition)
  setTimeout(done, 250);
}

export function initDetailView(
  map: L.Map,
  tileLayer: L.TileLayer,
  hexGridLayer: L.LayerGroup,
  hexLabelLayer: L.LayerGroup,
  staticLabelLayer: L.LayerGroup,
  onZoomChange: () => void,
): void {
  _map = map;
  _tileLayer = tileLayer;
  _hexGridLayer = hexGridLayer;
  _hexLabelLayer = hexLabelLayer;
  _staticLabelLayer = staticLabelLayer;
  _onZoomChange = onZoomChange;
}

export function getDetailMode(): DetailModeState | null {
  return detailMode;
}

export function detailLatLng(apiX: number, apiY: number): [number, number] {
  return [-apiY * IMG_H, apiX * IMG_W];
}

export function renderDetailLabels(apiName: string): void {
  const labels = hexStaticData[apiName];
  if (!labels || !detailMode) return;
  detailMode.labelLayer.clearLayers();

  for (const lbl of labels) {
    const latlng = detailLatLng(lbl.x, lbl.y);
    const isMajor = lbl.mapMarkerType === 'Major';
    const cls = isMajor ? 'map-text-major' : 'map-text-minor';
    const size: [number, number] = isMajor ? [160, 20] : [140, 16];

    L.marker(latlng, {
      interactive: false,
      pane: 'labelPane',
      icon: L.divIcon({
        className: cls,
        html: lbl.text,
        iconSize: size,
        iconAnchor: [size[0] / 2, size[1] / 2],
      }),
    }).addTo(detailMode.labelLayer);
  }
}

export function renderDetailMarkers(apiName: string): void {
  const items = hexDynamicData[apiName];
  if (!items || !detailMode) return;
  detailMode.markerLayer.clearLayers();

  for (const it of items) {
    const latlng = detailLatLng(it.x, it.y);
    const m = buildMarkerHtml(it);

    L.marker(latlng, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        html: m.html,
        iconSize: [m.size, m.size],
        iconAnchor: [m.size / 2, m.size / 2],
      }),
    }).addTo(detailMode.markerLayer);
  }
}

export function enterDetailMode(hexId: string): void {
  if (detailMode) return;
  clearUndoStack();
  const hexInfo = hexLookup[hexId];
  if (!hexInfo) return;
  const apiName = hexInfo.apiName;

  // Save current view
  const savedCenter = _map.getCenter();
  const savedZoom = _map.getZoom();

  // Remove world layers
  _map.removeLayer(_tileLayer);
  _map.removeLayer(_hexGridLayer);
  _map.removeLayer(_hexLabelLayer);
  _map.removeLayer(_staticLabelLayer);

  // Set zoom to detail level immediately so layers are added at correct scale
  const imageBounds: L.LatLngBoundsLiteral = [[-IMG_H, 0], [0, IMG_W]];
  _map.fitBounds(imageBounds, { animate: false });

  // Add hex image overlay
  const overlay = L.imageOverlay(hexImageUrl(hexId), imageBounds).addTo(_map);

  // Create detail-specific layers
  const dLabelLayer = L.layerGroup().addTo(_map);
  const dMarkerLayer = L.layerGroup().addTo(_map);

  // Build keypad grid overlay
  const dGridLayer = L.layerGroup().addTo(_map);
  const gridStyle: L.PolylineOptions = { color: '#000', weight: 1.5, opacity: 0.3 };

  // Vertical lines
  for (let c = 0; c <= GRID_COLS; c++) {
    const lng = c * GRID_CELL;
    L.polyline([[0, lng], [-GRID_ROWS * GRID_CELL, lng]], gridStyle).addTo(dGridLayer);
  }
  // Horizontal lines
  for (let r = 0; r <= GRID_ROWS; r++) {
    const lat = -r * GRID_CELL;
    L.polyline([[lat, 0], [lat, GRID_COLS * GRID_CELL]], gridStyle).addTo(dGridLayer);
  }
  // Column headers A-Q
  for (let c = 0; c < GRID_COLS; c++) {
    const colLabel = String.fromCharCode(65 + c);
    L.marker([GRID_CELL * 0.4, (c + 0.5) * GRID_CELL], {
      interactive: false,
      icon: L.divIcon({
        className: 'grid-label',
        html: colLabel,
        iconSize: [20, 14],
        iconAnchor: [10, 7],
      }),
    }).addTo(dGridLayer);
  }
  // Row headers 1-15
  for (let r = 0; r < GRID_ROWS; r++) {
    L.marker([-(r + 0.5) * GRID_CELL, -GRID_CELL * 0.3], {
      interactive: false,
      icon: L.divIcon({
        className: 'grid-label',
        html: `${r + 1}`,
        iconSize: [20, 14],
        iconAnchor: [10, 7],
      }),
    }).addTo(dGridLayer);
  }

  // Build subgrid overlay (3x3 keypad per cell)
  const SUB_CELL = GRID_CELL / 3;
  const dSubGridLayer = L.layerGroup();
  const subStyle: L.PolylineOptions = { color: '#000', weight: 0.5, opacity: 0.3 };

  // Subgrid vertical lines
  for (let c = 0; c < GRID_COLS; c++) {
    for (let sc = 1; sc <= 2; sc++) {
      const lng = c * GRID_CELL + sc * SUB_CELL;
      L.polyline([[0, lng], [-GRID_ROWS * GRID_CELL, lng]], subStyle).addTo(dSubGridLayer);
    }
  }
  // Subgrid horizontal lines
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let sr = 1; sr <= 2; sr++) {
      const lat = -(r * GRID_CELL + sr * SUB_CELL);
      L.polyline([[lat, 0], [lat, GRID_COLS * GRID_CELL]], subStyle).addTo(dSubGridLayer);
    }
  }
  // Keypad numbers 1-9 in each cell
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let sr = 0; sr < 3; sr++) {
        for (let sc = 0; sc < 3; sc++) {
          const num = sr * 3 + sc + 1;
          const lng = c * GRID_CELL + (sc + 0.5) * SUB_CELL;
          const lat = -(r * GRID_CELL + (sr + 0.5) * SUB_CELL);
          L.marker([lat, lng], {
            interactive: false,
            icon: L.divIcon({
              className: 'subgrid-label',
              html: `${num}`,
              iconSize: [12, 10],
              iconAnchor: [6, 5],
            }),
          }).addTo(dSubGridLayer);
        }
      }
    }
  }

  // Show subgrid if already zoomed in enough
  if (_map.getZoom() >= 5) dSubGridLayer.addTo(_map);

  detailMode = {
    hexId,
    apiName,
    overlay,
    labelLayer: dLabelLayer,
    markerLayer: dMarkerLayer,
    gridLayer: dGridLayer,
    subGridLayer: dSubGridLayer,
    savedCenter,
    savedZoom,
  };

  // Init drawing layer and activate immediately
  initDrawLayer(_map);
  setDrawColor(getDrawState().color);
  activateDrawing(_map);

  // Restore saved drawing state for this hex
  const savedDrawing = hexDrawingData[apiName];
  if (savedDrawing) {
    restoreDrawState(savedDrawing);
  }

  // Init artillery layer and activate immediately
  initArtilleryLayer(_map);

  // Restore saved artillery state for this hex
  const savedArty = hexArtilleryData[apiName];
  if (savedArty) {
    restoreArtilleryState(savedArty, _map);
  }

  activateArtillery(_map);

  // Render cached data immediately
  renderDetailLabels(apiName);
  renderDetailMarkers(apiName);

  // Set detail title text
  const detailTitle = document.getElementById('detail-title');
  if (detailTitle) detailTitle.textContent = hexInfo.name;

  // Activate IDE shell detail mode — panels animate open
  const shell = document.getElementById('ide-shell');
  if (shell) shell.classList.add('detail-mode');

  // Track container resize during transition, then fit to hex image
  duringShellTransition(() => {
    _map.fitBounds(imageBounds, { animate: false });
  });
}

export function exitDetailMode(): void {
  if (!detailMode) return;

  // Save drawing and artillery state before cleanup
  hexDrawingData[detailMode.apiName] = saveDrawState();
  hexArtilleryData[detailMode.apiName] = saveArtilleryState();
  clearUndoStack();

  cleanupArtillery(_map);
  cleanupDrawing(_map);

  // Remove detail layers
  _map.removeLayer(detailMode.overlay);
  _map.removeLayer(detailMode.labelLayer);
  _map.removeLayer(detailMode.markerLayer);
  _map.removeLayer(detailMode.gridLayer);
  _map.removeLayer(detailMode.subGridLayer);

  // Capture saved view before nullifying detailMode
  const { savedCenter, savedZoom } = detailMode;

  // Restore world view immediately so tiles load at the correct zoom/position
  _map.setView(savedCenter, savedZoom, { animate: false });

  // Restore world layers
  _map.addLayer(_tileLayer);
  _map.addLayer(_hexGridLayer);

  detailMode = null;

  // Restore zoom-dependent layers
  _onZoomChange();

  // Deactivate IDE shell — panels animate closed
  const shell = document.getElementById('ide-shell');
  if (shell) shell.classList.remove('detail-mode');

  // Track container resize during transition, then restore world view
  duringShellTransition(() => {
    _map.setView(savedCenter, savedZoom, { animate: false });
  });
}

export function getSelectedHexes(): string[] {
  if (detailMode) return [detailMode.apiName];
  return [];
}
