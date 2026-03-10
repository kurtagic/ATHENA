import {
  setArtilleryChangedCallback,
  restoreArtilleryState,
} from '../map/artillery';
import type { SavedArtilleryState } from '../data/store';
import { hexEntityData, hexArtilleryData } from '../data/store';
import { useMapStore } from '../stores/mapStore';
import { session } from './sessionManager';
import type {
  Entity,
  ArtilleryPlatformEntity,
  ArtilleryTargetEntity,
  ArtilleryImpactEntity,
  ArtilleryWindEntity,
} from './protocol';

// Convert SavedArtilleryState into entity create operations
function artilleryStateToEntities(state: SavedArtilleryState, hexId: string): Omit<Entity, 'authorId'>[] {
  const entities: Omit<Entity, 'authorId'>[] = [];

  for (let i = 0; i < state.positions.length; i++) {
    const pos = state.positions[i];
    entities.push({
      id: crypto.randomUUID(),
      hexId,
      entityType: 'artillery-platform',
      position: pos.latlng,
      label: pos.label,
      platformIndex: pos.platformIndex,
      isMain: i === state.mainGunIndex,
    } as Omit<ArtilleryPlatformEntity, 'authorId'>);
  }

  if (state.target) {
    entities.push({
      id: crypto.randomUUID(),
      hexId,
      entityType: 'artillery-target',
      position: state.target,
    } as Omit<ArtilleryTargetEntity, 'authorId'>);
  }

  if (state.impact) {
    entities.push({
      id: crypto.randomUUID(),
      hexId,
      entityType: 'artillery-impact',
      position: state.impact,
    } as Omit<ArtilleryImpactEntity, 'authorId'>);
  }

  if (state.windDirection !== undefined) {
    entities.push({
      id: crypto.randomUUID(),
      hexId,
      entityType: 'artillery-wind',
      windDirection: state.windDirection,
      windStrength: state.windStrength ?? 0,
    } as Omit<ArtilleryWindEntity, 'authorId'>);
  }

  return entities;
}

// Convert entities back to SavedArtilleryState
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
    };
  });

  const wind = winds.length > 0 ? winds[winds.length - 1] : null;

  return {
    positions,
    target: targets.length > 0 ? targets[targets.length - 1].position : null,
    impact: impacts.length > 0 ? impacts[impacts.length - 1].position : null,
    mainGunIndex,
    defaultPlatformIndex: 0,
    nextId: positions.length + 1,
    nextLabelNum: positions.length + 1,
    windDirection: wind ? wind.windDirection : undefined,
    windStrength: wind ? wind.windStrength : undefined,
  };
}

export function initArtillerySync(): void {
  setArtilleryChangedCallback((state, hexId) => {
    if (!session.connected) return;

    // Clear all artillery entities for this hex, then re-create
    session.sendEntityClear(hexId, 'artillery-platform');
    session.sendEntityClear(hexId, 'artillery-target');
    session.sendEntityClear(hexId, 'artillery-impact');
    session.sendEntityClear(hexId, 'artillery-wind');

    const entities = artilleryStateToEntities(state, hexId);
    for (const entity of entities) {
      session.sendEntityCreate(entity);
    }
  });
}

function isArtilleryType(entityType: string): boolean {
  return entityType === 'artillery-platform' || entityType === 'artillery-target' || entityType === 'artillery-impact' || entityType === 'artillery-wind';
}

function rebuildArtilleryFromCache(hexId: string): void {
  const map = useMapStore.getState().mapInstance;
  if (!map) return;

  const cached = hexEntityData[hexId] || [];
  const artilleryEntities = cached.filter(e => isArtilleryType(e.entityType));
  if (artilleryEntities.length > 0) {
    const savedState = entitiesToArtilleryState(artilleryEntities);
    restoreArtilleryState(savedState, map);
  }
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

function syncLegacyArtilleryCache(hexId: string): void {
  const cached = hexEntityData[hexId] || [];
  const artilleryEntities = cached.filter(e => isArtilleryType(e.entityType));
  if (artilleryEntities.length > 0) {
    hexArtilleryData[hexId] = entitiesToArtilleryState(artilleryEntities);
  } else {
    delete hexArtilleryData[hexId];
  }
}

export function handleArtilleryBroadcast(
  msg: Record<string, any>,
  currentHexId: string,
): void {
  const data = msg.payload ?? msg;

  switch (msg.type) {
    case 'entity-create': {
      const entity = data.entity as Entity;
      if (!isArtilleryType(entity.entityType)) return;

      cacheEntity(entity);
      if (entity.hexId === currentHexId) {
        rebuildArtilleryFromCache(entity.hexId);
      }
      break;
    }
    case 'entity-update': {
      const hexId = data.hexId as string;
      const entityId = data.entityId as string;
      const changes = data.changes as Record<string, unknown>;
      const entityType = data.entityType as string;

      if (!isArtilleryType(entityType)) return;

      const cached = hexEntityData[hexId];
      if (cached) {
        const entity = cached.find(e => e.id === entityId);
        if (entity) Object.assign(entity, changes);
      }

      if (hexId === currentHexId) {
        rebuildArtilleryFromCache(hexId);
      }
      break;
    }
    case 'entity-delete': {
      const hexId = data.hexId as string;
      const entityId = data.entityId as string;

      const cached = hexEntityData[hexId];
      if (cached) {
        const entity = cached.find(e => e.id === entityId);
        if (!entity || !isArtilleryType(entity.entityType)) return;
      }

      removeCachedEntity(hexId, entityId);

      if (hexId === currentHexId) {
        rebuildArtilleryFromCache(hexId);
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

export function cleanupArtillerySync(): void {
  setArtilleryChangedCallback(null);
}
