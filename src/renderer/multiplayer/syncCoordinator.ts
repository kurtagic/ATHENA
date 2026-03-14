import { session } from './sessionManager';
import { initDrawingSync, setupDrawingObserver, teardownDrawingObserver, loadHexStrokes } from './drawingSync';
import { setupArtilleryObserver, teardownArtilleryObserver, loadHexArtillery } from './artillerySync';
import { voice } from './voiceManager';
import { setSyncMode, setCurrentHexId, clearAllStrokes, restoreDrawState } from '../map/drawing';
import { setArtilleryHexId, restoreArtilleryState } from '../map/artillery';
import { hexDrawingData, hexArtilleryData } from '../data/store';
import { useSessionStore } from '../stores/sessionStore';
import { useMapStore } from '../stores/mapStore';
import { useBannerStore } from '../stores/bannerStore';
import { useNotificationStore } from '../stores/notificationStore';
import { connectYjs, disconnectYjs, getRootMap } from './yjsSync';
import type { ServerMessage, FullSnapshotMsg } from './protocol';
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

  // Yjs lifecycle: connect on lobby join, disconnect on lobby leave
  useSessionStore.subscribe((state, prev) => {
    if (state.lobbyId && !prev.lobbyId) {
      debugLog('session', 'Lobby joined — cleared local state');
      // Transitioning from no lobby to having a lobby — clear stale local state
      for (const key of Object.keys(hexDrawingData)) delete hexDrawingData[key];
      for (const key of Object.keys(hexArtilleryData)) delete hexArtilleryData[key];
      clearAllStrokes();
      const map = useMapStore.getState().mapInstance;
      if (map) {
        restoreArtilleryState({ positions: [], target: null, impact: null, mainGunIndex: 0, defaultPlatformIndex: 0, nextId: 1, nextLabelNum: 1 }, map);
      }

      // Connect Yjs and start observing
      const { provider } = connectYjs(state.lobbyId);
      setupDrawingObserver();
      setupArtilleryObserver();

      // When Yjs finishes initial sync, restore strokes for current hex
      (provider as any).on('synced', () => {
        const hexId = useMapStore.getState().detailMode?.apiName || '';
        if (!hexId) return;
        const strokes = loadHexStrokes(hexId);
        if (strokes.length > 0) {
          const map = useMapStore.getState().mapInstance;
          if (map) {
            clearAllStrokes();
            restoreDrawState(strokes, map);
            hexDrawingData[hexId] = strokes;
            debugLog('yjs', `Synced: restored ${strokes.length} strokes for ${hexId}`);
          }
        }
      });
    } else if (!state.lobbyId && prev.lobbyId) {
      // Lobby left — tear down Yjs
      teardownDrawingObserver();
      teardownArtilleryObserver();
      disconnectYjs();
    }
  });

  // If already in a lobby when init runs (e.g. menu → app view transition),
  // connect Yjs immediately since the subscribe above missed the transition
  const currentLobbyId = useSessionStore.getState().lobbyId;
  if (currentLobbyId) {
    debugLog('yjs', `Already in lobby ${currentLobbyId} at init — connecting Yjs`);
    connectYjs(currentLobbyId);
    setupDrawingObserver();
    setupArtilleryObserver();
  }

  // Initialize with current hex (in case detail view is already active)
  const currentHex = useMapStore.getState().detailMode?.apiName || '';
  if (currentHex) {
    setCurrentHexId(currentHex);
    setArtilleryHexId(currentHex);
  }

  // Track detail view hex changes — load Yjs data on hex enter
  useMapStore.subscribe((state, prev) => {
    if (state.detailMode?.apiName !== prev.detailMode?.apiName) {
      const hexId = state.detailMode?.apiName || '';
      setCurrentHexId(hexId);
      setArtilleryHexId(hexId);

      if (hexId) {
        // Load strokes from Yjs into hexDrawingData
        const strokes = loadHexStrokes(hexId);
        if (strokes.length > 0) {
          hexDrawingData[hexId] = strokes;
          debugLog('yjs', `Loaded ${strokes.length} strokes for ${hexId} from Y.Doc`);
        }

        // Load artillery from Yjs into hexArtilleryData
        const artilleryState = loadHexArtillery(hexId);
        if (artilleryState) {
          hexArtilleryData[hexId] = artilleryState;
          debugLog('yjs', `Loaded artillery for ${hexId} from Y.Doc`);
        }
      }
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
      const members = useSessionStore.getState().members;
      const sender = members.find((m) => m.id === notifSenderId);
      const senderName = sender?.displayName ?? 'Unknown';
      useNotificationStore.getState().showNotification(notifPayload.text, senderName);
      window.athena.showCustomNotification(notifPayload.text, senderName);
      break;
    }
  }
}

function applyFullSnapshot(msg: FullSnapshotMsg, currentHexId: string): void {
  // Clear view caches
  for (const key of Object.keys(hexDrawingData)) delete hexDrawingData[key];
  for (const key of Object.keys(hexArtilleryData)) delete hexArtilleryData[key];

  // Clear live map state
  clearAllStrokes();
  const mapInstance = useMapStore.getState().mapInstance;
  if (mapInstance) {
    restoreArtilleryState({ positions: [], target: null, impact: null, mainGunIndex: 0, defaultPlatformIndex: 0, nextId: 1, nextLabelNum: 1 }, mapInstance);
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
