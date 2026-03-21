import { session } from './sessionManager';
import { initDrawingSync, setupDrawingObserver, teardownDrawingObserver, loadHexStrokes } from './drawingSync';
import { setupArtilleryObserver, teardownArtilleryObserver, loadHexArtillery } from './artillerySync';
import { setupEnemyMarkerObserver, teardownEnemyMarkerObserver, loadHexEnemyMarkers } from './enemyMarkerSync';
import { setupNotesObserver, teardownNotesObserver, loadHexNotes, hexNotesCache, syncNotesUpdate } from './notesSync';
import { useNotesStore } from '../stores/notesStore';
import { voice } from './voiceManager';
import { setSyncMode, setCurrentHexId, clearAllStrokes, restoreDrawState, setDrawColor } from '../map/drawing';
import { colorByIndex } from '../data/colorFromUuid';
import { useDrawStore } from '../stores/drawStore';
import { setArtilleryHexId, restoreArtilleryState } from '../map/artillery';
import { setEnemyMarkerHexId, restoreEnemyMarkerState } from '../map/enemyMarkers';
import { DEFAULT_PLATFORM_INDEX } from '../data/artilleryPlatforms';
import { hexDrawingData, hexArtilleryData, hexEnemyMarkerData } from '../data/store';
import { useSessionStore } from '../stores/sessionStore';
import { useMapStore } from '../stores/mapStore';
import { useBannerStore } from '../stores/bannerStore';
import { useNotificationStore } from '../stores/notificationStore';
import { connectYjs, disconnectYjs, getRootMap } from './yjsSync';
import type { ServerMessage, FullSnapshotMsg } from './protocol';
import { useCrewStore } from '../stores/crewStore';
import { debugLog } from '../stores/debugStore';

let initialized = false;

export function initMultiplayerSync(): void {
  if (initialized) return;
  initialized = true;

  // Wire drawing sync outbound callbacks
  initDrawingSync();

  // Handle connection status changes for syncMode
  useSessionStore.subscribe((state, prev) => {
    if (state.status === 'connected' && prev.status !== 'connected') {
      setSyncMode(true);
    } else if (state.status !== 'connected' && prev.status === 'connected') {
      setSyncMode(false);
    }
  });

  // Set user-unique drawing color when members list updates (colorIndex from server)
  useSessionStore.subscribe((state, prev) => {
    if (state.memberId && state.members !== prev.members) {
      const me = state.members.find(m => m.id === state.memberId);
      if (me) {
        const color = colorByIndex(me.colorIndex);
        useDrawStore.getState().setActiveColor(color);
        setDrawColor(color);
        debugLog('session', `Drawing color set to ${color} from colorIndex ${me.colorIndex}`);
      }
    }
  });

  // Yjs lifecycle: connect on lobby join, disconnect on lobby leave
  useSessionStore.subscribe((state, prev) => {
    if (state.lobbyId && !prev.lobbyId) {
      debugLog('session', 'Lobby joined — cleared local state');
      // Transitioning from no lobby to having a lobby — clear stale local state
      for (const key of Object.keys(hexDrawingData)) delete hexDrawingData[key];
      for (const key of Object.keys(hexArtilleryData)) delete hexArtilleryData[key];
      for (const key of Object.keys(hexEnemyMarkerData)) delete hexEnemyMarkerData[key];
      for (const key of Object.keys(hexNotesCache)) delete hexNotesCache[key];
      clearAllStrokes();
      const map = useMapStore.getState().mapInstance;
      if (map) {
        restoreArtilleryState({ positions: [], target: null, impact: null, mainGunIndex: 0, defaultPlatformIndex: DEFAULT_PLATFORM_INDEX, nextId: 1, nextLabelNum: 1 }, map);
      }

      // Connect Yjs and start observing
      const { provider } = connectYjs(state.lobbyId);
      setupDrawingObserver();
      setupArtilleryObserver();
      setupEnemyMarkerObserver();
      setupNotesObserver();

      // When Yjs finishes initial sync, restore strokes and artillery for current hex
      (provider as any).on('synced', () => {
        const hexId = useMapStore.getState().detailMode?.apiName || '';
        if (!hexId) return;
        const map = useMapStore.getState().mapInstance;
        const strokes = loadHexStrokes(hexId);
        if (strokes.length > 0 && map) {
          clearAllStrokes();
          restoreDrawState(strokes, map);
          hexDrawingData[hexId] = strokes;
          debugLog('yjs', `Synced: restored ${strokes.length} strokes for ${hexId}`);
        }

        const artilleryState = loadHexArtillery(hexId);
        if (artilleryState) {
          hexArtilleryData[hexId] = artilleryState;
          if (map) {
            restoreArtilleryState(artilleryState, map);
            debugLog('yjs', `Synced: restored artillery for ${hexId}`);
          }
        }

        const enemyMarkers = loadHexEnemyMarkers(hexId);
        if (enemyMarkers.length > 0 && map) {
          hexEnemyMarkerData[hexId] = { markers: enemyMarkers };
          restoreEnemyMarkerState({ markers: enemyMarkers }, map);
          debugLog('yjs', `Synced: restored ${enemyMarkers.length} enemy markers for ${hexId}`);
        }

        const notesText = loadHexNotes(hexId);
        useNotesStore.getState().setText(notesText);
        debugLog('yjs', `Synced: restored notes for ${hexId}`);
      });
    } else if (!state.lobbyId && prev.lobbyId) {
      // Lobby left — tear down Yjs
      teardownDrawingObserver();
      teardownArtilleryObserver();
      teardownEnemyMarkerObserver();
      teardownNotesObserver();
      // Reset notes state and close PIP
      useNotesStore.getState().reset();
      window.athena.toggleNotesPip(false);
      // Reset crew state and close crew PIP
      useCrewStore.getState().reset();
      window.athena.toggleCrewPip(false);
      for (const key of Object.keys(hexNotesCache)) delete hexNotesCache[key];
      disconnectYjs();
    }
  });

  // If already connected when init runs, apply colorIndex color immediately
  const currentState = useSessionStore.getState();
  if (currentState.memberId) {
    const me = currentState.members.find(m => m.id === currentState.memberId);
    if (me) {
      const color = colorByIndex(me.colorIndex);
      useDrawStore.getState().setActiveColor(color);
      setDrawColor(color);
      debugLog('session', `Drawing color set to ${color} from existing colorIndex ${me.colorIndex}`);
    }
  }

  // If already in a lobby when init runs (e.g. menu → app view transition),
  // connect Yjs immediately since the subscribe above missed the transition
  const currentLobbyId = useSessionStore.getState().lobbyId;
  if (currentLobbyId) {
    debugLog('yjs', `Already in lobby ${currentLobbyId} at init — connecting Yjs`);
    connectYjs(currentLobbyId);
    setupDrawingObserver();
    setupArtilleryObserver();
    setupEnemyMarkerObserver();
    setupNotesObserver();
  }

  // Initialize with current hex (in case detail view is already active)
  const currentHex = useMapStore.getState().detailMode?.apiName || '';
  if (currentHex) {
    setCurrentHexId(currentHex);
    setArtilleryHexId(currentHex);
    setEnemyMarkerHexId(currentHex);
  }

  // Track detail view hex changes — load Yjs data on hex enter
  useMapStore.subscribe((state, prev) => {
    if (state.detailMode?.apiName !== prev.detailMode?.apiName) {
      const hexId = state.detailMode?.apiName || '';
      setCurrentHexId(hexId);
      setArtilleryHexId(hexId);
      setEnemyMarkerHexId(hexId);

      if (hexId) {
        // Load strokes from Yjs into hexDrawingData
        const strokes = loadHexStrokes(hexId);
        if (strokes.length > 0) {
          hexDrawingData[hexId] = strokes;
          debugLog('yjs', `Loaded ${strokes.length} strokes for ${hexId} from Y.Doc`);
        }

        // Load artillery from Yjs into hexArtilleryData and restore to map
        const artilleryState = loadHexArtillery(hexId);
        if (artilleryState) {
          hexArtilleryData[hexId] = artilleryState;
          const map = state.mapInstance;
          if (map) {
            restoreArtilleryState(artilleryState, map);
          }
          debugLog('yjs', `Loaded artillery for ${hexId} from Y.Doc`);
        }

        // Load enemy markers from Yjs
        const enemyMarkers = loadHexEnemyMarkers(hexId);
        if (enemyMarkers.length > 0) {
          hexEnemyMarkerData[hexId] = { markers: enemyMarkers };
          const map = state.mapInstance;
          if (map) {
            restoreEnemyMarkerState({ markers: enemyMarkers }, map);
          }
          debugLog('yjs', `Loaded ${enemyMarkers.length} enemy markers for ${hexId} from Y.Doc`);
        }

        // Load notes from Yjs
        const notesText = loadHexNotes(hexId);
        useNotesStore.getState().setText(notesText);
        if (useNotesStore.getState().pinned) {
          window.athena.updatePinnedNotes(notesText);
        }
        debugLog('yjs', `Loaded notes for ${hexId} from Y.Doc`);
      } else {
        // Exiting hex — reset notes text
        useNotesStore.getState().setText('');
      }
    }
  });

  // Handle edits from the notes PIP window
  window.athena.onNotesPipTextChange((text: string) => {
    const hexId = useMapStore.getState().detailMode?.apiName;
    if (!hexId) return;
    useNotesStore.getState().setText(text);
    syncNotesUpdate(hexId, text);
  });

  // Update crew PIP when crews change
  useCrewStore.subscribe((state, prev) => {
    if (state.crews !== prev.crews && state.pinned) {
      window.athena.updateCrewPip(state.crews);
    }
  });

  // Route inbound server messages
  session.onMessage((msg: ServerMessage) => {
    routeMessage(msg);
  });
}

function routeMessage(msg: ServerMessage): void {
  // Skip echo messages (except banners and notifications)
  const senderId = (msg as any).senderId;
  const myId = useSessionStore.getState().memberId;
  if (senderId && myId && senderId === myId && msg.type !== 'command-banner' && msg.type !== 'custom-notification') {
    debugLog('sync', `Echo skip: ${msg.type}`);
    return;
  }

  const currentHexId = useMapStore.getState().detailMode?.apiName || '';

  switch (msg.type) {
    // Voice signaling
    case 'voice-peer-joined':
    case 'voice-peer-left':
      debugLog('session', `${msg.type}: ${(msg as any).peerId}`);
      voice.handleSignaling(msg as any);
      break;
    case 'voice-offer':
    case 'voice-answer':
    case 'voice-ice':
      voice.handleSignaling(msg as any);
      break;

    // Full snapshot on join/reconnect
    case 'full-snapshot': {
      const snap = msg as FullSnapshotMsg;
      debugLog('session', `Snapshot received`);
      applyFullSnapshot(snap, currentHexId);
      break;
    }

    case 'command-banner': {
      const bannerPayload = (msg as any).payload ?? msg;
      useBannerStore.getState().showBanner(bannerPayload.command);
      window.athena.showCommandBanner(bannerPayload.command);
      break;
    }

    case 'custom-notification': {
      const notifPayload = (msg as any).payload ?? msg;
      const notifSenderId = (msg as any).senderId;
      const store = useSessionStore.getState();
      const sender = store.members.find((m) => m.id === notifSenderId);
      const senderName = sender?.displayName ?? 'Unknown';
      const target = notifPayload.target ?? { kind: 'everyone' };
      const targetKind = target.kind as 'everyone' | 'officers' | 'crew';

      // Determine sender role
      const senderRole = notifSenderId === store.ownerId ? 'owner' as const
        : store.officerIds.includes(notifSenderId) ? 'officer' as const
        : undefined;

      // Determine target label
      let targetLabel = 'Everyone';
      if (targetKind === 'officers') targetLabel = 'Officers';
      else if (targetKind === 'crew' && target.crewId) {
        const crews = useCrewStore.getState().crews;
        const crew = crews.find((c: any) => c.id === target.crewId);
        targetLabel = crew?.name ?? 'Crew';
      }

      useNotificationStore.getState().showNotification(notifPayload.text, senderName, { targetKind, targetLabel, senderRole });
      window.athena.showCustomNotification(notifPayload.text, senderName, targetKind, senderRole, targetLabel);
      break;
    }
  }
}

function applyFullSnapshot(msg: FullSnapshotMsg, currentHexId: string): void {
  // Clear view caches
  for (const key of Object.keys(hexDrawingData)) delete hexDrawingData[key];
  for (const key of Object.keys(hexArtilleryData)) delete hexArtilleryData[key];
  for (const key of Object.keys(hexEnemyMarkerData)) delete hexEnemyMarkerData[key];

  // Clear live map state
  clearAllStrokes();
  const mapInstance = useMapStore.getState().mapInstance;
  if (mapInstance) {
    restoreArtilleryState({ positions: [], target: null, impact: null, mainGunIndex: 0, defaultPlatformIndex: DEFAULT_PLATFORM_INDEX, nextId: 1, nextLabelNum: 1 }, mapInstance);
  }

  // Load from Yjs for current hex
  if (currentHexId) {
    const strokes = loadHexStrokes(currentHexId);
    if (strokes.length > 0 && mapInstance) {
      restoreDrawState(strokes, mapInstance);
      debugLog('yjs', `Restored ${strokes.length} strokes for ${currentHexId} from Y.Doc after snapshot`);
    }

    const artilleryState = loadHexArtillery(currentHexId);
    if (artilleryState && mapInstance) {
      restoreArtilleryState(artilleryState, mapInstance);
      debugLog('yjs', `Restored artillery for ${currentHexId} from Y.Doc after snapshot`);
    }

    const enemyMarkers = loadHexEnemyMarkers(currentHexId);
    if (enemyMarkers.length > 0 && mapInstance) {
      restoreEnemyMarkerState({ markers: enemyMarkers }, mapInstance);
      debugLog('yjs', `Restored ${enemyMarkers.length} enemy markers for ${currentHexId} from Y.Doc after snapshot`);
    }
  }

  // Repopulate hexDrawingData cache for all other hexes from Yjs
  const allStrokesMap = getRootMap('strokes');
  if (allStrokesMap) {
    allStrokesMap.forEach((_hexMap, hexId) => {
      if (hexId === currentHexId) return;
      const strokes = loadHexStrokes(hexId);
      if (strokes.length > 0) hexDrawingData[hexId] = strokes;
    });
  }
}
