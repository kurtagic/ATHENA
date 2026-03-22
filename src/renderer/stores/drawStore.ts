import { create } from 'zustand';
import { useArtilleryStore } from './artilleryStore';

export type ActiveTool = 'pen' | 'eraser' | 'area' | 'ruler' | 'circle' | 'arrow' | 'stamp' | 'text' | 'enemy-marker';
export type BrushPattern = 'diagonal' | 'crosshatch' | 'border';

interface DrawStoreState {
  activeColor: string;
  eraserActive: boolean;
  eraserPosition: { x: number; y: number } | null;
  eraserRadius: number;
  activeTool: ActiveTool;
  brushPattern: BrushPattern;
  strokeWidth: number;
  strokeOpacity: number;
  selectedStamp: string | null;
  setActiveColor: (color: string) => void;
  setEraserActive: (active: boolean) => void;
  toggleEraser: () => void;
  setEraserPosition: (pos: { x: number; y: number } | null) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setBrushPattern: (pattern: BrushPattern) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeOpacity: (opacity: number) => void;
  setSelectedStamp: (stamp: string | null) => void;
  reset: () => void;
}

export const useDrawStore = create<DrawStoreState>((set) => ({
  activeColor: '#ef4444',
  eraserActive: false,
  eraserPosition: null,
  eraserRadius: 20,
  activeTool: 'pen',
  brushPattern: 'diagonal',
  strokeWidth: 3,
  strokeOpacity: 1.0,
  selectedStamp: null,
  setActiveColor: (color) => set((s) => ({
    activeColor: color,
    eraserActive: false,
    // Preserve current tool unless switching away from eraser
    activeTool: s.activeTool === 'eraser' ? 'pen' : s.activeTool,
  })),

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
  setActiveTool: (tool) => {
    // Reset artillery placement when any drawing tool is selected
    useArtilleryStore.getState().setPlacementMode('idle');
    set({
      activeTool: tool,
      eraserActive: tool === 'eraser',
    });
  },
  setBrushPattern: (pattern) => set({ brushPattern: pattern }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setStrokeOpacity: (opacity) => set({ strokeOpacity: opacity }),
  setSelectedStamp: (stamp) => set({ selectedStamp: stamp }),
  reset: () => set({
    activeColor: '#ef4444',
    eraserActive: false,
    eraserPosition: null,
    eraserRadius: 20,
    activeTool: 'pen',
    brushPattern: 'diagonal',
    strokeWidth: 3,
    strokeOpacity: 1.0,
    selectedStamp: null,
  }),
}));
