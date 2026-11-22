import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import type { RandomFn } from '@/games/types';
import {
  MAX_MS,
  NEXT_BOARD_MS,
  NO_INPUT,
  PEEK_MS,
  START_MS,
  STEP_MS,
  TAP_GAP_MS,
  canTurn,
  clearBonusMs,
  createPairs,
  deal,
  tick,
  type PairsEvent,
  type PairsState,
} from './pairs';

const never = () => {
  throw new Error('no randomness expected here');
};

const types = (events: PairsEvent[]) => events.map((e) => e.type);

/** A card's partner: the other card with its symbol. */
function partner(state: PairsState, index: number): number {
  const symbol = state.cards[index]?.symbol;
  return state.cards.findIndex((c, i) => i !== index && c.symbol === symbol);
}

/** A face-down card that is not `index`'s partner. */
function stranger(state: PairsState, index: number): number {
  const symbol = state.cards[index]?.symbol;
  return state.cards.findIndex((c, i) => i !== index && c.face === 'down' && c.symbol !== symbol);
}

/** Taps `card` on the first step the rules accept a turn (as the scene holds a tap). */
function tap(state: PairsState, card: number, random: RandomFn = never) {
  const events: PairsEvent[] = [];
  while (!canTurn(state, state.timeMs + STEP_MS) && !state.over) {
    events.push(...tick(state, NO_INPUT, random));
  }
  return [...events, ...tick(state, { tap: card }, random)];
}

function wait(state: PairsState, ms: number, random: RandomFn = never) {
  const events: PairsEvent[] = [];
  for (let t = 0; t < ms; t += STEP_MS) events.push(...tick(state, NO_INPUT, random));
  return events;
}

/** Finds every pair on the board, one after another. */
function clearBoard(state: PairsState, random: RandomFn = never) {
  const events: PairsEvent[] = [];
  for (let i = 0; i < state.cards.length; i++) {
    if (state.cards[i]?.face !== 'down') continue;
    events.push(...tap(state, i, random), ...tap(state, partner(state, i), random));
  }
  return events;
}

describe('dealing', () => {
  it('grows the boards 4×4, 4×5, 5×6, then 6×6 for good, two of each symbol', () => {
    const random = seededRandom(1);
    const state = createPairs(random);
    const sizes: string[] = [];
    for (let board = 1; board <= 6; board++) {
      deal(state, board, random);
      sizes.push(`${state.cols}x${state.rows}`);
      const counts = new Map<number, number>();
      for (const card of state.cards) counts.set(card.symbol, (counts.get(card.symbol) ?? 0) + 1);
      expect([...counts.values()].every((n) => n === 2)).toBe(true);
      expect(state.cards).toHaveLength(state.cols * state.rows);
      expect(state.cards.every((c) => c.face === 'down')).toBe(true);
    }
    expect(sizes).toEqual(['4x4', '4x5', '5x6', '6x6', '6x6', '6x6']);
  });

  it('the same seed deals the same boards; another seed, other boards', () => {
    const layout = (seed: number) => createPairs(seededRandom(seed)).cards.map((c) => c.symbol);
    expect(layout(5)).toEqual(layout(5));
    expect(layout(5)).not.toEqual(layout(6));
  });

  it('shuffles the cards: where a card’s partner lies varies from seed to seed', () => {
    const partners = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const state = createPairs(seededRandom(seed));
      partners.add(partner(state, 0));
    }
    expect(partners.size).toBeGreaterThan(8);
  });

  it('the n-th board is the same however the player did on the ones before', () => {
    // Two players on one seed: one clears the first board cleanly, the other misses first.
    const play = (missFirst: boolean) => {
      const random = seededRandom(9);
      const state = createPairs(random);
      if (missFirst) {
        tap(state, 0);
        tap(state, stranger(state, 0));
        wait(state, PEEK_MS + 50);
      }
      clearBoard(state);
      wait(state, NEXT_BOARD_MS + 50, random);
      return { board: state.board, layout: state.cards.map((c) => c.symbol), left: state.leftMs };
    };
    const clean = play(false);
    const sloppy = play(true);
    expect(clean.board).toBe(2);
    expect(sloppy.left).toBeLessThan(clean.left); // the miss cost time
    expect(sloppy.layout).toEqual(clean.layout);
  });
});

describe('turning cards', () => {
  it('a matching pair stays face up and scores 10 — no time added for a pair', () => {
    const state = createPairs(seededRandom(2));
    tap(state, 0);
    const before = state.leftMs;
    const events = tap(state, partner(state, 0));
    expect(types(events)).toEqual(['flip', 'match']);
    expect(state.cards[0]?.face).toBe('matched');
    expect(state.score).toBe(10);
    expect(state.leftMs).toBeLessThan(before);
  });

  it('pairs in a row score 10 × the streak, up to × 5', () => {
    const state = createPairs(seededRandom(3));
    const scores: number[] = [];
    for (let i = 0; scores.length < 7; i++) {
      if (state.cards[i]?.face !== 'down') continue;
      tap(state, i);
      tap(state, partner(state, i));
      scores.push(state.score);
    }
    expect(scores).toEqual([10, 30, 60, 100, 150, 200, 250]);
  });

  it('a mismatch resets the streak and shows for 0.7 s, then turns face down', () => {
    const state = createPairs(seededRandom(4));
    tap(state, 0);
    tap(state, partner(state, 0));
    const other = state.cards.findIndex((c) => c.face === 'down');
    tap(state, other);
    const wrong = stranger(state, other);
    expect(types(tap(state, wrong))).toEqual(['flip', 'miss']);
    expect(state.streak).toBe(0);
    wait(state, PEEK_MS - 50);
    expect(state.cards[wrong]?.face).toBe('up');
    expect(types(wait(state, 100))).toEqual(['hide']);
    expect(state.cards[wrong]?.face).toBe('down');
    expect(state.cards[other]?.face).toBe('down');
  });

  it('the next tap turns a showing mismatch down at once', () => {
    const state = createPairs(seededRandom(5));
    tap(state, 0);
    const wrong = stranger(state, 0);
    tap(state, wrong);
    const next = state.cards.findIndex((c, i) => i !== 0 && i !== wrong && c.face === 'down');
    expect(types(tap(state, next))).toEqual(['hide', 'flip']);
    expect(state.cards[0]?.face).toBe('down');
    expect(state.cards[next]?.face).toBe('up');
  });

  it('a second card cannot turn within 0.15 s of the first', () => {
    const state = createPairs(seededRandom(5));
    tap(state, 0);
    const turnedAt = state.timeMs;
    expect(tick(state, { tap: 1 }, never)).toEqual([]);
    expect(state.cards[1]?.face).toBe('down');
    wait(state, TAP_GAP_MS - 2 * STEP_MS);
    expect(types(tap(state, 1))).toContain('flip');
    expect(state.timeMs - turnedAt).toBeGreaterThanOrEqual(TAP_GAP_MS);
  });

  it('ignores taps on a card already up or matched, or off the board', () => {
    const state = createPairs(seededRandom(6));
    tap(state, 0);
    expect(tap(state, 0)).toEqual([]);
    expect(state.first).toBe(0);
    tap(state, partner(state, 0));
    expect(tap(state, 0)).toEqual([]);
    expect(tap(state, 999)).toEqual([]);
    expect(tap(state, -1)).toEqual([]);
  });
});

describe('boards and the clock', () => {
  it('a cleared board adds 10 s, then 8, 6, 4, and 2 s from then on', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(clearBonusMs)).toEqual([
      10_000, 8_000, 6_000, 4_000, 2_000, 2_000, 2_000,
    ]);
  });

  it('clearing a board pays 50 × its number and its time, stops the clock, then deals the next', () => {
    const random = seededRandom(7);
    const state = createPairs(random);
    // Everything but the last pair, then measure the last one.
    for (let i = 0; i < state.cards.length; i++) {
      if (state.cards[i]?.face !== 'down') continue;
      const j = partner(state, i);
      if (state.cards.filter((c) => c.face === 'down').length === 2) {
        tap(state, i);
        while (!canTurn(state, state.timeMs + STEP_MS)) tick(state, NO_INPUT, never);
        const before = state.leftMs;
        const events = tick(state, { tap: j }, never);
        expect(events).toContainEqual({ type: 'clear', board: 1, points: 50 });
        expect(state.leftMs).toBeCloseTo(before - STEP_MS + clearBonusMs(1));
        break;
      }
      tap(state, i);
      tap(state, j);
    }
    const left = state.leftMs;
    let waited = 0;
    let next: PairsEvent[] = [];
    while (!types(next).includes('board')) {
      next = tick(state, NO_INPUT, random);
      waited += STEP_MS;
    }
    expect(waited).toBeGreaterThanOrEqual(NEXT_BOARD_MS);
    expect(next).toEqual([{ type: 'board', board: 2 }]);
    expect(state.leftMs).toBe(left); // stopped during the pause
    expect([state.cols, state.rows]).toEqual([4, 5]);
    // The second board pays 50 × 2.
    expect(clearBoard(state)).toContainEqual({ type: 'clear', board: 2, points: 100 });
  });

  it('never holds more than 99 seconds', () => {
    const state = createPairs(seededRandom(8));
    state.leftMs = MAX_MS - 500;
    clearBoard(state);
    expect(state.leftMs).toBe(MAX_MS);
  });

  it('runs out after 60 seconds of play, and then nothing more happens', () => {
    const state = createPairs(seededRandom(9));
    expect(state.leftMs).toBe(START_MS);
    const events = wait(state, START_MS + 100);
    expect(types(events)).toEqual(['over']);
    expect(state.over).toBe(true);
    expect(state.timeMs).toBeLessThanOrEqual(START_MS + STEP_MS);
    expect(tick(state, { tap: 0 }, never)).toEqual([]);
  });

  it('every run ends: even a perfect memory tapping as fast as allowed runs out of time', () => {
    for (const seed of [1, 2, 3]) {
      const random = seededRandom(seed);
      const state = createPairs(random);
      for (let guard = 0; !state.over && guard < 100; guard++) {
        clearBoard(state, random);
        while (state.nextBoardAtMs !== null && !state.over) tick(state, NO_INPUT, random);
      }
      expect(state.over).toBe(true);
      expect(state.board).toBeLessThan(40);
    }
  });
});
