import type maplibregl from 'maplibre-gl';
import { popUndoAction, popRedoAction } from '../data/undoStack';
import { undoStroke, restoreErasedStrokes, redoStroke, removeMatchingStrokes } from './drawing';
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

export function performRedo(map: maplibregl.Map): void {
  const action = popRedoAction();
  if (!action) return;
  if (action.type === 'drawing') {
    redoStroke();
  } else if (action.type === 'eraser') {
    removeMatchingStrokes(action.strokes);
  }
  // artillery redo skipped — snapshot-based redo is complex
}
