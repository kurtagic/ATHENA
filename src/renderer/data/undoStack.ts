import type { ArtySnapshot } from '../map/artillery';
import type { SavedStroke } from '../data/store';

export type UndoAction =
  | { type: 'drawing' }
  | { type: 'artillery'; snapshot: ArtySnapshot }
  | { type: 'eraser'; strokes: SavedStroke[] };

const MAX_UNDO = 50;
const stack: UndoAction[] = [];

export function pushUndoAction(action: UndoAction): void {
  stack.push(action);
  if (stack.length > MAX_UNDO) stack.shift();
}

export function popUndoAction(): UndoAction | null {
  return stack.pop() ?? null;
}

export function clearUndoStack(): void {
  stack.length = 0;
}
