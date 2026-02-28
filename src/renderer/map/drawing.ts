import L from 'leaflet';
import type { SavedStroke } from '../data/store';
import { pushUndoAction } from '../data/undoStack';

interface DrawState {
  active: boolean;
  drawing: boolean;
  color: string;
  weight: number;
  currentLine: L.Polyline | null;
  currentPoints: L.LatLng[];
  strokes: L.Polyline[];
  drawLayer: L.LayerGroup | null;
  erasing: boolean;
  eraserActive: boolean;
  eraserRadius: number;
  eraserCursor: HTMLDivElement | null;
  erasedDuringDrag: SavedStroke[];
  mapRef: L.Map | null;
}

const drawState: DrawState = {
  active: false,
  drawing: false,
  color: '#ff0000',
  weight: 3,
  currentLine: null,
  currentPoints: [],
  strokes: [],
  drawLayer: null,
  erasing: false,
  eraserActive: false,
  eraserRadius: 20,
  eraserCursor: null,
  erasedDuringDrag: [],
  mapRef: null,
};

export function getDrawState(): DrawState {
  return drawState;
}

export function initDrawLayer(map: L.Map): void {
  // Create a custom pane so drawings always render above markers/labels
  if (!map.getPane('drawPane')) {
    const pane = map.createPane('drawPane');
    pane.style.zIndex = '650'; // above markerPane (600) and overlayPane (400)
  }
  drawState.drawLayer = L.layerGroup([], { pane: 'drawPane' }).addTo(map);
  drawState.strokes = [];
  drawState.currentLine = null;
  drawState.currentPoints = [];
  drawState.drawing = false;
  drawState.active = false;
}

export function cleanupDrawing(map: L.Map): void {
  if (drawState.erasing) toggleEraser(map);
  if (drawState.active) deactivateDrawing(map);
  if (drawState.drawLayer) {
    map.removeLayer(drawState.drawLayer);
    drawState.drawLayer = null;
  }
  drawState.strokes = [];
  drawState.currentLine = null;
  drawState.currentPoints = [];
  drawState.drawing = false;
  drawState.eraserActive = false;
  drawState.erasedDuringDrag = [];
}

export function activateDrawing(map: L.Map): void {
  drawState.active = true;
}

export function deactivateDrawing(map: L.Map): void {
  finalizeStroke();
  drawState.active = false;
}

function finalizeStroke(): void {
  if (drawState.currentLine) {
    if (drawState.currentPoints.length > 1) {
      drawState.strokes.push(drawState.currentLine);
      pushUndoAction({ type: 'drawing' });
    } else {
      drawState.drawLayer?.removeLayer(drawState.currentLine);
    }
    drawState.currentLine = null;
    drawState.currentPoints = [];
  }
  drawState.drawing = false;
}

export function undoStroke(): void {
  if (drawState.strokes.length === 0) return;
  const last = drawState.strokes.pop()!;
  drawState.drawLayer?.removeLayer(last);
}

export function setDrawColor(color: string): void {
  drawState.color = color;
  // Deactivate eraser when a color is selected (mutually exclusive)
  if (drawState.erasing && drawState.mapRef) {
    toggleEraser(drawState.mapRef);
  }

  const swatches = document.querySelectorAll('.draw-swatch');
  swatches.forEach((swatch) => {
    if (swatch.getAttribute('data-color') === color) {
      swatch.classList.add('selected');
    } else {
      swatch.classList.remove('selected');
    }
  });
}

export function saveDrawState(): SavedStroke[] {
  return drawState.strokes.map((polyline) => {
    const latlngs = polyline.getLatLngs() as L.LatLng[];
    return {
      points: latlngs.map((ll) => [ll.lat, ll.lng] as [number, number]),
      color: polyline.options.color as string,
      weight: polyline.options.weight as number,
    };
  });
}

export function restoreDrawState(saved: SavedStroke[]): void {
  if (!drawState.drawLayer) return;
  for (const stroke of saved) {
    const polyline = L.polyline(
      stroke.points.map(([lat, lng]) => L.latLng(lat, lng)),
      {
        color: stroke.color,
        weight: stroke.weight,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'drawPane',
      },
    ).addTo(drawState.drawLayer);
    drawState.strokes.push(polyline);
  }
}

export function toggleEraser(map: L.Map): void {
  drawState.erasing = !drawState.erasing;
  const btn = document.getElementById('draw-eraser-btn');
  const container = map.getContainer();

  if (drawState.erasing) {
    btn?.classList.add('active');
    // Deselect color swatches to signal mutual exclusivity
    document.querySelectorAll('.draw-swatch').forEach((s) => s.classList.remove('selected'));
    // Create eraser cursor
    const cursor = document.createElement('div');
    cursor.className = 'eraser-cursor';
    const d = drawState.eraserRadius * 2;
    cursor.style.width = `${d}px`;
    cursor.style.height = `${d}px`;
    cursor.style.borderRadius = '50%';
    cursor.style.border = '2px solid rgba(239, 83, 80, 0.8)';
    cursor.style.background = 'rgba(239, 83, 80, 0.1)';
    cursor.style.position = 'absolute';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '10000';
    cursor.style.display = 'none';
    container.appendChild(cursor);
    drawState.eraserCursor = cursor;
    container.style.cursor = 'none';
  } else {
    btn?.classList.remove('active');
    if (drawState.eraserCursor) {
      drawState.eraserCursor.remove();
      drawState.eraserCursor = null;
    }
    container.style.cursor = '';
  }
}

function updateEraserCursor(map: L.Map, e: MouseEvent): void {
  if (!drawState.eraserCursor) return;
  const rect = map.getContainer().getBoundingClientRect();
  const x = e.clientX - rect.left - drawState.eraserRadius;
  const y = e.clientY - rect.top - drawState.eraserRadius;
  drawState.eraserCursor.style.left = `${x}px`;
  drawState.eraserCursor.style.top = `${y}px`;
  drawState.eraserCursor.style.display = '';
}

function eraseStrokesAtPoint(map: L.Map, latlng: L.LatLng): void {
  // Convert pixel radius to CRS distance
  const centerPt = map.latLngToContainerPoint(latlng);
  const edgePt = L.point(centerPt.x + drawState.eraserRadius, centerPt.y);
  const edgeLatLng = map.containerPointToLatLng(edgePt);
  const radiusSq =
    (latlng.lat - edgeLatLng.lat) ** 2 + (latlng.lng - edgeLatLng.lng) ** 2;

  for (let i = drawState.strokes.length - 1; i >= 0; i--) {
    const polyline = drawState.strokes[i];
    const pts = polyline.getLatLngs() as L.LatLng[];
    let hit = false;
    for (const pt of pts) {
      const dSq = (pt.lat - latlng.lat) ** 2 + (pt.lng - latlng.lng) ** 2;
      if (dSq <= radiusSq) {
        hit = true;
        break;
      }
    }
    if (hit) {
      // Serialize before removing
      const saved: SavedStroke = {
        points: pts.map((ll) => [ll.lat, ll.lng] as [number, number]),
        color: polyline.options.color as string,
        weight: polyline.options.weight as number,
      };
      drawState.erasedDuringDrag.push(saved);
      drawState.drawLayer?.removeLayer(polyline);
      drawState.strokes.splice(i, 1);
    }
  }
}

function finalizeErase(map: L.Map): void {
  if (drawState.erasedDuringDrag.length > 0) {
    pushUndoAction({ type: 'eraser', strokes: [...drawState.erasedDuringDrag] });
  }
  drawState.eraserActive = false;
  drawState.erasedDuringDrag = [];
  map.dragging.enable();
}

export function restoreErasedStrokes(saved: SavedStroke[]): void {
  if (!drawState.drawLayer) return;
  for (const stroke of saved) {
    const polyline = L.polyline(
      stroke.points.map(([lat, lng]) => L.latLng(lat, lng)),
      {
        color: stroke.color,
        weight: stroke.weight,
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'drawPane',
      },
    ).addTo(drawState.drawLayer);
    drawState.strokes.push(polyline);
  }
}

export function setupDrawingEvents(map: L.Map): void {
  drawState.mapRef = map;

  map.on('mousedown', (e: L.LeafletMouseEvent) => {
    if (!drawState.active) return;
    if (e.originalEvent.button !== 2) return;
    // Eraser: right-click when eraser mode is on
    if (drawState.erasing) {
      map.dragging.disable();
      drawState.eraserActive = true;
      eraseStrokesAtPoint(map, e.latlng);
      return;
    }
    drawState.drawing = true;
    drawState.currentPoints = [e.latlng];
    drawState.currentLine = L.polyline(drawState.currentPoints, {
      color: drawState.color,
      weight: drawState.weight,
      lineCap: 'round',
      lineJoin: 'round',
      pane: 'drawPane',
    }).addTo(drawState.drawLayer!);
  });

  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    // Always update eraser cursor position
    if (drawState.erasing) {
      updateEraserCursor(map, e.originalEvent);
    }
    if (drawState.eraserActive) {
      eraseStrokesAtPoint(map, e.latlng);
      return;
    }
    if (!drawState.drawing) return;
    drawState.currentPoints.push(e.latlng);
    drawState.currentLine?.setLatLngs(drawState.currentPoints);
  });

  map.on('mouseup', () => {
    if (drawState.eraserActive) {
      finalizeErase(map);
      return;
    }
    if (drawState.drawing) finalizeStroke();
  });

  document.addEventListener('mouseup', () => {
    if (drawState.eraserActive) {
      finalizeErase(map);
      return;
    }
    if (drawState.drawing) finalizeStroke();
  });

  // Suppress context menu while drawing
  map.getContainer().addEventListener('contextmenu', (e: MouseEvent) => {
    if (drawState.active) e.preventDefault();
  });

  // Toolbar handlers
  const swatches = document.querySelectorAll('.draw-swatch');
  swatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      setDrawColor(swatch.getAttribute('data-color')!);
    });
  });

  document.getElementById('draw-custom-color')?.addEventListener('input', (e) => {
    setDrawColor((e.target as HTMLInputElement).value);
  });

  // Eraser button
  document.getElementById('draw-eraser-btn')?.addEventListener('click', () => {
    toggleEraser(map);
  });

  // Hide/show eraser cursor on leave/enter
  map.getContainer().addEventListener('mouseleave', () => {
    if (drawState.eraserCursor) drawState.eraserCursor.style.display = 'none';
  });
  map.getContainer().addEventListener('mouseenter', (e: MouseEvent) => {
    if (drawState.erasing) updateEraserCursor(map, e);
  });
}
