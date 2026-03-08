import maplibregl from 'maplibre-gl';
import { hexes, W, H } from '../data/hexMapping';
import { mapPointToLngLat, toMapPoint } from '../data/coords';
import type { Feature, Polygon, FeatureCollection } from 'geojson';

let hexLabelMarkers: maplibregl.Marker[] = [];

export function createHexGrid(
  map: maplibregl.Map,
  onHexDblClick: (hexId: string) => void,
): { hexLabelMarkers: maplibregl.Marker[] } {
  // Build GeoJSON FeatureCollection for hex polygons
  const features: Feature<Polygon>[] = hexes.map((hex) => {
    const cy = hex.y - 128;
    const cx = hex.x + 128;
    const verts: [number, number][] = [
      mapPointToLngLat(toMapPoint(cx + W / 2, cy)),
      mapPointToLngLat(toMapPoint(cx + W / 4, cy - H / 2)),
      mapPointToLngLat(toMapPoint(cx - W / 4, cy - H / 2)),
      mapPointToLngLat(toMapPoint(cx - W / 2, cy)),
      mapPointToLngLat(toMapPoint(cx - W / 4, cy + H / 2)),
      mapPointToLngLat(toMapPoint(cx + W / 4, cy + H / 2)),
      mapPointToLngLat(toMapPoint(cx + W / 2, cy)), // close ring
    ];
    return {
      type: 'Feature',
      properties: { hexId: hex.hexId, name: hex.name },
      geometry: { type: 'Polygon', coordinates: [verts] },
    };
  });

  const geojson: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features,
  };

  map.addSource('hex-grid', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'hex-grid-fill',
    type: 'fill',
    source: 'hex-grid',
    paint: {
      'fill-color': 'rgba(255, 215, 0, 0.15)',
      'fill-opacity': 0,
    },
  });

  map.addLayer({
    id: 'hex-grid-line',
    type: 'line',
    source: 'hex-grid',
    paint: {
      'line-color': 'rgba(255, 255, 255, 0.45)',
      'line-width': 1,
    },
  });

  // Double-click on hex polygon
  map.on('dblclick', 'hex-grid-fill', (e) => {
    if (e.features && e.features.length > 0) {
      const hexId = e.features[0].properties?.hexId;
      if (hexId) onHexDblClick(hexId);
    }
  });

  // Create hex label markers
  hexLabelMarkers = hexes.map((hex) => {
    const cy = hex.y - 128;
    const cx = hex.x + 128;
    const lngLat = mapPointToLngLat(toMapPoint(cx, cy));

    const el = document.createElement('div');
    el.className = 'hex-label';
    el.textContent = hex.name;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(lngLat)
      .addTo(map);

    return marker;
  });

  return { hexLabelMarkers };
}

export function showHexGrid(map: maplibregl.Map): void {
  if (map.getLayer('hex-grid-fill')) map.setLayoutProperty('hex-grid-fill', 'visibility', 'visible');
  if (map.getLayer('hex-grid-line')) map.setLayoutProperty('hex-grid-line', 'visibility', 'visible');
}

export function hideHexGrid(map: maplibregl.Map): void {
  if (map.getLayer('hex-grid-fill')) map.setLayoutProperty('hex-grid-fill', 'visibility', 'none');
  if (map.getLayer('hex-grid-line')) map.setLayoutProperty('hex-grid-line', 'visibility', 'none');
}

export function showHexLabels(): void {
  for (const m of hexLabelMarkers) {
    m.getElement().style.display = '';
  }
}

export function hideHexLabels(): void {
  for (const m of hexLabelMarkers) {
    m.getElement().style.display = 'none';
  }
}

export function removeHexLabels(): void {
  for (const m of hexLabelMarkers) m.remove();
}

export function addHexLabels(map: maplibregl.Map): void {
  for (const m of hexLabelMarkers) m.addTo(map);
}
