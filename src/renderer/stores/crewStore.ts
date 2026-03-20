import { create } from 'zustand';
import type { Crew } from '../multiplayer/protocol';

interface CrewState {
  crews: Crew[];
  pinned: boolean;

  setCrews: (crews: Crew[]) => void;
  addCrew: (crew: Crew) => void;
  updateCrew: (crew: Crew) => void;
  removeCrew: (crewId: string) => void;
  setPinned: (pinned: boolean) => void;
  reset: () => void;
}

export const useCrewStore = create<CrewState>((set) => ({
  crews: [],
  pinned: false,

  setCrews: (crews) => set({ crews }),
  addCrew: (crew) => set((s) => ({ crews: [...s.crews, crew] })),
  updateCrew: (crew) => set((s) => ({
    crews: s.crews.map((c) => (c.id === crew.id ? crew : c)),
  })),
  removeCrew: (crewId) => set((s) => ({
    crews: s.crews.filter((c) => c.id !== crewId),
  })),
  setPinned: (pinned) => set({ pinned }),
  reset: () => set({ crews: [], pinned: false }),
}));

/** Get the crew the current user belongs to (if any) */
export function getMyCrew(memberId: string | null): Crew | undefined {
  if (!memberId) return undefined;
  return useCrewStore.getState().crews.find(c => c.memberIds.includes(memberId));
}
