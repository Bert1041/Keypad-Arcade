import type { RandomFn } from '@/games/types';

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Cell {
  x: number;
  y: number;
}

export interface Bonus {
  cell: Cell;
  /** Steps left before it disappears. */
  stepsLeft: number;
}

export interface CoilState {
  cols: number;
  rows: number;
  /** Head first. */
  snake: Cell[];
  dir: Dir;
  /** Turns pressed but not yet taken, so two quick swipes both count. */
  queue: Dir[];
  food: Cell;
  bonus: Bonus | null;
  /** Segments still to add; the tail stays put while this is above zero. */
  growth: number;
  eaten: number;
  score: number;
  alive: boolean;
}

export type StepEvent = 'ate' | 'ate-bonus' | 'bonus-appeared' | 'bonus-expired' | 'died';

/** The board, in cells. The scene draws it; replays on the server need it too. */
export const COLS = 15;
export const ROWS = 22;

export const FOOD_POINTS = 10;
export const BONUS_POINTS = 50;
/** A bonus appears after every this-many pellets. */
export const BONUS_EVERY = 5;
export const BONUS_STEPS = 30;
const MAX_QUEUE = 2;

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/** Milliseconds per step: starts relaxed, speeds up with each pellet, never below 70. */
export function stepMs(eaten: number): number {
  return Math.max(70, 150 - eaten * 3);
}

/**
 * Picks a cell from the seed alone, so a challenge replays the same food sequence whatever
 * path each player takes. Only if the snake is on that cell do we move on, deterministically,
 * to the next free one (reading order, wrapping). Returns null when the board is full.
 */
export function placeFrom(
  random: RandomFn,
  state: Pick<CoilState, 'cols' | 'rows'>,
  taken: Cell[],
): Cell | null {
  const total = state.cols * state.rows;
  const start = Math.floor(random() * total);
  for (let i = 0; i < total; i++) {
    const index = (start + i) % total;
    const cell = { x: index % state.cols, y: Math.floor(index / state.cols) };
    if (!taken.some((t) => same(t, cell))) return cell;
  }
  return null;
}

export function createCoil(random: RandomFn, cols: number, rows: number): CoilState {
  const y = Math.floor(rows / 2);
  const x = Math.floor(cols / 2);
  const snake = [
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y },
  ];
  const food = placeFrom(random, { cols, rows }, snake);
  if (!food) throw new Error('Coil: board too small');
  return {
    cols,
    rows,
    snake,
    dir: 'right',
    queue: [],
    food,
    bonus: null,
    growth: 0,
    eaten: 0,
    score: 0,
    alive: true,
  };
}

/** Queues a turn. Reversals into yourself and repeats of the current heading are ignored. */
export function queueTurn(state: CoilState, dir: Dir): CoilState {
  const last = state.queue.at(-1) ?? state.dir;
  if (!state.alive || state.queue.length >= MAX_QUEUE || dir === last || dir === OPPOSITE[last]) {
    return state;
  }
  return { ...state, queue: [...state.queue, dir] };
}

export function step(
  state: CoilState,
  random: RandomFn,
): { state: CoilState; events: StepEvent[] } {
  if (!state.alive) return { state, events: [] };
  const events: StepEvent[] = [];
  const [next, ...queue] = state.queue;
  const dir = next ?? state.dir;
  const head = state.snake[0];
  if (!head) throw new Error('Coil: snake has no head');
  const newHead = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };

  // The tail moves out of the way this step unless the snake is growing.
  const body = state.growth > 0 ? state.snake : state.snake.slice(0, -1);
  const hitWall =
    newHead.x < 0 || newHead.y < 0 || newHead.x >= state.cols || newHead.y >= state.rows;
  if (hitWall || body.some((c) => same(c, newHead))) {
    return { state: { ...state, dir, queue, alive: false }, events: ['died'] };
  }

  let { growth, eaten, score, food, bonus } = state;
  const snake = [newHead, ...body];
  if (growth > 0) growth -= 1;

  if (bonus) {
    if (same(newHead, bonus.cell)) {
      score += BONUS_POINTS;
      growth += 1;
      bonus = null;
      events.push('ate-bonus');
    } else if (bonus.stepsLeft <= 1) {
      bonus = null;
      events.push('bonus-expired');
    } else {
      bonus = { ...bonus, stepsLeft: bonus.stepsLeft - 1 };
    }
  }

  if (same(newHead, food)) {
    eaten += 1;
    score += FOOD_POINTS;
    growth += 1;
    events.push('ate');
    const taken = bonus ? [...snake, bonus.cell] : snake;
    const nextFood = placeFrom(random, state, taken);
    if (!nextFood) {
      // The board is full: nothing left to eat, the run ends as a perfect game.
      return {
        state: { ...state, snake, dir, queue, growth, eaten, score, bonus, alive: false },
        events: [...events, 'died'],
      };
    }
    food = nextFood;
    if (eaten % BONUS_EVERY === 0 && !bonus) {
      const cell = placeFrom(random, state, [...snake, food]);
      if (cell) {
        bonus = { cell, stepsLeft: BONUS_STEPS };
        events.push('bonus-appeared');
      }
    }
  }

  return { state: { ...state, snake, dir, queue, food, bonus, growth, eaten, score }, events };
}
