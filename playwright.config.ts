import { defineConfig, devices } from '@playwright/test';
import { LEADERBOARD_NOW } from './e2e/leaderboardClock';

const PORT = 4173;
const DEV_PORT = 5179;
const isCI = !!process.env.CI;
/**
 * The leaderboard tests need the local API and test Redis (npm run redis:test), so they run on
 * their own: npm run e2e:leaderboard. Their clock is fixed after Daily #1 — browser and server.
 */
const leaderboard = !!process.env.E2E_LEADERBOARD;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // No retries, even on CI: a retry hides exactly the flaky test we need to see.
  retries: 0,
  forbidOnly: isCI,
  reporter: isCI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  // Leaderboard specs only run in the leaderboard project; it runs nothing else.
  testIgnore: leaderboard ? undefined : 'leaderboard.spec.ts',
  projects: [
    ...(leaderboard
      ? [
          {
            name: 'leaderboard-android',
            testMatch: 'leaderboard.spec.ts',
            use: { ...devices['Pixel 7'] },
          },
          {
            name: 'leaderboard-iphone',
            testMatch: 'leaderboard.spec.ts',
            use: { ...devices['iPhone 14'] },
          },
        ]
      : []),
    // Budget Android is the primary target.
    { name: 'android-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 14'] } },
    // Desktop players: mouse and keyboard instead of touch.
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    // Firefox 157 (Playwright 1.64) will not start on macOS 27 ("Could not find profile folder",
    // even launched by hand), so locally it is opt-in. CI on Linux always runs it.
    ...(isCI || process.env.E2E_FIREFOX
      ? [{ name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } }]
      : []),
    // The dev server runs React StrictMode, which mounts every effect twice. That is the
    // harshest test of the game host's async create/destroy guard; production never does it.
    {
      name: 'dev-strictmode',
      testMatch: 'lifecycle.spec.ts',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  // A production build with lifecycle counters exposed — tests run against what ships,
  // including the service worker, not the dev server.
  webServer: [
    {
      command: `VITE_E2E=1 npm run build && npx vite preview --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_E2E=1 npx vite --port ${DEV_PORT} --strictPort`,
      port: DEV_PORT,
      reuseExistingServer: false,
    },
    ...(leaderboard
      ? [
          {
            command: `DEV_API_NOW=${LEADERBOARD_NOW} npx tsx --tsconfig tsconfig.node.json scripts/dev-api.ts`,
            port: 8788,
            reuseExistingServer: false,
          },
        ]
      : []),
  ],
});
