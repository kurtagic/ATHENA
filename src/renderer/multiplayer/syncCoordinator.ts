import { session } from './sessionManager';
import { initDrawingSync, handleDrawingBroadcast } from './drawingSync';
import { initArtillerySync, handleArtilleryBroadcast, cleanupArtillerySync } from './artillerySync';
import { voice } from './voiceManager';
import { setSyncMode, setCurrentHexId, clearAllStrokes, restoreDrawState } from '../map/drawing';
import { setArtilleryHexId, restoreArtilleryState } from '../map/artillery';
import { hexDrawingData, hexArtilleryData } from '../data/store';
import { useSessionStore } from '../stores/sessionStore';
import { useMapStore } from '../stores/mapStore';
import type { ServerMessage, ServerBroadcast, FullSnapshotMsg } from './protocol';
import { toMapPoint } from '../data/coords';

let initialized = false;

export function initMultiplayerSync(): void {
  if (initialized) return;
  initialized = true;

  // Wire drawing and artillery sync outbound callbacks
  initDrawingSync();
  initArtillerySync();

  // Handle connection status changes for syncMode
  useSessionStore.subscribe((state, prev) => {
    if (state.status === 'connected' && prev.status !== 'connected') {
      setSyncMode(true);
    } else if (state.status !== 'connected' && prev.status === 'connected') {
      setSyncMode(false);
      cleanupArtillerySync();
      // Re-init artillery sync for next connection
      initArtillerySync();
    }
  });

  // Track detail view hex changes
  useMapStore.subscribe((state, prev) => {
    if (state.detailMode?.apiName !== prev.detailMode?.apiName) {
      const hexId = state.detailMode?.apiName || '';
      setCurrentHexId(hexId);
      setArtilleryHexId(hexId);
    }
  });

  // Route inbound server messages
  session.onMessage((msg: ServerMessage) => {
    routeMessage(msg);
  });
}

function routeMessage(msg: ServerMessage): void {
  // Skip broadcasts that originated from this client (server echoes them back)
  const senderId = (msg as any).senderId;
  const myId = useSessionStore.getState().memberId;
  if (senderId && myId && senderId === myId) return;

  const currentHexId = useMapStore.getState().detailMode?.apiName || '';

  switch (msg.type) {
    // Drawing broadcasts
    case 'stroke-add':
    case 'stroke-undo':
    case 'stroke-redo':
    case 'stroke-clear':
      handleDrawingBroadcast(msg as unknown as ServerBroadcast, currentHexId);
      break;

    // Artillery broadcasts
    case 'artillery-snapshot':
      handleArtilleryBroadcast(msg as unknown as ServerBroadcast, currentHexId);
      break;

    // Voice signaling
    case 'voice-peer-joined':
    case 'voice-peer-left':
    case 'voice-offer':
    case 'voice-answer':
    case 'voice-ice':
      voice.handleSignaling(msg as any);
      break;

    // Full snapshot on join/reconnect
    case 'full-snapshot':
      applyFullSnapshot(msg as FullSnapshotMsg, currentHexId);
      break;
  }
}

function applyFullSnapshot(msg: FullSnapshotMsg, currentHexId: string): void {
  const { snapshot } = msg;

  // Apply drawing snapshots
  for (const [hexId, strokes] of Object.entries(snapshot.drawings)) {
    const savedStrokes = strokes.map(s => ({
      id: s.id,
      points: s.points as [number, number][],
      color: s.color,
      weight: s.weight,
      opacity: s.opacity,
    }));

    if (hexId === currentHexId) {
      // Apply directly to live drawing state
      clearAllStrokes();
      const map = useMapStore.getState().mapInstance;
      if (map) {
        restoreDrawState(savedStrokes, map);
      }
    } else {
      // Cache for later
      hexDrawingData[hexId] = savedStrokes;
    }
  }

  // Apply artillery snapshots
  for (const [hexId, artyData] of Object.entries(snapshot.artillery)) {
    const savedState = {
      positions: artyData.positions,
      target: artyData.target,
      impact: artyData.impact,
      mainGunIndex: artyData.mainGunIndex,
      defaultPlatformIndex: 0,
      nextId: artyData.nextId,
      nextLabelNum: artyData.nextLabelNum,
    };

    if (hexId === currentHexId) {
      const map = useMapStore.getState().mapInstance;
      if (map) {
        restoreArtilleryState(savedState, map);
      }
    } else {
      hexArtilleryData[hexId] = savedState;
    }
  }
}
