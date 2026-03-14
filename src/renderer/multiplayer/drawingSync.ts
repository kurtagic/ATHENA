import * as Y from 'yjs';
import type { StrokeData } from '../map/drawing';
import {
  setStrokeFinalizedCallback,
  setStrokesErasedCallback,
  addRemoteStroke,
  removeStrokeById,
  clearAllStrokes,
} from '../map/drawing';
import { toMapPoint } from '../data/coords';
import type { SavedStroke } from '../data/store';
import { hexDrawingData } from '../data/store';
import { getRootMap, getHexMap } from './yjsSync';
import { useMapStore } from '../stores/mapStore';
import { debugLog } from '../stores/debugStore';

let observer: ((events: Y.YEvent<any>[], tx: Y.Transaction) => void) | null = null;

/** Convert a Yjs stroke entry to a StrokeData (with MapPoints) for the canvas */
function fromYjsStroke(id: string, data: any): StrokeData {
  return {
    id,
    points: (data.points as [number, number][]).map(([x, y]) => toMapPoint(x, y)),
    color: data.color,
    weight: data.weight,
    opacity: data.opacity,
    brushPattern: data.brushPattern,
  };
}

/** Convert a Yjs stroke entry to SavedStroke (raw coords) for hexDrawingData cache */
function toSavedStroke(id: string, data: any): SavedStroke {
  return {
    id,
    points: data.points as [number, number][],
    color: data.color,
    weight: data.weight,
    opacity: data.opacity,
    brushPattern: data.brushPattern,
  };
}

export function initDrawingSync(): void {
  // Outbound: local drawing actions → Yjs
  setStrokeFinalizedCallback((stroke, hexId) => {
    const hexMap = getHexMap('strokes', hexId);
    if (!hexMap) return;
    const id = stroke.id || crypto.randomUUID();
    hexMap.set(id, {
      points: stroke.points.map((p) => [p.x, p.y] as [number, number]),
      color: stroke.color,
      weight: stroke.weight,
      opacity: stroke.opacity,
      brushPattern: stroke.brushPattern,
    });
    debugLog('yjs', `Stroke created in ${hexId}: ${id}`);
  });

  setStrokesErasedCallback((strokeIds, hexId) => {
    const hexMap = getHexMap('strokes', hexId);
    if (!hexMap) return;
    for (const id of strokeIds) {
      hexMap.delete(id);
      debugLog('yjs', `Stroke deleted in ${hexId}: ${id}`);
    }
  });
}

/** Start observing the root strokes Y.Map for remote changes */
export function setupDrawingObserver(): void {
  teardownDrawingObserver();

  const strokesMap = getRootMap('strokes');
  if (!strokesMap) return;

  observer = (events: Y.YEvent<any>[], transaction: Y.Transaction) => {
    if (transaction.local) return;

    const currentHexId = useMapStore.getState().detailMode?.apiName || '';

    for (const event of events) {
      if (!(event instanceof Y.YMapEvent)) continue;

      // Depth 0: a new hex map was added/removed at the root level
      if (event.target === strokesMap) continue;

      // Depth 1: strokes changed within a hex map
      const hexId = findHexId(strokesMap, event.target as Y.Map<any>);
      if (!hexId) continue;

      event.changes.keys.forEach((change, strokeId) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = (event.target as Y.Map<any>).get(strokeId);
          if (!data) return;

          if (hexId === currentHexId) {
            addRemoteStroke(fromYjsStroke(strokeId, data));
          } else {
            if (!hexDrawingData[hexId]) hexDrawingData[hexId] = [];
            // Remove existing entry if update
            const existing = hexDrawingData[hexId].findIndex(s => s.id === strokeId);
            if (existing !== -1) hexDrawingData[hexId].splice(existing, 1);
            hexDrawingData[hexId].push(toSavedStroke(strokeId, data));
          }
          debugLog('yjs', `Remote stroke ${change.action} in ${hexId}: ${strokeId}`);
        } else if (change.action === 'delete') {
          if (hexId === currentHexId) {
            removeStrokeById(strokeId);
          } else {
            const drawings = hexDrawingData[hexId];
            if (drawings) {
              const idx = drawings.findIndex(s => s.id === strokeId);
              if (idx !== -1) drawings.splice(idx, 1);
            }
          }
          debugLog('yjs', `Remote stroke delete in ${hexId}: ${strokeId}`);
        }
      });
    }
  };

  strokesMap.observeDeep(observer);
  debugLog('yjs', 'Stroke observer attached');
}

/** Stop observing */
export function teardownDrawingObserver(): void {
  if (observer) {
    const strokesMap = getRootMap('strokes');
    if (strokesMap) {
      strokesMap.unobserveDeep(observer);
    }
    observer = null;
    debugLog('yjs', 'Stroke observer detached');
  }
}

/** Load all strokes for a hex from the Y.Doc */
export function loadHexStrokes(hexId: string): SavedStroke[] {
  const strokesMap = getRootMap('strokes');
  if (!strokesMap || !strokesMap.has(hexId)) return [];

  const hexMap = strokesMap.get(hexId) as Y.Map<any>;
  const result: SavedStroke[] = [];
  hexMap.forEach((data: any, strokeId: string) => {
    result.push(toSavedStroke(strokeId, data));
  });
  return result;
}

/** Find which hex ID a sub-map belongs to */
function findHexId(root: Y.Map<Y.Map<any>>, target: Y.Map<any>): string | null {
  for (const [hexId, hexMap] of root.entries()) {
    if (hexMap === target) return hexId;
  }
  return null;
}
