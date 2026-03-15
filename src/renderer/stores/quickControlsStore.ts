import { create } from 'zustand';
import { METERS_PER_CRS_UNIT, crsDistanceMeters, crsAzimuth, calculateCorrection } from '../data/artilleryCalc';
import type { MapPoint } from '../data/coords';
import { hexArtilleryData, type SavedArtilleryState } from '../data/store';
import { syncImpactSet, syncImpactUpdate, loadHexArtillery } from '../multiplayer/artillerySync';
import { getRootMap } from '../multiplayer/yjsSync';
import { setRemoteImpact, updateRemoteImpact, getLiveSpotterPositions } from '../map/artillery';
import { useMapStore } from './mapStore';

export type QuickControlsMode = 'closed' | 'spotting';

interface SpotterContext {
  hexId: string;
  hexName: string;
  targetEntityId: string;
  targetPosition: [number, number];
  mainGunPosition: [number, number] | null;
  impactEntityId: string | null;
  impactPosition: [number, number];
  azimuthDeg: number;   // target-to-impact azimuth (offset)
  distanceM: number;    // target-to-impact distance (offset)
}

export interface SpotterDisplayValues {
  absDist: number;   // gun-to-corrected distance (firing solution)
  absAz: number;     // gun-to-corrected azimuth (firing solution)
  deltaDist: number;  // target-to-impact distance (correction magnitude)
  deltaAz: number;    // target-to-impact azimuth (correction direction)
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
    impact: [number, number] | null,
    impactEntityId: string | null,
    mainGunPosition: [number, number] | null,
  ) => void;
  adjustAzimuth: (delta: number) => void;
  adjustDistance: (delta: number) => void;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSync(hexId: string, entityId: string, position: [number, number], isNew: boolean) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (isNew) {
      syncImpactSet(hexId, entityId, position);
    } else {
      syncImpactUpdate(hexId, entityId, { position });
    }
    // Update cache
    const cached = hexArtilleryData[hexId];
    if (cached) {
      cached.impact = position;
      cached.impactEntityId = entityId;
    }
  }, 50);
}

function computeImpactPosition(
  target: [number, number],
  azimuthDeg: number,
  distanceM: number,
): [number, number] {
  const azRad = (azimuthDeg * Math.PI) / 180;
  const distCRS = distanceM / METERS_PER_CRS_UNIT;
  return [
    target[0] + Math.sin(azRad) * distCRS,
    target[1] + Math.cos(azRad) * distCRS,
  ];
}

function generateId(): string {
  return 'qc-' + Math.random().toString(36).slice(2, 11);
}

function toMP(pos: [number, number]): MapPoint {
  return { x: pos[0], y: pos[1] };
}

/** Compute the 4 display values for the spotter HUD, reading live gun position from artillery state. */
export function getSpotterDisplayValues(ctx: SpotterContext): SpotterDisplayValues {
  const live = getLiveSpotterPositions();
  const gun = live.gun ? toMP(live.gun) : null;
  const target = live.target ? toMP(live.target) : toMP(ctx.targetPosition);
  const impact = toMP(ctx.impactPosition);

  const correction = calculateCorrection(target, impact);

  const absDist = gun ? crsDistanceMeters(gun, correction.corrected) : 0;
  const absAz = gun ? crsAzimuth(gun, correction.corrected) : 0;

  const deltaDist = correction.correctionDistM;
  const deltaAz = correction.correctionAzDeg;

  return { absDist, absAz, deltaDist, deltaAz };
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

  selectSpotterTarget: (hexId, hexName, target, targetEntityId, impact, impactEntityId, mainGunPosition) => {
    let azimuthDeg = 0;
    let distanceM = 0;
    let impactPosition: [number, number] = [target[0], target[1]];

    if (impact) {
      // Existing impact: compute az/dist from target to impact
      const dx = impact[0] - target[0];
      const dy = impact[1] - target[1];
      const distCRS = Math.sqrt(dx * dx + dy * dy);
      distanceM = distCRS * METERS_PER_CRS_UNIT;
      azimuthDeg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      impactPosition = [impact[0], impact[1]];
    }
    // No impact: az/dist stay 0,0 (impact starts at the target).
    // The baseline gun-to-target values are only for display in the QC window.

    set({
      mode: 'spotting',
      spotterCtx: {
        hexId,
        hexName,
        targetEntityId,
        targetPosition: target,
        mainGunPosition: mainGunPosition,
        impactEntityId: impactEntityId,
        impactPosition,
        azimuthDeg,
        distanceM,
      },
    });
  },

  adjustAzimuth: (delta) => {
    const ctx = get().spotterCtx;
    if (!ctx) return;

    const live = getLiveSpotterPositions();
    const target = live.target ?? ctx.targetPosition;
    const newAz = ((ctx.azimuthDeg + delta) % 360 + 360) % 360;
    const newDist = ctx.distanceM;
    const newImpact = computeImpactPosition(target, newAz, newDist);

    const isNew = ctx.impactEntityId === null;
    const entityId = ctx.impactEntityId ?? generateId();

    set({
      spotterCtx: {
        ...ctx,
        azimuthDeg: newAz,
        impactPosition: newImpact,
        impactEntityId: entityId,
      },
    });

    // Live update if viewing this hex
    const detail = useMapStore.getState().detailMode;
    const map = useMapStore.getState().mapInstance;
    if (detail?.apiName === ctx.hexId && map) {
      if (isNew) {
        setRemoteImpact(map, entityId, newImpact);
      } else {
        updateRemoteImpact(map, entityId, { position: newImpact });
      }
    }

    debouncedSync(ctx.hexId, entityId, newImpact, isNew);
  },

  adjustDistance: (delta) => {
    const ctx = get().spotterCtx;
    if (!ctx) return;

    const live = getLiveSpotterPositions();
    const target = live.target ?? ctx.targetPosition;
    let newDist = ctx.distanceM + delta;
    let newAz = ctx.azimuthDeg;
    if (newDist < 0) {
      newDist = -newDist;
      newAz = (newAz + 180) % 360;
    }
    const newImpact = computeImpactPosition(target, newAz, newDist);

    const isNew = ctx.impactEntityId === null;
    const entityId = ctx.impactEntityId ?? generateId();

    set({
      spotterCtx: {
        ...ctx,
        azimuthDeg: newAz,
        distanceM: newDist,
        impactPosition: newImpact,
        impactEntityId: entityId,
      },
    });

    // Live update if viewing this hex
    const detail = useMapStore.getState().detailMode;
    const map = useMapStore.getState().mapInstance;
    if (detail?.apiName === ctx.hexId && map) {
      if (isNew) {
        setRemoteImpact(map, entityId, newImpact);
      } else {
        updateRemoteImpact(map, entityId, { position: newImpact });
      }
    }

    debouncedSync(ctx.hexId, entityId, newImpact, isNew);
  },
}));
