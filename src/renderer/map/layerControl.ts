import L from 'leaflet';
import { getDetailMode } from './detailView';

let _map: L.Map;
let _hexLabelLayer: L.LayerGroup;
let _staticLabelLayer: L.LayerGroup;

export function initLayerControl(
  map: L.Map,
  hexLabelLayer: L.LayerGroup,
  staticLabelLayer: L.LayerGroup,
): void {
  _map = map;
  _hexLabelLayer = hexLabelLayer;
  _staticLabelLayer = staticLabelLayer;

  map.on('zoomend', onZoomChange);
  map.whenReady(onZoomChange);
}

export function onZoomChange(): void {
  const z = _map.getZoom();
  const zoomEl = document.getElementById('zoom-level');
  if (zoomEl) zoomEl.textContent = `Z: ${z}`;

  const dm = getDetailMode();
  if (dm) {
    if (dm.subGridLayer) {
      if (z >= 5) _map.addLayer(dm.subGridLayer);
      else _map.removeLayer(dm.subGridLayer);
    }
    return;
  }

  if (z >= 3) _map.addLayer(_hexLabelLayer);
  else _map.removeLayer(_hexLabelLayer);

  if (z >= 5) _map.addLayer(_staticLabelLayer);
  else _map.removeLayer(_staticLabelLayer);
}
