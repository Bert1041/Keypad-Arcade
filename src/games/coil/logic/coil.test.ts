import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import {
  BONUS_EVERY,
  BONUS_POINTS,
  BONUS_STEPS,
  FOOD_POINTS,
  createCoil,
  placeFrom,
  queueTurn,
  step,
  stepMs,
  type CoilState,
  type Dir,
} from './coil';

/** A fixed "random" for tests that need full control. */
const constant = (value: number) => () => value;

function board(overrides: Partial<CoilState>): CoilState {
  return {
    cols: 10,
    rows: 10,
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
    dir: 'right',
    queue: [],
    food: { x: 0, y: 0 },
    bonus: null,
    growth: 0,
    eaten: 0,
    score: 0,
    alive: true,
    ...overrides,
  };
}

const run = (state: CoilState, steps: number, random = constant(0)) => {
  for (let i = 0; i < steps; i++) state = step(state, random).state;
  return state;
};

describe('moving', () => {
  it('moves one cell per step and keeps its length', () => {
    const s = run(board({}), 1);
    expect(s.snake).toEqual([
      { x: 6, y: 5 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ]);
  });

  it('takes queued turns one per step, in order', () => {
    let s = queueTurn(board({}), 'up');
    s = queueTurn(s, 'left');
    s = run(s, 1);
    expect(s.snake[0]).toEqual({ x: 5, y: 4 });
    s = run(s, 1);
    expect(s.snake[0]).toEqual({ x: 4, y: 4 });
    expect(s.dir).toBe('left');
  });

  it('ignores a reversal, a repeat of the heading, and turns beyond the queue limit', () => {
    const s = board({});
    expect(queueTurn(s, 'left')).toBe(s);
    expect(queueTurn(s, 'right')).toBe(s);
    const two = queueTurn(queueTurn(s, 'up'), 'left');
    expect(queueTurn(two, 'down').queue).toEqual(['up', 'left']);
  });

  it('judges a reversal against the last queued turn, not the current heading', () => {
    const s = queueTurn(board({}), 'up');
    expect(queueTurn(s, 'down').queue).toEqual(['up']); // down reverses the queued up
    expect(queueTurn(s, 'left').queue).toEqual(['up', 'left']); // left is fine after up
  });
});

describe('dying', () => {
  it.each<[string, Partial<CoilState>, Dir | null]>([
    [
      'right wall',
      {
        snake: [
          { x: 9, y: 5 },
          { x: 8, y: 5 },
        ],
      },
      null,
    ],
    [
      'left wall',
      {
        snake: [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
        ],
        dir: 'left',
      },
      null,
    ],
    [
      'top wall',
      {
        snake: [
          { x: 5, y: 0 },
          { x: 5, y: 1 },
        ],
        dir: 'up',
      },
      null,
    ],
    [
      'bottom wall',
      {
        snake: [
          { x: 5, y: 9 },
          { x: 5, y: 8 },
        ],
        dir: 'down',
      },
      null,
    ],
  ])('dies on the %s', (_name, overrides) => {
    const { state, events } = step(board(overrides), constant(0));
    expect(state.alive).toBe(false);
    expect(events).toEqual(['died']);
  });

  it('dies running into its own body', () => {
    // A hook shape: heading up into the segment at (5,4).
    const s = board({
      snake: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 4 },
        { x: 5, y: 4 },
        { x: 4, y: 4 },
      ],
      dir: 'up',
    });
    expect(step(s, constant(0)).state.alive).toBe(false);
  });

  it('may follow its own tail into the cell the tail is leaving', () => {
    const s = board({
      snake: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 4 },
        { x: 5, y: 4 },
      ],
      dir: 'up',
    });
    expect(step(s, constant(0)).state.alive).toBe(true);
  });

  it('may not enter the tail cell while growing, because the tail stays', () => {
    const s = board({
      snake: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 4 },
        { x: 5, y: 4 },
      ],
      dir: 'up',
      growth: 1,
    });
    expect(step(s, constant(0)).state.alive).toBe(false);
  });

  it('does nothing after death', () => {
    const dead = board({ alive: false });
    expect(step(dead, constant(0))).toEqual({ state: dead, events: [] });
    expect(queueTurn(dead, 'up')).toBe(dead);
  });
});

describe('eating', () => {
  it('scores, grows by one over the next step, and places new food off the snake', () => {
    const s0 = board({ food: { x: 6, y: 5 } });
    const { state: s1, events } = step(s0, constant(0));
    expect(events).toEqual(['ate']);
    expect(s1.score).toBe(FOOD_POINTS);
    expect(s1.eaten).toBe(1);
    expect(s1.snake).toHaveLength(3);
    const s2 = run(s1, 1);
    expect(s2.snake).toHaveLength(4);
    expect(s1.snake.some((c) => c.x === s1.food.x && c.y === s1.food.y)).toBe(false);
  });

  it(`spawns a bonus after every ${BONUS_EVERY}th pellet, worth ${BONUS_POINTS}`, () => {
    const s0 = board({ food: { x: 6, y: 5 }, eaten: BONUS_EVERY - 1 });
    const { state: s1, events } = step(s0, seededRandom(3));
    expect(events).toEqual(['ate', 'bonus-appeared']);
    expect(s1.bonus?.stepsLeft).toBe(BONUS_STEPS);
    const bonusCell = s1.bonus?.cell;
    expect(bonusCell).toBeDefined();
    expect(bonusCell).not.toEqual(s1.food);

    const onBonus = board({
      snake: [
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      bonus: { cell: { x: 2, y: 1 }, stepsLeft: 5 },
      food: { x: 9, y: 9 },
    });
    const eaten = step(onBonus, constant(0));
    expect(eaten.events).toEqual(['ate-bonus']);
    expect(eaten.state.score).toBe(BONUS_POINTS);
    expect(eaten.state.bonus).toBeNull();
  });

  it('lets an uneaten bonus expire', () => {
    const s = board({ bonus: { cell: { x: 0, y: 9 }, stepsLeft: 2 }, food: { x: 9, y: 0 } });
    const one = step(s, constant(0));
    expect(one.state.bonus?.stepsLeft).toBe(1);
    const two = step(one.state, constant(0));
    expect(two.events).toEqual(['bonus-expired']);
    expect(two.state.bonus).toBeNull();
  });
});

describe('challenge fairness', () => {
  const play = (seed: number, moves: (Dir | null)[]) => {
    const random = seededRandom(seed);
    let s = createCoil(random, 15, 22);
    const foods = [s.food];
    for (const move of moves) {
      if (move) s = queueTurn(s, move);
      const r = step(s, random);
      s = r.state;
      if (r.events.includes('ate')) foods.push(s.food);
      if (!s.alive) break;
    }
    return { s, foods };
  };

  it('replays identically from the same seed and the same moves', () => {
    const moves: (Dir | null)[] = ['up', null, null, 'left', null, 'down', null, null, 'right'];
    expect(play(42, moves)).toEqual(play(42, moves));
  });

  it('chooses food from the seed, not from where the snake happens to be', () => {
    // Two players at different points of the same challenge: different lengths and positions.
    // Unless the snake covers it, the seed alone decides the cell (index 50 of 100 → (0, 5)).
    const random = () => 0.5;
    const dims = { cols: 10, rows: 10 };
    const short = [{ x: 0, y: 0 }];
    const long = [5, 6, 7, 8, 9].map((x) => ({ x, y: 9 }));
    expect(placeFrom(random, dims, short)).toEqual({ x: 0, y: 5 });
    expect(placeFrom(random, dims, long)).toEqual({ x: 0, y: 5 });
  });

  it('never places food on the snake, and finds the last free cell', () => {
    const dims = { cols: 3, rows: 1 };
    expect(
      placeFrom(constant(0), dims, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toEqual({ x: 2, y: 0 });
    expect(
      placeFrom(constant(0), dims, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toBeNull();
  });
});

describe('stepMs', () => {
  it('speeds up per pellet and bottoms out at 70 ms', () => {
    expect(stepMs(0)).toBe(150);
    expect(stepMs(10)).toBe(120);
    expect(stepMs(1000)).toBe(70);
  });
});
