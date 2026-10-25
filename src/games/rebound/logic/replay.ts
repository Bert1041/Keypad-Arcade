import type { Level } from './level';
import {
  NO_INPUT,
  STEP_MS,
  createRebound,
  tick,
  type ReboundEvent,
  type ReboundInput,
} from './rebound';

/** Hold an input for `ms`. A level's solution is a list of these. */
export interface ScriptStep {
  ms: number;
  move?: number;
  jump?: boolean;
}

/**
 * Turns a script into one input per simulation step. The only definition of how long a step
 * lasts: the tests and the e2e-driven game both use it, so they cannot drift apart (they did,
 * when each counted milliseconds its own way).
 */
export function* scriptInputs(steps: readonly ScriptStep[]): Generator<ReboundInput> {
  for (const step of steps) {
    const ticks = Math.round(step.ms / STEP_MS);
    const input: ReboundInput = { move: step.move ?? 0, jump: step.jump ?? false };
    for (let i = 0; i < ticks; i++) yield input;
  }
}

/**
 * Plays a scripted input sequence through one level and reports what happened. Used to prove
 * every level can be finished: each ships with a solution, replayed in the tests.
 */
export function playScript(level: Level, script: readonly ScriptStep[]) {
  const state = createRebound([level]);
  const events: ReboundEvent[] = [];
  for (const input of scriptInputs(script)) {
    events.push(...tick(state, input));
    if (state.levelCleared || state.over) return { state, events };
  }
  // Keep the last moment going a little, as a player holding still would.
  events.push(...tick(state, NO_INPUT));
  return { state, events };
}

/** Two ticks: how far off a player's timing can be at each input change. */
export const NUDGE_MS = 2 * STEP_MS;
/**
 * How long after a nudged input change the ball must survive: the move and its landing. Time,
 * not a number of steps — one long held step would otherwise stretch the window to seconds of
 * play no player would leave uncorrected.
 */
export const REACTION_MS = 1500;

/** The script cut off `ms` after it starts (the last step shortened to fit). */
function truncate(solution: readonly ScriptStep[], ms: number): ScriptStep[] {
  const out: ScriptStep[] = [];
  let left = ms;
  for (const step of solution) {
    if (left <= 0) break;
    out.push({ ...step, ms: Math.min(step.ms, left) });
    left -= step.ms;
  }
  return out;
}

/**
 * The input changes in a solution that a player could not hit reliably: moved `nudgeMs` earlier
 * or later (only that boundary; everything after stays on schedule), the move it belongs to
 * dies. Later steps are not judged — a player, unlike a fixed script, adjusts to where the ball
 * actually landed. Returned as boundary indexes (i = between step i and i + 1).
 */
export function fragileBoundaries(
  level: Level,
  solution: readonly ScriptStep[],
  nudgeMs = NUDGE_MS,
): { boundary: number; late: boolean }[] {
  const fragile: { boundary: number; late: boolean }[] = [];
  for (let i = 0; i < solution.length - 1; i++) {
    for (const delta of [-nudgeMs, nudgeMs]) {
      const result = playNudged(level, solution, i, delta);
      if (result?.events.some((e) => e.type === 'died')) {
        fragile.push({ boundary: i, late: delta > 0 });
      }
    }
  }
  return fragile;
}

/**
 * Replays a solution with input change `i` moved by `delta` ms, up to REACTION_MS after it —
 * the one definition of "a nudge", for the fairness check and for anything explaining it.
 * Null when the nudge would make a step negative.
 */
export function playNudged(
  level: Level,
  solution: readonly ScriptStep[],
  i: number,
  delta: number,
): ReturnType<typeof playScript> | null {
  const nudged = solution.map((s, j) =>
    j === i ? { ...s, ms: s.ms + delta } : j === i + 1 ? { ...s, ms: s.ms - delta } : s,
  );
  if (nudged.some((s) => s.ms < 0)) return null;
  const changeAt = solution.slice(0, i + 1).reduce((t, s) => t + s.ms, 0) + delta;
  return playScript(level, truncate(nudged, changeAt + REACTION_MS));
}
