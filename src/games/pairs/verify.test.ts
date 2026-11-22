import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { createPairs, tick } from './logic/pairs';
import { replayRun, type PairsReplay } from './verify';

/**
 * Plays as a person with a good memory: when one card is up and its partner has been seen, turns
 * the partner; otherwise turns a card it has not seen yet. Taps every `pause` steps. Records the
 * replay as the scene does.
 */
function play(seed: number, pause = 20) {
  const random = seededRandom(seed);
  const state = createPairs(random);
  const replay: PairsReplay = { v: 1, taps: [] };
  const seen = new Map<number, number>(); // card index → its symbol, once seen
  let board = state.board;
  for (let step = 1; !state.over && step < 200_000; step++) {
    if (state.board !== board) {
      board = state.board;
      seen.clear();
    }
    let tap: number | null = null;
    if (step % pause === 0 && state.nextBoardAtMs === null) {
      const down = (i: number) => state.cards[i]?.face === 'down';
      const up = state.first;
      const symbol = up === null ? null : state.cards[up]?.symbol;
      const partner = [...seen].find(([i, s]) => i !== up && s === symbol && down(i))?.[0];
      const unseen = state.cards.findIndex((_, i) => down(i) && !seen.has(i));
      tap = partner ?? (unseen >= 0 ? unseen : state.cards.findIndex((_, i) => down(i)));
    }
    if (tap !== null) replay.taps.push([step, tap]);
    tick(state, { tap }, random);
    state.cards.forEach((c, i) => {
      if (c.face !== 'down') seen.set(i, c.symbol);
    });
  }
  return { state, replay };
}

describe('Pairs replays', () => {
  it('reproduce a played run’s score exactly', () => {
    for (const seed of [1, 42, 9999]) {
      const { state, replay } = play(seed);
      expect(state.over).toBe(true);
      expect(state.score).toBeGreaterThan(0);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for different taps or another seed', () => {
    const { state, replay } = play(7);
    const played = { ok: true, score: state.score };
    const slower = { v: 1, taps: replay.taps.map(([s, c]) => [s * 2, c]) };
    expect(replayRun(seededRandom(7), slower)).not.toEqual(played);
    expect(replayRun(seededRandom(8), replay)).not.toEqual(played);
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      { v: 1 },
      { v: 2, taps: [] },
      { v: 1, taps: [[0, 1]] },
      {
        v: 1,
        taps: [
          [3, 1],
          [3, 2],
        ],
      },
      { v: 1, taps: [[1, 36]] },
      { v: 1, taps: [[1, -1]] },
      { v: 1, taps: [[1, 1.5]] },
      { v: 1, taps: [['1', 1]] },
      { v: 1, taps: [[1, 1, 1]] },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay)).toEqual({
        ok: false,
        reason: 'not a Pairs replay',
      });
    }
  });

  it('reject inputs after the run ended', () => {
    const { replay } = play(3);
    const extra = { v: 1, taps: [...replay.taps, [100_000, 0]] };
    expect(replayRun(seededRandom(3), extra)).toEqual({
      ok: false,
      reason: 'inputs after the run ended',
    });
  });
});
