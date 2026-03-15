import { create } from 'zustand';
import { DEFAULT_PLATFORM_INDEX } from '../data/artilleryPlatforms';

interface EnemyMarkerStoreState {
  selectedPlatformIndex: number;
  placingMarker: boolean;
  setSelectedPlatformIndex: (i: number) => void;
  setPlacingMarker: (v: boolean) => void;
}

export const useEnemyMarkerStore = create<EnemyMarkerStoreState>((set) => ({
  selectedPlatformIndex: DEFAULT_PLATFORM_INDEX,
  placingMarker: false,
  setSelectedPlatformIndex: (i) => set({ selectedPlatformIndex: i }),
  setPlacingMarker: (v) => set({ placingMarker: v }),
}));
