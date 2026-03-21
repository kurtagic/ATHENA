import { useMapStore } from '../stores/mapStore';
import { hexDrawingData, hexArtilleryData, hexEnemyMarkerData, hexDynamicData } from '../data/store';
import { saveDrawState } from '../map/drawing';
import { saveArtilleryState } from '../map/artillery';
import { saveEnemyMarkerState } from '../map/enemyMarkers';

export function minimapNotify(layer: string, hexId: string): void {
  if (!useMapStore.getState().minimapPinned) return;

  const currentHexId = useMapStore.getState().detailMode?.apiName;
  const isCurrentHex = hexId === currentHexId;

  let data: unknown;
  if (layer === 'strokes') {
    data = isCurrentHex ? saveDrawState() : hexDrawingData[hexId];
  } else if (layer === 'artillery') {
    data = isCurrentHex ? saveArtilleryState() : hexArtilleryData[hexId];
  } else if (layer === 'enemies') {
    data = isCurrentHex ? saveEnemyMarkerState() : hexEnemyMarkerData[hexId];
  } else if (layer === 'structures') {
    data = hexDynamicData[hexId];
  }

  window.athena.updateMinimapPip(layer, data);
}
