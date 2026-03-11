import {
  restoreArtilleryState,
  addRemoteGun,
  updateRemoteGun,
  removeRemoteGun,
  setRemoteTarget,
  removeRemoteTarget,
  setRemoteImpact,
  removeRemoteImpact,
} from '../map/artillery';
import type { SavedArtilleryState } from '../data/store';
import { DEFAULT_PLATFORM_INDEX } from '../data/artilleryPlatforms';
import { hexEntityData, hexArtilleryData } from '../data/store';
import { useMapStore } from '../stores/mapStore';
import { useArtilleryStore } from '../stores/artilleryStore';
import { session } from './sessionManager';
import type {
  Entity,
  ArtilleryPlatformEntity,
  ArtilleryTargetEntity,
  ArtilleryImpactEntity,
  ArtilleryWindEntity,
} from './protocol';

// ── Granular outbound sync functions ──

export function syncGunCreate(
  hexId: string,
  entity: { entityId: string; position: [number, number]; label: string; platformIndex?: number; isMain: boolean },
): void {
  if (!session.connected) return;
  session.sendEntityCreate({
    id: entity.entityId,
    hexId,
    entityType: 'artillery-platform',
    position: entity.position,
    label: entity.label,
    platformIndex: entity.platformIndex,
    isMain: entity.isMain,
  } as Omit<ArtilleryPlatformEntity, 'authorId'>);
}

export function syncGunDelete(hexId: string, entityId: string): void {
  if (!session.connected) return;
  session.sendEntityDelete(hexId, entityId);
}

export function syncGunUpdate(hexId: string, entityId: string, changes: Record<string, unknown>): void {
  if (!session.connected) return;
  session.sendEntityUpdate(hexId, entityId, 'artillery-platform', changes);
}

export function syncTargetSet(hexId: string, entityId: string, position: [number, number]): void {
  if (!session.connected) return;
  session.sendEntityCreate({
    id: entityId,
    hexId,
    entityType: 'artillery-target',
    position,
  } as Omit<ArtilleryTargetEntity, 'authorId'>);
}

export function syncTargetDelete(hexId: string, entityId: string): void {
  if (!session.connected) return;
  session.sendEntityDelete(hexId, entityId);
}

export function syncImpactSet(hexId: string, entityId: string, position: [number, number]): void {
  if (!session.connected) return;
  session.sendEntityCreate({
    id: entityId,
    hexId,
    entityType: 'artillery-impact',
    position,
  } as Omit<ArtilleryImpactEntity, 'authorId'>);
}

export function syncImpactDelete(hexId: string, entityId: string): void {
  if (!session.connected) return;
  session.sendEntityDelete(hexId, entityId);
}

export function syncArtilleryClearAll(hexId: string): void {
  if (!session.connected) return;
  session.sendEntityClear(hexId, 'artillery-platform');
  session.sendEntityClear(hexId, 'artillery-target');
  session.sendEntityClear(hexId, 'artillery-impact');
  session.sendEntityClear(hexId, 'artillery-wind');
}

export function syncWindOnly(windDirection: number | null, windStrength: number, hexId: string): void {
  if (!session.connected) return;
  session.sendEntityClear(hexId, 'artillery-wind');
  if (windDirection !== null && windStrength > 0) {
    session.sendEntityCreate({
      id: crypto.randomUUID(),
      hexId,
      entityType: 'artillery-wind',
      windDirection,
      windStrength,
    } as Omit<ArtilleryWindEntity, 'authorId'>);
  }
}

// ── Entity → State conversion (used for full-snapshot restore and entity-clear rebuild) ──

export function entitiesToArtilleryState(entities: Entity[]): SavedArtilleryState {
  const platforms = entities.filter(e => e.entityType === 'artillery-platform') as ArtilleryPlatformEntity[];
  const targets = entities.filter(e => e.entityType === 'artillery-target') as ArtilleryTargetEntity[];
  const impacts = entities.filter(e => e.entityType === 'artillery-impact') as ArtilleryImpactEntity[];
  const winds = entities.filter(e => e.entityType === 'artillery-wind') as ArtilleryWindEntity[];

  let mainGunIndex = 0;
  const positions = platforms.map((p, i) => {
    if (p.isMain) mainGunIndex = i;
    return {
      id: i + 1,
      latlng: p.position,
      label: p.label,
      platformIndex: p.platformIndex,
      entityId: p.id,
    };
  });

  const lastTarget = targets.length > 0 ? targets[targets.length - 1] : null;
  const lastImpact = impacts.length > 0 ? impacts[impacts.length - 1] : null;
  const wind = winds.length > 0 ? winds[winds.length - 1] : null;

  return {
    positions,
    target: lastTarget ? lastTarget.position : null,
    impact: lastImpact ? lastImpact.position : null,
    mainGunIndex,
    defaultPlatformIndex: DEFAULT_PLATFORM_INDEX,
    nextId: positions.length + 1,
    nextLabelNum: positions.length + 1,
    targetEntityId: lastTarget ? lastTarget.id : null,
    impactEntityId: lastImpact ? lastImpact.id : null,
    windDirection: wind ? wind.windDirection : undefined,
    windStrength: wind ? wind.windStrength : undefined,
  };
}

// ── Init (no-op now — no callback to register) ──

export function initArtillerySync(): void {
  // Granular sync is wired directly in artillery.ts mutation points
}

export function cleanupArtillerySync(): void {
  // No callback to clean up
}

// ── Cache helpers ──

function isArtilleryType(entityType: string): boolean {
  return entityType === 'artillery-platform' || entityType === 'artillery-target' || entityType === 'artillery-impact' || entityType === 'artillery-wind';
}

function cacheEntity(entity: Entity): void {
  if (!hexEntityData[entity.hexId]) hexEntityData[entity.hexId] = [];
  hexEntityData[entity.hexId].push(entity);
  syncLegacyArtilleryCache(entity.hexId);
}

function removeCachedEntity(hexId: string, entityId: string): void {
  const cached = hexEntityData[hexId];
  if (cached) {
    const idx = cached.findIndex(e => e.id === entityId);
    if (idx !== -1) cached.splice(idx, 1);
  }
  syncLegacyArtilleryCache(hexId);
}

function updateCachedEntity(hexId: string, entityId: string, changes: Record<string, unknown>): void {
  const cached = hexEntityData[hexId];
  if (cached) {
    const entity = cached.find(e => e.id === entityId);
    if (entity) Object.assign(entity, changes);
  }
  syncLegacyArtilleryCache(hexId);
}

function syncLegacyArtilleryCache(hexId: string): void {
  const cached = hexEntityData[hexId] || [];
  const artilleryEntities = cached.filter(e => isArtilleryType(e.entityType));
  if (artilleryEntities.length > 0) {
    hexArtilleryData[hexId] = entitiesToArtilleryState(artilleryEntities);
  } else {
    delete hexArtilleryData[hexId];
  }
}

function rebuildArtilleryFromCache(hexId: string): void {
  const map = useMapStore.getState().mapInstance;
  if (!map) return;

  const cached = hexEntityData[hexId] || [];
  const artilleryEntities = cached.filter(e => isArtilleryType(e.entityType));
  if (artilleryEntities.length > 0) {
    const savedState = entitiesToArtilleryState(artilleryEntities);
    restoreArtilleryState(savedState, map);
  } else {
    // Empty state — restore clean
    restoreArtilleryState({
      positions: [],
      target: null,
      impact: null,
      mainGunIndex: 0,
      defaultPlatformIndex: DEFAULT_PLATFORM_INDEX,
      nextId: 1,
      nextLabelNum: 1,
      targetEntityId: null,
      impactEntityId: null,
    }, map);
  }
}

// ── Granular inbound handler ──

export function handleArtilleryBroadcast(
  msg: Record<string, any>,
  currentHexId: string,
): void {
  const data = msg.payload ?? msg;
  const map = useMapStore.getState().mapInstance;

  switch (msg.type) {
    case 'entity-create': {
      const entity = data.entity as Entity;
      if (!isArtilleryType(entity.entityType)) return;

      cacheEntity(entity);

      if (entity.hexId === currentHexId && map) {
        switch (entity.entityType) {
          case 'artillery-platform': {
            const p = entity as ArtilleryPlatformEntity;
            addRemoteGun(map, p.id, p.position, p.label, p.platformIndex, p.isMain);
            break;
          }
          case 'artillery-target': {
            const t = entity as ArtilleryTargetEntity;
            setRemoteTarget(map, t.id, t.position);
            break;
          }
          case 'artillery-impact': {
            const i = entity as ArtilleryImpactEntity;
            setRemoteImpact(map, i.id, i.position);
            break;
          }
          case 'artillery-wind': {
            const w = entity as ArtilleryWindEntity;
            useArtilleryStore.getState().setWind(w.windDirection, w.windStrength);
            // Wind changes need a full refresh to recalculate solutions
            rebuildArtilleryFromCache(entity.hexId);
            break;
          }
        }
      }
      break;
    }
    case 'entity-update': {
      const hexId = data.hexId as string;
      const entityId = data.entityId as string;
      const changes = data.changes as Record<string, unknown>;
      const entityType = data.entityType as string;

      if (!isArtilleryType(entityType)) return;

      updateCachedEntity(hexId, entityId, changes);

      if (hexId === currentHexId && map) {
        if (entityType === 'artillery-platform') {
          updateRemoteGun(map, entityId, changes);
        }
        // target/impact/wind don't have update semantics — they use delete+create
      }
      break;
    }
    case 'entity-delete': {
      const hexId = data.hexId as string;
      const entityId = data.entityId as string;

      const cached = hexEntityData[hexId];
      if (!cached) return;
      const entity = cached.find(e => e.id === entityId);
      if (!entity || !isArtilleryType(entity.entityType)) return;

      const entityType = entity.entityType;
      removeCachedEntity(hexId, entityId);

      if (hexId === currentHexId && map) {
        switch (entityType) {
          case 'artillery-platform':
            removeRemoteGun(map, entityId);
            break;
          case 'artillery-target':
            removeRemoteTarget(map);
            break;
          case 'artillery-impact':
            removeRemoteImpact(map);
            break;
        }
      }
      break;
    }
    case 'entity-clear': {
      const hexId = data.hexId as string;
      const entityType = data.entityType as string | undefined;

      if (entityType && !isArtilleryType(entityType)) return;

      if (entityType) {
        const cached = hexEntityData[hexId];
        if (cached) {
          hexEntityData[hexId] = cached.filter(e => e.entityType !== entityType);
        }
      }

      syncLegacyArtilleryCache(hexId);

      if (hexId === currentHexId) {
        rebuildArtilleryFromCache(hexId);
      }
      break;
    }
  }
}
