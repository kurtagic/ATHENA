import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { getDetailMode, exitDetailMode } from '../map/detailView';
import { getArtilleryState, setPlacementMode } from '../map/artillery';
import { useMapStore } from '../stores/mapStore';
import { useVoiceStore } from '../stores/voiceStore';
import { voice } from '../multiplayer/voiceManager';

export function useGlobalKeyboard(mapRef: React.MutableRefObject<maplibregl.Map | null>): void {
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const map = mapRef.current;
      if (!map) return;

      // V key → PTT (push-to-talk)
      if (e.key === 'y' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (useVoiceStore.getState().joined) {
          e.preventDefault();
          voice.setPttActive(true);
          useVoiceStore.getState().setPttActive(true);
          return;
        }
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

    const handleKeyup = (e: KeyboardEvent) => {
      if (e.key === 'y' && useVoiceStore.getState().joined) {
        voice.setPttActive(false);
        useVoiceStore.getState().setPttActive(false);
      }
    };

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('keyup', handleKeyup);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('keyup', handleKeyup);
    };
  }, [mapRef]);
}
