import type { ArtySnapshot } from '../map/artillery';
import type { SavedStroke } from '../data/store';

export type UndoAction =
  | { type: 'drawing' }
  | { type: 'artillery'; snapshot: ArtySnapshot }
  | { type: 'eraser'; strokes: SavedStroke[] };

const MAX_UNDO = 50;
const stack: UndoAction[] = [];
const redoStack: UndoAction[] = [];

export function pushUndoAction(action: UndoAction): void {
  stack.push(action);
  if (stack.length > MAX_UNDO) stack.shift();
  redoStack.length = 0;
}

export function popUndoAction(): UndoAction | null {
  const action = stack.pop() ?? null;
  if (action) redoStack.push(action);
  return action;
}

export function popRedoAction(): UndoAction | null {
  const action = redoStack.pop() ?? null;
  if (action) stack.push(action);
  return action;
}

export function clearUndoStack(): void {
  stack.length = 0;
  redoStack.length = 0;
}

export function canUndo(): boolean {
  return stack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}
