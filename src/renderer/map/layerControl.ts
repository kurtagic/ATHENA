import type maplibregl from 'maplibre-gl';
import { useMapStore } from '../stores/mapStore';
import { useLayerStore } from '../stores/layerStore';
import { getDetailMode } from './detailView';
import { showHexLabels, hideHexLabels, showHexGrid, hideHexGrid } from './hexGrid';

let _map: maplibregl.Map;
let _staticLabelMarkers: maplibregl.Marker[] = [];

export function setStaticLabelMarkers(markers: maplibregl.Marker[]): void {
  _staticLabelMarkers = markers;
}

export function getStaticLabelMarkers(): maplibregl.Marker[] {
  return _staticLabelMarkers;
}

export function initLayerControl(map: maplibregl.Map): void {
  _map = map;
  map.on('zoomend', onZoomChange);
  map.once('load', onZoomChange);

  // Re-apply layer visibility whenever a toggle changes
  useLayerStore.subscribe(onZoomChange);
}

export function onZoomChange(): void {
  if (!_map) return;
  const z = _map.getZoom();
  useMapStore.getState().setZoomLevel(z);
  const layers = useLayerStore.getState().layers;

  const dm = getDetailMode();
  if (dm) {
    // Detail view: toggle subgrid visibility (zoom >= 4 AND hexGrid toggle on)
    const showSub = layers.hexGrid.visible && z >= 5;
    if (_map.getLayer('detail-subgrid-lines')) {
      _map.setLayoutProperty('detail-subgrid-lines', 'visibility', showSub ? 'visible' : 'none');
    }
    if (_map.getLayer('detail-subgrid-labels')) {
      _map.setLayoutProperty('detail-subgrid-labels', 'visibility', showSub ? 'visible' : 'none');
    }

    // Detail view: toggle main grid lines
    if (_map.getLayer('detail-grid-lines')) {
      _map.setLayoutProperty('detail-grid-lines', 'visibility', layers.hexGrid.visible ? 'visible' : 'none');
    }

    // Detail view: toggle grid label markers (A-Q / 1-15)
    if (dm.gridLabelMarkers) {
      for (const m of dm.gridLabelMarkers) {
        m.getElement().style.display = layers.hexGrid.visible ? '' : 'none';
      }
    }

    // Detail view: toggle location labels
    if (dm.labelMarkers) {
      for (const m of dm.labelMarkers) {
        m.getElement().style.display = layers.staticLabels.visible ? '' : 'none';
      }
    }
    return;
  }

  // World view: toggle hex grid + labels together
  if (layers.hexGrid.visible) {
    showHexGrid(_map);
    if (z >= 4) showHexLabels();
    else hideHexLabels();
  } else {
    hideHexGrid(_map);
    hideHexLabels();
  }

  // World view: toggle static labels at zoom >= 5
  const showStatic = layers.staticLabels.visible && z >= 6;
  for (const m of _staticLabelMarkers) {
    m.getElement().style.display = showStatic ? '' : 'none';
  }
}
