import { create } from 'zustand';
import type { LobbyMember, PendingJoin } from '../multiplayer/protocol';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface SessionState {
  status: ConnectionStatus;
  memberId: string | null;
  displayName: string;
  lobbyId: string | null;
  lobbyName: string | null;
  isOwner: boolean;
  ownerId: string | null;
  members: LobbyMember[];
  officerIds: string[];
  pendingApprovals: PendingJoin[];
  error: string | null;

  setStatus: (status: ConnectionStatus) => void;
  setMemberId: (id: string | null) => void;
  setDisplayName: (name: string) => void;
  setLobby: (lobbyId: string | null, name: string | null) => void;
  setIsOwner: (isOwner: boolean) => void;
  setOwnerId: (id: string | null) => void;
  setMembers: (members: LobbyMember[]) => void;
  setOfficerIds: (ids: string[]) => void;
  updateOfficer: (memberId: string, officer: boolean) => void;
  setPendingApprovals: (pending: PendingJoin[]) => void;
  addMember: (member: LobbyMember) => void;
  removeMember: (memberId: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'disconnected',
  memberId: null,
  displayName: '',
  lobbyId: null,
  lobbyName: null,
  isOwner: false,
  ownerId: null,
  members: [],
  officerIds: [],
  pendingApprovals: [],
  error: null,

  setStatus: (status) => set({ status }),
  setMemberId: (memberId) => set({ memberId }),
  setDisplayName: (displayName) => set({ displayName }),
  setLobby: (lobbyId, lobbyName) => set({ lobbyId, lobbyName }),
  setIsOwner: (isOwner) => set({ isOwner }),
  setOwnerId: (ownerId) => {
    set({ ownerId, isOwner: ownerId === get().memberId });
  },
  setMembers: (members) => set({ members }),
  setOfficerIds: (officerIds) => set({ officerIds }),
  updateOfficer: (memberId, officer) => set((s) => ({
    officerIds: officer
      ? [...s.officerIds, memberId]
      : s.officerIds.filter((id) => id !== memberId),
  })),
  setPendingApprovals: (pendingApprovals) => set({ pendingApprovals }),
  addMember: (member) => set((s) => ({ members: [...s.members, member] })),
  removeMember: (memberId) => set((s) => ({
    members: s.members.filter((m) => m.id !== memberId),
  })),
  setError: (error) => set({ error }),
  reset: () => set({
    status: 'disconnected',
    memberId: null,
    lobbyId: null,
    lobbyName: null,
    isOwner: false,
    ownerId: null,
    members: [],
    officerIds: [],
    pendingApprovals: [],
    error: null,
  }),
}));
