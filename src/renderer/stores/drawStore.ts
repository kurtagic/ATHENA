import { create } from 'zustand';

interface DrawStoreState {
  activeColor: string;
  eraserActive: boolean;
  eraserPosition: { x: number; y: number } | null;
  eraserRadius: number;
  setActiveColor: (color: string) => void;
  setEraserActive: (active: boolean) => void;
  toggleEraser: () => void;
  setEraserPosition: (pos: { x: number; y: number } | null) => void;
}

export const useDrawStore = create<DrawStoreState>((set) => ({
  activeColor: '#ff0000',
  eraserActive: false,
  eraserPosition: null,
  eraserRadius: 20,
  setActiveColor: (color) => set({ activeColor: color, eraserActive: false }),
  setEraserActive: (active) => set({ eraserActive: active }),
  toggleEraser: () => set((s) => ({ eraserActive: !s.eraserActive, activeColor: !s.eraserActive ? '' : s.activeColor })),
  setEraserPosition: (pos) => set({ eraserPosition: pos }),
}));
