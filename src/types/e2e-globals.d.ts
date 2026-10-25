// Shared by the app (which sets it) and the Playwright tests (which read it).
interface Window {
  /** Present only in VITE_E2E=1 builds. */
  __GAME_HOST_E2E__?: { liveGames(): number; playableGames(): number };
}
