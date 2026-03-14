import { create } from 'zustand';

export type DebugCategory = 'ws' | 'sync' | 'session' | 'error' | 'yjs' | 'voice';

interface DebugLogEntry {
  id: number;
  timestamp: number;
  category: DebugCategory;
  message: string;
}

interface DebugState {
  open: boolean;
  entries: DebugLogEntry[];
  toggle: () => void;
  log: (category: DebugCategory, message: string) => void;
  clear: () => void;
}

let entryId = 0;

export const useDebugStore = create<DebugState>((set, get) => ({
  open: false,
  entries: [],
  toggle: () => set({ open: !get().open }),
  log: (category, message) => {
    const entries = get().entries;
    const newEntry: DebugLogEntry = { id: ++entryId, timestamp: Date.now(), category, message };
    // Ring buffer: trim oldest 50 when at 200
    const trimmed = entries.length >= 200 ? entries.slice(50) : entries;
    set({ entries: [...trimmed, newEntry] });
  },
  clear: () => set({ entries: [] }),
}));

/** Standalone helper for use in non-React code */
export function debugLog(category: DebugCategory, message: string): void {
  useDebugStore.getState().log(category, message);
}
