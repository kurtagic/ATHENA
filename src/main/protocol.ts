import { app, net, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const assetsRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(app.getAppPath(), 'assets');

const TILE_ROOT = path.join(assetsRoot, 'tiles');
const ICON_ROOT = path.join(assetsRoot, 'icons');
const HEX_MAP_ROOT = path.join(assetsRoot, 'hexmaps');
const LIB_ROOT = path.join(assetsRoot, 'lib');

export function registerTileProtocol(): void {
  protocol.handle('tile', async (request) => {
    const url = new URL(request.url);
    const relPath = url.pathname.replace(/^\/+/, '');

    let filePath: string;
    let contentType = 'image/png';

    if (relPath.startsWith('lib/')) {
      // Serve library files from assets/lib/
      const libFile = relPath.slice(4); // e.g. "maplibre-gl.js"
      filePath = path.join(LIB_ROOT, libFile);
      if (filePath.endsWith('.js')) contentType = 'application/javascript';
      else if (filePath.endsWith('.css')) contentType = 'text/css';
    } else if (relPath.startsWith('icons/')) {
      filePath = path.join(ICON_ROOT, relPath.slice(6));
    } else if (relPath.startsWith('hexmaps/')) {
      filePath = path.join(HEX_MAP_ROOT, relPath.slice(8));
    } else {
      filePath = path.join(TILE_ROOT, ...relPath.split('/'));
    }

    try {
      const data = await readFile(filePath);
      return new Response(data, {
        headers: { 'Content-Type': contentType },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
