import { create } from 'zustand';
import type { BrushPattern } from './drawStore';

// ── Stroke snapshots ──

export interface StrokeSnapshot {
  id: string;
  points: [number, number][];
  color: string;
  weight: number;
  opacity: number;
  brushPattern?: BrushPattern;
}

// ── Gun snapshots ──

export interface GunSnapshot {
  entityId: string;
  position: [number, number];
  label: string;
  platformIndex: number | undefined;
  wasMain: boolean;
  posIndex: number;
}

// ── Action types ──

interface StrokeAddedAction {
  type: 'stroke-added';
  hexId: string;
  stroke: StrokeSnapshot;
}

interface StrokesErasedAction {
  type: 'strokes-erased';
  hexId: string;
  strokes: StrokeSnapshot[];
}

interface GunAddedAction {
  type: 'gun-added';
  hexId: string;
  gun: GunSnapshot;
}

interface GunRemovedAction {
  type: 'gun-removed';
  hexId: string;
  gun: GunSnapshot;
}

interface GunMovedAction {
  type: 'gun-moved';
  hexId: string;
  entityId: string;
  from: [number, number];
  to: [number, number];
}

interface TargetSetAction {
  type: 'target-set';
  hexId: string;
  position: [number, number];
  entityId: string;
  prevTarget: [number, number] | null;
  prevTargetEntityId: string | null;
  prevImpact: [number, number] | null;
  prevImpactEntityId: string | null;
}

interface TargetMovedAction {
  type: 'target-moved';
  hexId: string;
  entityId: string;
  from: [number, number];
  to: [number, number];
  impactEntityId: string | null;
  impactFrom: [number, number] | null;
  impactTo: [number, number] | null;
}

interface ImpactSetAction {
  type: 'impact-set';
  hexId: string;
  position: [number, number];
  entityId: string;
  prevImpact: [number, number] | null;
  prevImpactEntityId: string | null;
}

interface ImpactMovedAction {
  type: 'impact-moved';
  hexId: string;
  entityId: string;
  from: [number, number];
  to: [number, number];
}

interface EnemyMarkerAddedAction {
  type: 'enemy-marker-added';
  hexId: string;
  entityId: string;
  position: [number, number];
  platformIndex: number;
  label: string;
}

interface EnemyMarkerRemovedAction {
  type: 'enemy-marker-removed';
  hexId: string;
  entityId: string;
  position: [number, number];
  platformIndex: number;
  label: string;
}

interface EnemyMarkerMovedAction {
  type: 'enemy-marker-moved';
  hexId: string;
  entityId: string;
  from: [number, number];
  to: [number, number];
}

export type UndoableAction =
  | StrokeAddedAction
  | StrokesErasedAction
  | GunAddedAction
  | GunRemovedAction
  | GunMovedAction
  | TargetSetAction
  | TargetMovedAction
  | ImpactSetAction
  | ImpactMovedAction
  | EnemyMarkerAddedAction
  | EnemyMarkerRemovedAction
  | EnemyMarkerMovedAction;

const MAX_STACK_SIZE = 50;

interface UndoState {
  undoStacks: Record<string, UndoableAction[]>;
  redoStacks: Record<string, UndoableAction[]>;
  pushAction: (action: UndoableAction) => void;
  popUndo: (hexId: string) => UndoableAction | undefined;
  popRedo: (hexId: string) => UndoableAction | undefined;
  canUndo: (hexId: string) => boolean;
  canRedo: (hexId: string) => boolean;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStacks: {},
  redoStacks: {},

  pushAction: (action) => set((s) => {
    const hexId = action.hexId;
    const stack = [...(s.undoStacks[hexId] ?? []), action];
    if (stack.length > MAX_STACK_SIZE) stack.shift();
    return {
      undoStacks: { ...s.undoStacks, [hexId]: stack },
      redoStacks: { ...s.redoStacks, [hexId]: [] },
    };
  }),

  popUndo: (hexId) => {
    const s = get();
    const stack = s.undoStacks[hexId];
    if (!stack || stack.length === 0) return undefined;
    const action = stack[stack.length - 1];
    const newUndo = stack.slice(0, -1);
    const newRedo = [...(s.redoStacks[hexId] ?? []), action];
    set({
      undoStacks: { ...s.undoStacks, [hexId]: newUndo },
      redoStacks: { ...s.redoStacks, [hexId]: newRedo },
    });
    return action;
  },

  popRedo: (hexId) => {
    const s = get();
    const stack = s.redoStacks[hexId];
    if (!stack || stack.length === 0) return undefined;
    const action = stack[stack.length - 1];
    const newRedo = stack.slice(0, -1);
    const newUndo = [...(s.undoStacks[hexId] ?? []), action];
    set({
      undoStacks: { ...s.undoStacks, [hexId]: newUndo },
      redoStacks: { ...s.redoStacks, [hexId]: newRedo },
    });
    return action;
  },

  canUndo: (hexId) => {
    const stack = get().undoStacks[hexId];
    return !!stack && stack.length > 0;
  },

  canRedo: (hexId) => {
    const stack = get().redoStacks[hexId];
    return !!stack && stack.length > 0;
  },
}));
