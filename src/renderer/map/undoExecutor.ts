import { useUndoStore, type UndoableAction } from '../stores/undoStore';
import { useMapStore } from '../stores/mapStore';
import { removeStrokeById, addRemoteStroke } from './drawing';
import { toMapPoint } from '../data/coords';
import {
  undoRemoveGunByEntityId,
  undoAddGun,
  undoSetTarget,
  undoSetImpact,
  undoMoveGun,
  undoMoveTarget,
  undoMoveImpact,
  setSuppressUndoPush,
} from './artillery';
import {
  syncGunCreate,
  syncGunDelete,
  syncGunUpdate,
  syncTargetSet,
  syncTargetDelete,
  syncTargetUpdate,
  syncImpactSet,
  syncImpactDelete,
  syncImpactUpdate,
} from '../multiplayer/artillerySync';
import {
  syncEnemyMarkerCreate,
  syncEnemyMarkerDelete,
  syncEnemyMarkerUpdate,
} from '../multiplayer/enemyMarkerSync';
import {
  undoPlaceEnemyMarker,
  undoRemoveEnemyMarker,
  undoMoveEnemyMarker,
} from './enemyMarkers';
import { getHexMap } from '../multiplayer/yjsSync';
import { debugLog } from '../stores/debugStore';

function getMap() {
  return useMapStore.getState().mapInstance;
}

function undoAction(action: UndoableAction): void {
  const map = getMap();
  if (!map) return;

  switch (action.type) {
    case 'stroke-added': {
      removeStrokeById(action.stroke.id);
      const hexMap = getHexMap('strokes', action.hexId);
      if (hexMap) {
        hexMap.delete(action.stroke.id);
        debugLog('yjs', `Undo stroke-added (deleted) in ${action.hexId}: ${action.stroke.id}`);
      }
      break;
    }

    case 'strokes-erased': {
      for (const s of action.strokes) {
        addRemoteStroke({
          id: s.id,
          points: s.points.map(([x, y]) => toMapPoint(x, y)),
          color: s.color,
          weight: s.weight,
          opacity: s.opacity,
          brushPattern: s.brushPattern,
        });
        const hexMap = getHexMap('strokes', action.hexId);
        if (hexMap) {
          hexMap.set(s.id, {
            points: s.points,
            color: s.color,
            weight: s.weight,
            opacity: s.opacity,
            brushPattern: s.brushPattern,
          });
          debugLog('yjs', `Undo strokes-erased (restored) in ${action.hexId}: ${s.id}`);
        }
      }
      break;
    }

    case 'gun-added': {
      setSuppressUndoPush(true);
      undoRemoveGunByEntityId(action.gun.entityId, map);
      setSuppressUndoPush(false);
      if (action.hexId) syncGunDelete(action.hexId, action.gun.entityId);
      break;
    }

    case 'gun-removed': {
      setSuppressUndoPush(true);
      undoAddGun(action.gun.entityId, action.gun.position, action.gun.label, action.gun.platformIndex, action.gun.wasMain, map);
      setSuppressUndoPush(false);
      if (action.hexId) syncGunCreate(action.hexId, {
        entityId: action.gun.entityId,
        position: action.gun.position,
        label: action.gun.label,
        platformIndex: action.gun.platformIndex ?? 0,
        isMain: action.gun.wasMain,
      });
      break;
    }

    case 'gun-moved': {
      undoMoveGun(action.entityId, action.from, map);
      if (action.hexId) syncGunUpdate(action.hexId, action.entityId, { position: action.from });
      break;
    }

    case 'target-set': {
      // Remove current target (and impact if it was cleared)
      if (action.entityId && action.hexId) syncTargetDelete(action.hexId, action.entityId);
      // Restore previous target/impact if they existed
      if (action.prevTarget) {
        const entityId = action.prevTargetEntityId ?? crypto.randomUUID();
        undoSetTarget(action.prevTarget, entityId, map);
        if (action.hexId) syncTargetSet(action.hexId, entityId, action.prevTarget);
        if (action.prevImpact) {
          const impEntityId = action.prevImpactEntityId ?? crypto.randomUUID();
          undoSetImpact(action.prevImpact, impEntityId, map);
          if (action.hexId) syncImpactSet(action.hexId, impEntityId, action.prevImpact);
        }
      } else {
        undoSetTarget(null, null, map);
        undoSetImpact(null, null, map);
      }
      break;
    }

    case 'target-moved': {
      undoMoveTarget(action.from, action.impactFrom, map);
      if (action.hexId && action.entityId) syncTargetUpdate(action.hexId, action.entityId, { position: action.from });
      if (action.hexId && action.impactEntityId && action.impactFrom) {
        syncImpactUpdate(action.hexId, action.impactEntityId, { position: action.impactFrom });
      }
      break;
    }

    case 'impact-set': {
      if (action.entityId && action.hexId) syncImpactDelete(action.hexId, action.entityId);
      if (action.prevImpact) {
        const entityId = action.prevImpactEntityId ?? crypto.randomUUID();
        undoSetImpact(action.prevImpact, entityId, map);
        if (action.hexId) syncImpactSet(action.hexId, entityId, action.prevImpact);
      } else {
        undoSetImpact(null, null, map);
      }
      break;
    }

    case 'impact-moved': {
      undoMoveImpact(action.from, map);
      if (action.hexId && action.entityId) syncImpactUpdate(action.hexId, action.entityId, { position: action.from });
      break;
    }

    case 'enemy-marker-added': {
      undoRemoveEnemyMarker(action.entityId, map);
      if (action.hexId) syncEnemyMarkerDelete(action.hexId, action.entityId);
      break;
    }

    case 'enemy-marker-removed': {
      undoPlaceEnemyMarker(action.entityId, action.position, action.platformIndex, map);
      if (action.hexId) syncEnemyMarkerCreate(action.hexId, {
        entityId: action.entityId,
        position: action.position,
        platformIndex: action.platformIndex,
        label: action.label,
      });
      break;
    }

    case 'enemy-marker-moved': {
      undoMoveEnemyMarker(action.entityId, action.from, map);
      if (action.hexId) syncEnemyMarkerUpdate(action.hexId, action.entityId, { position: action.from });
      break;
    }
  }
}

function redoAction(action: UndoableAction): void {
  const map = getMap();
  if (!map) return;

  switch (action.type) {
    case 'stroke-added': {
      addRemoteStroke({
        id: action.stroke.id,
        points: action.stroke.points.map(([x, y]) => toMapPoint(x, y)),
        color: action.stroke.color,
        weight: action.stroke.weight,
        opacity: action.stroke.opacity,
        brushPattern: action.stroke.brushPattern,
      });
      const hexMap2 = getHexMap('strokes', action.hexId);
      if (hexMap2) {
        hexMap2.set(action.stroke.id, {
          points: action.stroke.points,
          color: action.stroke.color,
          weight: action.stroke.weight,
          opacity: action.stroke.opacity,
          brushPattern: action.stroke.brushPattern,
        });
        debugLog('yjs', `Redo stroke-added (restored) in ${action.hexId}: ${action.stroke.id}`);
      }
      break;
    }

    case 'strokes-erased': {
      for (const s of action.strokes) {
        removeStrokeById(s.id);
        const hexMap3 = getHexMap('strokes', action.hexId);
        if (hexMap3) {
          hexMap3.delete(s.id);
          debugLog('yjs', `Redo strokes-erased (deleted) in ${action.hexId}: ${s.id}`);
        }
      }
      break;
    }

    case 'gun-added': {
      setSuppressUndoPush(true);
      undoAddGun(action.gun.entityId, action.gun.position, action.gun.label, action.gun.platformIndex, action.gun.wasMain, map);
      setSuppressUndoPush(false);
      if (action.hexId) syncGunCreate(action.hexId, {
        entityId: action.gun.entityId,
        position: action.gun.position,
        label: action.gun.label,
        platformIndex: action.gun.platformIndex ?? 0,
        isMain: action.gun.wasMain,
      });
      break;
    }

    case 'gun-removed': {
      setSuppressUndoPush(true);
      undoRemoveGunByEntityId(action.gun.entityId, map);
      setSuppressUndoPush(false);
      if (action.hexId) syncGunDelete(action.hexId, action.gun.entityId);
      break;
    }

    case 'gun-moved': {
      undoMoveGun(action.entityId, action.to, map);
      if (action.hexId) syncGunUpdate(action.hexId, action.entityId, { position: action.to });
      break;
    }

    case 'target-set': {
      // Delete previous target/impact if they existed
      if (action.prevTargetEntityId && action.hexId) syncTargetDelete(action.hexId, action.prevTargetEntityId);
      if (action.prevImpactEntityId && action.hexId) syncImpactDelete(action.hexId, action.prevImpactEntityId);
      // Set the new target
      undoSetTarget(action.position, action.entityId, map);
      undoSetImpact(null, null, map);
      if (action.hexId) syncTargetSet(action.hexId, action.entityId, action.position);
      break;
    }

    case 'target-moved': {
      undoMoveTarget(action.to, action.impactTo, map);
      if (action.hexId && action.entityId) syncTargetUpdate(action.hexId, action.entityId, { position: action.to });
      if (action.hexId && action.impactEntityId && action.impactTo) {
        syncImpactUpdate(action.hexId, action.impactEntityId, { position: action.impactTo });
      }
      break;
    }

    case 'impact-set': {
      if (action.prevImpactEntityId && action.hexId) syncImpactDelete(action.hexId, action.prevImpactEntityId);
      undoSetImpact(action.position, action.entityId, map);
      if (action.hexId) syncImpactSet(action.hexId, action.entityId, action.position);
      break;
    }

    case 'impact-moved': {
      undoMoveImpact(action.to, map);
      if (action.hexId && action.entityId) syncImpactUpdate(action.hexId, action.entityId, { position: action.to });
      break;
    }

    case 'enemy-marker-added': {
      undoPlaceEnemyMarker(action.entityId, action.position, action.platformIndex, map);
      if (action.hexId) syncEnemyMarkerCreate(action.hexId, {
        entityId: action.entityId,
        position: action.position,
        platformIndex: action.platformIndex,
        label: action.label,
      });
      break;
    }

    case 'enemy-marker-removed': {
      undoRemoveEnemyMarker(action.entityId, map);
      if (action.hexId) syncEnemyMarkerDelete(action.hexId, action.entityId);
      break;
    }

    case 'enemy-marker-moved': {
      undoMoveEnemyMarker(action.entityId, action.to, map);
      if (action.hexId) syncEnemyMarkerUpdate(action.hexId, action.entityId, { position: action.to });
      break;
    }
  }
}

export function executeUndo(hexId: string): void {
  const action = useUndoStore.getState().popUndo(hexId);
  if (!action) return;
  undoAction(action);
}

export function executeRedo(hexId: string): void {
  const action = useUndoStore.getState().popRedo(hexId);
  if (!action) return;
  redoAction(action);
}
