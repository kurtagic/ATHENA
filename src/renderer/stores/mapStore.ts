import { create } from 'zustand';
import type maplibregl from 'maplibre-gl';

interface DetailMode {
  hexId: string;
  hexName: string;
  apiName: string;
}

interface MapState {
  mapInstance: maplibregl.Map | null;
  detailMode: DetailMode | null;
  zoomLevel: number;
  mapCursor: string;
  setMapInstance: (map: maplibregl.Map) => void;
  setDetailMode: (mode: DetailMode | null) => void;
  setZoomLevel: (z: number) => void;
  setMapCursor: (cursor: string) => void;
}

export const useMapStore = create<MapState>((set) => ({
  mapInstance: null,
  detailMode: null,
  zoomLevel: 0,
  mapCursor: '',
  setMapInstance: (map) => set({ mapInstance: map }),
  setDetailMode: (mode) => set({ detailMode: mode }),
  setZoomLevel: (z) => set({ zoomLevel: z }),
  setMapCursor: (cursor) => set({ mapCursor: cursor }),
}));
