import { create } from 'zustand';

export type PlacementMode = 'idle' | 'placing-arty' | 'placing-target' | 'placing-impact';

export interface ArtillerySolution {
  posIndex: number;
  label: string;
  distanceM: number;
  azimuthDeg: number;
  inRange: boolean;
  platformName: string;
  platformIndex: number;
  relDist: number;
  relAz: number;
  isMain: boolean;
}

interface ArtilleryStoreState {
  placementMode: PlacementMode;
  platformIndex: number;
  statusText: string;
  solutions: ArtillerySolution[];
  hasTarget: boolean;
  setPlacementMode: (mode: PlacementMode) => void;
  setPlatformIndex: (index: number) => void;
  setSolutions: (solutions: ArtillerySolution[], hasTarget: boolean) => void;
  setStatusText: (text: string) => void;
}

export const useArtilleryStore = create<ArtilleryStoreState>((set) => ({
  placementMode: 'idle',
  platformIndex: 0,
  statusText: '',
  solutions: [],
  hasTarget: false,
  setPlacementMode: (mode) => set({ placementMode: mode }),
  setPlatformIndex: (index) => set({ platformIndex: index }),
  setSolutions: (solutions, hasTarget) => set({ solutions, hasTarget }),
  setStatusText: (text) => set({ statusText: text }),
}));
