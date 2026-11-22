import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import type { RandomFn } from '@/games/types';
import {
  GAMES,
  LEVELS,
  MAX_PLIES,
  PHONE_STORE,
  PLAYER_STORE,
  SEEDS_PER_PIT,
  WIN_POINTS,
  boardFrom,
  createSeeds,
  legalMoves,
  move,
  phoneChoice,
  sow,
  starter,
  type SeedsEvent,
  type SeedsState,
  type Side,
} from './seeds';

/** A board from the player's pits, the phone's pits (in its own order, 7–12) and the stores. */
function boardOf(you: number[], phone: number[], stores: [number, number] = [0, 0]): number[] {
  return [...you, stores[0], ...phone, stores[1]];
}

function stateWith(board: number[], turn: Side = 'player', game = 1): SeedsState {
  const state = createSeeds(seededRandom(1));
  return { ...state, board, turn, game };
}

/** Rolls that come out in a fixed order (then repeat). */
function rolls(...values: number[]): RandomFn & { used: () => number } {
  let i = 0;
  const fn = () => values[i++ % values.length] ?? 0;
  return Object.assign(fn, { used: () => i });
}

const total = (board: number[]) => board.reduce((a, b) => a + b, 0);

describe('sowing', () => {
  it('drops one seed in each following place, anticlockwise', () => {
    const { board, path, extra, captured } = sow(boardFrom([4, 4, 4, 4, 4, 4]), 'player', 1);
    expect(path).toEqual([2, 3, 4, 5]);
    expect(board).toEqual(boardOf([4, 0, 5, 5, 5, 5], [4, 4, 4, 4, 4, 4]));
    expect([extra, captured]).toEqual([false, 0]);
  });

  it('a last seed in your own store gives another turn', () => {
    expect(sow(boardFrom([4, 4, 4, 4, 4, 4]), 'player', 2).extra).toBe(true);
    expect(sow(boardFrom([4, 4, 4, 4, 4, 4]), 'phone', 9).extra).toBe(true);
    expect(sow(boardFrom([4, 4, 4, 4, 4, 4]), 'player', 3).extra).toBe(false);
  });

  it('skips the other side’s store, never its own', () => {
    const player = sow(boardOf([0, 0, 0, 0, 0, 14], [0, 0, 0, 0, 0, 0]), 'player', 5);
    expect(player.path).not.toContain(PHONE_STORE);
    expect(player.path.filter((p) => p === PLAYER_STORE)).toHaveLength(2);
    expect(total(player.board)).toBe(14);
    const phone = sow(boardOf([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 14]), 'phone', 12);
    expect(phone.path).not.toContain(PLAYER_STORE);
    expect(phone.path.filter((p) => p === PHONE_STORE)).toHaveLength(2);
  });

  it('a last seed in your own empty pit takes the seeds opposite, and itself', () => {
    // Pit 1 has 2 seeds: they land in 2 and 3; 3 was empty and faces pit 9 (5 seeds).
    const { board, captured } = sow(boardOf([0, 2, 1, 0, 1, 1], [1, 1, 5, 1, 1, 1]), 'player', 1);
    expect(captured).toBe(6);
    expect(board).toEqual(boardOf([0, 0, 2, 0, 1, 1], [1, 1, 0, 1, 1, 1], [6, 0]));
  });

  it('takes nothing when the opposite pit is empty, or the pit was not empty, or not yours', () => {
    expect(sow(boardOf([0, 2, 1, 0, 1, 1], [1, 1, 0, 1, 1, 1]), 'player', 1).captured).toBe(0);
    expect(sow(boardOf([0, 2, 1, 1, 1, 1], [1, 1, 5, 1, 1, 1]), 'player', 1).captured).toBe(0);
    // The last seed lands in the phone's empty pit 8, facing your 2 in pit 4: not yours to take.
    expect(sow(boardOf([0, 0, 0, 0, 2, 3], [1, 0, 1, 1, 1, 1]), 'player', 5).captured).toBe(0);
  });

  it('the phone captures the same way', () => {
    // Pit 7 has 1 seed: it lands in empty pit 8, which faces pit 4 (3 seeds).
    const { board, captured } = sow(boardOf([1, 1, 1, 1, 3, 1], [1, 0, 1, 1, 1, 1]), 'phone', 7);
    expect(captured).toBe(4);
    expect(board[PHONE_STORE]).toBe(4);
    expect(board[4]).toBe(0);
  });

  it('only pits with seeds can be played, and only your own', () => {
    expect(legalMoves(boardOf([0, 3, 0, 1, 0, 0], [1, 1, 1, 1, 1, 1]), 'player')).toEqual([1, 3]);
    expect(legalMoves(boardOf([1, 1, 1, 1, 1, 1], [0, 0, 2, 0, 0, 1]), 'phone')).toEqual([9, 12]);
  });
});

describe('the games', () => {
  it('the first starts as the classic board: four in every pit', () => {
    const state = createSeeds(seededRandom(5));
    expect(state.board).toEqual(boardFrom(new Array(6).fill(SEEDS_PER_PIT)));
    expect(state.turn).toBe('player');
  });

  it('later ones are dealt from the seed: mirrored, 24 a side, no pit empty', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { layouts } = createSeeds(seededRandom(seed));
      expect(layouts).toHaveLength(GAMES);
      for (const pits of layouts) {
        expect(total(pits)).toBe(6 * SEEDS_PER_PIT);
        expect(Math.min(...pits)).toBeGreaterThanOrEqual(1);
        const board = boardFrom(pits);
        expect(board.slice(7, 13)).toEqual(board.slice(0, 6));
      }
    }
    // Many seeds: a pit emptied by the deal would be rare, so look at thousands of layouts.
    for (let seed = 1; seed <= 3000; seed++) {
      for (const pits of createSeeds(seededRandom(seed)).layouts) {
        expect(Math.min(...pits)).toBeGreaterThanOrEqual(1);
      }
    }
    const later = (seed: number) => createSeeds(seededRandom(seed)).layouts.slice(1);
    expect(later(4)).toEqual(later(4));
    expect(later(4)).not.toEqual(later(5));
  });

  it('you start the odd games, the phone the even ones', () => {
    expect([1, 2, 3, 4, 5].map(starter)).toEqual(['player', 'phone', 'player', 'phone', 'player']);
  });

  it('the turn passes after a move, but not after an extra turn', () => {
    const state = createSeeds(seededRandom(1));
    move(state, 2); // 4 seeds from pit 2: the last lands in your store
    expect(state.turn).toBe('player');
    move(state, 0);
    expect(state.turn).toBe('phone');
  });

  it('refuses a move that is not legal, or not yours', () => {
    const state = stateWith(boardOf([0, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]));
    expect(() => move(state, 0)).toThrow();
    expect(() => move(state, 8)).toThrow();
  });

  it('ends when a side is empty: each side’s seeds go to its own store', () => {
    // Your last seed goes to your store; the phone still has 10 on its side.
    const state = stateWith(boardOf([0, 0, 0, 0, 0, 1], [2, 2, 2, 2, 1, 1], [20, 18]));
    const events = move(state, 5);
    const game = events.find((e) => e.type === 'game');
    expect(game).toMatchObject({ type: 'game', result: 'lost', you: 21, phone: 28, points: 21 });
    expect(state.over).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'over' });
  });

  it('ends when the phone’s side is empty, too', () => {
    // The phone's last seed goes to its store; your 5 go to yours.
    const state = stateWith(boardOf([1, 1, 1, 1, 1, 0], [0, 0, 0, 0, 0, 1], [20, 22]), 'phone');
    const game = move(state, 12).find((e) => e.type === 'game');
    expect(game).toMatchObject({ result: 'won', you: 25, phone: 23 });
  });

  it('a win pays your seeds plus 20 × the game’s number, and the next game begins', () => {
    const state = stateWith(boardOf([0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1], [30, 15]), 'player', 3);
    const game = move(state, 5).find((e) => e.type === 'game');
    expect(game).toMatchObject({ result: 'won', you: 31, phone: 17, points: 31 + WIN_POINTS * 3 });
    expect(state.score).toBe(31 + 60);
    expect(state.game).toBe(4);
    expect(state.turn).toBe('phone');
    expect(state.board).toEqual(boardFrom(state.layouts[3] ?? []));
    expect(state.plies).toBe(0);
    expect(state.over).toBe(false);
  });

  it('a draw goes on to the next game, with no win bonus', () => {
    const state = stateWith(boardOf([0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0], [22, 22]));
    const game = move(state, 5).find((e) => e.type === 'game');
    expect(game).toMatchObject({ result: 'drawn', you: 23, phone: 23, points: 23 });
    expect(state.game).toBe(2);
    expect(state.over).toBe(false);
  });

  it('winning the fifth game ends the run', () => {
    const state = stateWith(boardOf([0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0], [30, 16]), 'player', 5);
    const events = move(state, 5);
    expect(events.find((e) => e.type === 'game')).toMatchObject({ result: 'won' });
    expect(state.over).toBe(true);
    expect(() => move(state, 0)).toThrow();
  });

  it(`a game stops after ${MAX_PLIES} moves, each side keeping what is on it`, () => {
    const state = stateWith(boardOf([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], [10, 26]));
    state.plies = MAX_PLIES - 1;
    const game = move(state, 0).find((e) => e.type === 'game');
    expect(game).toMatchObject({ result: 'lost', you: 16, phone: 32 });
  });

  it('every seed stays on the board through a whole run', () => {
    const random = seededRandom(21);
    const bot = seededRandom(22);
    const state = createSeeds(random);
    while (!state.over) {
      const before = state.game;
      const moves = legalMoves(state.board, state.turn);
      const pit =
        state.turn === 'player'
          ? (moves[Math.floor(bot() * moves.length)] ?? 0)
          : phoneChoice(state, random);
      const events = move(state, pit);
      for (const e of events) if (e.type !== 'over') expect(total(e.board)).toBe(48);
      if (state.game === before && !state.over) expect(total(state.board)).toBe(48);
    }
  });
});

describe('the phone', () => {
  it('draws exactly two numbers a move, whatever it decides', () => {
    for (const values of [
      [0.1, 0.5],
      [0.9, 0.5],
    ]) {
      const random = rolls(...values);
      phoneChoice(stateWith(boardFrom([4, 4, 4, 4, 4, 4]), 'phone', 1), random);
      expect(random.used()).toBe(2);
    }
  });

  it('at its blunder rate it plays at random; otherwise its best', () => {
    // Pit 7 captures your 9 seeds: clearly its best move. Its legal moves: 7, 9, 10, 11, 12.
    const board = boardOf([1, 1, 1, 1, 9, 1], [1, 0, 3, 3, 3, 3]);
    const level1 = LEVELS[0]?.blunder ?? 0;
    expect(phoneChoice(stateWith(board, 'phone', 1), rolls(level1 + 0.01, 0.99))).toBe(7);
    expect(phoneChoice(stateWith(board, 'phone', 1), rolls(level1 - 0.01, 0.99))).toBe(12);
    expect(phoneChoice(stateWith(board, 'phone', 1), rolls(level1 - 0.01, 0.5))).toBe(10);
    // The top level never blunders: the lowest roll changes nothing. (It plays 10 first, for the
    // extra turn, and captures after; looking further ahead than the capture.)
    const top = (blunder: number) =>
      phoneChoice(stateWith(board, 'phone', 5), rolls(blunder, 0.99));
    expect(top(0)).toBe(top(0.99));
    expect(top(0)).toBe(10);
  });

  it('chooses among equally good moves by its roll', () => {
    // Level 1 looks one move ahead: pits 9–12 each put a seed in its store, 7 and 8 do not.
    const board = boardFrom([4, 4, 4, 4, 4, 4]);
    const choose = (pick: number) => phoneChoice(stateWith(board, 'phone', 1), rolls(0.99, pick));
    expect([0, 0.3, 0.6, 0.99].map(choose)).toEqual([9, 10, 11, 12]);
  });

  it('takes a capture when it sees one', () => {
    // Pit 7 (1 seed) lands in empty pit 8, facing your 9 seeds in pit 4.
    const board = boardOf([1, 1, 1, 1, 9, 1], [1, 0, 3, 3, 3, 3]);
    expect(phoneChoice(stateWith(board, 'phone', 1), rolls(0.99, 0))).toBe(7);
  });

  it('plays better at each level: the hardest beats the same player more than the easiest', () => {
    const wins = (game: number) => {
      let phoneWins = 0;
      for (let seed = 1; seed <= 16; seed++) {
        const random = seededRandom(seed);
        const bot = seededRandom(seed + 100);
        const state = { ...createSeeds(random), game };
        state.board = boardFrom([4, 4, 4, 4, 4, 4]);
        state.turn = 'player';
        let result: SeedsEvent | undefined;
        while (!result) {
          const moves = legalMoves(state.board, state.turn);
          // The same player each time: grabs an extra turn or a capture if one is there.
          const greedy =
            moves.find((p) => sow(state.board, 'player', p).extra) ??
            moves.find((p) => sow(state.board, 'player', p).captured > 0) ??
            moves[Math.floor(bot() * moves.length)] ??
            0;
          const pit = state.turn === 'player' ? greedy : phoneChoice(state, random);
          result = move(state, pit).find((e) => e.type === 'game');
        }
        if (result.type === 'game' && result.result === 'lost') phoneWins += 1;
      }
      return phoneWins;
    };
    const easiest = wins(1);
    const hardest = wins(5);
    expect(hardest).toBeGreaterThan(easiest);
    expect(hardest).toBeGreaterThanOrEqual(14);
  });
});
