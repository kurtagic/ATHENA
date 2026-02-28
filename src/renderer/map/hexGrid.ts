import L from 'leaflet';
import { hexes, W, H } from '../data/hexMapping';

export function createHexGrid(
  map: L.Map,
  onHexDblClick: (hexId: string) => void
): { hexGridLayer: L.LayerGroup; hexLabelLayer: L.LayerGroup } {
  const hexGridLayer = L.layerGroup().addTo(map);
  const hexLabelLayer = L.layerGroup();

  for (const hex of hexes) {
    const lat = hex.y - 128;
    const lng = hex.x + 128;
    const verts: L.LatLngTuple[] = [
      [lat,       lng + W / 2],
      [lat - H / 2, lng + W / 4],
      [lat - H / 2, lng - W / 4],
      [lat,       lng - W / 2],
      [lat + H / 2, lng - W / 4],
      [lat + H / 2, lng + W / 4],
    ];

    const polygon = L.polygon(verts, {
      color: 'rgba(255, 255, 255, 0.45)',
      weight: 1,
      opacity: 1,
      fillColor: 'rgba(255, 215, 0, 0.15)',
      fillOpacity: 0,
    }).addTo(hexGridLayer);

    polygon.on('dblclick', () => {
      onHexDblClick(hex.hexId);
    });

    L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'hex-label',
        html: hex.name,
        iconSize: [160, 20],
        iconAnchor: [80, 10],
      }),
    }).addTo(hexLabelLayer);
  }

  return { hexGridLayer, hexLabelLayer };
}
