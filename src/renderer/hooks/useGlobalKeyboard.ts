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
import { useCrewStore, getMyCrew } from '../stores/crewStore';
import { useArtilleryStore } from '../stores/artilleryStore';
import { useNotesStore } from '../stores/notesStore';
import { getStatusesForType } from '../data/crewStatuses';
import { voice } from '../multiplayer/voiceManager';
import { session } from '../multiplayer/sessionManager';
import { hexLookup } from '../data/hexMapping';
import type { CrewStatus } from '../multiplayer/protocol';

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

  // Reply to notif context requests from main process
  useEffect(() => {
    window.athena.onRequestNotifContext(() => {
      const store = useSessionStore.getState();
      const isOfficer = store.officerIds.includes(store.memberId!);
      const crews = useCrewStore.getState().crews.map(c => ({ id: c.id, name: c.name }));
      window.athena.sendNotifContextReply({ isOfficer, crews });
    });
  }, []);

  // Handle quick notification sends from the input window
  useEffect(() => {
    window.athena.onSendQuickNotification((data) => {
      if (useSessionStore.getState().lobbyId) {
        const target = data.target as import('../multiplayer/protocol').NotificationTarget | undefined;
        session.sendCustomNotification(data.text, target);
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
        payload.targetEntityId, payload.mainGunPosition,
      );
      // Send initial display values to the qc window
      window.athena.sendQcSpotterUpdate(getSpotterDisplayValues());
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
      window.athena.sendQcSpotterUpdate(getSpotterDisplayValues());
    });
  }, []);

  // Quick Controls: handle close mode from the separate window (Escape in HUD)
  useEffect(() => {
    window.athena.onQcCloseMode(() => {
      useQuickControlsStore.getState().close();
    });
  }, []);

  // Quick Controls: reply to crew data requests from the separate window
  useEffect(() => {
    window.athena.onQcRequestCrewData(() => {
      const memberId = useSessionStore.getState().memberId;
      const myCrew = getMyCrew(memberId);
      if (!myCrew) {
        window.athena.sendQcCrewDataReply(null);
        return;
      }
      window.athena.sendQcCrewDataReply({
        crewName: myCrew.name,
        crewType: myCrew.type,
        currentStatus: myCrew.status,
        statuses: getStatusesForType(myCrew.type).map(s => ({ id: s.id, label: s.label })),
      });
    });
  }, []);

  // Quick Controls: handle crew status change from the separate window
  useEffect(() => {
    window.athena.onQcCrewSetStatus((status: string) => {
      session.setCrewStatus(status as CrewStatus);
    });
  }, []);

  // Quick Controls: toggle artillery PIP from the separate window
  useEffect(() => {
    window.athena.onQcTogglePip(() => {
      const next = !useArtilleryStore.getState().pipVisible;
      useArtilleryStore.getState().setPipVisible(next);
      window.athena.togglePip(next);
    });
  }, []);

  // Quick Controls: toggle notes PIP from the separate window
  useEffect(() => {
    window.athena.onQcToggleNotesPip(() => {
      const next = !useNotesStore.getState().pinned;
      useNotesStore.getState().setPinned(next);
      window.athena.toggleNotesPip(next, next ? useNotesStore.getState().text : undefined);
    });
  }, []);

  // Quick Controls: toggle crew PIP from the separate window
  useEffect(() => {
    window.athena.onQcToggleCrewPip(() => {
      const next = !useCrewStore.getState().pinned;
      useCrewStore.getState().setPinned(next);
      const memberId = useSessionStore.getState().memberId;
      const myCrew = getMyCrew(memberId);
      window.athena.toggleCrewPip(next, next && myCrew ? useCrewStore.getState().crews : undefined);
    });
  }, []);

  // Quick Controls: reply with current pin states
  useEffect(() => {
    window.athena.onQcRequestPinStates(() => {
      window.athena.sendQcPinStatesReply({
        artillery: useArtilleryStore.getState().pipVisible,
        notes: useNotesStore.getState().pinned,
        crew: useCrewStore.getState().pinned,
      });
    });
  }, []);

  // Quick Controls: broadcast pin state changes to QC window (from overlay UI)
  useEffect(() => {
    let prev = {
      artillery: useArtilleryStore.getState().pipVisible,
      notes: useNotesStore.getState().pinned,
      crew: useCrewStore.getState().pinned,
    };
    const sendIfChanged = () => {
      const next = {
        artillery: useArtilleryStore.getState().pipVisible,
        notes: useNotesStore.getState().pinned,
        crew: useCrewStore.getState().pinned,
      };
      if (next.artillery !== prev.artillery || next.notes !== prev.notes || next.crew !== prev.crew) {
        prev = next;
        window.athena.sendQcPinStatesReply(next);
      }
    };
    const unsubs = [
      useArtilleryStore.subscribe(sendIfChanged),
      useNotesStore.subscribe(sendIfChanged),
      useCrewStore.subscribe(sendIfChanged),
    ];
    return () => unsubs.forEach((u) => u());
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
          window.athena.sendQcSpotterUpdate(getSpotterDisplayValues());
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

        // Exit stamp/text/enemy-marker placement mode
        const currentTool = useDrawStore.getState().activeTool;
        if (currentTool === 'stamp' || currentTool === 'text') {
          useDrawStore.getState().setActiveTool('pen');
          useMapStore.getState().setMapCursor('');
          return;
        }
        if (currentTool === 'enemy-marker') {
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
