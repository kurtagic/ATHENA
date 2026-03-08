import type { StaticLabel, MapItem } from '../../shared/types';

// Data caches shared between dataHandlers and detailView
export const hexStaticData: Record<string, StaticLabel[]> = {};
export const hexDynamicData: Record<string, MapItem[]> = {};

// Per-hex drawing and artillery state caches (survive view transitions)
export interface SavedStroke {
  points: [number, number][];
  color: string;
  weight: number;
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

export const hexDrawingData: Record<string, SavedStroke[]> = {};
export const hexArtilleryData: Record<string, SavedArtilleryState> = {};
