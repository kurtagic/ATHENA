import type maplibregl from 'maplibre-gl';
import type { MapPoint } from '../data/coords';
import { toMapPoint, mapPointToLngLat, lngLatToMapPoint } from '../data/coords';
import { crsDistanceMeters, crsAzimuth } from '../data/artilleryCalc';
import type { SavedStroke } from '../data/store';
import { useMapStore } from '../stores/mapStore';
import { useDrawStore, type BrushPattern } from '../stores/drawStore';

export interface StrokeData {
  id?: string;
  points: MapPoint[];
  color: string;
  weight: number;
  opacity: number;
  brushPattern?: BrushPattern;
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
  rulerStart: MapPoint | null;
  rulerEnd: MapPoint | null;
  rulerPreviewPoint: MapPoint | null;
  placingRuler: boolean;
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
  rulerStart: null,
  rulerEnd: null,
  rulerPreviewPoint: null,
  placingRuler: false,
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

  const drawPenStroke = (points: MapPoint[], color: string, weight: number, opacity: number) => {
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
    if (stroke.brushPattern) {
      drawAreaShape(ctx, map, stroke.points, stroke.color, stroke.weight, stroke.opacity, stroke.brushPattern);
    } else {
      drawPenStroke(stroke.points, stroke.color, stroke.weight, stroke.opacity);
    }
  }

  // Draw current in-progress stroke
  if (drawState.drawing && drawState.currentPoints.length > 1) {
    if (drawState.brushPattern) {
      drawAreaShape(ctx, map, drawState.currentPoints, drawState.color, drawState.weight, drawState.opacity, drawState.brushPattern);
    } else {
      drawPenStroke(drawState.currentPoints, drawState.color, drawState.weight, drawState.opacity);
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

  // Draw ruler overlay
  const rulerEnd = drawState.rulerEnd ?? drawState.rulerPreviewPoint;
  if (drawState.rulerStart && rulerEnd) {
    const startLngLat = mapPointToLngLat(drawState.rulerStart);
    const endLngLat = mapPointToLngLat(rulerEnd);
    const startPx = map.project(startLngLat);
    const endPx = map.project(endLngLat);

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

    // Distance and azimuth labels at midpoint
    const midX = (startPx.x + endPx.x) / 2;
    const midY = (startPx.y + endPx.y) / 2;
    const distM = crsDistanceMeters(drawState.rulerStart, rulerEnd);
    const azDeg = crsAzimuth(drawState.rulerStart, rulerEnd);
    const distText = `${Math.round(distM)}m`;
    const azText = `${azDeg.toFixed(1)}°`;

    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const distWidth = ctx.measureText(distText).width;
    const azWidth = ctx.measureText(azText).width;
    const pillWidth = Math.max(distWidth, azWidth) + 16;
    const pillHeight = 38;

    // Background pill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    const r = 6;
    const px0 = midX - pillWidth / 2;
    const py0 = midY - pillHeight / 2;
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

    // Distance text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(distText, midX, midY - 8);

    // Azimuth text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '11px monospace';
    ctx.fillText(azText, midX, midY + 9);

    ctx.restore();
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
  drawState.placingPolygon = false;
  drawState.polygonPreviewPoint = null;
  drawState.rulerStart = null;
  drawState.rulerEnd = null;
  drawState.rulerPreviewPoint = null;
  drawState.placingRuler = false;
}

export function activateDrawing(_map: maplibregl.Map): void {
  drawState.active = true;
}

export function deactivateDrawing(_map: maplibregl.Map): void {
  cancelPolygon();
  cancelRuler();
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
    };

    drawState.strokes.push(stroke);

    if (onStrokeFinalized) onStrokeFinalized(stroke, currentHexId);
  }
  drawState.currentPoints = [];
  drawState.drawing = false;
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

export function cancelRuler(): void {
  drawState.rulerStart = null;
  drawState.rulerEnd = null;
  drawState.rulerPreviewPoint = null;
  drawState.placingRuler = false;
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
      brushPattern: stroke.brushPattern as BrushPattern | undefined,
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
        brushPattern: stroke.brushPattern,
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

    // Read active tool/brushPattern from store at draw start
    const store = useDrawStore.getState();
    if (store.activeTool === 'ruler') {
      const point = lngLatToMapPoint(lngLat.lng, lngLat.lat);
      if (!drawState.placingRuler) {
        drawState.rulerStart = point;
        drawState.rulerEnd = null;
        drawState.rulerPreviewPoint = null;
        drawState.placingRuler = true;
      } else {
        drawState.rulerEnd = point;
        drawState.placingRuler = false;
        drawState.rulerPreviewPoint = null;
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

    drawState.brushPattern = undefined;
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

    // Ruler placement preview
    if (drawState.placingRuler) {
      drawState.rulerPreviewPoint = lngLatToMapPoint(lngLat.lng, lngLat.lat);
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
    // Don't finalize polygon/ruler on mouseup — they use click-click
    if (drawState.placingPolygon) return;
    if (drawState.placingRuler) return;
    if (drawState.drawing) finalizeStroke();
  };

  container.addEventListener('mouseup', finishDraw);
  document.addEventListener('mouseup', finishDraw);

  // Suppress context menu while drawing
  container.addEventListener('contextmenu', (e: MouseEvent) => {
    if (drawState.active) e.preventDefault();
  });

  // Escape cancels polygon/ruler placement
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (drawState.placingPolygon) cancelPolygon();
      if (drawState.placingRuler) cancelRuler();
    }
  });

  // Cancel polygon/ruler if tool changes mid-placement
  useDrawStore.subscribe((state, prev) => {
    if (state.activeTool !== prev.activeTool) {
      if (drawState.placingPolygon) cancelPolygon();
      if (prev.activeTool === 'ruler') cancelRuler();
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
