import * as Y from 'yjs';
import {
  addRemoteEnemyMarker,
  removeRemoteEnemyMarker,
  updateRemoteEnemyMarker,
} from '../map/enemyMarkers';
import { useMapStore } from '../stores/mapStore';
import { getRootMap, getHexMap } from './yjsSync';
import { minimapNotify } from './minimapNotify';
import { debugLog } from '../stores/debugStore';

// ── Outbound sync ──

export function syncEnemyMarkerCreate(
  hexId: string,
  entity: { entityId: string; position: [number, number]; platformIndex: number; label: string },
): void {
  const hexMap = getHexMap('enemy-markers', hexId);
  if (!hexMap) return;
  hexMap.set(entity.entityId, {
    type: 'enemy-marker',
    position: entity.position,
    platformIndex: entity.platformIndex,
    label: entity.label,
  });
  debugLog('yjs', `Enemy marker created in ${hexId}: ${entity.entityId}`);
  minimapNotify('enemies', hexId);
}

export function syncEnemyMarkerDelete(hexId: string, entityId: string): void {
  const hexMap = getHexMap('enemy-markers', hexId);
  if (!hexMap) return;
  hexMap.delete(entityId);
  debugLog('yjs', `Enemy marker deleted in ${hexId}: ${entityId}`);
  minimapNotify('enemies', hexId);
}

export function syncEnemyMarkerUpdate(hexId: string, entityId: string, changes: Record<string, unknown>): void {
  const hexMap = getHexMap('enemy-markers', hexId);
  if (!hexMap) return;
  const current = hexMap.get(entityId);
  if (!current) return;
  hexMap.set(entityId, { ...current, ...changes });
  debugLog('yjs', `Enemy marker updated in ${hexId}: ${entityId}`);
  minimapNotify('enemies', hexId);
}

// ── Observer ──

let observer: ((events: Y.YEvent<any>[], tx: Y.Transaction) => void) | null = null;

export function setupEnemyMarkerObserver(): void {
  teardownEnemyMarkerObserver();

  const rootMap = getRootMap('enemy-markers');
  if (!rootMap) return;

  observer = (events: Y.YEvent<any>[], transaction: Y.Transaction) => {
    if (transaction.local) return;

    const currentHexId = useMapStore.getState().detailMode?.apiName || '';
    const map = useMapStore.getState().mapInstance;

    for (const event of events) {
      if (!(event instanceof Y.YMapEvent)) continue;
      if (event.target === rootMap) continue;

      const hexId = findHexId(rootMap, event.target as Y.Map<any>);
      if (!hexId) continue;

      event.changes.keys.forEach((change, entityId) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = (event.target as Y.Map<any>).get(entityId);
          if (!data || data.type !== 'enemy-marker') return;

          if (hexId === currentHexId && map) {
            if (change.action === 'update') {
              updateRemoteEnemyMarker(entityId, data, map);
            } else {
              addRemoteEnemyMarker(entityId, data, map);
            }
          }
          debugLog('yjs', `Remote enemy marker ${change.action} in ${hexId}: ${entityId}`);
          minimapNotify('enemies', hexId);
        } else if (change.action === 'delete') {
          if (hexId === currentHexId && map) {
            removeRemoteEnemyMarker(entityId, map);
          }
          debugLog('yjs', `Remote enemy marker delete in ${hexId}: ${entityId}`);
          minimapNotify('enemies', hexId);
        }
      });
    }
  };

  rootMap.observeDeep(observer);
  debugLog('yjs', 'Enemy marker observer attached');
}

export function teardownEnemyMarkerObserver(): void {
  if (observer) {
    const rootMap = getRootMap('enemy-markers');
    if (rootMap) {
      rootMap.unobserveDeep(observer);
    }
    observer = null;
    debugLog('yjs', 'Enemy marker observer detached');
  }
}

// ── Load function ──

export interface EnemyMarkerData {
  entityId: string;
  position: [number, number];
  platformIndex: number;
  label: string;
}

export function loadHexEnemyMarkers(hexId: string): EnemyMarkerData[] {
  const rootMap = getRootMap('enemy-markers');
  if (!rootMap || !rootMap.has(hexId)) return [];

  const hexMap = rootMap.get(hexId) as Y.Map<any>;
  const markers: EnemyMarkerData[] = [];

  hexMap.forEach((data: any, entityId: string) => {
    if (data.type === 'enemy-marker') {
      markers.push({
        entityId,
        position: data.position,
        platformIndex: data.platformIndex,
        label: data.label,
      });
    }
  });

  return markers;
}

// ── Helpers ──

function findHexId(root: Y.Map<Y.Map<any>>, target: Y.Map<any>): string | null {
  for (const [hexId, hexMap] of root.entries()) {
    if (hexMap === target) return hexId;
  }
  return null;
}
