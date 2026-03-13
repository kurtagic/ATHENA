import { session } from './sessionManager';
import { initDrawingSync, handleDrawingBroadcast } from './drawingSync';
import { initArtillerySync, handleArtilleryBroadcast, cleanupArtillerySync, entitiesToArtilleryState } from './artillerySync';
import { voice } from './voiceManager';
import { setSyncMode, setCurrentHexId, clearAllStrokes, restoreDrawState } from '../map/drawing';
import { setArtilleryHexId, restoreArtilleryState } from '../map/artillery';
import { hexEntityData, hexDrawingData, hexArtilleryData } from '../data/store';
import { useSessionStore } from '../stores/sessionStore';
import { useMapStore } from '../stores/mapStore';
import { useBannerStore } from '../stores/bannerStore';
import { useNotificationStore } from '../stores/notificationStore';
import type { ServerMessage, ServerBroadcast, FullSnapshotMsg, StrokeEntity } from './protocol';

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
      initArtillerySync();
    }
  });

  // Initialize with current hex (in case detail view is already active)
  const currentHex = useMapStore.getState().detailMode?.apiName || '';
  if (currentHex) {
    setCurrentHexId(currentHex);
    setArtilleryHexId(currentHex);
  }

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
  // All entity broadcasts are echo — skip messages from self (except command-banner)
  const senderId = (msg as any).senderId;
  const myId = useSessionStore.getState().memberId;
  if (senderId && myId && senderId === myId && msg.type !== 'command-banner' && msg.type !== 'custom-notification') return;

  const currentHexId = useMapStore.getState().detailMode?.apiName || '';

  switch (msg.type) {
    // entity-delete payload has no entityType — look it up from cache
    case 'entity-delete': {
      const delPayload = (msg as any).payload ?? msg;
      const cached = hexEntityData[delPayload.hexId];
      const cachedEntity = cached?.find((e: any) => e.id === delPayload.entityId);
      const delType = cachedEntity?.entityType as string | undefined;

      if (delType === 'stroke' || !delType) {
        handleDrawingBroadcast(msg as unknown as ServerBroadcast, currentHexId);
      }
      if (delType?.startsWith('artillery-') || !delType) {
        handleArtilleryBroadcast(msg as unknown as Record<string, any>, currentHexId);
      }

      // Remove from local cache
      if (cached && cachedEntity) {
        const idx = cached.indexOf(cachedEntity);
        if (idx !== -1) cached.splice(idx, 1);
      }
      break;
    }

    // Entity operations — dispatch based on entityType in payload
    case 'entity-create':
    case 'entity-update':
    case 'entity-clear': {
      const payload = (msg as any).payload ?? msg;
      const entityType = payload.entity?.entityType ?? payload.entityType;
      if (entityType === 'stroke') {
        handleDrawingBroadcast(msg as unknown as ServerBroadcast, currentHexId);
      } else if (entityType?.startsWith('artillery-')) {
        handleArtilleryBroadcast(msg as unknown as Record<string, any>, currentHexId);
      } else if (!entityType && msg.type === 'entity-clear') {
        // Full hex clear — handle both
        handleDrawingBroadcast(msg as unknown as ServerBroadcast, currentHexId);
        handleArtilleryBroadcast(msg as unknown as Record<string, any>, currentHexId);
      }
      break;
    }

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
  const { snapshot } = msg;

  // Clear existing caches
  for (const key of Object.keys(hexEntityData)) delete hexEntityData[key];
  for (const key of Object.keys(hexDrawingData)) delete hexDrawingData[key];
  for (const key of Object.keys(hexArtilleryData)) delete hexArtilleryData[key];

  // Populate entity cache
  for (const [hexId, entities] of Object.entries(snapshot.entities)) {
    hexEntityData[hexId] = [...entities];

    // Extract strokes for drawing system
    const strokes = entities.filter(e => e.entityType === 'stroke') as StrokeEntity[];
    if (strokes.length > 0) {
      const savedStrokes = strokes.map(s => ({
        id: s.id,
        points: s.points as [number, number][],
        color: s.color,
        weight: s.weight,
        opacity: s.opacity,
      }));

      if (hexId === currentHexId) {
        clearAllStrokes();
        const map = useMapStore.getState().mapInstance;
        if (map) {
          restoreDrawState(savedStrokes, map);
        }
      } else {
        hexDrawingData[hexId] = savedStrokes;
      }
    }

    // Extract artillery entities
    const artilleryEntities = entities.filter(e =>
      e.entityType === 'artillery-platform' ||
      e.entityType === 'artillery-target' ||
      e.entityType === 'artillery-impact'
    );
    if (artilleryEntities.length > 0) {
      const savedState = entitiesToArtilleryState(artilleryEntities);

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
}
