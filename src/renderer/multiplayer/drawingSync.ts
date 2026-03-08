import type { StrokeData } from '../map/drawing';
import {
  setStrokeFinalizedCallback,
  setStrokeUndoneCallback,
  setStrokeRedoneCallback,
  setStrokesErasedCallback,
  addRemoteStroke,
  removeStrokeById,
  clearAllStrokes,
} from '../map/drawing';
import { toMapPoint } from '../data/coords';
import { hexDrawingData } from '../data/store';
import { session } from './sessionManager';
import type { SyncStroke, ServerBroadcast } from './protocol';

function toSyncStroke(stroke: StrokeData, hexId: string): Omit<SyncStroke, 'authorId'> {
  return {
    id: stroke.id || crypto.randomUUID(),
    hexId,
    points: stroke.points.map((p) => [p.x, p.y] as [number, number]),
    color: stroke.color,
    weight: stroke.weight,
    opacity: stroke.opacity,
  };
}

function fromSyncStroke(sync: SyncStroke): StrokeData {
  return {
    id: sync.id,
    points: sync.points.map(([x, y]) => toMapPoint(x, y)),
    color: sync.color,
    weight: sync.weight,
    opacity: sync.opacity,
  };
}

export function initDrawingSync(): void {
  // Outbound: local drawing actions → server
  setStrokeFinalizedCallback((stroke, hexId) => {
    if (!session.connected) return;
    session.sendStrokeAdd(toSyncStroke(stroke, hexId));
  });

  setStrokeUndoneCallback((strokeId, hexId) => {
    if (!session.connected) return;
    session.sendStrokeUndo(hexId, strokeId);
  });

  setStrokeRedoneCallback((stroke, hexId) => {
    if (!session.connected) return;
    session.sendStrokeRedo(toSyncStroke(stroke, hexId));
  });

  setStrokesErasedCallback((strokeIds, hexId) => {
    if (!session.connected) return;
    for (const id of strokeIds) {
      session.sendStrokeUndo(hexId, id);
    }
  });
}

function syncStrokeToSaved(sync: SyncStroke) {
  return {
    id: sync.id,
    points: sync.points as [number, number][],
    color: sync.color,
    weight: sync.weight,
    opacity: sync.opacity,
  };
}

export function handleDrawingBroadcast(
  msg: ServerBroadcast | Record<string, any>,
  currentHexId: string,
): void {
  // Broadcasts may come as { type, payload: {...} } or { type, seq, senderId, payload: {...} }
  const data = (msg as any).payload ?? msg;

  switch (msg.type) {
    case 'stroke-add':
    case 'stroke-redo': {
      const syncStroke = data.stroke as SyncStroke;
      if (syncStroke.hexId === currentHexId) {
        addRemoteStroke(fromSyncStroke(syncStroke));
      } else {
        if (!hexDrawingData[syncStroke.hexId]) hexDrawingData[syncStroke.hexId] = [];
        hexDrawingData[syncStroke.hexId].push(syncStrokeToSaved(syncStroke));
      }
      break;
    }
    case 'stroke-undo': {
      const hexId = data.hexId as string;
      const strokeId = data.strokeId as string;
      if (hexId === currentHexId) {
        removeStrokeById(strokeId);
      } else {
        const cached = hexDrawingData[hexId];
        if (cached) {
          const idx = cached.findIndex(s => s.id === strokeId);
          if (idx !== -1) cached.splice(idx, 1);
        }
      }
      break;
    }
    case 'stroke-clear': {
      const hexId = data.hexId as string;
      if (hexId === currentHexId) {
        clearAllStrokes();
      } else {
        delete hexDrawingData[hexId];
      }
      break;
    }
  }
}
