import type { RandomFn } from '@/games/types';

/**
 * Seeds' rules: mancala (Kalah) against the phone. Turn-based, with no clock: a run depends only
 * on the seed and which pits the player chose, so the leaderboard replays it from that list.
 *
 * The board is 14 places, sown anticlockwise: the player's pits 0–5 (left to right along the
 * bottom), the player's store 6 (right), the phone's pits 7–12 (right to left along the top) and
 * the phone's store 13 (left). Pit i faces pit 12 − i.
 *
 * Integers only, so every engine plays the phone's moves alike.
 */

export type Side = 'player' | 'phone';
export type Result = 'won' | 'lost' | 'drawn';

export const PITS = 6;
export const PLAYER_STORE = 6;
export const PHONE_STORE = 13;
export const PLACES = 14;
export const SEEDS_PER_PIT = 4;
/** A run is a ladder of this many games; the phone plays better in each. */
export const GAMES = 5;
/** Points for a won game, × its number. Each game also pays the seeds in your store. */
export const WIN_POINTS = 20;
/**
 * A game stops after this many moves even if both sides still have seeds, and each side keeps
 * what is on it. Real games end far sooner (~30–60 moves); the cap only guarantees an end.
 */
export const MAX_PLIES = 200;

/**
 * How the phone plays each game: how far it looks ahead (its moves and yours), and how often it
 * instead plays a move at random.
 */
export const LEVELS: readonly { depth: number; blunder: number }[] = [
  { depth: 1, blunder: 0.35 },
  { depth: 2, blunder: 0.2 },
  { depth: 4, blunder: 0.1 },
  { depth: 6, blunder: 0.04 },
  { depth: 8, blunder: 0 },
];

export interface SeedsState {
  /** Each game's starting pits for one side (the other side mirrors it), dealt at the start. */
  layouts: number[][];
  /** 1-based. */
  game: number;
  board: number[];
  turn: Side;
  plies: number;
  score: number;
  results: Result[];
  over: boolean;
}

export type SeedsEvent =
  | {
      type: 'sow';
      side: Side;
      pit: number;
      /** Where each seed went, in order. */
      path: number[];
      /** Seeds taken by a capture (the opposite pit's and the last one), 0 if none. */
      captured: number;
      extra: boolean;
      /** The board after the move (before any end-of-game sweep). */
      board: number[];
    }
  | {
      type: 'game';
      game: number;
      result: Result;
      you: number;
      phone: number;
      points: number;
      /** The final board, every seed swept into the stores. */
      board: number[];
    }
  | { type: 'over' };

export const storeOf = (side: Side) => (side === 'player' ? PLAYER_STORE : PHONE_STORE);
export const other = (side: Side): Side => (side === 'player' ? 'phone' : 'player');
const firstPit = (side: Side) => (side === 'player' ? 0 : 7);

export function isOwnPit(side: Side, place: number): boolean {
  const first = firstPit(side);
  return place >= first && place < first + PITS;
}

export function legalMoves(board: readonly number[], side: Side): number[] {
  const moves: number[] = [];
  const first = firstPit(side);
  for (let pit = first; pit < first + PITS; pit++) if ((board[pit] ?? 0) > 0) moves.push(pit);
  return moves;
}

const at = (board: readonly number[], i: number) => board[i] ?? 0;

/**
 * Sows the seeds of `pit` one by one into the following places, skipping the other side's store.
 * The last seed in your own store gives another turn; in your own empty pit, with seeds opposite,
 * it takes them and itself into your store.
 */
export function sow(board: readonly number[], side: Side, pit: number) {
  const next = [...board];
  let seeds = at(next, pit);
  next[pit] = 0;
  const skip = storeOf(other(side));
  const path: number[] = [];
  let place = pit;
  while (seeds > 0) {
    place = (place + 1) % PLACES;
    if (place === skip) continue;
    next[place] = at(next, place) + 1;
    seeds -= 1;
    path.push(place);
  }
  const extra = place === storeOf(side);
  let captured = 0;
  const facing = 12 - place;
  if (!extra && isOwnPit(side, place) && at(next, place) === 1 && at(next, facing) > 0) {
    captured = at(next, facing) + 1;
    next[storeOf(side)] = at(next, storeOf(side)) + captured;
    next[place] = 0;
    next[facing] = 0;
  }
  return { board: next, path, extra, captured };
}

/** True when either side's pits are empty: the game is over. */
function sideEmpty(board: readonly number[]): boolean {
  return legalMoves(board, 'player').length === 0 || legalMoves(board, 'phone').length === 0;
}

/** Moves every seed left in a side's pits into that side's store. */
function sweep(board: readonly number[]): number[] {
  const next = [...board];
  for (const side of ['player', 'phone'] as const) {
    const first = firstPit(side);
    for (let pit = first; pit < first + PITS; pit++) {
      next[storeOf(side)] = at(next, storeOf(side)) + at(next, pit);
      next[pit] = 0;
    }
  }
  return next;
}

/** A starting board from one side's six pits, mirrored to the other side. */
export function boardFrom(pits: readonly number[]): number[] {
  const board = new Array<number>(PLACES).fill(0);
  for (let i = 0; i < PITS; i++) {
    board[i] = pits[i] ?? 0;
    board[7 + i] = pits[i] ?? 0;
  }
  return board;
}

/**
 * Deals a game's pits: four in each for the first game, as the classic board is; later games
 * move six seeds between random pits (never emptying one), so they differ day to day. Always
 * draws 12 numbers.
 */
function deal(game: number, random: RandomFn): number[] {
  const pits = new Array<number>(PITS).fill(SEEDS_PER_PIT);
  for (let i = 0; i < 6; i++) {
    const from = Math.floor(random() * PITS);
    const to = Math.floor(random() * PITS);
    if (game > 1 && at(pits, from) > 1) {
      pits[from] = at(pits, from) - 1;
      pits[to] = at(pits, to) + 1;
    }
  }
  return pits;
}

/** Who starts game `game`: you start the odd ones, the phone the even ones. */
export const starter = (game: number): Side => (game % 2 === 1 ? 'player' : 'phone');

export function createSeeds(random: RandomFn): SeedsState {
  // All five layouts are dealt first, so the n-th game of a seed is the same for everyone.
  const layouts = Array.from({ length: GAMES }, (_, i) => deal(i + 1, random));
  return {
    layouts,
    game: 1,
    board: boardFrom(layouts[0] ?? []),
    turn: starter(1),
    plies: 0,
    score: 0,
    results: [],
    over: false,
  };
}

/** Ends the current game: sweeps, scores, then the next game or the end of the run. */
function finishGame(state: SeedsState, events: SeedsEvent[]): void {
  const board = sweep(state.board);
  const you = at(board, PLAYER_STORE);
  const phone = at(board, PHONE_STORE);
  const result: Result = you > phone ? 'won' : you < phone ? 'lost' : 'drawn';
  const points = you + (result === 'won' ? WIN_POINTS * state.game : 0);
  state.score += points;
  state.results.push(result);
  events.push({ type: 'game', game: state.game, result, you, phone, points, board });
  if (result === 'lost' || state.game >= GAMES) {
    state.board = board;
    state.over = true;
    events.push({ type: 'over' });
    return;
  }
  state.game += 1;
  state.board = boardFrom(state.layouts[state.game - 1] ?? []);
  state.turn = starter(state.game);
  state.plies = 0;
}

/**
 * Plays `pit` for whichever side's turn it is. Throws on an illegal move (the scene only offers
 * legal ones; verify.ts checks before calling).
 */
export function move(state: SeedsState, pit: number): SeedsEvent[] {
  if (state.over) throw new Error('Seeds: the run is over');
  if (!legalMoves(state.board, state.turn).includes(pit)) {
    throw new Error(`Seeds: ${pit} is not a legal move for the ${state.turn}`);
  }
  const side = state.turn;
  const sown = sow(state.board, side, pit);
  state.board = sown.board;
  state.plies += 1;
  const events: SeedsEvent[] = [
    {
      type: 'sow',
      side,
      pit,
      path: sown.path,
      captured: sown.captured,
      extra: sown.extra,
      board: [...sown.board],
    },
  ];
  if (sideEmpty(state.board) || state.plies >= MAX_PLIES) {
    finishGame(state, events);
  } else if (!sown.extra) {
    state.turn = other(side);
  }
  return events;
}

const WIN_VALUE = 1000;

/**
 * The phone's view of a board, `depth` moves ahead (alpha-beta minimax). Positive is good for
 * the phone: the difference between the stores, or a decided game's final difference plus
 * WIN_VALUE. Moves are tried in pit order, so equal positions always resolve alike.
 */
function search(
  board: readonly number[],
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (sideEmpty(board)) {
    const final = sweep(board);
    const diff = at(final, PHONE_STORE) - at(final, PLAYER_STORE);
    return diff === 0 ? 0 : diff + (diff > 0 ? WIN_VALUE : -WIN_VALUE);
  }
  if (depth === 0) return at(board, PHONE_STORE) - at(board, PLAYER_STORE);
  const maximising = side === 'phone';
  let best = maximising ? -Infinity : Infinity;
  for (const pit of legalMoves(board, side)) {
    const sown = sow(board, side, pit);
    const value = search(sown.board, sown.extra ? side : other(side), depth - 1, alpha, beta);
    if (maximising) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
    }
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * The phone's choice on its turn. Always draws two numbers: whether it plays at random this time
 * (by its level's blunder rate), and which of the moves it picks — at random, or among those it
 * rates best.
 */
export function phoneChoice(state: SeedsState, random: RandomFn): number {
  const blunder = random();
  const pick = random();
  const moves = legalMoves(state.board, 'phone');
  const level = LEVELS[Math.min(state.game, LEVELS.length) - 1] ?? { depth: 1, blunder: 0 };
  if (blunder < level.blunder) return moves[Math.floor(pick * moves.length)] ?? 0;
  let bestValue = -Infinity;
  let best: number[] = [];
  for (const pit of moves) {
    const sown = sow(state.board, 'phone', pit);
    const value = search(
      sown.board,
      sown.extra ? 'phone' : 'player',
      level.depth - 1,
      -Infinity,
      Infinity,
    );
    if (value > bestValue) {
      bestValue = value;
      best = [pit];
    } else if (value === bestValue) {
      best.push(pit);
    }
  }
  return best[Math.floor(pick * best.length)] ?? moves[0] ?? 0;
}
