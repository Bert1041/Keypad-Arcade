// Shared by the app (which sets these) and the Playwright tests (which read them).
// All are present only in VITE_E2E=1 builds.

declare global {
  interface Window {
    __GAME_HOST_E2E__?: { liveGames(): number; playableGames(): number; pausedGames(): number };
    /**
     * Rebound: scripted input per level (index 0 = level 1), played deterministically. The
     * shape of Rebound's ScriptStep, written out because shell code may not import from inside
     * a game folder (src/architecture.test.ts); TypeScript checks the two match where used.
     */
    __REBOUND_SCRIPT__?: { ms: number; move?: number; jump?: boolean }[][];
    /** Rebound: a read-only look at the run, for tests of the controls and menu. */
    __REBOUND_DEBUG__?: () => { started: boolean; level: number; score: number; x: number };
  }
}

export {};
