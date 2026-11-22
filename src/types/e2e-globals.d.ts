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
    /** The last finished run as the game reported it, replay included (leaderboard tests). */
    __LAST_RUN__?: { gameId: string; seed: number; score: number; replay?: unknown };
    /** Pairs: a read-only look at the run, including where each card is drawn. */
    __PAIRS_DEBUG__?: () => {
      started: boolean;
      over: boolean;
      board: number;
      cols: number;
      rows: number;
      score: number;
      leftMs: number;
      faces: ('down' | 'up' | 'matched')[];
      symbols: number[];
      centres: { x: number; y: number }[];
    };
    /** Plunge: a read-only look at the run. */
    __PLUNGE_DEBUG__?: () => {
      started: boolean;
      over: boolean;
      lives: number;
      score: number;
      ball: { x: number; y: number; on: number | null };
      deaths: { x: number; y: number }[];
    };
    /** Wallbreak: a read-only look at the run. */
    __WALLBREAK_DEBUG__?: () => {
      started: boolean;
      over: boolean;
      serving: boolean;
      level: number;
      lives: number;
      score: number;
      bricks: number;
      paddleX: number;
      balls: { x: number; y: number }[];
    };
    /** Seeds: a read-only look at the run. */
    __SEEDS_DEBUG__?: () => {
      started: boolean;
      over: boolean;
      busy: boolean;
      turn: 'player' | 'phone';
      game: number;
      score: number;
      board: number[];
      shown: number[];
      results: ('won' | 'lost' | 'drawn')[];
      pits: { x: number; y: number }[];
    };
    /** Pop Shot: a read-only look at the run. */
    __POP_SHOT_DEBUG__?: () => {
      started: boolean;
      over: boolean;
      score: number;
      shots: number;
      pushes: number;
      flying: boolean;
      rows: string[];
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
