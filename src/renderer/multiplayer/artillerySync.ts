import * as Y from 'yjs';
import {
  restoreArtilleryState,
  addRemoteGun,
  updateRemoteGun,
  removeRemoteGun,
  setRemoteTarget,
  removeRemoteTarget,
  setRemoteImpact,
  removeRemoteImpact,
  updateRemoteTarget,
  updateRemoteImpact,
  scheduleWindRefresh,
  refreshPinnedFromCache,
} from '../map/artillery';
import type { SavedArtilleryState } from '../data/store';
import { DEFAULT_PLATFORM_INDEX } from '../data/artilleryPlatforms';
import { hexArtilleryData } from '../data/store';
import { useMapStore } from '../stores/mapStore';
import { useArtilleryStore } from '../stores/artilleryStore';
import { getRootMap, getHexMap } from './yjsSync';
import { minimapNotify } from './minimapNotify';
import { debugLog } from '../stores/debugStore';

// ── Granular outbound sync functions ──

export function syncGunCreate(
  hexId: string,
  entity: { entityId: string; position: [number, number]; label: string; platformIndex?: number; isMain: boolean },
): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  hexMap.set(entity.entityId, {
    type: 'platform',
    position: entity.position,
    label: entity.label,
    platformIndex: entity.platformIndex,
    isMain: entity.isMain,
  });
  debugLog('yjs', `Gun created in ${hexId}: ${entity.entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncGunDelete(hexId: string, entityId: string): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  hexMap.delete(entityId);
  debugLog('yjs', `Gun deleted in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncGunUpdate(hexId: string, entityId: string, changes: Record<string, unknown>): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  const current = hexMap.get(entityId);
  if (!current) return;
  hexMap.set(entityId, { ...current, ...changes });
  debugLog('yjs', `Gun updated in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncTargetSet(hexId: string, entityId: string, position: [number, number]): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  hexMap.set(entityId, { type: 'target', position });
  debugLog('yjs', `Target set in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncTargetDelete(hexId: string, entityId: string): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  hexMap.delete(entityId);
  debugLog('yjs', `Target deleted in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncTargetUpdate(hexId: string, entityId: string, changes: Record<string, unknown>): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  const current = hexMap.get(entityId);
  if (!current) return;
  hexMap.set(entityId, { ...current, ...changes });
  debugLog('yjs', `Target updated in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncImpactSet(hexId: string, entityId: string, position: [number, number]): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  hexMap.set(entityId, { type: 'impact', position });
  debugLog('yjs', `Impact set in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncImpactDelete(hexId: string, entityId: string): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  hexMap.delete(entityId);
  debugLog('yjs', `Impact deleted in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncImpactUpdate(hexId: string, entityId: string, changes: Record<string, unknown>): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  const current = hexMap.get(entityId);
  if (!current) return;
  hexMap.set(entityId, { ...current, ...changes });
  debugLog('yjs', `Impact updated in ${hexId}: ${entityId}`);
  minimapNotify('artillery', hexId);
}

export function syncArtilleryClearAll(hexId: string): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  const keys = Array.from(hexMap.keys());
  for (const key of keys) {
    hexMap.delete(key);
  }
  debugLog('yjs', `Artillery cleared in ${hexId}`);
  minimapNotify('artillery', hexId);
}

export function syncWindOnly(windDirection: number | null, windStrength: number, hexId: string): void {
  const hexMap = getHexMap('artillery', hexId);
  if (!hexMap) return;
  // Remove existing wind entries
  for (const [key, value] of hexMap.entries()) {
    if (value && value.type === 'wind') {
      hexMap.delete(key);
    }
  }
  if (windDirection !== null && windStrength > 0) {
    hexMap.set('wind', { type: 'wind', direction: windDirection, strength: windStrength });
  }
  debugLog('yjs', `Wind set in ${hexId}: dir=${windDirection} str=${windStrength}`);
  minimapNotify('artillery', hexId);
}

// ── Observer ──

let observer: ((events: Y.YEvent<any>[], tx: Y.Transaction) => void) | null = null;

export function setupArtilleryObserver(): void {
  teardownArtilleryObserver();

  const artilleryMap = getRootMap('artillery');
  if (!artilleryMap) return;

  observer = (events: Y.YEvent<any>[], transaction: Y.Transaction) => {
    if (transaction.local) return;

    const currentHexId = useMapStore.getState().detailMode?.apiName || '';
    const map = useMapStore.getState().mapInstance;

    for (const event of events) {
      if (!(event instanceof Y.YMapEvent)) continue;

      // Skip root-level hex map additions/removals
      if (event.target === artilleryMap) continue;

      const hexId = findHexId(artilleryMap, event.target as Y.Map<any>);
      if (!hexId) continue;

      event.changes.keys.forEach((change, entityId) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = (event.target as Y.Map<any>).get(entityId);
          if (!data) return;

          if (hexId === currentHexId && map) {
            applyRemoteAdd(map, entityId, data, change.action);
          } else {
            // Update off-screen cache
            updateArtilleryCache(hexId);
          }
          debugLog('yjs', `Remote artillery ${change.action} in ${hexId}: ${entityId} (${data.type})`);
          minimapNotify('artillery', hexId);
        } else if (change.action === 'delete') {
          const oldData = change.oldValue;
          if (hexId === currentHexId && map) {
            applyRemoteDelete(map, entityId, oldData);
          } else {
            updateArtilleryCache(hexId);
          }
          debugLog('yjs', `Remote artillery delete in ${hexId}: ${entityId} (${oldData?.type})`);
          minimapNotify('artillery', hexId);
        }
      });
    }
  };

  artilleryMap.observeDeep(observer);
  debugLog('yjs', 'Artillery observer attached');
}

export function teardownArtilleryObserver(): void {
  if (observer) {
    const artilleryMap = getRootMap('artillery');
    if (artilleryMap) {
      artilleryMap.unobserveDeep(observer);
    }
    observer = null;
    debugLog('yjs', 'Artillery observer detached');
  }
}

function applyRemoteAdd(map: maplibregl.Map, entityId: string, data: any, action: string): void {
  switch (data.type) {
    case 'platform': {
      if (action === 'update') {
        updateRemoteGun(map, entityId, data);
      } else {
        addRemoteGun(map, entityId, data.position, data.label, data.platformIndex, data.isMain);
      }
      break;
    }
    case 'target': {
      if (action === 'update') {
        updateRemoteTarget(map, entityId, data);
      } else {
        setRemoteTarget(map, entityId, data.position);
      }
      break;
    }
    case 'impact': {
      if (action === 'update') {
        updateRemoteImpact(map, entityId, data);
      } else {
        setRemoteImpact(map, entityId, data.position);
      }
      break;
    }
    case 'wind': {
      useArtilleryStore.getState().setWind(data.direction, data.strength);
      scheduleWindRefresh(map);
      break;
    }
  }
}

function applyRemoteDelete(map: maplibregl.Map, entityId: string, oldData: any): void {
  if (!oldData) return;
  switch (oldData.type) {
    case 'platform':
      removeRemoteGun(map, entityId);
      break;
    case 'target':
      removeRemoteTarget(map);
      break;
    case 'impact':
      removeRemoteImpact(map);
      break;
    case 'wind':
      useArtilleryStore.getState().setWind(null, 0);
      scheduleWindRefresh(map);
      break;
  }
}

// ── Load function ──

export function loadHexArtillery(hexId: string): SavedArtilleryState | null {
  const artilleryMap = getRootMap('artillery');
  if (!artilleryMap || !artilleryMap.has(hexId)) return null;

  const hexMap = artilleryMap.get(hexId) as Y.Map<any>;
  const platforms: { entityId: string; position: [number, number]; label: string; platformIndex?: number; isMain: boolean }[] = [];
  let target: { entityId: string; position: [number, number] } | null = null;
  let impact: { entityId: string; position: [number, number] } | null = null;
  let wind: { direction: number | null; strength: number } | null = null as { direction: number | null; strength: number } | null;

  hexMap.forEach((data: any, entityId: string) => {
    switch (data.type) {
      case 'platform':
        platforms.push({
          entityId,
          position: data.position,
          label: data.label,
          platformIndex: data.platformIndex,
          isMain: data.isMain,
        });
        break;
      case 'target':
        target = { entityId, position: data.position };
        break;
      case 'impact':
        impact = { entityId, position: data.position };
        break;
      case 'wind':
        wind = { direction: data.direction, strength: data.strength };
        break;
    }
  });

  if (platforms.length === 0 && !target && !impact && !wind) return null;

  // Extract wind values here to avoid TS closure narrowing issue
  const windDirection = wind ? wind.direction : undefined;
  const windStrength = wind ? wind.strength : undefined;

  let mainGunIndex = 0;
  const positions = platforms.map((p, i) => {
    if (p.isMain) mainGunIndex = i;
    return {
      id: i + 1,
      latlng: p.position,
      label: p.label,
      platformIndex: p.platformIndex,
      entityId: p.entityId,
    };
  });

  return {
    positions,
    target: target ? (target as any).position : null,
    impact: impact ? (impact as any).position : null,
    mainGunIndex,
    defaultPlatformIndex: DEFAULT_PLATFORM_INDEX,
    nextId: positions.length + 1,
    nextLabelNum: positions.length + 1,
    targetEntityId: target ? (target as any).entityId : null,
    impactEntityId: impact ? (impact as any).entityId : null,
    windDirection,
    windStrength,
  };
}

// ── Cache helper ──

function updateArtilleryCache(hexId: string): void {
  const state = loadHexArtillery(hexId);
  if (state) {
    hexArtilleryData[hexId] = state;
    // If this hex has pinned artillery, recompute pinned solutions for PIP
    const pinnedHexId = useArtilleryStore.getState().pinnedHexId;
    if (pinnedHexId === hexId) {
      refreshPinnedFromCache(state);
    }
  } else {
    delete hexArtilleryData[hexId];
  }
}

// ── Helpers ──

function findHexId(root: Y.Map<Y.Map<any>>, target: Y.Map<any>): string | null {
  for (const [hexId, hexMap] of root.entries()) {
    if (hexMap === target) return hexId;
  }
  return null;
}
