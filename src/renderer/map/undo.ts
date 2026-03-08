import type maplibregl from 'maplibre-gl';
import { popUndoAction } from '../data/undoStack';
import { undoStroke, restoreErasedStrokes } from './drawing';
import { restoreArtySnapshot } from './artillery';

export function performUndo(map: maplibregl.Map): void {
  const action = popUndoAction();
  if (!action) return;
  if (action.type === 'drawing') {
    undoStroke();
  } else if (action.type === 'eraser') {
    restoreErasedStrokes(action.strokes);
  } else {
    restoreArtySnapshot(action.snapshot, map);
  }
}
