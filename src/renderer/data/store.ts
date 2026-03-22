import type { StaticLabel, MapItem } from '../../shared/types';

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
  brushPattern?: string;
  isArrow?: boolean;
  stampType?: string;
  stampText?: string;
  measureType?: 'ruler' | 'circle';
  radius?: number;
}

export interface SavedArtilleryState {
  positions: { id: number; latlng: [number, number]; label: string; platformIndex?: number; entityId?: string }[];
  target: [number, number] | null;
  impact: [number, number] | null;
  mainGunIndex: number;
  defaultPlatformIndex: number;
  nextId: number;
  nextLabelNum: number;
  targetEntityId?: string | null;
  impactEntityId?: string | null;
  windDirection?: number | null;
  windStrength?: number;
}

export const hexDrawingData: Record<string, SavedStroke[]> = {};
export const hexArtilleryData: Record<string, SavedArtilleryState> = {};
export const hexEnemyMarkerData: Record<string, import('../map/enemyMarkers').SavedEnemyMarkerState> = {};

export function clearHexCaches(): void {
  for (const key of Object.keys(hexDrawingData)) delete hexDrawingData[key];
  for (const key of Object.keys(hexArtilleryData)) delete hexArtilleryData[key];
  for (const key of Object.keys(hexEnemyMarkerData)) delete hexEnemyMarkerData[key];
}
