import L from 'leaflet';

const bounds: L.LatLngBoundsLiteral = [[-256, 0], [0, 256]];

export function createMap(): { map: L.Map; tileLayer: L.TileLayer } {
  const map = L.map('map', {
    crs: L.CRS.Simple,
    center: [-128, 128],
    zoom: 3,
    minZoom: 0,
    maxZoom: 8,
    maxBounds: [[-270, -14], [14, 270]],
    zoomControl: false,
    attributionControl: false,
    doubleClickZoom: false,
  });

  const tileLayer = L.tileLayer('tile:///{z}/{z}_{x}_{y}.png', {
    minZoom: 0,
    maxZoom: 8,
    maxNativeZoom: 6,
    tileSize: 256,
    noWrap: true,
    bounds,
  }).addTo(map);

  return { map, tileLayer };
}
