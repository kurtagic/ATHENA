import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { getDetailMode, exitDetailMode } from '../map/detailView';
import { getArtilleryState, setPlacementMode } from '../map/artillery';
import { performUndo, performRedo } from '../map/undo';
import { toggleEraser } from '../map/drawing';
import { useDrawStore } from '../stores/drawStore';
import { useMapStore } from '../stores/mapStore';

export function useGlobalKeyboard(mapRef: React.MutableRefObject<maplibregl.Map | null>): void {
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const map = mapRef.current;
      if (!map) return;

      // Ctrl+Shift+Z or Ctrl+Y → Redo
      if (
        ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
        (e.key === 'y' && (e.ctrlKey || e.metaKey))
      ) {
        if (getDetailMode()) {
          e.preventDefault();
          performRedo(map);
        }
        return;
      }

      // Ctrl+Z → Undo (must check after shift variant)
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && getDetailMode()) {
        e.preventDefault();
        performUndo(map);
        return;
      }

      // E → Toggle eraser
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && getDetailMode()) {
        e.preventDefault();
        toggleEraser(map);
        useDrawStore.getState().toggleEraser();
        return;
      }

      if (e.key === 'Escape') {
        const as = getArtilleryState();
        if (as.placementMode !== 'idle') {
          setPlacementMode('idle');
        } else if (getDetailMode()) {
          exitDetailMode();
        }
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [mapRef]);
}
