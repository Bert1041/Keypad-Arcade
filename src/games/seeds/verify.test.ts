import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import { createSeeds, legalMoves, move, phoneChoice, sow } from './logic/seeds';
import { replayRun, type SeedsReplay } from './verify';

/** Plays a run as a fair player (extra turns and captures first), recording the pits chosen. */
function play(seed: number) {
  const random = seededRandom(seed);
  const bot = seededRandom(seed + 500);
  const state = createSeeds(random);
  const replay: SeedsReplay = { v: 1, moves: [] };
  while (!state.over) {
    if (state.turn === 'phone') {
      move(state, phoneChoice(state, random));
      continue;
    }
    const moves = legalMoves(state.board, 'player');
    const pit =
      moves.find((p) => sow(state.board, 'player', p).extra) ??
      moves.find((p) => sow(state.board, 'player', p).captured > 0) ??
      moves[Math.floor(bot() * moves.length)] ??
      0;
    replay.moves.push(pit);
    move(state, pit);
  }
  return { state, replay };
}

describe('Seeds replays', () => {
  it('reproduce a played run’s score exactly, the phone’s moves rebuilt from the seed', () => {
    for (const seed of [1, 42, 9999]) {
      const { state, replay } = play(seed);
      expect(state.over).toBe(true);
      expect(state.score).toBeGreaterThan(0);
      expect(replayRun(seededRandom(seed), replay)).toEqual({ ok: true, score: state.score });
    }
  });

  it('give a different result for other moves or another seed', () => {
    const { state, replay } = play(7);
    const played = { ok: true, score: state.score };
    expect(replayRun(seededRandom(8), replay)).not.toEqual(played);
    // Play the first legal pit other than the one chosen, at the first move: a different run.
    const first = replay.moves[0] ?? 0;
    const changed = { v: 1, moves: [first === 0 ? 1 : 0, ...replay.moves.slice(1)] };
    expect(replayRun(seededRandom(7), changed)).not.toEqual(played);
  });

  it('reject anything that is not a well-formed replay', () => {
    const bad: unknown[] = [
      null,
      { v: 2, moves: [] },
      { v: 1 },
      { v: 1, moves: [6] },
      { v: 1, moves: [-1] },
      { v: 1, moves: [1.5] },
      { v: 1, moves: ['2'] },
      { v: 1, moves: new Array(1001).fill(0) },
    ];
    for (const replay of bad) {
      expect(replayRun(seededRandom(1), replay)).toEqual({
        ok: false,
        reason: 'not a Seeds replay',
      });
    }
  });

  it('reject an illegal move, a run cut short, and moves after the end', () => {
    const { replay } = play(3);
    // Pit 2 then pit 2 again: the first leaves it empty (4 seeds, the last in your store).
    expect(replayRun(seededRandom(3), { v: 1, moves: [2, 2] })).toEqual({
      ok: false,
      reason: 'an illegal move',
    });
    expect(replayRun(seededRandom(3), { v: 1, moves: replay.moves.slice(0, -1) })).toEqual({
      ok: false,
      reason: 'the run never ended',
    });
    expect(replayRun(seededRandom(3), { v: 1, moves: [...replay.moves, 0] })).toEqual({
      ok: false,
      reason: 'moves after the run ended',
    });
  });
});
