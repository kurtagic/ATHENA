import 'leaflet/dist/leaflet.css';
import './styles/map.css';
import { createMap } from './map/mapInit';
import { createHexGrid } from './map/hexGrid';
import { initLayerControl, onZoomChange } from './map/layerControl';
import { initDetailView, enterDetailMode, exitDetailMode, getDetailMode, getSelectedHexes } from './map/detailView';
import { setupDrawingEvents, undoStroke, restoreErasedStrokes } from './map/drawing';
import { popUndoAction } from './data/undoStack';
import { setupArtilleryEvents, getArtilleryState, setPlacementMode, restoreArtySnapshot } from './map/artillery';
import { updateWarStatus, updateHexItems, updateStaticLabels, setDetailRefreshCallback } from './data/dataHandlers';
import { renderDetailMarkers } from './map/detailView';
import L from 'leaflet';
import { SELECTION_POLL_MS } from '../shared/constants';

// Fix Leaflet default icon paths for bundled environment
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// Init map
const { map, tileLayer } = createMap();

// Custom pane so text labels render above structure icons (markerPane z=600)
const labelPane = map.createPane('labelPane');
labelPane.style.zIndex = '610';

// Init hex grid
const { hexGridLayer, hexLabelLayer } = createHexGrid(map, (hexId) => {
  if (!getDetailMode()) {
    enterDetailMode(hexId);
  }
});

// Static label layer (shown at zoom >= 5)
const staticLabelLayer = L.layerGroup();

// Init layer control
initLayerControl(map, hexLabelLayer, staticLabelLayer);

// Init detail view
initDetailView(map, tileLayer, hexGridLayer, hexLabelLayer, staticLabelLayer, onZoomChange);

// Wire detail refresh: when hex items update, refresh detail markers if in detail mode
setDetailRefreshCallback((mapName) => {
  const dm = getDetailMode();
  if (dm && dm.apiName === mapName) {
    renderDetailMarkers(mapName);
  }
});

// Init drawing events
setupDrawingEvents(map);

// Init artillery events
setupArtilleryEvents(map);

// Unified undo (drawing + artillery)
function performUndo(): void {
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'z' && (e.ctrlKey || e.metaKey) && getDetailMode()) {
    e.preventDefault();
    performUndo();
  }
});

document.getElementById('draw-undo-btn')?.addEventListener('click', () => {
  performUndo();
});

// Back button + Escape for detail mode exit
document.getElementById('back-btn')?.addEventListener('click', () => {
  exitDetailMode();
});

// Quit button
document.getElementById('quit-btn')?.addEventListener('click', () => {
  (window as any).athena?.quit();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const as = getArtilleryState();
    if (as.placementMode !== 'idle') {
      setPlacementMode('idle');
    } else if (getDetailMode()) {
      exitDetailMode();
    }
  }
});

// IPC listeners
const athena = (window as any).athena;
if (athena) {
  athena.onWarStatus((data: any) => {
    updateWarStatus(data);
  });

  athena.onHexItems((data: any) => {
    updateHexItems(data);
  });

  // Load static data
  athena.loadStaticData().then((staticData: Record<string, any[]> | null) => {
    if (!staticData) {
      console.log('[Athena] static_data.json not found — run fetch-static first');
      return;
    }
    const keys = Object.keys(staticData);
    console.log(`[Athena] static_data.json keys (${keys.length}):`, keys);
    for (const [mapName, labels] of Object.entries(staticData)) {
      updateStaticLabels({ mapName, labels }, staticLabelLayer);
    }
    console.log(`[Athena] Loaded static labels for ${keys.length} hexes from disk`);
  });

  // Poll selected hexes and send to main process
  setInterval(() => {
    athena.setSelectedHexes(getSelectedHexes());
  }, SELECTION_POLL_MS);
}
