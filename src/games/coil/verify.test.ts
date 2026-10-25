import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { COLS, ROWS, createCoil, queueTurn, step, type CoilState, type Dir } from './logic/coil';
import { replayRun, type CoilReplay } from './verify';

const CODE = { up: 'u', down: 'd', left: 'l', right: 'r' } as const;

/** Steers toward the food, now and then queueing two turns before one step (as two quick swipes
 *  do), recording turns as the scene does. */
function play(seed: number) {
  const random = seededRandom(seed);
  let state: CoilState = createCoil(random, COLS, ROWS);
  const replay: CoilReplay = { v: 1, turns: [] };
  const turn = (dir: Dir, taken: number) => {
    state = queueTurn(state, dir);
    replay.turns.push([taken, CODE[dir]]);
  };
  for (let taken = 0; state.alive && taken < 5000; taken++) {
    const head = state.snake[0];
    if (head) {
      const dx = state.food.x - head.x;
      const dy = state.food.y - head.y;
      turn(dx !== 0 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up', taken);
      if (taken % 13 === 5) turn(dy > 0 ? 'down' : 'up', taken);
    }
    state = step(state, random).state;
  }
  return { state, replay };
}

describe('Coil replays', () => {
  it('reproduce a played run’s score exactly', () => {
    for (const seed of [1, 42, 9999]) {
      const { state, replay } = play(seed);
      expect(state.alive).toBe(false);
      expect(state.score).toBeGreaterThan(0);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for different inputs', () => {
    const { state, replay } = play(11);
    const half = { v: 1, turns: replay.turns.slice(0, Math.floor(replay.turns.length / 2)) };
    expect(replayRun(seededRandom(11), half)).not.toEqual({ ok: true, score: state.score });
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      { v: 1 },
      { v: 1, turns: [[0, 'x']] },
      { v: 1, turns: [[0, 'u', 1]] },
      { v: 1, turns: [[-1, 'u']] },
      {
        v: 1,
        turns: [
          [5, 'u'],
          [2, 'd'],
        ],
      },
      { v: 1, turns: [[1.5, 'u']] },
      { v: 1, turns: [['2', 'u']] },
      { v: 1, turns: Array.from({ length: 30_000 }, () => [0, 'u']) },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay)).toEqual({
        ok: false,
        reason: 'not a Coil replay',
      });
    }
  });

  it('reject inputs after the run ended', () => {
    const { replay } = play(3);
    const extra = { v: 1, turns: [...replay.turns, [9000, 'u']] };
    expect(replayRun(seededRandom(3), extra)).toEqual({
      ok: false,
      reason: 'inputs after the run ended',
    });
  });
});
