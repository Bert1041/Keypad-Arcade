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
    __REBOUND_DEBUG__?: () => {
      started: boolean;
      level: number;
      score: number;
      x: number;
      y: number;
      over: boolean;
    };
    /** Skyline: a read-only look at the run. */
    __SKYLINE_DEBUG__?: () => {
      started: boolean;
      over: boolean;
      phase: 'swinging' | 'falling' | 'waiting' | 'over';
      floors: number;
      drops: number;
      score: number;
      inHand: number;
      hookX: number;
      topX: number;
      topRest: number;
    };
  }
}

export {};
