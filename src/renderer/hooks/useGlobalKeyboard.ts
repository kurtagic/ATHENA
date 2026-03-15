import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { getArtilleryState, setPlacementMode } from '../map/artillery';
import { useDrawStore } from '../stores/drawStore';
import { useEnemyMarkerStore } from '../stores/enemyMarkerStore';
import { executeUndo, executeRedo } from '../map/undoExecutor';
import { useMapStore } from '../stores/mapStore';
import { useVoiceStore } from '../stores/voiceStore';
import { useSessionStore } from '../stores/sessionStore';
import { useQuickControlsStore, getAllArtilleryFromYjs, getSpotterDisplayValues } from '../stores/quickControlsStore';
import { useNotificationStore } from '../stores/notificationStore';
import { voice } from '../multiplayer/voiceManager';
import { session } from '../multiplayer/sessionManager';
import { hexLookup } from '../data/hexMapping';

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

  // Quick Controls: reply to artillery data requests from the separate window
  useEffect(() => {
    window.athena.onQcRequestArtilleryData(() => {
      const allArty = getAllArtilleryFromYjs();
      const result: Record<string, any> = {};
      for (const [hexId, data] of Object.entries(allArty)) {
        const hex = hexLookup[hexId];
        result[hexId] = { ...data, hexName: hex?.name ?? hexId };
      }
      window.athena.sendQcArtilleryDataReply(result);
    });
  }, []);

  // Quick Controls: handle spotter selection from the separate window
  useEffect(() => {
    window.athena.onQcSelectSpotter((payload: any) => {
      useQuickControlsStore.getState().selectSpotterTarget(
        payload.hexId, payload.hexName, payload.target,
        payload.targetEntityId, payload.impact, payload.impactEntityId,
        payload.mainGunPosition,
      );
      // Send initial display values to the qc window
      const ctx = useQuickControlsStore.getState().spotterCtx;
      if (ctx) {
        window.athena.sendQcSpotterUpdate(getSpotterDisplayValues(ctx));
      }
    });
  }, []);

  // Quick Controls: handle spotter arrow key adjustments from the separate window
  useEffect(() => {
    window.athena.onQcSpotterAdjust((payload: any) => {
      const store = useQuickControlsStore.getState();
      if (store.mode !== 'spotting') return;
      if (payload.azDelta) store.adjustAzimuth(payload.azDelta);
      if (payload.distDelta) store.adjustDistance(payload.distDelta);
      // Send computed display values back to the qc window
      const ctx = useQuickControlsStore.getState().spotterCtx;
      if (ctx) {
        window.athena.sendQcSpotterUpdate(getSpotterDisplayValues(ctx));
      }
    });
  }, []);

  // Quick Controls: handle close mode from the separate window (Escape in HUD)
  useEffect(() => {
    window.athena.onQcCloseMode(() => {
      useQuickControlsStore.getState().close();
    });
  }, []);

  // Local keyboard shortcuts (Escape, arrow keys, etc.)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const map = mapRef.current;
      if (!map) return;

      // Quick Controls: arrow keys in spotting mode (when overlay is focused)
      const qcMode = useQuickControlsStore.getState().mode;
      if (qcMode === 'spotting') {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          const store = useQuickControlsStore.getState();
          if (e.key === 'ArrowLeft') store.adjustAzimuth(-4);
          if (e.key === 'ArrowRight') store.adjustAzimuth(4);
          if (e.key === 'ArrowUp') store.adjustDistance(8);
          if (e.key === 'ArrowDown') store.adjustDistance(-8);
          // Update the qc window too
          const ctx = useQuickControlsStore.getState().spotterCtx;
          if (ctx) {
            window.athena.sendQcSpotterUpdate(getSpotterDisplayValues(ctx));
          }
          return;
        }
      }

      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const hexId = useMapStore.getState().detailMode?.apiName;
        if (hexId) executeUndo(hexId);
        return;
      }
      // Redo
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'Z') || e.key === 'y')) {
        e.preventDefault();
        const hexId = useMapStore.getState().detailMode?.apiName;
        if (hexId) executeRedo(hexId);
        return;
      }

      if (e.key === 'Escape') {
        if (qcMode !== 'closed') {
          useQuickControlsStore.getState().close();
          return;
        }

        // Exit enemy marker placement mode
        if (useDrawStore.getState().activeTool === 'enemy-marker') {
          useEnemyMarkerStore.getState().setPlacingMarker(false);
          useDrawStore.getState().setActiveTool('pen');
          useMapStore.getState().setMapCursor('');
          return;
        }

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
