import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { rmSync } from 'node:fs';
import path from 'node:path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './athena',
    extraResource: ['./static', './assets', './athena.ico'],
  },
  hooks: {
    postPackage: async (_forgeConfig, options) => {
      const outDir = options.outputPaths[0];
      const tilesDir = path.join(outDir, 'resources', 'assets', 'tiles');
      for (const z of [5, 6]) {
        const dir = path.join(tilesDir, String(z));
        try {
          rmSync(dir, { recursive: true, force: true });
          console.log(`[forge] Removed: ${dir}`);
        } catch {}
      }
    },
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: { iconUrl: 'file:///athena.ico', setupIcon: './athena.ico' } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload/pipPreload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload/notesPipPreload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload/minimapPipPreload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
