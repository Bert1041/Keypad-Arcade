import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { NO_INPUT, SHOOTER_Y, createPopShot, tick, type PopShotInput } from './logic/popShot';
import { replayRun, type PopShotReplay } from './verify';

/**
 * Sweeps the aim back and forth and fires every `every` steps, so shots land all over the board
 * and some miss; records input changes as the scene does. Runs until the pile buries the player.
 */
function play(seed: number, every = 40) {
  const random = seededRandom(seed);
  const state = createPopShot(random);
  const replay: PopShotReplay = { v: 1, input: [] };
  let recorded: PopShotInput = NO_INPUT;
  for (let step = 1; !state.over && step < 200_000; step++) {
    const sweep = Math.floor(step / every) % 9;
    const input: PopShotInput = {
      aimX: 20 + sweep * 40,
      aimY: SHOOTER_Y - 260,
      fire: step % every === 0,
    };
    if (
      input.aimX !== recorded.aimX ||
      input.aimY !== recorded.aimY ||
      input.fire !== recorded.fire
    ) {
      replay.input.push([step, input.aimX, input.aimY, input.fire ? 1 : 0]);
      recorded = input;
    }
    tick(state, input, random);
  }
  return { state, replay };
}

describe('Pop Shot replays', () => {
  it('reproduce a played run’s score exactly', () => {
    for (const seed of [1, 42, 9999]) {
      const { state, replay } = play(seed);
      expect(state.over).toBe(true);
      expect(state.score).toBeGreaterThan(50);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for different input or another seed', () => {
    const { state, replay } = play(7);
    const played = { ok: true, score: state.score };
    const shifted = {
      v: 1,
      input: replay.input.map(([s, x, y, fire]) => [s, x + 37, y, fire]), // a bubble over
    };
    expect(replayRun(seededRandom(7), shifted)).not.toEqual(played);
    expect(replayRun(seededRandom(8), replay)).not.toEqual(played);
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      { v: 2, input: [] },
      { v: 1 },
      { v: 1, input: [[1, 10, 0]] },
      { v: 1, input: [[0, 10, 0, 0]] },
      {
        v: 1,
        input: [
          [2, 10, 0, 0],
          [2, 11, 0, 0],
        ],
      },
      { v: 1, input: [[1, 10.5, 0, 0]] },
      { v: 1, input: [[1, 10, null, 0]] },
      { v: 1, input: [[1, 10, 0, 2]] },
      { v: 1, input: [[1, 99_999, 0, 0]] },
      { v: 1, input: [[1, 10, -99_999, 0]] },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay)).toEqual({
        ok: false,
        reason: 'not a Pop Shot replay',
      });
    }
  });

  it('reject inputs after the run ended', () => {
    const { replay } = play(3);
    const last = replay.input.at(-1)?.[0] ?? 0;
    const extra = { v: 1, input: [...replay.input, [last + 5000, 0, 0, 0]] };
    expect(replayRun(seededRandom(3), extra)).toEqual({
      ok: false,
      reason: 'inputs after the run ended',
    });
  });

  it('a player who never fires is fired for, so even an empty replay ends', () => {
    const idle = replayRun(seededRandom(3), { v: 1, input: [] });
    expect(idle.ok).toBe(true);
  });
});
