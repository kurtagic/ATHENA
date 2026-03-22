import maplibregl from 'maplibre-gl';
import type { MapPoint } from '../data/coords';
import { toMapPoint, mapPointToLngLat, lngLatToMapPoint } from '../data/coords';
import { crsDistanceMeters, crsAzimuth, METERS_PER_CRS_UNIT, metersToRadius } from '../data/artilleryCalc';
import type { SavedStroke } from '../data/store';
import { useMapStore } from '../stores/mapStore';
import { useDrawStore, type BrushPattern } from '../stores/drawStore';
import { useUndoStore } from '../stores/undoStore';
import { useEnemyMarkerStore } from '../stores/enemyMarkerStore';
import { useLayerStore } from '../stores/layerStore';
import { eraseEnemyMarkersAtPoint } from './enemyMarkers';
import { createStampElement, type StampType } from './stampIcons';

export interface StrokeData {
  id?: string;
  points: MapPoint[];
  color: string;
  weight: number;
  opacity: number;
  brushPattern?: BrushPattern;
  isArrow?: boolean;
  stampType?: string;
  stampText?: string;
  measureType?: 'ruler' | 'circle';
  radius?: number;
}

interface DrawState {
  active: boolean;
  drawing: boolean;
  color: string;
  weight: number;
  opacity: number;
  brushPattern?: BrushPattern;
  currentPoints: MapPoint[];
  strokes: StrokeData[];
  canvas: HTMLCanvasElement | null;
  erasing: boolean;
  eraserActive: boolean;
  eraserRadius: number;
  erasedDuringDrag: SavedStroke[];
  mapRef: maplibregl.Map | null;
  placingPolygon: boolean;
  polygonPreviewPoint: MapPoint | null;
  placingMeasurement: boolean;
  measurementStart: MapPoint | null;
  measurementPreviewPoint: MapPoint | null;
  draggingMeasurement: StrokeData | null;
  dragMeasurementPointIndex: number;
  dragMeasurementStartPoints: MapPoint[] | null;
  dragMeasurementStartRadius: number | null;
  isArrow: boolean;
  draggingStamp: StrokeData | null;
  dragStampStartPos: MapPoint | null;
}

const drawState: DrawState = {
  active: false,
  drawing: false,
  color: '#ff0000',
  weight: 3,
  opacity: 1.0,
  brushPattern: undefined,
  currentPoints: [],
  strokes: [],
  canvas: null,
  erasing: false,
  eraserActive: false,
  eraserRadius: 20,
  erasedDuringDrag: [],
  mapRef: null,
  placingPolygon: false,
  polygonPreviewPoint: null,
  placingMeasurement: false,
  measurementStart: null,
  measurementPreviewPoint: null,
  draggingMeasurement: null,
  dragMeasurementPointIndex: 0,
  dragMeasurementStartPoints: null,
  dragMeasurementStartRadius: null,
  isArrow: false,
  draggingStamp: null,
  dragStampStartPos: null,
};

// ── Sync infrastructure ──
let syncMode = false;
let onStrokeFinalized: ((stroke: StrokeData, hexId: string) => void) | null = null;
let onStrokesErased: ((strokeIds: string[], hexId: string) => void) | null = null;
let currentHexId: string = '';

let onStrokeUpdated: ((stroke: StrokeData, hexId: string) => void) | null = null;

export function setSyncMode(enabled: boolean) { syncMode = enabled; }
export function setCurrentHexId(hexId: string) { currentHexId = hexId; }
export function setStrokeFinalizedCallback(cb: typeof onStrokeFinalized) { onStrokeFinalized = cb; }
export function setStrokesErasedCallback(cb: typeof onStrokesErased) { onStrokesErased = cb; }
export function setStrokeUpdatedCallback(cb: typeof onStrokeUpdated) { onStrokeUpdated = cb; }

export function getDrawState(): DrawState {
  return drawState;
}

export function showDrawCanvas(): void {
  if (drawState.canvas) drawState.canvas.style.display = '';
}

export function hideDrawCanvas(): void {
  if (drawState.canvas) drawState.canvas.style.display = 'none';
}

export function showStampMarkers(): void {
  for (const m of stampMarkers) m.marker.getElement().style.display = '';
}

export function hideStampMarkers(): void {
  for (const m of stampMarkers) m.marker.getElement().style.display = 'none';
}

// ── Hatch pattern cache ──
const patternCache = new Map<string, CanvasPattern>();

function createHatchPattern(ctx: CanvasRenderingContext2D, color: string, type: 'diagonal' | 'crosshatch'): CanvasPattern | null {
  const key = `${color}-${type}`;
  const cached = patternCache.get(key);
  if (cached) return cached;

  const size = 28;
  const offscreen = new OffscreenCanvas(size, size);
  const pCtx = offscreen.getContext('2d');
  if (!pCtx) return null;

  pCtx.strokeStyle = color;
  pCtx.lineWidth = 1.5;

  // NW→SE diagonal (with wrapping for seamless tiling)
  pCtx.beginPath();
  pCtx.moveTo(0, 0);
  pCtx.lineTo(size, size);
  pCtx.moveTo(-size, 0);
  pCtx.lineTo(size, size * 2);
  pCtx.moveTo(0, -size);
  pCtx.lineTo(size * 2, size);
  pCtx.stroke();

  if (type === 'crosshatch') {
    // NE→SW diagonal
    pCtx.beginPath();
    pCtx.moveTo(size, 0);
    pCtx.lineTo(0, size);
    pCtx.moveTo(size * 2, 0);
    pCtx.lineTo(0, size * 2);
    pCtx.moveTo(size, -size);
    pCtx.lineTo(-size, size);
    pCtx.stroke();
  }

  const pattern = ctx.createPattern(offscreen, 'repeat');
  if (pattern) patternCache.set(key, pattern);
  return pattern;
}

function drawAreaShape(
  ctx: CanvasRenderingContext2D,
  map: maplibregl.Map,
  points: MapPoint[],
  color: string,
  weight: number,
  opacity: number,
  brushPattern: BrushPattern,
): void {
  if (points.length < 3) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();

  for (let i = 0; i < points.length; i++) {
    const lngLat = mapPointToLngLat(points[i]);
    const px = map.project(lngLat);
    if (i === 0) ctx.moveTo(px.x, px.y);
    else ctx.lineTo(px.x, px.y);
  }
  ctx.closePath();

  // Stroke the border
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Fill with pattern (skip for border-only)
  if (brushPattern === 'diagonal' || brushPattern === 'crosshatch') {
    const pattern = createHatchPattern(ctx, color, brushPattern);
    if (pattern) {
      // Anchor pattern to first vertex and scale with zoom
      const firstLngLat = mapPointToLngLat(points[0]);
      const firstPx = map.project(firstLngLat);
      const zoom = map.getZoom();
      const scale = Math.pow(2, zoom - 4); // normalize around zoom 4
      pattern.setTransform(
        new DOMMatrix()
          .translateSelf(firstPx.x, firstPx.y)
          .scaleSelf(scale, scale)
      );
      ctx.fillStyle = pattern;
      ctx.fill('evenodd');
    }
  }

  ctx.restore();
}

const STAMP_SIZE = 56;

// ── Stamp DOM markers ──

interface StampDomMarker {
  strokeId: string;
  marker: maplibregl.Marker;
}
const stampMarkers: StampDomMarker[] = [];

function createTextStampElement(text: string, color: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    background:rgba(0,0,0,0.75);
    color:${color};
    font:bold 13px monospace;
    padding:4px 8px;
    border-radius:6px;
    white-space:nowrap;
    cursor:grab;
    pointer-events:auto;
  `;
  el.textContent = text;
  return el;
}

function addStampDomMarker(stroke: StrokeData, map: maplibregl.Map): void {
  let el: HTMLElement;
  if (stroke.stampType === 'text' && stroke.stampText) {
    el = createTextStampElement(stroke.stampText, stroke.color);
  } else {
    el = createStampElement(stroke.stampType as StampType, stroke.color, STAMP_SIZE);
  }

  const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(mapPointToLngLat(stroke.points[0]))
    .addTo(map);

  stampMarkers.push({ strokeId: stroke.id!, marker });

  // Hide if drawings layer is toggled off
  if (!useLayerStore.getState().layers.drawings?.visible) {
    el.style.display = 'none';
  }

  // Left-click drag (same pattern as enemyMarkers.ts startDrag)
  el.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    startStampDrag(stroke, marker, map);
  });
}

function startStampDrag(stroke: StrokeData, marker: maplibregl.Marker, map: maplibregl.Map): void {
  drawState.draggingStamp = stroke;
  drawState.dragStampStartPos = { ...stroke.points[0] };
  map.dragPan.disable();
  useMapStore.getState().setMapCursor('grabbing');

  const onMove = (ev: maplibregl.MapMouseEvent) => {
    if (!drawState.draggingStamp) return;
    const pt = lngLatToMapPoint(ev.lngLat.lng, ev.lngLat.lat);
    drawState.draggingStamp.points[0] = pt;
    marker.setLngLat(mapPointToLngLat(pt));
  };

  const onUp = () => {
    map.off('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    map.dragPan.enable();
    useMapStore.getState().setMapCursor('');
    finalizeDrag();
  };

  map.on('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function removeStampDomMarker(strokeId: string): void {
  const idx = stampMarkers.findIndex(m => m.strokeId === strokeId);
  if (idx !== -1) {
    stampMarkers[idx].marker.remove();
    stampMarkers.splice(idx, 1);
  }
}

function clearStampDomMarkers(): void {
  for (const m of stampMarkers) m.marker.remove();
  stampMarkers.length = 0;
}

export function updateStampDomMarkerPosition(strokeId: string, point: MapPoint): void {
  const dm = stampMarkers.find(m => m.strokeId === strokeId);
  if (dm) dm.marker.setLngLat(mapPointToLngLat(point));
}


function resizeCanvas(): void {
  if (!drawState.canvas || !drawState.mapRef) return;
  const container = drawState.mapRef.getContainer();
  drawState.canvas.width = container.clientWidth;
  drawState.canvas.height = container.clientHeight;
  redrawAllStrokes();
}

export function redrawAllStrokes(): void {
  if (!drawState.canvas || !drawState.mapRef) return;
  const ctx = drawState.canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, drawState.canvas.width, drawState.canvas.height);
  const map = drawState.mapRef;

  const drawPenStroke = (points: MapPoint[], color: string, weight: number, opacity: number, isArrow?: boolean) => {
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < points.length; i++) {
      const lngLat = mapPointToLngLat(points[i]);
      const px = map.project(lngLat);
      if (i === 0) ctx.moveTo(px.x, px.y);
      else ctx.lineTo(px.x, px.y);
    }
    ctx.stroke();

    if (isArrow && points.length >= 2) {
      const tipLngLat = mapPointToLngLat(points[points.length - 1]);
      const tipPx = map.project(tipLngLat);
      // Look further back for a stable direction (skip near-duplicate points)
      let prevPx = map.project(mapPointToLngLat(points[points.length - 2]));
      for (let j = points.length - 3; j >= 0; j--) {
        const candidatePx = map.project(mapPointToLngLat(points[j]));
        const dist = Math.hypot(tipPx.x - candidatePx.x, tipPx.y - candidatePx.y);
        if (dist >= 10) { prevPx = candidatePx; break; }
      }
      const angle = Math.atan2(tipPx.y - prevPx.y, tipPx.x - prevPx.x);
      const headSize = Math.max(weight * 8, 28);

      ctx.beginPath();
      ctx.moveTo(tipPx.x, tipPx.y);
      ctx.lineTo(
        tipPx.x - headSize * Math.cos(angle - Math.PI / 6),
        tipPx.y - headSize * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        tipPx.x - headSize * 0.55 * Math.cos(angle),
        tipPx.y - headSize * 0.55 * Math.sin(angle),
      );
      ctx.lineTo(
        tipPx.x - headSize * Math.cos(angle + Math.PI / 6),
        tipPx.y - headSize * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.restore();
  };

  const drawMeasurementLabel = (cx: number, cy: number, line1: string, line2?: string) => {
    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const w1 = ctx.measureText(line1).width;
    const w2 = line2 ? ctx.measureText(line2).width : 0;
    const pillWidth = Math.max(w1, w2) + 16;
    const pillHeight = line2 ? 38 : 24;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    const r = 6;
    const px0 = cx - pillWidth / 2;
    const py0 = cy - pillHeight / 2;
    ctx.moveTo(px0 + r, py0);
    ctx.lineTo(px0 + pillWidth - r, py0);
    ctx.quadraticCurveTo(px0 + pillWidth, py0, px0 + pillWidth, py0 + r);
    ctx.lineTo(px0 + pillWidth, py0 + pillHeight - r);
    ctx.quadraticCurveTo(px0 + pillWidth, py0 + pillHeight, px0 + pillWidth - r, py0 + pillHeight);
    ctx.lineTo(px0 + r, py0 + pillHeight);
    ctx.quadraticCurveTo(px0, py0 + pillHeight, px0, py0 + pillHeight - r);
    ctx.lineTo(px0, py0 + r);
    ctx.quadraticCurveTo(px0, py0, px0 + r, py0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    if (line2) {
      ctx.fillText(line1, cx, cy - 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText(line2, cx, cy + 9);
    } else {
      ctx.fillText(line1, cx, cy);
    }
    ctx.restore();
  };

  const drawRulerStroke = (start: MapPoint, end: MapPoint) => {
    const startPx = map.project(mapPointToLngLat(start));
    const endPx = map.project(mapPointToLngLat(end));

    ctx.save();
    ctx.globalAlpha = 1;

    // Dashed line
    ctx.beginPath();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.moveTo(startPx.x, startPx.y);
    ctx.lineTo(endPx.x, endPx.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoint circles
    for (const px of [startPx, endPx]) {
      ctx.beginPath();
      ctx.arc(px.x, px.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();

    // Label at midpoint
    const midX = (startPx.x + endPx.x) / 2;
    const midY = (startPx.y + endPx.y) / 2;
    const distM = crsDistanceMeters(start, end);
    const azDeg = crsAzimuth(start, end);
    drawMeasurementLabel(midX, midY, `${Math.round(distM)}m`, `${azDeg.toFixed(1)}°`);
  };

  const drawCircleStroke = (center: MapPoint, radiusCrs: number) => {
    const centerPx = map.project(mapPointToLngLat(center));
    // Compute screen-space radius by projecting a point at the edge
    const edgePt: MapPoint = { x: center.x + radiusCrs, y: center.y };
    const edgePx = map.project(mapPointToLngLat(edgePt));
    const screenRadius = Math.hypot(edgePx.x - centerPx.x, edgePx.y - centerPx.y);

    ctx.save();
    ctx.globalAlpha = 1;

    // Dashed circle
    ctx.beginPath();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.arc(centerPx.x, centerPx.y, screenRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center dot
    ctx.beginPath();
    ctx.arc(centerPx.x, centerPx.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Radius label at center
    const radiusM = radiusCrs * METERS_PER_CRS_UNIT;
    drawMeasurementLabel(centerPx.x, centerPx.y - screenRadius - 20, `${Math.round(radiusM)}m`);
  };

  // Draw completed strokes (stamps are DOM-based, skip them)
  for (const stroke of drawState.strokes) {
    if (stroke.measureType === 'ruler' && stroke.points.length >= 2) {
      drawRulerStroke(stroke.points[0], stroke.points[1]);
    } else if (stroke.measureType === 'circle' && stroke.radius) {
      drawCircleStroke(stroke.points[0], stroke.radius);
    } else if (stroke.stampType) {
      continue;
    } else if (stroke.brushPattern) {
      drawAreaShape(ctx, map, stroke.points, stroke.color, stroke.weight, stroke.opacity, stroke.brushPattern);
    } else {
      drawPenStroke(stroke.points, stroke.color, stroke.weight, stroke.opacity, stroke.isArrow);
    }
  }

  // Draw current in-progress stroke
  if (drawState.drawing && drawState.currentPoints.length > 1) {
    if (drawState.brushPattern) {
      drawAreaShape(ctx, map, drawState.currentPoints, drawState.color, drawState.weight, drawState.opacity, drawState.brushPattern);
    } else {
      drawPenStroke(drawState.currentPoints, drawState.color, drawState.weight, drawState.opacity, drawState.isArrow);
    }
  }

  // Draw polygon placement preview
  if (drawState.placingPolygon && drawState.currentPoints.length >= 1) {
    const pts = drawState.currentPoints;
    ctx.save();
    ctx.globalAlpha = drawState.opacity;
    ctx.strokeStyle = drawState.color;
    ctx.lineWidth = drawState.weight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw solid lines between placed vertices
    if (pts.length >= 2) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const lngLat = mapPointToLngLat(pts[i]);
        const px = map.project(lngLat);
        if (i === 0) ctx.moveTo(px.x, px.y);
        else ctx.lineTo(px.x, px.y);
      }
      ctx.stroke();
    }

    // Draw dashed preview lines (last vertex → cursor → first vertex)
    if (drawState.polygonPreviewPoint) {
      const lastPt = pts[pts.length - 1];
      const lastLngLat = mapPointToLngLat(lastPt);
      const lastPx = map.project(lastLngLat);
      const previewLngLat = mapPointToLngLat(drawState.polygonPreviewPoint);
      const previewPx = map.project(previewLngLat);
      const firstLngLat = mapPointToLngLat(pts[0]);
      const firstPx = map.project(firstLngLat);

      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lastPx.x, lastPx.y);
      ctx.lineTo(previewPx.x, previewPx.y);
      if (pts.length >= 2) {
        ctx.lineTo(firstPx.x, firstPx.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw close-target circle at first vertex
      if (pts.length >= 3) {
        ctx.beginPath();
        ctx.arc(firstPx.x, firstPx.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = drawState.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // Draw measurement placement preview
  if (drawState.placingMeasurement && drawState.measurementStart && drawState.measurementPreviewPoint) {
    const store = useDrawStore.getState();
    if (store.activeTool === 'ruler') {
      drawRulerStroke(drawState.measurementStart, drawState.measurementPreviewPoint);
    } else if (store.activeTool === 'circle') {
      const radiusCrs = Math.sqrt(
        (drawState.measurementPreviewPoint.x - drawState.measurementStart.x) ** 2 +
        (drawState.measurementPreviewPoint.y - drawState.measurementStart.y) ** 2,
      );
      drawCircleStroke(drawState.measurementStart, radiusCrs || 0.1);
    }
  }
}

export function initDrawLayer(map: maplibregl.Map): void {
  // Create canvas overlay
  const container = map.getContainer();
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '10';
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  container.appendChild(canvas);

  drawState.canvas = canvas;
  drawState.mapRef = map;
  drawState.strokes = [];
  drawState.currentPoints = [];
  drawState.drawing = false;
  drawState.active = false;

  // Redraw on pan/zoom
  map.on('move', redrawAllStrokes);
  map.on('resize', resizeCanvas);
}

export function cleanupDrawing(map: maplibregl.Map): void {
  removeTextInput();
  if (drawState.erasing) toggleEraser(map);
  if (drawState.active) deactivateDrawing(map);

  map.off('move', redrawAllStrokes);
  map.off('resize', resizeCanvas);

  clearStampDomMarkers();

  if (drawState.canvas) {
    drawState.canvas.remove();
    drawState.canvas = null;
  }
  drawState.strokes = [];
  drawState.currentPoints = [];
  drawState.drawing = false;
  drawState.eraserActive = false;
  drawState.erasedDuringDrag = [];
  drawState.placingPolygon = false;
  drawState.polygonPreviewPoint = null;
  drawState.placingMeasurement = false;
  drawState.measurementStart = null;
  drawState.measurementPreviewPoint = null;
  drawState.draggingMeasurement = null;
  drawState.dragMeasurementPointIndex = 0;
  drawState.dragMeasurementStartPoints = null;
  drawState.dragMeasurementStartRadius = null;
  drawState.draggingStamp = null;
  drawState.dragStampStartPos = null;
}

export function activateDrawing(_map: maplibregl.Map): void {
  drawState.active = true;
}

export function deactivateDrawing(_map: maplibregl.Map): void {
  cancelPolygon();
  cancelMeasurement();
  removeTextInput();
  finalizeStroke();
  drawState.active = false;
}

function finalizeStroke(): void {
  if (drawState.drawing && drawState.currentPoints.length > 1) {
    const id = crypto.randomUUID();
    const stroke: StrokeData = {
      id,
      points: [...drawState.currentPoints],
      color: drawState.color,
      weight: drawState.weight,
      opacity: drawState.opacity,
      brushPattern: drawState.brushPattern,
      isArrow: drawState.isArrow || undefined,
    };

    drawState.strokes.push(stroke);

    if (onStrokeFinalized) onStrokeFinalized(stroke, currentHexId);

    useUndoStore.getState().pushAction({
      type: 'stroke-added',
      hexId: currentHexId,
      stroke: { id, points: stroke.points.map(p => [p.x, p.y] as [number, number]), color: stroke.color, weight: stroke.weight, opacity: stroke.opacity, brushPattern: stroke.brushPattern, isArrow: stroke.isArrow, stampType: stroke.stampType, stampText: stroke.stampText },
    });
  }
  drawState.currentPoints = [];
  drawState.drawing = false;
  drawState.isArrow = false;
  redrawAllStrokes();
}

function finalizePolygon(): void {
  if (drawState.currentPoints.length >= 3) {
    const id = crypto.randomUUID();
    const stroke: StrokeData = {
      id,
      points: [...drawState.currentPoints],
      color: drawState.color,
      weight: drawState.weight,
      opacity: drawState.opacity,
      brushPattern: drawState.brushPattern,
    };

    drawState.strokes.push(stroke);

    if (onStrokeFinalized) onStrokeFinalized(stroke, currentHexId);

    useUndoStore.getState().pushAction({
      type: 'stroke-added',
      hexId: currentHexId,
      stroke: { id, points: stroke.points.map(p => [p.x, p.y] as [number, number]), color: stroke.color, weight: stroke.weight, opacity: stroke.opacity, brushPattern: stroke.brushPattern },
    });
  }
  drawState.currentPoints = [];
  drawState.placingPolygon = false;
  drawState.polygonPreviewPoint = null;
  redrawAllStrokes();
}

export function cancelPolygon(): void {
  if (drawState.placingPolygon) {
    drawState.currentPoints = [];
    drawState.placingPolygon = false;
    drawState.polygonPreviewPoint = null;
    redrawAllStrokes();
  }
}

export function cancelMeasurement(): void {
  drawState.placingMeasurement = false;
  drawState.measurementStart = null;
  drawState.measurementPreviewPoint = null;
  redrawAllStrokes();
}

// ── Remote operation helpers ──

export function addRemoteStroke(stroke: StrokeData): void {
  drawState.strokes.push(stroke);
  if (stroke.stampType && drawState.mapRef) {
    addStampDomMarker(stroke, drawState.mapRef);
  }
  redrawAllStrokes();
}

export function removeStrokeById(id: string): void {
  removeStampDomMarker(id);
  const idx = drawState.strokes.findIndex(s => s.id === id);
  if (idx !== -1) {
    drawState.strokes.splice(idx, 1);
    redrawAllStrokes();
  }
}

export function clearAllStrokes(): void {
  clearStampDomMarkers();
  drawState.strokes.length = 0;
  redrawAllStrokes();
}

export function moveStampById(id: string, position: [number, number]): void {
  const stroke = drawState.strokes.find(s => s.id === id);
  if (stroke) {
    stroke.points[0] = toMapPoint(position[0], position[1]);
    updateStampDomMarkerPosition(id, stroke.points[0]);
    redrawAllStrokes();
  }
}

export function updateMeasurementById(id: string, points: [number, number][], radius?: number): void {
  const stroke = drawState.strokes.find(s => s.id === id);
  if (stroke) {
    stroke.points = points.map(([x, y]) => toMapPoint(x, y));
    if (radius !== undefined) stroke.radius = radius;
    redrawAllStrokes();
  }
}

export function setDrawColor(color: string): void {
  drawState.color = color;
  if (drawState.erasing && drawState.mapRef) {
    toggleEraser(drawState.mapRef);
  }
}

export function setDrawWeight(w: number): void {
  drawState.weight = w;
}

export function setDrawOpacity(o: number): void {
  drawState.opacity = o;
}

export function setDrawBrushPattern(p: BrushPattern | undefined): void {
  drawState.brushPattern = p;
}

export function saveDrawState(): SavedStroke[] {
  return drawState.strokes.map((stroke) => ({
    id: stroke.id,
    points: stroke.points.map((p) => [p.x, p.y] as [number, number]),
    color: stroke.color,
    weight: stroke.weight,
    opacity: stroke.opacity,
    brushPattern: stroke.brushPattern,
    isArrow: stroke.isArrow,
    stampType: stroke.stampType,
    stampText: stroke.stampText,
    measureType: stroke.measureType,
    radius: stroke.radius,
  }));
}

export function restoreDrawState(saved: SavedStroke[], _map: maplibregl.Map): void {
  for (const stroke of saved) {
    const s: StrokeData = {
      id: stroke.id,
      points: stroke.points.map(([x, y]) => toMapPoint(x, y)),
      color: stroke.color,
      weight: stroke.weight,
      opacity: stroke.opacity ?? 1.0,
      brushPattern: stroke.brushPattern as BrushPattern | undefined,
      isArrow: stroke.isArrow,
      stampType: stroke.stampType,
      stampText: stroke.stampText,
      measureType: stroke.measureType,
      radius: stroke.radius,
    };
    drawState.strokes.push(s);
    if (s.stampType && drawState.mapRef) {
      addStampDomMarker(s, drawState.mapRef);
    }
  }
  redrawAllStrokes();
}

export function toggleEraser(map: maplibregl.Map): void {
  drawState.erasing = !drawState.erasing;

  if (drawState.erasing) {
    useMapStore.getState().setMapCursor('none');
  } else {
    useMapStore.getState().setMapCursor('');
    useDrawStore.getState().setEraserPosition(null);
  }
}

function updateEraserCursor(map: maplibregl.Map, e: MouseEvent): void {
  const rect = map.getContainer().getBoundingClientRect();
  const x = e.clientX - rect.left - drawState.eraserRadius;
  const y = e.clientY - rect.top - drawState.eraserRadius;
  useDrawStore.getState().setEraserPosition({ x, y });
}

function eraseStrokesAtPoint(map: maplibregl.Map, lngLat: maplibregl.LngLat): void {
  const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);

  // Convert pixel radius to CRS distance
  const centerPx = map.project([lngLat.lng, lngLat.lat]);
  const edgeLngLat = map.unproject([centerPx.x + drawState.eraserRadius, centerPx.y]);
  const edgePoint = lngLatToMapPoint(edgeLngLat.lng, edgeLngLat.lat);
  const radiusSq = (point.x - edgePoint.x) ** 2 + (point.y - edgePoint.y) ** 2;

  for (let i = drawState.strokes.length - 1; i >= 0; i--) {
    const stroke = drawState.strokes[i];
    let hit = false;
    for (const pt of stroke.points) {
      const dSq = (pt.x - point.x) ** 2 + (pt.y - point.y) ** 2;
      if (dSq <= radiusSq) {
        hit = true;
        break;
      }
    }
    // Also check circle circumference proximity
    if (!hit && stroke.measureType === 'circle' && stroke.radius) {
      const center = stroke.points[0];
      const dFromCenter = Math.sqrt((center.x - point.x) ** 2 + (center.y - point.y) ** 2);
      if (Math.abs(dFromCenter - stroke.radius) <= Math.sqrt(radiusSq)) {
        hit = true;
      }
    }
    if (hit) {
      const saved: SavedStroke = {
        id: stroke.id,
        points: stroke.points.map((p) => [p.x, p.y] as [number, number]),
        color: stroke.color,
        weight: stroke.weight,
        opacity: stroke.opacity,
        brushPattern: stroke.brushPattern,
        isArrow: stroke.isArrow,
        stampType: stroke.stampType,
        stampText: stroke.stampText,
        measureType: stroke.measureType,
        radius: stroke.radius,
      };
      drawState.erasedDuringDrag.push(saved);
      if (stroke.stampType && stroke.id) removeStampDomMarker(stroke.id);
      drawState.strokes.splice(i, 1);
    }
  }

  // Also erase enemy markers under the eraser
  eraseEnemyMarkersAtPoint(point, radiusSq, map);

  redrawAllStrokes();
}

function finalizeErase(map: maplibregl.Map): void {
  if (drawState.erasedDuringDrag.length > 0) {
    // Push undo action before clearing
    useUndoStore.getState().pushAction({
      type: 'strokes-erased',
      hexId: currentHexId,
      strokes: drawState.erasedDuringDrag.map(s => ({
        id: s.id ?? '',
        points: s.points,
        color: s.color,
        weight: s.weight,
        opacity: s.opacity ?? 1.0,
        brushPattern: s.brushPattern as BrushPattern | undefined,
        isArrow: s.isArrow,
        stampType: s.stampType,
        stampText: s.stampText,
        measureType: s.measureType,
        radius: s.radius,
      })),
    });

    // Notify sync of erased stroke IDs
    const erasedIds = drawState.erasedDuringDrag
      .map(s => s.id)
      .filter((id): id is string => id !== undefined);
    if (onStrokesErased && erasedIds.length > 0) {
      onStrokesErased(erasedIds, currentHexId);
    }
  }
  drawState.eraserActive = false;
  drawState.erasedDuringDrag = [];
  map.dragPan.enable();
}

// ── Stamp placement ──

function finalizeStamp(point: MapPoint, stampType: string, stampText?: string): void {
  const id = crypto.randomUUID();
  const store = useDrawStore.getState();
  const stroke: StrokeData = {
    id,
    points: [point],
    color: drawState.color,
    weight: store.strokeWidth,
    opacity: store.strokeOpacity,
    stampType,
    stampText,
  };

  drawState.strokes.push(stroke);
  if (drawState.mapRef) addStampDomMarker(stroke, drawState.mapRef);
  if (onStrokeFinalized) onStrokeFinalized(stroke, currentHexId);

  useUndoStore.getState().pushAction({
    type: 'stroke-added',
    hexId: currentHexId,
    stroke: { id, points: [[point.x, point.y]], color: stroke.color, weight: stroke.weight, opacity: stroke.opacity, stampType, stampText },
  });

  redrawAllStrokes();
}

// ── Text input DOM ──

let activeTextInput: HTMLInputElement | null = null;

function removeTextInput(): void {
  if (activeTextInput) {
    activeTextInput.remove();
    activeTextInput = null;
  }
}

function showTextInput(map: maplibregl.Map, clientX: number, clientY: number, lngLat: { lng: number; lat: number }): void {
  removeTextInput();

  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type label...';
  input.style.cssText = `
    position: absolute;
    left: ${clientX - rect.left - 60}px;
    top: ${clientY - rect.top - 16}px;
    width: 120px;
    height: 28px;
    z-index: 20;
    background: rgba(0,0,0,0.85);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 6px;
    padding: 2px 8px;
    font: bold 13px monospace;
    outline: none;
  `;
  container.appendChild(input);
  activeTextInput = input;

  setTimeout(() => input.focus(), 0);

  const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);

  const finalize = () => {
    input.removeEventListener('blur', finalize);
    const text = input.value.trim();
    if (text) {
      finalizeStamp(point, 'text', text);
    }
    removeTextInput();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finalize(); }
    if (e.key === 'Escape') { e.preventDefault(); removeTextInput(); }
  });

  input.addEventListener('blur', finalize);
}

export { removeTextInput };

function finalizeDrag(): void {
  const stamp = drawState.draggingStamp;
  const startPos = drawState.dragStampStartPos;
  if (!stamp || !startPos) return;

  const newPos = stamp.points[0];
  const moved = newPos.x !== startPos.x || newPos.y !== startPos.y;

  if (moved) {
    if (onStrokeUpdated) onStrokeUpdated(stamp, currentHexId);

    useUndoStore.getState().pushAction({
      type: 'stamp-moved',
      hexId: currentHexId,
      strokeId: stamp.id!,
      from: [startPos.x, startPos.y],
      to: [newPos.x, newPos.y],
    });
  }

  drawState.draggingStamp = null;
  drawState.dragStampStartPos = null;
}

function finalizeMeasurementRuler(start: MapPoint, end: MapPoint): void {
  const id = crypto.randomUUID();
  const stroke: StrokeData = {
    id,
    points: [start, end],
    color: '#ffffff',
    weight: 2,
    opacity: 1,
    measureType: 'ruler',
  };
  drawState.strokes.push(stroke);
  if (onStrokeFinalized) onStrokeFinalized(stroke, currentHexId);
  useUndoStore.getState().pushAction({
    type: 'stroke-added',
    hexId: currentHexId,
    stroke: { id, points: [[start.x, start.y], [end.x, end.y]], color: '#ffffff', weight: 2, opacity: 1, measureType: 'ruler' },
  });
  drawState.placingMeasurement = false;
  drawState.measurementStart = null;
  drawState.measurementPreviewPoint = null;
  redrawAllStrokes();
}

function finalizeMeasurementCircle(center: MapPoint, radiusCrs: number): void {
  const id = crypto.randomUUID();
  const stroke: StrokeData = {
    id,
    points: [center],
    color: '#ffffff',
    weight: 2,
    opacity: 1,
    measureType: 'circle',
    radius: radiusCrs,
  };
  drawState.strokes.push(stroke);
  if (onStrokeFinalized) onStrokeFinalized(stroke, currentHexId);
  useUndoStore.getState().pushAction({
    type: 'stroke-added',
    hexId: currentHexId,
    stroke: { id, points: [[center.x, center.y]], color: '#ffffff', weight: 2, opacity: 1, measureType: 'circle', radius: radiusCrs },
  });
  drawState.placingMeasurement = false;
  drawState.measurementStart = null;
  drawState.measurementPreviewPoint = null;
  redrawAllStrokes();
}

function startMeasurementDrag(stroke: StrokeData, pointIndex: number, map: maplibregl.Map): void {
  drawState.draggingMeasurement = stroke;
  drawState.dragMeasurementPointIndex = pointIndex;
  drawState.dragMeasurementStartPoints = stroke.points.map(p => ({ ...p }));
  map.dragPan.disable();

  const onMove = (e: MouseEvent) => {
    const rect = map.getContainer().getBoundingClientRect();
    const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
    stroke.points[pointIndex] = point;
    redrawAllStrokes();
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    map.dragPan.enable();

    const startPoints = drawState.dragMeasurementStartPoints!;
    const newPoints = stroke.points;
    const moved = startPoints[pointIndex].x !== newPoints[pointIndex].x ||
                  startPoints[pointIndex].y !== newPoints[pointIndex].y;

    if (moved) {
      if (onStrokeUpdated) onStrokeUpdated(stroke, currentHexId);
      useUndoStore.getState().pushAction({
        type: 'measurement-updated',
        hexId: currentHexId,
        strokeId: stroke.id!,
        prevPoints: startPoints.map(p => [p.x, p.y] as [number, number]),
        newPoints: newPoints.map(p => [p.x, p.y] as [number, number]),
      });
    }

    drawState.draggingMeasurement = null;
    drawState.dragMeasurementStartPoints = null;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startCircleResize(stroke: StrokeData, map: maplibregl.Map): void {
  drawState.draggingMeasurement = stroke;
  drawState.dragMeasurementStartRadius = stroke.radius!;
  map.dragPan.disable();

  const center = stroke.points[0];

  const onMove = (e: MouseEvent) => {
    const rect = map.getContainer().getBoundingClientRect();
    const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    stroke.radius = Math.sqrt(dx * dx + dy * dy) || 0.1;
    redrawAllStrokes();
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    map.dragPan.enable();

    const startRadius = drawState.dragMeasurementStartRadius!;
    const changed = startRadius !== stroke.radius;

    if (changed) {
      if (onStrokeUpdated) onStrokeUpdated(stroke, currentHexId);
      useUndoStore.getState().pushAction({
        type: 'measurement-updated',
        hexId: currentHexId,
        strokeId: stroke.id!,
        prevPoints: stroke.points.map(p => [p.x, p.y] as [number, number]),
        prevRadius: startRadius,
        newPoints: stroke.points.map(p => [p.x, p.y] as [number, number]),
        newRadius: stroke.radius,
      });
    }

    drawState.draggingMeasurement = null;
    drawState.dragMeasurementStartRadius = null;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startCircleMove(stroke: StrokeData, map: maplibregl.Map): void {
  drawState.draggingMeasurement = stroke;
  drawState.dragMeasurementStartPoints = stroke.points.map(p => ({ ...p }));
  map.dragPan.disable();

  const onMove = (e: MouseEvent) => {
    const rect = map.getContainer().getBoundingClientRect();
    const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
    stroke.points[0] = point;
    redrawAllStrokes();
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    map.dragPan.enable();

    const startPoints = drawState.dragMeasurementStartPoints!;
    const moved = startPoints[0].x !== stroke.points[0].x || startPoints[0].y !== stroke.points[0].y;

    if (moved) {
      if (onStrokeUpdated) onStrokeUpdated(stroke, currentHexId);
      useUndoStore.getState().pushAction({
        type: 'measurement-updated',
        hexId: currentHexId,
        strokeId: stroke.id!,
        prevPoints: startPoints.map(p => [p.x, p.y] as [number, number]),
        prevRadius: stroke.radius,
        newPoints: stroke.points.map(p => [p.x, p.y] as [number, number]),
        newRadius: stroke.radius,
      });
    }

    drawState.draggingMeasurement = null;
    drawState.dragMeasurementStartPoints = null;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function setupDrawingEvents(map: maplibregl.Map): void {
  drawState.mapRef = map;

  const container = map.getContainer();

  // Left-click handler for dragging measurement endpoints/circumference
  // Use capture phase so we fire before MapLibre's internal drag-pan handler
  container.addEventListener('mousedown', (e: MouseEvent) => {
    if (!drawState.active || e.button !== 0) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    for (const stroke of drawState.strokes) {
      if (stroke.measureType === 'ruler' && stroke.points.length >= 2) {
        for (let i = 0; i < 2; i++) {
          const ptPx = map.project(mapPointToLngLat(stroke.points[i]));
          if (Math.hypot(clickX - ptPx.x, clickY - ptPx.y) <= 10) {
            e.stopPropagation();
            e.preventDefault();
            startMeasurementDrag(stroke, i, map);
            return;
          }
        }
      } else if (stroke.measureType === 'circle' && stroke.radius) {
        const centerPx = map.project(mapPointToLngLat(stroke.points[0]));
        const dist = Math.hypot(clickX - centerPx.x, clickY - centerPx.y);
        // Center dot drag — move the whole circle
        if (dist <= 10) {
          e.stopPropagation();
          e.preventDefault();
          startCircleMove(stroke, map);
          return;
        }
        // Circumference drag — resize
        const edgeCrs: MapPoint = { x: stroke.points[0].x + stroke.radius, y: stroke.points[0].y };
        const edgePx = map.project(mapPointToLngLat(edgeCrs));
        const screenRadius = Math.hypot(edgePx.x - centerPx.x, edgePx.y - centerPx.y);
        if (Math.abs(dist - screenRadius) <= 15) {
          e.stopPropagation();
          e.preventDefault();
          startCircleResize(stroke, map);
          return;
        }
      }
    }
  }, { capture: true });

  container.addEventListener('mousedown', (e: MouseEvent) => {
    if (!drawState.active) return;
    if (e.button !== 2) return;

    const rect = container.getBoundingClientRect();
    const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);

    if (drawState.erasing) {
      map.dragPan.disable();
      drawState.eraserActive = true;
      eraseStrokesAtPoint(map, lngLat);
      return;
    }

    // Read active tool/brushPattern from store at draw start
    const store = useDrawStore.getState();

    if (store.activeTool === 'stamp') {
      const stampType = store.selectedStamp;
      if (stampType) {
        const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
        finalizeStamp(point, stampType);
      }
      return;
    }

    if (store.activeTool === 'text') {
      showTextInput(map, e.clientX, e.clientY, lngLat);
      return;
    }

    if (store.activeTool === 'ruler') {
      const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
      if (!drawState.placingMeasurement) {
        drawState.measurementStart = point;
        drawState.measurementPreviewPoint = null;
        drawState.placingMeasurement = true;
      } else {
        finalizeMeasurementRuler(drawState.measurementStart!, point);
      }
      redrawAllStrokes();
      return;
    }

    if (store.activeTool === 'circle') {
      const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
      if (!drawState.placingMeasurement) {
        drawState.measurementStart = point;
        drawState.measurementPreviewPoint = null;
        drawState.placingMeasurement = true;
      } else {
        const dx = point.x - drawState.measurementStart!.x;
        const dy = point.y - drawState.measurementStart!.y;
        const radiusCrs = Math.sqrt(dx * dx + dy * dy);
        finalizeMeasurementCircle(drawState.measurementStart!, radiusCrs || metersToRadius(150));
      }
      redrawAllStrokes();
      return;
    }

    if (store.activeTool === 'area') {
      drawState.brushPattern = store.brushPattern;
      const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);

      if (!drawState.placingPolygon) {
        // First click — start polygon placement
        drawState.placingPolygon = true;
        drawState.currentPoints = [point];
      } else {
        // Check if click is near first vertex to close
        if (drawState.currentPoints.length >= 3) {
          const firstPt = drawState.currentPoints[0];
          const firstLngLat = mapPointToLngLat(firstPt);
          const firstPx = map.project(firstLngLat);
          const clickPx = map.project([lngLat.lng, lngLat.lat]);
          const dist = Math.hypot(clickPx.x - firstPx.x, clickPx.y - firstPx.y);
          if (dist <= 15) {
            finalizePolygon();
            return;
          }
        }
        // Add vertex
        drawState.currentPoints.push(point);
      }
      redrawAllStrokes();
      return;
    }

    if (store.activeTool === 'enemy-marker') {
      return;
    }

    drawState.brushPattern = undefined;
    drawState.isArrow = store.activeTool === 'arrow';
    drawState.drawing = true;
    const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
    drawState.currentPoints = [point];
  });

  container.addEventListener('mousemove', (e: MouseEvent) => {
    if (drawState.erasing) {
      updateEraserCursor(map, e);
    }

    const rect = container.getBoundingClientRect();
    const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);

    if (drawState.eraserActive) {
      eraseStrokesAtPoint(map, lngLat);
      return;
    }

    // Polygon placement preview
    if (drawState.placingPolygon) {
      drawState.polygonPreviewPoint = lngLatToMapPoint(lngLat.lng, lngLat.lat);
      redrawAllStrokes();
      return;
    }

    // Measurement placement preview
    if (drawState.placingMeasurement) {
      drawState.measurementPreviewPoint = lngLatToMapPoint(lngLat.lng, lngLat.lat);
      redrawAllStrokes();
      return;
    }

    if (!drawState.drawing) return;

    const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
    drawState.currentPoints.push(point);
    redrawAllStrokes();
  });

  const finishDraw = () => {
    if (drawState.eraserActive) {
      finalizeErase(map);
      return;
    }
    // Don't finalize polygon/measurement on mouseup — they use click-click
    if (drawState.placingPolygon) return;
    if (drawState.placingMeasurement) return;
    if (drawState.drawing) finalizeStroke();
  };

  container.addEventListener('mouseup', finishDraw);
  document.addEventListener('mouseup', finishDraw);

  // Suppress context menu while drawing
  container.addEventListener('contextmenu', (e: MouseEvent) => {
    if (drawState.active) e.preventDefault();
  });

  // Escape cancels polygon/measurement placement
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (drawState.placingPolygon) cancelPolygon();
      if (drawState.placingMeasurement) cancelMeasurement();
    }
  });

  // Cancel polygon/measurement/enemy-marker/text if tool changes mid-placement
  useDrawStore.subscribe((state, prev) => {
    if (state.activeTool !== prev.activeTool) {
      if (drawState.placingPolygon) cancelPolygon();
      if (prev.activeTool === 'ruler' || prev.activeTool === 'circle') cancelMeasurement();
      if (prev.activeTool === 'text') removeTextInput();
      if (prev.activeTool === 'enemy-marker') {
        useEnemyMarkerStore.getState().setPlacingMarker(false);
        useMapStore.getState().setMapCursor('');
      }
    }
  });

  // Hide/show eraser cursor on leave/enter
  container.addEventListener('mouseleave', () => {
    if (drawState.erasing) useDrawStore.getState().setEraserPosition(null);
  });
  container.addEventListener('mouseenter', (e: MouseEvent) => {
    if (drawState.erasing) updateEraserCursor(map, e);
  });
}
