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
 * How far a player may re-time their *next* input after a mistimed one: someone who pressed a
 * little late reacts to where the ball actually is. The mistimed input itself gets no help — a
 * jump pressed too late into spikes stays fatal — only what follows it may adapt.
 */
export const COMPENSATE_MS = 6 * STEP_MS;

/**
 * The input changes in a solution that a player could not hit reliably: moved `nudgeMs` earlier
 * or later, the move dies within REACTION_MS — even when the next input change is re-timed by up
 * to COMPENSATE_MS to make up for it. Returned as boundary indexes (i = between step i and i+1).
 */
export function fragileBoundaries(
  level: Level,
  solution: readonly ScriptStep[],
  nudgeMs = NUDGE_MS,
): { boundary: number; late: boolean }[] {
  const fragile: { boundary: number; late: boolean }[] = [];
  const compensations = [0];
  for (let k = 1; k * STEP_MS <= COMPENSATE_MS + 1e-9; k++)
    compensations.push(k * STEP_MS, -k * STEP_MS);
  for (let i = 0; i < solution.length - 1; i++) {
    for (const delta of [-nudgeMs, nudgeMs]) {
      const survives = compensations.some((c) => {
        const result = playNudged(level, solution, i, delta, c);
        return result !== null && !result.events.some((e) => e.type === 'died');
      });
      if (!survives) fragile.push({ boundary: i, late: delta > 0 });
    }
  }
  return fragile;
}

/**
 * The script with input change `i` moved by `delta` ms and the next one by `compensate` ms.
 * Only those two boundaries move: every later input keeps its schedule, and the total length is
 * unchanged. Null when a step would become negative.
 */
export function nudgeScript(
  solution: readonly ScriptStep[],
  i: number,
  delta: number,
  compensate = 0,
): ScriptStep[] | null {
  const nudged = solution.map((s, j) =>
    j === i
      ? { ...s, ms: s.ms + delta }
      : j === i + 1
        ? { ...s, ms: s.ms - delta + compensate }
        : j === i + 2
          ? { ...s, ms: s.ms - compensate }
          : s,
  );
  return nudged.some((s) => s.ms < 0) ? null : nudged;
}

/**
 * Replays a solution nudged by nudgeScript(), for REACTION_MS after the change — the one
 * definition of "a nudge", for the fairness check and anything explaining it. If the script
 * ends sooner, the ball keeps going with no input: stopping the replay early would count a ball
 * still in the air as having survived.
 */
export function playNudged(
  level: Level,
  solution: readonly ScriptStep[],
  i: number,
  delta: number,
  compensate = 0,
): ReturnType<typeof playScript> | null {
  const nudged = nudgeScript(solution, i, delta, compensate);
  if (!nudged) return null;
  const changeAt = solution.slice(0, i + 1).reduce((t, s) => t + s.ms, 0) + delta;
  return playScript(level, truncate([...nudged, { ms: REACTION_MS }], changeAt + REACTION_MS));
}
