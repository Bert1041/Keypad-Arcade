import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/appInfo.ts';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The leaderboard API: Vercel serves /api in production; locally scripts/dev-api.ts does.
  server: { proxy: { '/api': 'http://localhost:8788' } },
  preview: { proxy: { '/api': 'http://localhost:8788' } },
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
        theme_color: '#0d0e14',
        background_color: '#0d0e14',
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
        // /api is the leaderboard server: never answer it from the cache with the app's page.
        navigateFallbackDenylist: [/^\/api\//],
        // Game chunks are lazy-loaded but must still be precached, or a game opened offline fails.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Phaser alone is over Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
});
