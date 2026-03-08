import {
  setArtilleryChangedCallback,
  saveArtilleryState,
  restoreArtilleryState,
} from '../map/artillery';
import type { SavedArtilleryState } from '../data/store';
import { hexArtilleryData } from '../data/store';
import { useMapStore } from '../stores/mapStore';
import { session } from './sessionManager';
import type { SyncArtillery, ServerBroadcast } from './protocol';

const THROTTLE_MS = 150;

let pendingSnapshot: SavedArtilleryState | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;

function flushArtillery(hexId: string): void {
  if (pendingSnapshot && session.connected && hexId) {
    session.sendArtillerySnapshot(hexId, {
      positions: pendingSnapshot.positions,
      target: pendingSnapshot.target,
      impact: pendingSnapshot.impact,
      mainGunIndex: pendingSnapshot.mainGunIndex,
      nextId: pendingSnapshot.nextId,
      nextLabelNum: pendingSnapshot.nextLabelNum,
    });
  }
  pendingSnapshot = null;
  throttleTimer = null;
}

export function initArtillerySync(): void {
  setArtilleryChangedCallback((state, hexId) => {
    if (!session.connected) return;
    pendingSnapshot = state;
    if (!throttleTimer) {
      throttleTimer = setTimeout(() => flushArtillery(hexId), THROTTLE_MS);
    }
  });
}

export function handleArtilleryBroadcast(
  msg: ServerBroadcast | Record<string, any>,
  currentHexId: string,
): void {
  const data_envelope = (msg as any).payload ?? msg;
  const hexId = data_envelope.hexId as string;
  const data = data_envelope.data as Omit<SyncArtillery, 'authorId' | 'hexId'>;

  const savedState: SavedArtilleryState = {
    positions: data.positions,
    target: data.target,
    impact: data.impact,
    mainGunIndex: data.mainGunIndex,
    defaultPlatformIndex: 0,
    nextId: data.nextId,
    nextLabelNum: data.nextLabelNum,
  };

  if (hexId === currentHexId) {
    const map = useMapStore.getState().mapInstance;
    if (map) {
      restoreArtilleryState(savedState, map);
    }
  } else {
    // Cache for when user navigates to that hex
    hexArtilleryData[hexId] = savedState;
  }
}

export function cleanupArtillerySync(): void {
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  pendingSnapshot = null;
  setArtilleryChangedCallback(null);
}
