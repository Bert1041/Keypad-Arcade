import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/appInfo.ts';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    // The Phaser chunk is expected to be large; scripts/check-budget.ts guards what matters.
    chunkSizeWarningLimit: 1300,
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': a new deploy must never reload the page mid-run.
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: APP_NAME,
        // Home-screen labels truncate around 12 characters.
        short_name: 'Keypad',
        description: 'Original pocket games inspired by the phones we grew up with.',
        theme_color: '#0f1a0f',
        background_color: '#0f1a0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Game chunks are lazy-loaded but must still be precached, or a game opened offline fails.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Phaser alone is over Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
});
