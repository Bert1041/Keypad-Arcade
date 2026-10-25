import { defineConfig } from 'vite';

/**
 * Bundles the leaderboard API (server/api/*.ts) into self-contained files in api/, which Vercel
 * deploys as functions. Vercel's own TypeScript handling resolves neither the @/ alias nor
 * extensionless imports that the game code uses, so the function would crash on its first
 * request. The output is committed — Vercel finds functions before the build runs — and CI
 * checks it matches its source (npm run api:check).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Only code goes in api/: every file there is deployed as part of a function.
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'api',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      input: {
        scores: 'server/api/scores.ts',
        leaderboard: 'server/api/leaderboard.ts',
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        // Vercel serves every file in api/ as a function except those under an underscore.
        chunkFileNames: '_lib/[name].js',
      },
    },
  },
});
