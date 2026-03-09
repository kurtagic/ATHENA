import type { StrokeData } from '../map/drawing';
import {
  setStrokeFinalizedCallback,
  setStrokesErasedCallback,
  addRemoteStroke,
  removeStrokeById,
  clearAllStrokes,
} from '../map/drawing';
import { toMapPoint } from '../data/coords';
import { hexEntityData, hexDrawingData } from '../data/store';
import { session } from './sessionManager';
import type { StrokeEntity, ServerBroadcast, Entity } from './protocol';

function toEntityCreate(stroke: StrokeData, hexId: string): Omit<StrokeEntity, 'authorId'> {
  return {
    id: stroke.id || crypto.randomUUID(),
    hexId,
    entityType: 'stroke',
    points: stroke.points.map((p) => [p.x, p.y] as [number, number]),
    color: stroke.color,
    weight: stroke.weight,
    opacity: stroke.opacity,
  };
}

function fromStrokeEntity(entity: StrokeEntity): StrokeData {
  return {
    id: entity.id,
    points: entity.points.map(([x, y]) => toMapPoint(x, y)),
    color: entity.color,
    weight: entity.weight,
    opacity: entity.opacity,
  };
}

export function initDrawingSync(): void {
  // Outbound: local drawing actions → server
  setStrokeFinalizedCallback((stroke, hexId) => {
    if (!session.connected) return;
    session.sendEntityCreate(toEntityCreate(stroke, hexId));
  });

  setStrokesErasedCallback((strokeIds, hexId) => {
    if (!session.connected) return;
    for (const id of strokeIds) {
      session.sendEntityDelete(hexId, id);
    }
  });
}

function cacheStroke(entity: StrokeEntity): void {
  if (!hexEntityData[entity.hexId]) hexEntityData[entity.hexId] = [];
  hexEntityData[entity.hexId].push(entity);

  // Also update legacy drawing cache used by detailView save/restore
  if (!hexDrawingData[entity.hexId]) hexDrawingData[entity.hexId] = [];
  hexDrawingData[entity.hexId].push({
    id: entity.id,
    points: entity.points,
    color: entity.color,
    weight: entity.weight,
    opacity: entity.opacity,
  });
}

function removeCachedStroke(hexId: string, entityId: string): void {
  const cached = hexEntityData[hexId];
  if (cached) {
    const idx = cached.findIndex(e => e.id === entityId);
    if (idx !== -1) cached.splice(idx, 1);
  }

  const drawings = hexDrawingData[hexId];
  if (drawings) {
    const idx = drawings.findIndex(s => s.id === entityId);
    if (idx !== -1) drawings.splice(idx, 1);
  }
}

export function handleDrawingBroadcast(
  msg: ServerBroadcast | Record<string, any>,
  currentHexId: string,
): void {
  const data = (msg as any).payload ?? msg;

  switch (msg.type) {
    case 'entity-create': {
      const entity = data.entity as StrokeEntity;
      if (entity.entityType !== 'stroke') return;
      if (entity.hexId === currentHexId) {
        addRemoteStroke(fromStrokeEntity(entity));
      } else {
        cacheStroke(entity);
      }
      break;
    }
    case 'entity-delete': {
      const hexId = data.hexId as string;
      const entityId = data.entityId as string;
      if (hexId === currentHexId) {
        removeStrokeById(entityId);
      } else {
        removeCachedStroke(hexId, entityId);
      }
      break;
    }
    case 'entity-clear': {
      const hexId = data.hexId as string;
      const entityType = data.entityType as string | undefined;
      if (!entityType || entityType === 'stroke') {
        if (hexId === currentHexId) {
          clearAllStrokes();
        } else {
          if (entityType) {
            const cached = hexEntityData[hexId];
            if (cached) {
              hexEntityData[hexId] = cached.filter(e => e.entityType !== 'stroke');
            }
            delete hexDrawingData[hexId];
          } else {
            delete hexEntityData[hexId];
            delete hexDrawingData[hexId];
          }
        }
      }
      break;
    }
  }
}
