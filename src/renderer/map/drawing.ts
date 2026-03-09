import type maplibregl from 'maplibre-gl';
import type { MapPoint } from '../data/coords';
import { toMapPoint, mapPointToLngLat, lngLatToMapPoint } from '../data/coords';
import type { SavedStroke } from '../data/store';
import { useMapStore } from '../stores/mapStore';
import { useDrawStore } from '../stores/drawStore';

export interface StrokeData {
  id?: string;
  points: MapPoint[];
  color: string;
  weight: number;
  opacity: number;
}

interface DrawState {
  active: boolean;
  drawing: boolean;
  color: string;
  weight: number;
  opacity: number;
  currentPoints: MapPoint[];
  strokes: StrokeData[];
  canvas: HTMLCanvasElement | null;
  erasing: boolean;
  eraserActive: boolean;
  eraserRadius: number;
  erasedDuringDrag: SavedStroke[];
  mapRef: maplibregl.Map | null;
}

const drawState: DrawState = {
  active: false,
  drawing: false,
  color: '#ff0000',
  weight: 3,
  opacity: 1.0,
  currentPoints: [],
  strokes: [],
  canvas: null,
  erasing: false,
  eraserActive: false,
  eraserRadius: 20,
  erasedDuringDrag: [],
  mapRef: null,
};

// ── Sync infrastructure ──
let syncMode = false;
let onStrokeFinalized: ((stroke: StrokeData, hexId: string) => void) | null = null;
let onStrokesErased: ((strokeIds: string[], hexId: string) => void) | null = null;
let currentHexId: string = '';

export function setSyncMode(enabled: boolean) { syncMode = enabled; }
export function setCurrentHexId(hexId: string) { currentHexId = hexId; }
export function setStrokeFinalizedCallback(cb: typeof onStrokeFinalized) { onStrokeFinalized = cb; }
export function setStrokesErasedCallback(cb: typeof onStrokesErased) { onStrokesErased = cb; }

export function getDrawState(): DrawState {
  return drawState;
}

export function showDrawCanvas(): void {
  if (drawState.canvas) drawState.canvas.style.display = '';
}

export function hideDrawCanvas(): void {
  if (drawState.canvas) drawState.canvas.style.display = 'none';
}

function resizeCanvas(): void {
  if (!drawState.canvas || !drawState.mapRef) return;
  const container = drawState.mapRef.getContainer();
  drawState.canvas.width = container.clientWidth;
  drawState.canvas.height = container.clientHeight;
  redrawAllStrokes();
}

function redrawAllStrokes(): void {
  if (!drawState.canvas || !drawState.mapRef) return;
  const ctx = drawState.canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, drawState.canvas.width, drawState.canvas.height);
  const map = drawState.mapRef;

  const drawStroke = (points: MapPoint[], color: string, weight: number, opacity: number) => {
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
    ctx.restore();
  };

  // Draw completed strokes
  for (const stroke of drawState.strokes) {
    drawStroke(stroke.points, stroke.color, stroke.weight, stroke.opacity);
  }

  // Draw current in-progress stroke
  if (drawState.drawing && drawState.currentPoints.length > 1) {
    drawStroke(drawState.currentPoints, drawState.color, drawState.weight, drawState.opacity);
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
  if (drawState.erasing) toggleEraser(map);
  if (drawState.active) deactivateDrawing(map);

  map.off('move', redrawAllStrokes);
  map.off('resize', resizeCanvas);

  if (drawState.canvas) {
    drawState.canvas.remove();
    drawState.canvas = null;
  }
  drawState.strokes = [];
  drawState.currentPoints = [];
  drawState.drawing = false;
  drawState.eraserActive = false;
  drawState.erasedDuringDrag = [];
}

export function activateDrawing(_map: maplibregl.Map): void {
  drawState.active = true;
}

export function deactivateDrawing(_map: maplibregl.Map): void {
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
    };

    drawState.strokes.push(stroke);

    if (onStrokeFinalized) onStrokeFinalized(stroke, currentHexId);
  }
  drawState.currentPoints = [];
  drawState.drawing = false;
  redrawAllStrokes();
}

// ── Remote operation helpers ──

export function addRemoteStroke(stroke: StrokeData): void {
  drawState.strokes.push(stroke);
  redrawAllStrokes();
}

export function removeStrokeById(id: string): void {
  const idx = drawState.strokes.findIndex(s => s.id === id);
  if (idx !== -1) {
    drawState.strokes.splice(idx, 1);
    redrawAllStrokes();
  }
}

export function clearAllStrokes(): void {
  drawState.strokes.length = 0;
  redrawAllStrokes();
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

export function saveDrawState(): SavedStroke[] {
  return drawState.strokes.map((stroke) => ({
    id: stroke.id,
    points: stroke.points.map((p) => [p.x, p.y] as [number, number]),
    color: stroke.color,
    weight: stroke.weight,
    opacity: stroke.opacity,
  }));
}

export function restoreDrawState(saved: SavedStroke[], _map: maplibregl.Map): void {
  for (const stroke of saved) {
    drawState.strokes.push({
      id: stroke.id,
      points: stroke.points.map(([x, y]) => toMapPoint(x, y)),
      color: stroke.color,
      weight: stroke.weight,
      opacity: stroke.opacity ?? 1.0,
    });
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
    if (hit) {
      const saved: SavedStroke = {
        id: stroke.id,
        points: stroke.points.map((p) => [p.x, p.y] as [number, number]),
        color: stroke.color,
        weight: stroke.weight,
        opacity: stroke.opacity,
      };
      drawState.erasedDuringDrag.push(saved);
      drawState.strokes.splice(i, 1);
    }
  }
  redrawAllStrokes();
}

function finalizeErase(map: maplibregl.Map): void {
  if (drawState.erasedDuringDrag.length > 0) {
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

export function setupDrawingEvents(map: maplibregl.Map): void {
  drawState.mapRef = map;

  const container = map.getContainer();

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
    if (drawState.drawing) finalizeStroke();
  };

  container.addEventListener('mouseup', finishDraw);
  document.addEventListener('mouseup', finishDraw);

  // Suppress context menu while drawing
  container.addEventListener('contextmenu', (e: MouseEvent) => {
    if (drawState.active) e.preventDefault();
  });

  // Hide/show eraser cursor on leave/enter
  container.addEventListener('mouseleave', () => {
    if (drawState.erasing) useDrawStore.getState().setEraserPosition(null);
  });
  container.addEventListener('mouseenter', (e: MouseEvent) => {
    if (drawState.erasing) updateEraserCursor(map, e);
  });
}
