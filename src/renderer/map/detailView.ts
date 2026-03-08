import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { useMapStore } from '../stores/mapStore';
import { hexLookup, hexImageUrl, detailMapPoint } from '../data/hexMapping';
import { mapPointToLngLat, lngLatToMapPoint } from '../data/coords';
import { hexStaticData, hexDynamicData, hexDrawingData, hexArtilleryData } from '../data/store';
import { buildMarkerHtml } from '../data/dataHandlers';
import { CONQUERABLE_STRUCTURES } from '../data/iconTypes';
import voronoiOwners from '../../../static/voronoi_owners.json';
import { initDrawLayer, cleanupDrawing, setDrawColor, getDrawState, activateDrawing, saveDrawState, restoreDrawState } from './drawing';
import { initArtilleryLayer, cleanupArtillery, activateArtillery, saveArtilleryState, restoreArtilleryState } from './artillery';
import { clearUndoStack } from '../data/undoStack';
import { removeHexLabels, addHexLabels, hideHexGrid, showHexGrid } from './hexGrid';
import { removeStaticLabelMarkers, addStaticLabelMarkers } from '../data/dataHandlers';
import voronoiData from '../../../static/voronoi.json';

const IMG_W = 256;
const IMG_H = 256 * 1776 / 2048;
const GRID_COLS = 17; // A-Q
const GRID_ROWS = 15; // 1-15
const CELL_W = IMG_W / GRID_COLS;  // ≈15.06 CRS units
const CELL_H = IMG_H / GRID_ROWS;  // ≈14.80 CRS units

interface DetailModeState {
  hexId: string;
  apiName: string;
  savedCenter: maplibregl.LngLat;
  savedZoom: number;
  labelMarkers: maplibregl.Marker[];
  markerMarkers: maplibregl.Marker[];
  gridLabelMarkers: maplibregl.Marker[];
}

let detailMode: DetailModeState | null = null;
let _map: maplibregl.Map;
let _shellEl: HTMLElement | null = null;
let _onMoveHandler: (() => void) | null = null;

export function setShellElement(el: HTMLElement): void {
  _shellEl = el;
}

function duringShellTransition(cb: () => void): void {
  const shell = _shellEl;
  const mapEl = _map.getContainer();
  if (!shell || !mapEl) { cb(); return; }

  const ro = new ResizeObserver(() => {
    _map.resize();
  });
  ro.observe(mapEl);

  let fired = false;
  const done = () => {
    if (fired) return;
    fired = true;
    ro.disconnect();
    _map.resize();
    cb();
  };

  shell.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 250);
}

export function initDetailView(map: maplibregl.Map): void {
  _map = map;
}

export function getDetailMode(): DetailModeState | null {
  return detailMode;
}

export function showDetailMarkers(): void {
  if (!detailMode) return;
  for (const m of detailMode.markerMarkers) m.getElement().style.display = '';
}

export function hideDetailMarkers(): void {
  if (!detailMode) return;
  for (const m of detailMode.markerMarkers) m.getElement().style.display = 'none';
}

export function renderDetailLabels(apiName: string): void {
  const labels = hexStaticData[apiName];
  if (!labels || !detailMode) return;

  // Clear old label markers
  for (const m of detailMode.labelMarkers) m.remove();
  detailMode.labelMarkers = [];

  for (const lbl of labels) {
    const point = detailMapPoint(lbl.x, lbl.y);
    const lngLat = mapPointToLngLat(point);
    const isMajor = lbl.mapMarkerType === 'Major';
    const cls = isMajor ? 'map-text-major' : 'map-text-minor';

    const el = document.createElement('div');
    el.className = cls;
    el.textContent = lbl.text;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(lngLat)
      .addTo(_map);

    detailMode.labelMarkers.push(marker);
  }
}

export function renderDetailMarkers(apiName: string): void {
  const items = hexDynamicData[apiName];
  if (!items || !detailMode) return;

  // Clear old structure markers
  for (const m of detailMode.markerMarkers) m.remove();
  detailMode.markerMarkers = [];

  for (const it of items) {
    const point = detailMapPoint(it.x, it.y);
    const lngLat = mapPointToLngLat(point);
    const m = buildMarkerHtml(it);

    const el = document.createElement('div');
    el.innerHTML = m.html;
    el.style.width = `${m.size}px`;
    el.style.height = `${m.size}px`;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(_map);

    detailMode.markerMarkers.push(marker);
  }
}

function assignTeamsToVoronoi(apiName: string, regionCount: number): string[] {
  const items = hexDynamicData[apiName];
  const owners = (voronoiOwners as unknown as Record<string, ([number, number] | null)[]>)[apiName];
  if (!owners || !items) return new Array(regionCount).fill('NONE');

  // Build coordinate lookup from dynamic items: "x,y" → teamId
  const conquerableByPos = new Map<string, string>();
  for (const item of items) {
    if (CONQUERABLE_STRUCTURES.has(item.iconType)) {
      conquerableByPos.set(`${item.x},${item.y}`, item.teamId);
    }
  }

  return owners.map((pos) => {
    if (!pos) return 'NONE';
    return conquerableByPos.get(`${pos[0]},${pos[1]}`) ?? 'NONE';
  });
}

function buildVoronoiFeatures(apiName: string): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const regions = (voronoiData as unknown as Record<string, { notes: string; coordinates: [number, number][] }[]>)[apiName];
  if (!regions) return [];

  const teams = assignTeamsToVoronoi(apiName, regions.length);

  return regions.map((region, i) => {
    const coords = region.coordinates.map(([ax, ay]) => mapPointToLngLat(detailMapPoint(ax, ay)));
    // Close the ring if not already closed
    if (coords.length > 0) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([...first] as [number, number]);
      }
    }
    return {
      type: 'Feature' as const,
      properties: { notes: region.notes, teamId: teams[i] },
      geometry: { type: 'Polygon' as const, coordinates: [coords] },
    };
  });
}

export function refreshVoronoiFills(apiName: string): void {
  if (!detailMode || !_map.getSource('voronoi-regions')) return;
  const features = buildVoronoiFeatures(apiName);
  (_map.getSource('voronoi-regions') as GeoJSONSource).setData({
    type: 'FeatureCollection', features,
  });
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

  // Hide world layers
  _map.setLayoutProperty('world-tiles', 'visibility', 'none');
  hideHexGrid(_map);
  removeHexLabels();
  removeStaticLabelMarkers();

  // Image bounds: 4 corners [TL, TR, BR, BL] in [lng, lat]
  const tl = mapPointToLngLat({ x: 0, y: 0 });
  const tr = mapPointToLngLat({ x: IMG_W, y: 0 });
  const br = mapPointToLngLat({ x: IMG_W, y: -IMG_H });
  const bl = mapPointToLngLat({ x: 0, y: -IMG_H });

  // Add detail image source + layer
  _map.addSource('detail-image', {
    type: 'image',
    url: hexImageUrl(hexId),
    coordinates: [
      [tl[0], tl[1]], // TL
      [tr[0], tr[1]], // TR
      [br[0], br[1]], // BR
      [bl[0], bl[1]], // BL
    ],
  });
  _map.addLayer({ id: 'detail-image', type: 'raster', source: 'detail-image' });

  // Voronoi subregion boundaries
  const voronoiFeatures = buildVoronoiFeatures(apiName);
  if (voronoiFeatures.length > 0) {
    _map.addSource('voronoi-regions', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: voronoiFeatures },
    });
    _map.addLayer({
      id: 'voronoi-fill',
      type: 'fill',
      source: 'voronoi-regions',
      paint: {
        'fill-color': ['match', ['get', 'teamId'],
          'COLONIALS', '#6D7B34',
          'WARDENS', '#516C96',
          'rgba(0,0,0,0)'],
        'fill-opacity': ['match', ['get', 'teamId'], 'NONE', 0, 0.25],
      },
    });
    _map.addLayer({
      id: 'voronoi-lines',
      type: 'line',
      source: 'voronoi-regions',
      paint: { 'line-color': 'rgba(0,0,0,0.5)', 'line-width': 2 },
    });
  }

  // Build keypad grid GeoJSON
  const gridLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  // Vertical lines
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = c * CELL_W;
    gridLines.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          mapPointToLngLat({ x, y: 0 }),
          mapPointToLngLat({ x, y: -GRID_ROWS * CELL_H }),
        ],
      },
    });
  }
  // Horizontal lines
  for (let r = 0; r <= GRID_ROWS; r++) {
    const y = -r * CELL_H;
    gridLines.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          mapPointToLngLat({ x: 0, y }),
          mapPointToLngLat({ x: GRID_COLS * CELL_W, y }),
        ],
      },
    });
  }

  _map.addSource('detail-grid', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: gridLines },
  });
  _map.addLayer({
    id: 'detail-grid-lines',
    type: 'line',
    source: 'detail-grid',
    paint: { 'line-color': '#000', 'line-width': 1.5, 'line-opacity': 0.3 },
  });

  // Grid labels (A-Q columns, 1-15 rows) — sticky to viewport edge
  const gridLabelMarkers: maplibregl.Marker[] = [];
  const colMarkers: maplibregl.Marker[] = [];
  const rowMarkers: maplibregl.Marker[] = [];

  const PADDING = 0.15; // inset fraction of cell size

  for (let c = 0; c < GRID_COLS; c++) {
    const el = document.createElement('div');
    el.className = 'grid-label';
    el.textContent = String.fromCharCode(65 + c);
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(mapPointToLngLat({ x: (c + 0.5) * CELL_W, y: -PADDING * CELL_H }))
      .addTo(_map);
    colMarkers.push(marker);
    gridLabelMarkers.push(marker);
  }
  for (let r = 0; r < GRID_ROWS; r++) {
    const el = document.createElement('div');
    el.className = 'grid-label';
    el.textContent = `${r + 1}`;
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(mapPointToLngLat({ x: PADDING * CELL_W, y: -(r + 0.5) * CELL_H }))
      .addTo(_map);
    rowMarkers.push(marker);
    gridLabelMarkers.push(marker);
  }

  // Reposition labels to stick to viewport edge
  const updateStickyLabels = () => {
    const bounds = _map.getBounds();
    const topLeft = lngLatToMapPoint(bounds.getWest(), bounds.getNorth());
    const bottomRight = lngLatToMapPoint(bounds.getEast(), bounds.getSouth());

    // Column labels: clamp y to top of viewport or grid top, whichever is lower (inside grid)
    const gridTop = 0;
    const gridBottom = -GRID_ROWS * CELL_H;
    const stickyY = Math.max(gridBottom + CELL_H, Math.min(gridTop - PADDING * CELL_H, topLeft.y - PADDING * CELL_H));
    for (let c = 0; c < colMarkers.length; c++) {
      colMarkers[c].setLngLat(mapPointToLngLat({ x: (c + 0.5) * CELL_W, y: stickyY }));
    }

    // Row labels: clamp x to left of viewport or grid left, whichever is more to the right (inside grid)
    const gridLeft = 0;
    const gridRight = GRID_COLS * CELL_W;
    const stickyX = Math.min(gridRight - CELL_W, Math.max(gridLeft + PADDING * CELL_W, topLeft.x + PADDING * CELL_W));
    for (let r = 0; r < rowMarkers.length; r++) {
      rowMarkers[r].setLngLat(mapPointToLngLat({ x: stickyX, y: -(r + 0.5) * CELL_H }));
    }
  };

  updateStickyLabels();
  _onMoveHandler = updateStickyLabels;
  _map.on('move', _onMoveHandler);

  // Subgrid lines (3x3 per cell)
  const SUB_W = CELL_W / 3;
  const SUB_H = CELL_H / 3;
  const subLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (let c = 0; c < GRID_COLS; c++) {
    for (let sc = 1; sc <= 2; sc++) {
      const x = c * CELL_W + sc * SUB_W;
      subLines.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            mapPointToLngLat({ x, y: 0 }),
            mapPointToLngLat({ x, y: -GRID_ROWS * CELL_H }),
          ],
        },
      });
    }
  }
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let sr = 1; sr <= 2; sr++) {
      const y = -(r * CELL_H + sr * SUB_H);
      subLines.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            mapPointToLngLat({ x: 0, y }),
            mapPointToLngLat({ x: GRID_COLS * CELL_W, y }),
          ],
        },
      });
    }
  }

  _map.addSource('detail-subgrid', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: subLines },
  });
  _map.addLayer({
    id: 'detail-subgrid-lines',
    type: 'line',
    source: 'detail-subgrid',
    paint: { 'line-color': '#000', 'line-width': 0.5, 'line-opacity': 0.3 },
    layout: { visibility: _map.getZoom() >= 4 ? 'visible' : 'none' },
  });

  // Subgrid labels (1-9 per cell) — GPU-rendered symbol layer
  const subgridPoints: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let sr = 0; sr < 3; sr++) {
        for (let sc = 0; sc < 3; sc++) {
          const num = sr * 3 + sc + 1;
          const x = c * CELL_W + (sc + 0.5) * SUB_W;
          const y = -(r * CELL_H + (sr + 0.5) * SUB_H);
          const lngLat = mapPointToLngLat({ x, y });
          subgridPoints.push({
            type: 'Feature',
            properties: { label: `${num}` },
            geometry: { type: 'Point', coordinates: lngLat },
          });
        }
      }
    }
  }

  _map.addSource('detail-subgrid-labels', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: subgridPoints },
  });
  _map.addLayer({
    id: 'detail-subgrid-labels',
    type: 'symbol',
    source: 'detail-subgrid-labels',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Semibold'],
      'text-size': 14,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      visibility: _map.getZoom() >= 4 ? 'visible' : 'none',
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0,0,0,0.5)',
      'text-halo-width': 1,
    },
  });

  detailMode = {
    hexId,
    apiName,
    savedCenter,
    savedZoom,
    labelMarkers: [],
    markerMarkers: [],
    gridLabelMarkers,
  };

  // Fit to image bounds (after detailMode is set so onZoomChange sees detail mode)
  const sw = mapPointToLngLat({ x: 0, y: -IMG_H });
  const ne = mapPointToLngLat({ x: IMG_W, y: 0 });
  _map.fitBounds([sw, ne], { animate: false });

  // Init drawing layer and activate
  initDrawLayer(_map);
  setDrawColor(getDrawState().color);
  activateDrawing(_map);

  // Restore saved drawing state for this hex
  const savedDrawing = hexDrawingData[apiName];
  if (savedDrawing) restoreDrawState(savedDrawing, _map);

  // Init artillery layer and activate
  initArtilleryLayer(_map);

  // Restore saved artillery state for this hex
  const savedArty = hexArtilleryData[apiName];
  if (savedArty) restoreArtilleryState(savedArty, _map);

  activateArtillery(_map);

  // Render cached data immediately
  renderDetailMarkers(apiName);
  renderDetailLabels(apiName);

  // Update Zustand store
  useMapStore.getState().setDetailMode({ hexId, hexName: hexInfo.name, apiName });

  duringShellTransition(() => {
    _map.fitBounds([sw, ne], { animate: false });
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

  // Remove sticky label listener
  if (_onMoveHandler) {
    _map.off('move', _onMoveHandler);
    _onMoveHandler = null;
  }

  // Remove detail markers
  for (const m of detailMode.labelMarkers) m.remove();
  for (const m of detailMode.markerMarkers) m.remove();
  for (const m of detailMode.gridLabelMarkers) m.remove();

  // Remove detail layers and sources
  if (_map.getLayer('voronoi-fill')) _map.removeLayer('voronoi-fill');
  if (_map.getLayer('voronoi-lines')) _map.removeLayer('voronoi-lines');
  if (_map.getSource('voronoi-regions')) _map.removeSource('voronoi-regions');
  if (_map.getLayer('detail-image')) _map.removeLayer('detail-image');
  if (_map.getSource('detail-image')) _map.removeSource('detail-image');
  if (_map.getLayer('detail-grid-lines')) _map.removeLayer('detail-grid-lines');
  if (_map.getSource('detail-grid')) _map.removeSource('detail-grid');
  if (_map.getLayer('detail-subgrid-lines')) _map.removeLayer('detail-subgrid-lines');
  if (_map.getSource('detail-subgrid')) _map.removeSource('detail-subgrid');
  if (_map.getLayer('detail-subgrid-labels')) _map.removeLayer('detail-subgrid-labels');
  if (_map.getSource('detail-subgrid-labels')) _map.removeSource('detail-subgrid-labels');

  const { savedCenter, savedZoom } = detailMode;

  // Restore world view
  _map.jumpTo({ center: savedCenter, zoom: savedZoom });

  // Show world layers
  _map.setLayoutProperty('world-tiles', 'visibility', 'visible');
  showHexGrid(_map);
  addHexLabels(_map);
  addStaticLabelMarkers(_map);

  detailMode = null;

  useMapStore.getState().setDetailMode(null);

  // Import onZoomChange dynamically to avoid circular dependency
  import('./layerControl').then(({ onZoomChange }) => onZoomChange());

  duringShellTransition(() => {
    _map.jumpTo({ center: savedCenter, zoom: savedZoom });
  });
}

export function getSelectedHexes(): string[] {
  if (detailMode) return [detailMode.apiName];
  return [];
}
