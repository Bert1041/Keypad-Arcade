import type { RandomFn } from '@/games/types';

/**
 * Pairs' rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
 * per simulated second with the card the player tapped (if any), so a run depends only on the
 * seed and which card was tapped when.
 *
 * Cards are numbered in reading order: index = row * cols + col.
 */

export const STEP_MS = 1000 / 60;

/** Board sizes in play order; after the last, it repeats. */
export const BOARDS: readonly { cols: number; rows: number }[] = [
  { cols: 4, rows: 4 },
  { cols: 4, rows: 5 },
  { cols: 5, rows: 6 },
  { cols: 6, rows: 6 },
];

/** Distinct faces the scene can draw; the biggest board needs 18. */
export const SYMBOLS = 18;

export const START_MS = 60_000;
/** The clock never shows more than this. */
export const MAX_MS = 99_000;
/**
 * Only clearing a board adds time, and less each board: 10 s, 8, 6, 4, then 2 s for good. With a
 * second for every pair found (the first version), a player with a good memory gained time
 * faster than they spent it, and a run never ended.
 */
export function clearBonusMs(board: number): number {
  return Math.max(2_000, 12_000 - 2_000 * board);
}
/**
 * The shortest gap between two turns, about a flip's animation: no hand taps faster, and it
 * bounds even a bot — a 6×6 board then takes over 5 s, more than its 2 s bonus.
 */
export const TAP_GAP_MS = 150;

/** How long a mismatched pair stays face up, unless the next tap turns it down sooner. */
export const PEEK_MS = 700;
/** The pause between a cleared board and the next; the clock stops for it. */
export const NEXT_BOARD_MS = 900;

export const PAIR_POINTS = 10;
export const MAX_STREAK = 5;
export const CLEAR_POINTS = 50;

export type Face = 'down' | 'up' | 'matched';

export interface Card {
  symbol: number;
  face: Face;
}

export interface PairsState {
  timeMs: number;
  /** Time left on the run's clock. */
  leftMs: number;
  /** Boards started so far (1 = the first). */
  board: number;
  cols: number;
  rows: number;
  cards: Card[];
  /** The first card of a pair being turned, if one is up. */
  first: number | null;
  /** A mismatched pair still showing, and until when. */
  wrong: [number, number] | null;
  wrongUntilMs: number;
  /** While set, the board is cleared and the next one is coming; the clock is stopped. */
  nextBoardAtMs: number | null;
  score: number;
  streak: number;
  pairs: number;
  over: boolean;
  /** When a card was last turned. */
  lastTurnMs: number;
}

export interface PairsInput {
  /** The card tapped this step, or null. */
  tap: number | null;
}

export const NO_INPUT: PairsInput = { tap: null };

export type PairsEvent =
  | { type: 'flip'; card: number }
  | { type: 'match'; cards: [number, number]; streak: number }
  | { type: 'miss'; cards: [number, number] }
  | { type: 'hide'; cards: [number, number] }
  | { type: 'clear'; board: number; points: number }
  | { type: 'board'; board: number }
  | { type: 'over' };

export function boardSize(board: number): { cols: number; rows: number } {
  const size = BOARDS[Math.min(board, BOARDS.length) - 1];
  if (!size) throw new Error(`Pairs: no board ${board}`);
  return size;
}

/** Fisher–Yates with the seeded generator: always length − 1 draws. */
function shuffle<T>(items: T[], random: RandomFn): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

/**
 * Deals board `board`: picks its symbols from all SYMBOLS, then lays out two of each. The number
 * of draws depends only on the board's size, so the n-th board of a seed is the same however
 * the player did on the ones before.
 */
export function deal(state: PairsState, board: number, random: RandomFn): void {
  const { cols, rows } = boardSize(board);
  const symbols = shuffle(
    Array.from({ length: SYMBOLS }, (_, i) => i),
    random,
  ).slice(0, (cols * rows) / 2);
  const faces = shuffle([...symbols, ...symbols], random);
  state.board = board;
  state.cols = cols;
  state.rows = rows;
  state.cards = faces.map((symbol) => ({ symbol, face: 'down' }));
  state.first = null;
  state.wrong = null;
  state.nextBoardAtMs = null;
}

export function createPairs(random: RandomFn): PairsState {
  const state: PairsState = {
    timeMs: 0,
    leftMs: START_MS,
    board: 0,
    cols: 0,
    rows: 0,
    cards: [],
    first: null,
    wrong: null,
    wrongUntilMs: 0,
    nextBoardAtMs: null,
    score: 0,
    streak: 0,
    pairs: 0,
    over: false,
    lastTurnMs: Number.NEGATIVE_INFINITY,
  };
  deal(state, 1, random);
  return state;
}

function hideWrong(state: PairsState, events: PairsEvent[]): void {
  if (!state.wrong) return;
  for (const i of state.wrong) {
    const card = state.cards[i];
    if (card) card.face = 'down';
  }
  events.push({ type: 'hide', cards: state.wrong });
  state.wrong = null;
}

/**
 * Whether a tap at `atMs` may turn a card: a board is in play and the last turn was long enough
 * ago. The scene asks for the coming step, and holds a tap until then rather than lose it.
 */
export function canTurn(state: PairsState, atMs = state.timeMs): boolean {
  return !state.over && state.nextBoardAtMs === null && atMs - state.lastTurnMs >= TAP_GAP_MS;
}

function turn(state: PairsState, index: number, events: PairsEvent[]): void {
  const card = state.cards[index];
  if (!card || card.face !== 'down' || !canTurn(state)) return;
  state.lastTurnMs = state.timeMs;
  // A tap while a mismatch is still showing turns it down at once: fast players never wait.
  hideWrong(state, events);
  card.face = 'up';
  events.push({ type: 'flip', card: index });
  const firstIndex = state.first;
  if (firstIndex === null) {
    state.first = index;
    return;
  }
  state.first = null;
  const first = state.cards[firstIndex];
  if (!first) return;
  if (first.symbol !== card.symbol) {
    state.streak = 0;
    state.wrong = [firstIndex, index];
    state.wrongUntilMs = state.timeMs + PEEK_MS;
    events.push({ type: 'miss', cards: [firstIndex, index] });
    return;
  }
  first.face = 'matched';
  card.face = 'matched';
  state.streak += 1;
  state.pairs += 1;
  state.score += PAIR_POINTS * Math.min(state.streak, MAX_STREAK);
  events.push({ type: 'match', cards: [firstIndex, index], streak: state.streak });
  if (state.cards.every((c) => c.face === 'matched')) {
    const points = CLEAR_POINTS * state.board;
    state.score += points;
    state.leftMs = Math.min(MAX_MS, state.leftMs + clearBonusMs(state.board));
    state.nextBoardAtMs = state.timeMs + NEXT_BOARD_MS;
    events.push({ type: 'clear', board: state.board, points });
  }
}

/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
export function tick(state: PairsState, input: PairsInput, random: RandomFn): PairsEvent[] {
  if (state.over) return [];
  const events: PairsEvent[] = [];
  state.timeMs += STEP_MS;

  if (state.nextBoardAtMs !== null) {
    if (state.timeMs >= state.nextBoardAtMs) {
      deal(state, state.board + 1, random);
      events.push({ type: 'board', board: state.board });
    }
    return events;
  }

  state.leftMs -= STEP_MS;
  if (state.leftMs <= 0) {
    state.leftMs = 0;
    state.over = true;
    return [{ type: 'over' }];
  }
  if (state.wrong && state.timeMs >= state.wrongUntilMs) hideWrong(state, events);
  if (input.tap !== null) turn(state, input.tap, events);
  return events;
}
