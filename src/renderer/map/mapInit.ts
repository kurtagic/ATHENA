import maplibregl from 'maplibre-gl';
import { mapPointToLngLat } from '../data/coords';
import { tileUrlTemplate } from '../data/assetUrl';

const isElectron = !!(window as any).athena;

export function createMap(container: HTMLElement): maplibregl.Map {
  // Register tile:// protocol only in Electron
  if (isElectron) {
    maplibregl.addProtocol('tile', (params: { url: string }, abortController: AbortController) => {
      return new Promise<{ data: ArrayBuffer }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', params.url, true);
        xhr.responseType = 'arraybuffer';

        abortController.signal.addEventListener('abort', () => xhr.abort());

        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve({ data: xhr.response as ArrayBuffer });
          } else {
            reject(new Error(`Tile fetch failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error(`Tile fetch error: ${params.url}`));
        xhr.onabort = () => reject(new Error('aborted'));

        xhr.send();
      });
    });
  }

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
          minzoom: 0,
          maxzoom: 6,
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
    zoom: 3,
    minZoom: 0,
    maxZoom: 8,
    renderWorldCopies: false,
    doubleClickZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
  });

  return map;
}
