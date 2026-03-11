import maplibregl from 'maplibre-gl';
import { mapPointToLngLat } from '../data/coords';
import { tileUrlTemplate } from '../data/assetUrl';

const isElectron = !!(window as any).athena;

// 1x1 transparent PNG
const TRANSPARENT_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg=='),
  c => c.charCodeAt(0),
).buffer;

function fetchAsArrayBuffer(url: string, signal: AbortSignal): Promise<{ data: ArrayBuffer }> {
  if (isElectron) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      signal.addEventListener('abort', () => xhr.abort());
      xhr.onload = () => {
        if (xhr.status === 200) resolve({ data: xhr.response as ArrayBuffer });
        else reject(new Error(`Tile fetch failed: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error(`Tile fetch error: ${url}`));
      xhr.onabort = () => reject(new Error('aborted'));
      xhr.send();
    });
  }
  return fetch(url, { signal }).then(r => r.arrayBuffer()).then(data => ({ data }));
}

export function createMap(container: HTMLElement): maplibregl.Map {
  // Register tile:// protocol with tile index remapping (both Electron and web)
  maplibregl.addProtocol('tile', (params: { url: string }, abortController: AbortController) => {
    // Check if this is a z/x/y tile request (vs hexmaps, icons)
    const tileMatch = params.url.match(/\/(\d+)\/\d+_(\d+)_(\d+)\.png/);

    if (tileMatch) {
      const z = parseInt(tileMatch[1]);
      const x = parseInt(tileMatch[2]);
      const y = parseInt(tileMatch[3]);

      // Remap: content occupies center quarter of tile grid
      const origZ = z - 1;
      const offset = 1 << (z - 2);
      const origX = x - offset;
      const origY = y - offset;

      // Out of bounds or below min original zoom: transparent
      if (z < 2 || origX < 0 || origY < 0 || origX >= (1 << origZ) || origY >= (1 << origZ)) {
        return Promise.resolve({ data: TRANSPARENT_PNG.slice(0) });
      }

      const remappedUrl = isElectron
        ? `tile:///${origZ}/${origZ}_${origX}_${origY}.png`
        : `/assets/tiles/${origZ}/${origZ}_${origX}_${origY}.png`;

      return fetchAsArrayBuffer(remappedUrl, abortController.signal);
    }

    // Non-tile asset (hexmaps, icons) — pass through
    const passUrl = isElectron
      ? params.url
      : params.url.replace('tile:///', '/assets/');

    return fetchAsArrayBuffer(passUrl, abortController.signal);
  });

  const center = mapPointToLngLat({ x: 128, y: -128 });

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'world-tiles': {
          type: 'raster',
          tiles: [tileUrlTemplate()],
          tileSize: 256,
          minzoom: 2,
          maxzoom: 4,
          scheme: 'xyz',
        },
      },
      layers: [
        {
          id: 'world-tiles',
          type: 'raster',
          source: 'world-tiles',
        },
      ],
    },
    center: [center[0], center[1]],
    zoom: 4,
    minZoom: 0,
    maxZoom: 9,
    renderWorldCopies: false,
    doubleClickZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
  });

  return map;
}
