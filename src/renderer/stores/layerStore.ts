import { create } from 'zustand';

interface LayerConfig {
  visible: boolean;
  label: string;
}

interface LayerState {
  layers: Record<string, LayerConfig>;
  toggleLayer: (key: string) => void;
  setLayerVisible: (key: string, visible: boolean) => void;
}

export const useLayerStore = create<LayerState>((set) => ({
  layers: {
    hexGrid: { visible: true, label: 'Hex Grid' },
    staticLabels: { visible: true, label: 'Location Labels' },
    structures: { visible: true, label: 'Structures' },
    drawings: { visible: true, label: 'Drawings' },
    artillery: { visible: true, label: 'Artillery' },
    voronoi: { visible: true, label: 'Regions' },
  },
  toggleLayer: (key) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [key]: { ...state.layers[key], visible: !state.layers[key].visible },
      },
    })),
  setLayerVisible: (key, visible) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [key]: { ...state.layers[key], visible },
      },
    })),
}));
