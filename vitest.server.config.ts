import { defineConfig } from 'vitest/config';

/**
 * Leaderboard server tests, against a real Redis behind Upstash's REST adapter (never mocks):
 * locally `npm run redis:test` starts both (needs redis-server and Docker); CI runs them as
 * services. One file at a time —
 * they share the database.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
