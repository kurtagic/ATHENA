import { create } from 'zustand';

export type ActiveTool = 'pen' | 'eraser';

interface DrawStoreState {
  activeColor: string;
  eraserActive: boolean;
  eraserPosition: { x: number; y: number } | null;
  eraserRadius: number;
  activeTool: ActiveTool;
  strokeWidth: number;
  strokeOpacity: number;
  setActiveColor: (color: string) => void;
  setEraserActive: (active: boolean) => void;
  toggleEraser: () => void;
  setEraserPosition: (pos: { x: number; y: number } | null) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeOpacity: (opacity: number) => void;
  reset: () => void;
}

export const useDrawStore = create<DrawStoreState>((set) => ({
  activeColor: '#ef4444',
  eraserActive: false,
  eraserPosition: null,
  eraserRadius: 20,
  activeTool: 'pen',
  strokeWidth: 3,
  strokeOpacity: 1.0,
  setActiveColor: (color) => set({ activeColor: color, eraserActive: false, activeTool: 'pen' }),
  setEraserActive: (active) => set({ eraserActive: active, activeTool: active ? 'eraser' : 'pen' }),
  toggleEraser: () => set((s) => {
    const newEraser = !s.eraserActive;
    return {
      eraserActive: newEraser,
      activeTool: newEraser ? 'eraser' : 'pen',
      activeColor: newEraser ? '' : s.activeColor,
    };
  }),
  setEraserPosition: (pos) => set({ eraserPosition: pos }),
  setActiveTool: (tool) => set({
    activeTool: tool,
    eraserActive: tool === 'eraser',
  }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setStrokeOpacity: (opacity) => set({ strokeOpacity: opacity }),
  reset: () => set({
    activeColor: '#ef4444',
    eraserActive: false,
    eraserPosition: null,
    eraserRadius: 20,
    activeTool: 'pen',
    strokeWidth: 3,
    strokeOpacity: 1.0,
  }),
}));
