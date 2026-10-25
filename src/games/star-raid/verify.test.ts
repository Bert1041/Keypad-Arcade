import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { WIDTH, createRaid, tick, type RaidInput } from './logic/raid';
import { replayRun, type RaidReplay } from './verify';

/** Sweeps the ship back and forth with a finger, sometimes the keys, recording as the scene does. */
function play(seed: number) {
  const random = seededRandom(seed);
  const state = createRaid();
  const replay: RaidReplay = { v: 1, input: [] };
  let recorded: RaidInput = { targetX: null, axis: 0 };
  for (let step = 1; state.alive && step < 200_000; step++) {
    const phase = Math.floor(step / 90) % 6;
    const input: RaidInput =
      phase < 4
        ? { targetX: Math.round(WIDTH / 2 + ((step % 360) - 180)), axis: 0 }
        : { targetX: null, axis: phase === 4 ? -1 : 1 };
    if (input.targetX !== recorded.targetX || input.axis !== recorded.axis) {
      replay.input.push([step, input.targetX, input.axis]);
      recorded = input;
    }
    tick(state, input, random);
  }
  return { state, replay };
}

describe('Star Raid replays', () => {
  it('reproduce a played run’s score exactly', () => {
    for (const seed of [1, 42]) {
      const { state, replay } = play(seed);
      expect(state.alive).toBe(false);
      expect(state.score).toBeGreaterThan(0);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for different inputs', () => {
    const { state, replay } = play(5);
    const shifted = {
      v: 1,
      input: replay.input.map(([s, x, a]) => [s, x === null ? null : x + 40, a]),
    };
    expect(replayRun(seededRandom(5), shifted)).not.toEqual({ ok: true, score: state.score });
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      { v: 1 },
      { v: 1, input: [[1, 10]] },
      { v: 1, input: [[0, 10, 0]] },
      {
        v: 1,
        input: [
          [2, 10, 0],
          [2, 11, 0],
        ],
      },
      { v: 1, input: [[1, 10.5, 0]] },
      { v: 1, input: [[1, 99_999, 0]] },
      { v: 1, input: [[1, null, 2]] },
      { v: 1, input: [[1, '10', 0]] },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay)).toEqual({
        ok: false,
        reason: 'not a Star Raid replay',
      });
    }
  });

  it('reject inputs after the run ended', () => {
    const { replay } = play(3);
    const extra = { v: 1, input: [...replay.input, [107_000, 1, 0]] };
    expect(replayRun(seededRandom(3), extra)).toEqual({
      ok: false,
      reason: 'inputs after the run ended',
    });
  });
});
