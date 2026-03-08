import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { getDetailMode, exitDetailMode } from '../map/detailView';
import { getArtilleryState, setPlacementMode } from '../map/artillery';
import { performUndo } from '../map/undo';

export function useGlobalKeyboard(mapRef: React.MutableRefObject<maplibregl.Map | null>): void {
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const map = mapRef.current;
      if (!map) return;

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && getDetailMode()) {
        e.preventDefault();
        performUndo(map);
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
