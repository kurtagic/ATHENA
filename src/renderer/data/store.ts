import type { StaticLabel, MapItem } from '../../shared/types';
import type { Entity, EntityType } from '../multiplayer/protocol';

// Data caches shared between dataHandlers and detailView
export const hexStaticData: Record<string, StaticLabel[]> = {};
export const hexDynamicData: Record<string, MapItem[]> = {};

// Per-hex drawing and artillery state caches (survive view transitions)
export interface SavedStroke {
  id?: string;
  points: [number, number][];
  color: string;
  weight: number;
  opacity: number;
}

export interface SavedArtilleryState {
  positions: { id: number; latlng: [number, number]; label: string; platformIndex?: number }[];
  target: [number, number] | null;
  impact: [number, number] | null;
  mainGunIndex: number;
  defaultPlatformIndex: number;
  nextId: number;
  nextLabelNum: number;
}

// Unified entity cache
export const hexEntityData: Record<string, Entity[]> = {};

// Legacy caches — kept for save/restore in drawing.ts and artillery.ts
export const hexDrawingData: Record<string, SavedStroke[]> = {};
export const hexArtilleryData: Record<string, SavedArtilleryState> = {};

// Helper functions for entity cache
export function getEntitiesByType<T extends Entity>(hexId: string, type: EntityType): T[] {
  const entities = hexEntityData[hexId];
  if (!entities) return [];
  return entities.filter(e => e.entityType === type) as T[];
}

export function getEntity(hexId: string, entityId: string): Entity | undefined {
  const entities = hexEntityData[hexId];
  if (!entities) return undefined;
  return entities.find(e => e.id === entityId);
}
