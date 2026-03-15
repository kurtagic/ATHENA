import { create } from 'zustand';
import { METERS_PER_CRS_UNIT } from '../data/artilleryCalc';
import { hexArtilleryData, type SavedArtilleryState } from '../data/store';
import { syncTargetUpdate, syncImpactUpdate, loadHexArtillery } from '../multiplayer/artillerySync';
import { getRootMap } from '../multiplayer/yjsSync';
import { updateRemoteTarget, updateRemoteImpact, getLiveSpotterPositions } from '../map/artillery';
import { useMapStore } from './mapStore';
import { useArtilleryStore } from './artilleryStore';

export type QuickControlsMode = 'closed' | 'spotting';

interface SpotterContext {
  hexId: string;
  hexName: string;
  targetEntityId: string;
  targetPosition: [number, number];
  originalTargetPosition: [number, number];
  mainGunPosition: [number, number] | null;
  gunToTargetAz: number;    // gun-to-target azimuth
  gunToTargetDist: number;  // gun-to-target distance in meters
}

export interface SpotterGunSolution {
  label: string;
  distanceM: number;
  azimuthDeg: number;
  isMain: boolean;
}

export interface SpotterDisplayValues {
  guns: SpotterGunSolution[];
}

interface QuickControlsState {
  mode: QuickControlsMode;
  spotterCtx: SpotterContext | null;

  close: () => void;
  selectSpotterTarget: (
    hexId: string,
    hexName: string,
    target: [number, number],
    targetEntityId: string,
    mainGunPosition: [number, number] | null,
  ) => void;
  adjustAzimuth: (delta: number) => void;
  adjustDistance: (delta: number) => void;
  syncSpotterTarget: (newTarget: [number, number]) => void;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSync(hexId: string, entityId: string, position: [number, number], impactEntityId: string | null, impactPosition: [number, number] | null) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTargetUpdate(hexId, entityId, { position });
    if (impactEntityId && impactPosition) {
      syncImpactUpdate(hexId, impactEntityId, { position: impactPosition });
    }
    // Update cache
    const cached = hexArtilleryData[hexId];
    if (cached) {
      cached.target = position;
      if (impactPosition) cached.impact = impactPosition;
    }
  }, 50);
}

function computeTargetFromGun(
  gun: [number, number],
  azimuthDeg: number,
  distanceM: number,
): [number, number] {
  const azRad = (azimuthDeg * Math.PI) / 180;
  const distCRS = distanceM / METERS_PER_CRS_UNIT;
  return [
    gun[0] + Math.sin(azRad) * distCRS,
    gun[1] + Math.cos(azRad) * distCRS,
  ];
}

/** Read firing solutions directly from the artillery store (same values shown in the sidebar). */
export function getSpotterDisplayValues(): SpotterDisplayValues {
  const solutions = useArtilleryStore.getState().solutions;
  const guns: SpotterGunSolution[] = solutions.map((s) => ({
    label: s.label,
    distanceM: s.distanceM,
    azimuthDeg: s.azimuthDeg,
    isMain: s.isMain,
  }));
  return { guns };
}

/** Read all artillery data fresh from Yjs (the single source of truth). */
export function getAllArtilleryFromYjs(): Record<string, SavedArtilleryState> {
  const result: Record<string, SavedArtilleryState> = {};
  const root = getRootMap('artillery');
  if (!root) return result;
  for (const hexId of root.keys()) {
    const state = loadHexArtillery(hexId);
    if (state) result[hexId] = state;
  }
  return result;
}

export const useQuickControlsStore = create<QuickControlsState>((set, get) => ({
  mode: 'closed',
  spotterCtx: null,

  close: () => {
    set({ mode: 'closed', spotterCtx: null });
  },

  selectSpotterTarget: (hexId, hexName, target, targetEntityId, mainGunPosition) => {
    let gunToTargetAz = 0;
    let gunToTargetDist = 0;

    if (mainGunPosition) {
      const dx = target[0] - mainGunPosition[0];
      const dy = target[1] - mainGunPosition[1];
      const distCRS = Math.sqrt(dx * dx + dy * dy);
      gunToTargetDist = distCRS * METERS_PER_CRS_UNIT;
      gunToTargetAz = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    }

    set({
      mode: 'spotting',
      spotterCtx: {
        hexId,
        hexName,
        targetEntityId,
        targetPosition: [target[0], target[1]],
        originalTargetPosition: [target[0], target[1]],
        mainGunPosition,
        gunToTargetAz,
        gunToTargetDist,
      },
    });
  },

  adjustAzimuth: (delta) => {
    const ctx = get().spotterCtx;
    if (!ctx || !ctx.mainGunPosition) return;

    const newAz = ((ctx.gunToTargetAz + delta) % 360 + 360) % 360;
    const newTarget = computeTargetFromGun(ctx.mainGunPosition, newAz, ctx.gunToTargetDist);
    const dx = newTarget[0] - ctx.targetPosition[0];
    const dy = newTarget[1] - ctx.targetPosition[1];

    // Also shift impact by the same delta (like target drag does)
    const live = getLiveSpotterPositions();
    let newImpact: [number, number] | null = null;
    if (live.impact) {
      newImpact = [live.impact[0] + dx, live.impact[1] + dy];
    }

    set({
      spotterCtx: {
        ...ctx,
        gunToTargetAz: newAz,
        targetPosition: newTarget,
      },
    });

    // Live update if viewing this hex
    const detail = useMapStore.getState().detailMode;
    const map = useMapStore.getState().mapInstance;
    if (detail?.apiName === ctx.hexId && map) {
      updateRemoteTarget(map, ctx.targetEntityId, { position: newTarget });
      if (newImpact && live.impactEntityId) {
        updateRemoteImpact(map, live.impactEntityId, { position: newImpact });
      }
    }

    debouncedSync(ctx.hexId, ctx.targetEntityId, newTarget, live.impactEntityId, newImpact);
  },

  adjustDistance: (delta) => {
    const ctx = get().spotterCtx;
    if (!ctx || !ctx.mainGunPosition) return;

    let newDist = ctx.gunToTargetDist + delta;
    let newAz = ctx.gunToTargetAz;
    if (newDist < 0) {
      newDist = -newDist;
      newAz = (newAz + 180) % 360;
    }
    const newTarget = computeTargetFromGun(ctx.mainGunPosition, newAz, newDist);
    const dx = newTarget[0] - ctx.targetPosition[0];
    const dy = newTarget[1] - ctx.targetPosition[1];

    // Also shift impact by the same delta (like target drag does)
    const live = getLiveSpotterPositions();
    let newImpact: [number, number] | null = null;
    if (live.impact) {
      newImpact = [live.impact[0] + dx, live.impact[1] + dy];
    }

    set({
      spotterCtx: {
        ...ctx,
        gunToTargetAz: newAz,
        gunToTargetDist: newDist,
        targetPosition: newTarget,
      },
    });

    // Live update if viewing this hex
    const detail = useMapStore.getState().detailMode;
    const map = useMapStore.getState().mapInstance;
    if (detail?.apiName === ctx.hexId && map) {
      updateRemoteTarget(map, ctx.targetEntityId, { position: newTarget });
      if (newImpact && live.impactEntityId) {
        updateRemoteImpact(map, live.impactEntityId, { position: newImpact });
      }
    }

    debouncedSync(ctx.hexId, ctx.targetEntityId, newTarget, live.impactEntityId, newImpact);
  },

  syncSpotterTarget: (newTarget) => {
    const ctx = get().spotterCtx;
    if (!ctx || !ctx.mainGunPosition) return;

    const dx = newTarget[0] - ctx.mainGunPosition[0];
    const dy = newTarget[1] - ctx.mainGunPosition[1];
    const distCRS = Math.sqrt(dx * dx + dy * dy);
    const gunToTargetDist = distCRS * METERS_PER_CRS_UNIT;
    const gunToTargetAz = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

    set({
      spotterCtx: {
        ...ctx,
        gunToTargetAz,
        gunToTargetDist,
        targetPosition: newTarget,
      },
    });
  },
}));
