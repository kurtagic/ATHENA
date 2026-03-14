import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { getDetailMode, exitDetailMode } from '../map/detailView';
import { getArtilleryState, setPlacementMode } from '../map/artillery';
import { useVoiceStore } from '../stores/voiceStore';
import { useSessionStore } from '../stores/sessionStore';
import { voice } from '../multiplayer/voiceManager';
import { session } from '../multiplayer/sessionManager';

export function useGlobalKeyboard(mapRef: React.MutableRefObject<maplibregl.Map | null>): void {
  // Global TTT toggle via main process hotkey
  useEffect(() => {
    window.athena.onTttToggle(() => {
      if (!useVoiceStore.getState().joined) return;
      const active = useVoiceStore.getState().tttActive;
      voice.setTttActive(!active);
      useVoiceStore.getState().setTttActive(!active);
    });
  }, []);

  // Reply to lobby status checks from main process
  useEffect(() => {
    window.athena.onCheckLobbyStatus(() => {
      const inLobby = !!useSessionStore.getState().lobbyId;
      window.athena.sendLobbyStatusResult(inLobby);
    });
  }, []);

  // Handle quick notification sends from the input window
  useEffect(() => {
    window.athena.onSendQuickNotification((text: string) => {
      if (useSessionStore.getState().lobbyId) {
        session.sendCustomNotification(text);
      }
    });
  }, []);

  // Local keyboard shortcuts (Escape etc.)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const map = mapRef.current;
      if (!map) return;

      if (e.key === 'Escape') {
        const as = getArtilleryState();
        if (as.placementMode !== 'idle') {
          setPlacementMode('idle');
        }
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [mapRef]);
}
