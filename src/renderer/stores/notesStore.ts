import { create } from 'zustand';

interface NotesState {
  text: string;
  pinned: boolean;
  setText: (text: string) => void;
  setPinned: (pinned: boolean) => void;
  reset: () => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  text: '',
  pinned: false,
  setText: (text) => set({ text }),
  setPinned: (pinned) => set({ pinned }),
  reset: () => set({ text: '', pinned: false }),
}));
