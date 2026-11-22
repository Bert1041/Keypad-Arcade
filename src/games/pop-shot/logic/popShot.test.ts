import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/random/seededRandom';
import type { RandomFn } from '@/games/types';
import {
  CEILING_Y,
  CLEAR_POINTS,
  CLEAR_ROWS,
  COLS,
  DROP_POINTS,
  HURRY_MS,
  LOSE_ROW,
  MATCH,
  NO_INPUT,
  POP_POINTS,
  R,
  ROW_H,
  SHOOTER_X,
  SHOOTER_Y,
  START_COLOURS,
  START_ROWS,
  WIDTH,
  activeColours,
  aimDirection,
  cellCentre,
  colourFor,
  createPopShot,
  landingCell,
  looseCells,
  neighbours,
  pushRow,
  rowLength,
  sameColourGroup,
  shotPath,
  shotsPerRow,
  tick,
  type Cell,
  type PopShotEvent,
  type PopShotInput,
  type PopShotState,
} from './popShot';

const types = (events: PopShotEvent[]) => events.map((e) => e.type);

/** A board from text: one string per row, a digit per colour or '.' for empty. */
function board(rows: string[], pushes = 0): PopShotState {
  const state = createPopShot(seededRandom(1));
  state.pushes = pushes;
  state.grid = rows.map((text) => {
    const cells = new Array<Cell>(COLS).fill(null);
    [...text].forEach((ch, col) => {
      if (ch !== '.') cells[col] = Number(ch);
    });
    return cells;
  });
  return state;
}

/** Ticks until the shot in flight has landed (or the run is over); returns the events. */
function settle(state: PopShotState, input: PopShotInput, random: RandomFn = seededRandom(5)) {
  const events: PopShotEvent[] = [];
  for (let i = 0; i < 600 && !state.over; i++) {
    events.push(...tick(state, i === 0 ? input : { ...input, fire: false }, random));
    if (!state.shot) break;
  }
  return events;
}

const fireAt = (x: number, y: number): PopShotInput => ({ aimX: x, aimY: y, fire: true });
const straightUp = fireAt(SHOOTER_X, SHOOTER_Y - 200);

/** A bubble of `colour` released at a cell's centre, flying straight up: it settles there. */
function releaseAt(state: PopShotState, row: number, col: number, colour: number) {
  state.shot = { ...cellCentre(state, row, col), dx: 0, dy: -1, colour };
  return settle(state, { ...NO_INPUT });
}

/** The board as text, the same way board() reads it (rows of 9 shown as 9). */
const cells = (state: PopShotState) =>
  state.grid.map((row, r) =>
    row
      .slice(0, rowLength(state, r))
      .map((c) => (c === null ? '.' : String(c)))
      .join(''),
  );

describe('the board', () => {
  it('starts with rows of 10 and 9 in the starting colours', () => {
    const state = createPopShot(seededRandom(2));
    expect(state.grid).toHaveLength(START_ROWS);
    state.grid.forEach((row, r) => {
      const length = rowLength(state, r);
      expect(length).toBe(r % 2 === 0 ? 10 : 9);
      row.forEach((c, col) => {
        if (col < length) expect(c).toBeGreaterThanOrEqual(0);
        if (col < length) expect(c).toBeLessThan(START_COLOURS);
        else expect(c).toBeNull();
      });
    });
  });

  it('the same seed deals the same board and bubbles; another seed, others', () => {
    const deal = (seed: number) => {
      const s = createPopShot(seededRandom(seed));
      return [cells(s), s.current, s.next];
    };
    expect(deal(4)).toEqual(deal(4));
    expect(deal(4)).not.toEqual(deal(5));
  });

  it('is a true hex grid at either shift: touching cells are neighbours, both ways', () => {
    for (const pushes of [0, 1]) {
      const state = board([], pushes);
      const all: [number, number][] = [];
      for (let r = 0; r < 15; r++) for (let c = 0; c < rowLength(state, r); c++) all.push([r, c]);
      for (const [r, c] of all) {
        const near = neighbours(state, r, c);
        const a = cellCentre(state, r, c);
        expect(a.x - R).toBeGreaterThanOrEqual(0);
        expect(a.x + R).toBeLessThanOrEqual(WIDTH);
        for (const [r2, c2] of all) {
          if (r2 === r && c2 === c) continue;
          const b = cellCentre(state, r2, c2);
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const isNeighbour = near.some(([nr, nc]) => nr === r2 && nc === c2);
          // Neighbours touch (36 px apart, or 35.8 on the diagonal); every other cell is far off.
          if (isNeighbour) expect(distance).toBeLessThan(37);
          else expect(distance).toBeGreaterThan(50);
          if (isNeighbour) {
            expect(neighbours(state, r2, c2).some(([nr, nc]) => nr === r && nc === c)).toBe(true);
          }
        }
        expect(near.length).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('aiming', () => {
  it('gives a unit direction towards the aim point', () => {
    for (const [x, y] of [
      [SHOOTER_X, 100],
      [0, 300],
      [360, 50],
      [123, 456],
    ] as const) {
      const d = aimDirection({ x, y });
      expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(1, 12);
      expect(Math.sign(d.dx)).toBe(Math.sign(x - SHOOTER_X));
    }
    expect(aimDirection({ x: SHOOTER_X, y: 10 })).toEqual({ dx: 0, dy: -1 });
  });

  it('never fires flatter than a fifth upwards, and never down', () => {
    const flatLeft = aimDirection({ x: -500, y: SHOOTER_Y });
    expect(flatLeft.dy).toBeCloseTo(-0.2, 12);
    expect(flatLeft.dx).toBeLessThan(0);
    expect(aimDirection({ x: 900, y: SHOOTER_Y + 300 }).dy).toBeCloseTo(-0.2, 12);
    expect(aimDirection({ x: SHOOTER_X, y: SHOOTER_Y + 50 })).toEqual({ dx: 0, dy: -1 });
  });
});

describe('a shot', () => {
  it('bounces off the side walls and stays inside them', () => {
    const state = board([]);
    const random = seededRandom(5);
    const events: PopShotEvent[] = [];
    events.push(...tick(state, fireAt(-2000, SHOOTER_Y - 300), random));
    while (state.shot) {
      expect(state.shot.x).toBeGreaterThanOrEqual(R);
      expect(state.shot.x).toBeLessThanOrEqual(WIDTH - R);
      events.push(...tick(state, NO_INPUT, random));
    }
    expect(types(events).filter((t) => t === 'bounce').length).toBeGreaterThanOrEqual(2);
    expect(types(events)).toContain('stick');
  });

  it('a bounce sends it back across the board, not along the wall', () => {
    const state = board([]);
    const random = seededRandom(5);
    tick(state, fireAt(-2000, SHOOTER_Y - 300), random); // shallow, to the left
    let farthestRight = 0;
    while (state.shot) {
      farthestRight = Math.max(farthestRight, state.shot.x);
      tick(state, NO_INPUT, random);
    }
    expect(farthestRight).toBeGreaterThan(WIDTH - R - 5);
  });

  it('sticks to the ceiling in the top row, never flying through it', () => {
    const state = board([]);
    const random = seededRandom(5);
    tick(state, straightUp, random);
    while (state.shot) {
      expect(state.shot.y - R).toBeGreaterThanOrEqual(CEILING_Y - 4);
      tick(state, NO_INPUT, random);
    }
    expect(cells(state)[0]).toMatch(/^\.{4}\d\.{5}$/);
  });

  it('settles in the empty cell next to the bubble it hits', () => {
    const state = board(['....01....']);
    state.current = 0.99; // dealt from the colours on the board (0 and 1): colour 1.
    settle(state, straightUp);
    // Straight up from the middle meets the 0 and the 1 and hangs below them, between.
    expect(cells(state)).toEqual(['....01....', '....1....']);
  });

  it('grazing passes: it sticks to a bubble within 30 px, not one 31 px away', () => {
    // A lone bubble in row 3; the shot flies straight up beside it.
    const pass = board(['..........', '.........', '..........', '....0....']);
    const x = cellCentre(pass, 3, 4).x;
    pass.shot = { x: x + 31, y: 300, dx: 0, dy: -1, colour: 1 };
    const passed = settle(pass, NO_INPUT).find((e) => e.type === 'stick');
    expect(passed?.type === 'stick' && passed.bubble.y).toBe(cellCentre(pass, 0, 0).y);

    const hit = board(['..........', '.........', '..........', '....0....']);
    hit.shot = { x: x + 29, y: 300, dx: 0, dy: -1, colour: 1 };
    const stuck = settle(hit, NO_INPUT).find((e) => e.type === 'stick');
    // Beside it or below, not up at the ceiling.
    expect(stuck?.type === 'stick' && stuck.bubble.y).toBeGreaterThanOrEqual(
      cellCentre(hit, 3, 0).y,
    );
  });

  it('lands exactly where landingCell (the aim guide) says, for any aim', () => {
    const random = seededRandom(8);
    for (let i = 0; i < 40; i++) {
      const state = createPopShot(seededRandom(100 + i));
      const aim = { x: Math.round(-300 + random() * 960), y: Math.round(100 + random() * 400) };
      const [row, col] = landingCell(state, aim);
      const expected = cellCentre(state, row, col);
      const stick = settle(state, { aimX: aim.x, aimY: aim.y, fire: true }).find(
        (e) => e.type === 'stick',
      );
      expect(stick?.type === 'stick' && { x: stick.bubble.x, y: stick.bubble.y }).toEqual(expected);
    }
  });

  it('the aim guide follows the real shot step for step, to where it settles', () => {
    const random = seededRandom(5);
    const state = createPopShot(seededRandom(12));
    const aim = { x: -150, y: 380 }; // off the left wall
    const path = shotPath(state, aim);
    const flown = [{ x: SHOOTER_X, y: SHOOTER_Y }];
    let stuck: PopShotEvent | undefined;
    tick(state, fireAt(aim.x, aim.y), random);
    while (state.shot) {
      flown.push({ x: state.shot.x, y: state.shot.y });
      stuck = tick(state, NO_INPUT, random).find((e) => e.type === 'stick') ?? stuck;
    }
    // The real shot's position after each step is the guide's, in order.
    expect(path.slice(0, flown.length)).toEqual(flown);
    expect(path.at(-1)).toEqual(
      stuck?.type === 'stick' && { x: stuck.bubble.x, y: stuck.bubble.y },
    );
    expect(path.some((p) => p.x <= R + 4)).toBe(true); // it did bounce
  });

  it('only one flies at a time: fire is ignored until it lands', () => {
    const state = createPopShot(seededRandom(3));
    const random = seededRandom(5);
    const events: PopShotEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(...tick(state, straightUp, random));
    expect(types(events).filter((t) => t === 'fire')).toHaveLength(1);
  });

  it('the next bubble moves up to the shooter, and a new next is dealt', () => {
    const state = createPopShot(seededRandom(3));
    const { current, next } = state;
    tick(state, straightUp, seededRandom(5));
    expect(state.current).toBe(next);
    expect(state.next).not.toBe(next);
    expect(state.current).not.toBe(current);
  });

  it('is dealt from the colours still on the board', () => {
    const state = board(['2....5....']);
    expect(colourFor(state, 0)).toBe(2);
    expect(colourFor(state, 0.49)).toBe(2);
    expect(colourFor(state, 0.5)).toBe(5);
    expect(colourFor(state, 0.999)).toBe(5);
    const empty = board([], 12);
    expect(colourFor(empty, 0.999)).toBe(activeColours(12) - 1);
  });
});

describe('popping and dropping', () => {
  it(`${MATCH} or more of a colour pop; two do not`, () => {
    const two = board(['....1.....', '.........']);
    releaseAt(two, 1, 4, 1); // touches the 1 above, but only two in all
    expect(cells(two)).toEqual(['....1.....', '....1....']);
    expect(two.score).toBe(0);

    const three = board(['....11....']);
    const events = releaseAt(three, 1, 4, 1);
    expect(types(events)).toContain('pop');
    expect(three.score).toBe(MATCH * POP_POINTS + CLEAR_POINTS);
  });

  it('pays for every bubble popped, not just three', () => {
    // The shot joins three 1s: four pop, and the 2 that hung from them falls. The 0 stays.
    const state = board(['...111..0.', '..2......']);
    releaseAt(state, 1, 3, 1);
    expect(cells(state)).toEqual(['........0.']);
    expect(state.score).toBe(4 * POP_POINTS + DROP_POINTS);
  });

  it('a different colour does not pop the group it lands on', () => {
    const state = board(['....11....']);
    releaseAt(state, 1, 4, 2);
    expect(cells(state)).toEqual(['....11....', '....2....']);
  });

  it('bubbles cut loose fall for double points; those still hanging elsewhere stay', () => {
    const state = board(['..2.2.....', '..011....', '....3.....', '...3.....']);
    const events = releaseAt(state, 2, 5, 1);
    // Popped: the two 1s and the shot. Fell: the 3s below them. Stayed: the 0 (held by a 2).
    expect(cells(state)).toEqual(['..2.2.....', '..0......']);
    const pop = events.find((e) => e.type === 'pop');
    const drop = events.find((e) => e.type === 'drop');
    expect(pop?.type === 'pop' && pop.bubbles.length).toBe(3);
    expect(drop?.type === 'drop' && drop.bubbles.map((b) => b.colour)).toEqual([3, 3]);
    expect(state.score).toBe(3 * POP_POINTS + 2 * DROP_POINTS);
  });

  it('looseCells finds exactly what no chain holds to the ceiling', () => {
    const state = board(['1.........', '1........', '.........', '..2......', '...3.....']);
    // Row 3's 2 and row 4's 3 touch each other but nothing above.
    expect(looseCells(state)).toEqual([
      [3, 2],
      [4, 3],
    ]);
  });

  it('sameColourGroup follows a colour across rows, and no further', () => {
    const state = board(['11.2......', '.1.......', '..1......', '..2......']);
    expect(sameColourGroup(state, 0, 0).sort()).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 2],
    ]);
  });

  it('a cleared board scores a bonus and refills', () => {
    const state = board(['....11....']);
    const events = releaseAt(state, 1, 4, 1);
    expect(types(events)).toEqual(['stick', 'pop', 'clear', 'row']);
    expect(state.score).toBe(3 * POP_POINTS + CLEAR_POINTS);
    expect(state.grid).toHaveLength(CLEAR_ROWS);
    expect(
      state.grid.every((row, r) => row.slice(0, rowLength(state, r)).every((c) => c !== null)),
    ).toBe(true);
  });
});

describe('the pressure', () => {
  it('a new row comes every few shots: 8 at first, one fewer every 4 rows, never under 1', () => {
    expect([0, 3, 4, 8, 27, 28, 100].map(shotsPerRow)).toEqual([8, 8, 7, 6, 2, 1, 1]);
    expect([0, 5, 6, 12, 100].map(activeColours)).toEqual([4, 4, 5, 6, 6]);
  });

  it('pushes everything down one row, keeping every bubble where it was across', () => {
    const random = seededRandom(9);
    const state = createPopShot(random);
    const before = state.grid.flatMap((row, r) =>
      row.flatMap((c, col) => (c === null ? [] : [{ ...cellCentre(state, r, col), c }])),
    );
    pushRow(state, random);
    const after = state.grid
      .slice(1)
      .flatMap((row, i) =>
        row.flatMap((c, col) => (c === null ? [] : [{ ...cellCentre(state, i + 1, col), c }])),
      );
    expect(after).toEqual(before.map((b) => ({ ...b, y: b.y + ROW_H })));
    expect(rowLength(state, 0)).toBe(9); // the shift flips with each push
  });

  it('counts shots, pops or not, and pushes a row when the count is reached', () => {
    const random = seededRandom(9);
    const state = createPopShot(random);
    let rows = 0;
    for (let shot = 1; shot <= 16; shot++) {
      const events = settle(state, fireAt([20, 100, 180, 260, 340][shot % 5] ?? 0, 300), random);
      rows += types(events).filter((t) => t === 'row').length;
      if (types(events).includes('clear')) throw new Error('unexpected clear');
    }
    expect(rows).toBe(2);
  });

  it('rows of 9 and of 10 draw the same numbers, so a seed deals the same rows either way', () => {
    const rowsFrom = (shift: number) => {
      const random = seededRandom(31);
      const state = board([], shift);
      const out: string[] = [];
      for (let i = 0; i < 4; i++) {
        pushRow(state, random);
        out.push(cells(state)[0]?.slice(0, 9) ?? '');
      }
      return out;
    };
    expect(rowsFrom(0)).toEqual(rowsFrom(1));
  });

  it('a bubble left on the line ends the run', () => {
    const rows = Array.from({ length: LOSE_ROW }, (_, r) =>
      r % 2 === 0 ? '....0.....' : '....0....',
    );
    // Fourteen rows is the most that fits: a shot that brings no row leaves the run going.
    const fits = board(rows);
    releaseAt(fits, 1, 3, 2);
    expect(fits.over).toBe(false);

    const state = board(rows);
    state.shotsSinceRow = shotsPerRow(0) - 1; // the next shot brings a row: the pile crosses
    const events = releaseAt(state, 1, 3, 2);
    expect(types(events)).toContain('over');
    expect(state.over).toBe(true);
    expect(tick(state, straightUp, seededRandom(1))).toEqual([]);
  });

  it('a bubble that lands on the line but pops does not', () => {
    const chain = Array.from({ length: 13 }, (_, r) => (r % 2 === 0 ? '....0.....' : '....0....'));
    const missed = board([...chain, '...11....']);
    releaseAt(missed, 14, 4, 2);
    expect(missed.over).toBe(true);

    const popped = board([...chain, '...11....']);
    const events = releaseAt(popped, 14, 4, 1);
    expect(types(events)).toContain('pop');
    expect(popped.over).toBe(false);
    expect(popped.grid).toHaveLength(13);
  });

  it(`fires by itself after ${HURRY_MS / 1000} s without a shot, and the clock restarts`, () => {
    const state = createPopShot(seededRandom(6));
    const random = seededRandom(5);
    const fires: { step: number; auto: boolean }[] = [];
    for (let step = 1; step <= 1100; step++) {
      for (const e of tick(state, NO_INPUT, random))
        if (e.type === 'fire') fires.push({ step, auto: e.auto });
    }
    const hurrySteps = HURRY_MS / (1000 / 60);
    expect(fires[0]?.auto).toBe(true);
    expect(fires[0]?.step).toBeGreaterThanOrEqual(hurrySteps - 1);
    expect(fires[0]?.step).toBeLessThanOrEqual(hurrySteps + 1);
    // The second waits a full hurry from when the first landed, not from the start.
    expect((fires[1]?.step ?? 0) - (fires[0]?.step ?? 0)).toBeGreaterThan(hurrySteps);
  });
});

describe('every run ends, and skill counts', () => {
  const aims = Array.from({ length: 121 }, (_, i) => ({ x: -360 + i * 9, y: SHOOTER_Y - 250 }));

  /** The best-scoring cell for this bubble: pops and drops first, then a high, matching spot. */
  function bestAim(state: PopShotState) {
    const colour = colourFor(state, state.current);
    let best = aims[60] ?? { x: SHOOTER_X, y: 0 };
    let bestValue = -Infinity;
    for (const aim of aims) {
      const [r, c] = landingCell(state, aim);
      const s = { ...state, grid: state.grid.map((row) => [...row]) };
      while (s.grid.length <= r) s.grid.push(new Array<Cell>(COLS).fill(null));
      const target = s.grid[r];
      if (target) target[c] = colour;
      const group = sameColourGroup(s, r, c);
      let value = group.length * 5 - r;
      if (group.length >= MATCH) {
        for (const [gr, gc] of group) {
          const cellsRow = s.grid[gr];
          if (cellsRow) cellsRow[gc] = null;
        }
        value = 100 + group.length + 2 * looseCells(s).length;
      }
      if (value > bestValue) {
        bestValue = value;
        best = aim;
      }
    }
    return best;
  }

  function play(seed: number, choose: (s: PopShotState) => { x: number; y: number }) {
    const random = seededRandom(seed);
    const state = createPopShot(random);
    let shots = 0;
    while (!state.over && shots < 400) {
      const aim = choose(state);
      settle(state, fireAt(Math.round(aim.x), Math.round(aim.y)), random);
      shots += 1;
    }
    return { state, shots };
  }

  it('even a player who always finds the best shot is buried once a row comes every shot', () => {
    for (const seed of [1, 2, 3]) {
      const { state, shots } = play(seed, bestAim);
      expect(state.over).toBe(true);
      // 4 × (8 + 7 + … + 2) = 140 shots bring the pace to a row a shot; it cannot last long after.
      expect(shots).toBeLessThan(220);
      expect(shots).toBeGreaterThan(100);
    }
  });

  it('the best shots outscore random ones on the same board', () => {
    for (const seed of [4, 5]) {
      const aimRandom = seededRandom(seed + 50);
      const random = play(seed, () => ({ x: -360 + aimRandom() * 1080, y: SHOOTER_Y - 250 }));
      const best = play(seed, bestAim);
      expect(best.state.score).toBeGreaterThan(random.state.score * 2);
    }
  });
});
