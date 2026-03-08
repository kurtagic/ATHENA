import { create } from 'zustand';

export interface VoicePeer {
  id: string;
  name: string;
  speaking: boolean;
}

interface VoiceState {
  joined: boolean;
  pttActive: boolean;
  peers: VoicePeer[];

  setJoined: (joined: boolean) => void;
  setPttActive: (active: boolean) => void;
  setPeers: (peers: VoicePeer[]) => void;
  addPeer: (peer: VoicePeer) => void;
  removePeer: (id: string) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  joined: false,
  pttActive: false,
  peers: [],

  setJoined: (joined) => set({ joined }),
  setPttActive: (pttActive) => set({ pttActive }),
  setPeers: (peers) => set({ peers }),
  addPeer: (peer) => set((s) => ({ peers: [...s.peers, peer] })),
  removePeer: (id) => set((s) => ({ peers: s.peers.filter((p) => p.id !== id) })),
  reset: () => set({ joined: false, pttActive: false, peers: [] }),
}));
