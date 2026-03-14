import { create } from 'zustand';
import { DEFAULT_PLATFORM_INDEX } from '../data/artilleryPlatforms';

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
  windDriftM: number;
  isPinned: boolean;
}

interface ArtilleryStoreState {
  placementMode: PlacementMode;
  platformIndex: number;
  statusText: string;
  solutions: ArtillerySolution[];
  hasTarget: boolean;
  hasImpact: boolean;
  windDirection: number | null;
  windStrength: number;
  pinnedGuns: Set<number>;
  pinnedHexId: string;
  pipVisible: boolean;
  showWarden: boolean;
  showColonial: boolean;
  showShips: boolean;
  setPlacementMode: (mode: PlacementMode) => void;
  setPlatformIndex: (index: number) => void;
  setSolutions: (solutions: ArtillerySolution[], hasTarget: boolean, hasImpact: boolean) => void;
  setStatusText: (text: string) => void;
  setWind: (direction: number | null, strength: number) => void;
  setPinnedHexId: (hexId: string) => void;
  togglePin: (posIndex: number) => void;
  setPipVisible: (visible: boolean) => void;
  toggleShowWarden: () => void;
  toggleShowColonial: () => void;
  toggleShowShips: () => void;
  reset: () => void;
}

export const useArtilleryStore = create<ArtilleryStoreState>((set) => ({
  placementMode: 'idle',
  platformIndex: DEFAULT_PLATFORM_INDEX,
  statusText: '',
  solutions: [],
  hasTarget: false,
  hasImpact: false,
  windDirection: null,
  windStrength: 0,
  pinnedGuns: new Set<number>(),
  pinnedHexId: '',
  pipVisible: false,
  showWarden: true,
  showColonial: false,
  showShips: false,
  setPlacementMode: (mode) => set({ placementMode: mode }),
  setPlatformIndex: (index) => set({ platformIndex: index }),
  setSolutions: (solutions, hasTarget, hasImpact) => set({ solutions, hasTarget, hasImpact }),
  setStatusText: (text) => set({ statusText: text }),
  setWind: (direction, strength) => set({ windDirection: direction, windStrength: strength }),
  togglePin: (posIndex) => set((state) => {
    const next = new Set(state.pinnedGuns);
    if (next.has(posIndex)) next.delete(posIndex);
    else next.add(posIndex);
    return { pinnedGuns: next };
  }),
  setPinnedHexId: (hexId) => set({ pinnedHexId: hexId }),
  setPipVisible: (visible) => set({ pipVisible: visible }),
  toggleShowWarden: () => set((state) => ({ showWarden: !state.showWarden })),
  toggleShowColonial: () => set((state) => ({ showColonial: !state.showColonial })),
  toggleShowShips: () => set((state) => ({ showShips: !state.showShips })),
  reset: () => set({
    placementMode: 'idle',
    platformIndex: DEFAULT_PLATFORM_INDEX,
    statusText: '',
    solutions: [],
    hasTarget: false,
    hasImpact: false,
    windDirection: null,
    windStrength: 0,
    pinnedGuns: new Set<number>(),
    pinnedHexId: '',
    pipVisible: false,
    showWarden: true,
    showColonial: false,
    showShips: false,
  }),
}));
