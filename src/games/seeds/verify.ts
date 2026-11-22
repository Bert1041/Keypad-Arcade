import type { ReplayRun } from '@/games/types';
import { GAMES, MAX_PLIES, createSeeds, legalMoves, move, phoneChoice } from './logic/seeds';

/**
 * A Seeds run as the scene records it: the pits the player chose (0–5), in order. The phone's
 * moves are not recorded — they follow from the seed and the player's choices, so replaying
 * rebuilds them.
 */
export interface SeedsReplay {
  v: 1;
  moves: number[];
}

/** No run can hold more of the player's moves than this. */
const MAX_MOVES = GAMES * MAX_PLIES;

function isReplay(value: unknown): value is SeedsReplay {
  if (typeof value !== 'object' || value === null) return false;
  const { v, moves } = value as Partial<SeedsReplay>;
  if (v !== 1 || !Array.isArray(moves) || moves.length > MAX_MOVES) return false;
  return (moves as unknown[]).every(
    (m) => Number.isInteger(m) && (m as number) >= 0 && (m as number) < 6,
  );
}

export const replayRun: ReplayRun = (random, replay) => {
  if (!isReplay(replay)) return { ok: false, reason: 'not a Seeds replay' };
  const state = createSeeds(random);
  let next = 0;
  // A game stops after MAX_PLIES moves and the player's moves run out, so this loop ends.
  while (!state.over) {
    if (state.turn === 'phone') {
      move(state, phoneChoice(state, random));
      continue;
    }
    const pit = replay.moves[next];
    if (pit === undefined) return { ok: false, reason: 'the run never ended' };
    if (!legalMoves(state.board, 'player').includes(pit)) {
      return { ok: false, reason: 'an illegal move' };
    }
    move(state, pit);
    next += 1;
  }
  return next === replay.moves.length
    ? { ok: true, score: state.score }
    : { ok: false, reason: 'moves after the run ended' };
};
