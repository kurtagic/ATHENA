import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import fs from 'fs';

function serveLocalAssets(): Plugin {
  const assetsDir = path.resolve(__dirname, 'assets');
  const staticFile = path.resolve(__dirname, 'static/static_data.json');

  return {
    name: 'serve-local-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        if (req.url === '/static_data.json') {
          if (fs.existsSync(staticFile)) {
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(staticFile).pipe(res);
          } else {
            res.statusCode = 404;
            res.end('Not found');
          }
          return;
        }

        if (req.url.startsWith('/assets/')) {
          const filePath = path.join(assetsDir, req.url.slice('/assets/'.length));
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.webp': 'image/webp',
              '.svg': 'image/svg+xml',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
          } else {
            res.statusCode = 404;
            res.end('Not found');
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveLocalAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5173,
  },
  publicDir: false,
  build: {
    outDir: 'dist-web',
  },
});
