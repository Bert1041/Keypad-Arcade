import type { RandomFn } from '@/games/types';

/**
 * Pop Shot's rules: a fixed-step simulation with no Phaser in it. The scene calls tick() 60 times
 * per simulated second with where the player is aiming and whether they fired, so a run depends
 * only on the seed and those inputs.
 *
 * World px, y downwards. Bubbles sit on a hex grid hanging from the ceiling: rows of 10 and 9
 * alternate, the rows of 9 shifted half a bubble right. Only + − × ÷, Math.sqrt and rounding are
 * used, which every engine computes alike (the leaderboard replays runs in Node).
 */

export const STEP_MS = 1000 / 60;
export const WIDTH = 360;
export const HEIGHT = 600;

export const R = 18;
const D = R * 2;
export const COLS = 10;
/** Distance between rows: about R × √3, rounded, so neighbours nearly touch. */
export const ROW_H = 31;
/** The ceiling the top row hangs from. */
export const CEILING_Y = 52;
/** A bubble left in this row (or lower) ends the run. */
export const LOSE_ROW = 14;
export const SHOOTER_X = WIDTH / 2;
export const SHOOTER_Y = 548;
/** px/s. */
export const SHOT_SPEED = 1100;
/** How far a shot moves each step. */
const SHOT_STEP = (SHOT_SPEED * STEP_MS) / 1000;
/** A flying bubble sticks when its centre comes this close to a bubble's: a little forgiving. */
const COLLIDE = 30;
/** The shot's upward share never drops below this, so it cannot be fired flat along the floor. */
const MIN_UP = 0.2;
/** With no shot fired for this long, the loaded bubble goes by itself, wherever it aims. */
export const HURRY_MS = 8_000;

export const START_ROWS = 5;
export const START_COLOURS = 4;
export const MAX_COLOURS = 6;
/** Bubbles that must touch to pop. */
export const MATCH = 3;
export const POP_POINTS = 10;
export const DROP_POINTS = 20;
export const CLEAR_POINTS = 500;
/** A cleared board refills with this many rows. */
export const CLEAR_ROWS = 4;

/** A colour index, or null for an empty cell. */
export type Cell = number | null;

export interface Shot {
  x: number;
  y: number;
  dx: number;
  dy: number;
  colour: number;
}

export interface Bubble {
  x: number;
  y: number;
  colour: number;
}

export interface PopShotState {
  timeMs: number;
  /** Row 0 hangs from the ceiling. Every row has COLS entries; a row of 9 leaves the last null. */
  grid: Cell[][];
  /** Rows pushed in from the top during the run: sets the pace and the colours. */
  pushes: number;
  shotsSinceRow: number;
  /**
   * The loaded and next bubbles, as random rolls: each becomes one of the colours still on the
   * board when it is shown or fired, so a colour that is gone is never dealt.
   */
  current: number;
  next: number;
  aim: { x: number; y: number };
  shot: Shot | null;
  /** When the loaded bubble became ready: the hurry clock runs from here. */
  readyAtMs: number;
  score: number;
  over: boolean;
}

export interface PopShotInput {
  /** The point aimed at, whole world px. */
  aimX: number;
  aimY: number;
  fire: boolean;
}

/** Straight up, not firing. */
export const NO_INPUT: PopShotInput = { aimX: SHOOTER_X, aimY: SHOOTER_Y - 200, fire: false };

export type PopShotEvent =
  | { type: 'fire'; auto: boolean }
  | { type: 'bounce' }
  | { type: 'stick'; bubble: Bubble }
  | { type: 'pop'; bubbles: Bubble[]; points: number }
  | { type: 'drop'; bubbles: Bubble[]; points: number }
  | { type: 'clear'; points: number }
  | { type: 'row' }
  | { type: 'over' };

/** Shots per new row: 8 at first, one fewer every 4 rows, down to one. */
export function shotsPerRow(pushes: number): number {
  return Math.max(1, 8 - Math.floor(pushes / 4));
}

export function activeColours(pushes: number): number {
  return Math.min(MAX_COLOURS, START_COLOURS + Math.floor(pushes / 6));
}

/** Rows of 9 are shifted half a bubble right; which rows they are flips with every push. */
export function isShifted(state: Pick<PopShotState, 'pushes'>, row: number): boolean {
  return (((row - state.pushes) % 2) + 2) % 2 === 1;
}

export function rowLength(state: Pick<PopShotState, 'pushes'>, row: number): number {
  return isShifted(state, row) ? COLS - 1 : COLS;
}

export function cellCentre(state: Pick<PopShotState, 'pushes'>, row: number, col: number) {
  return {
    x: R + col * D + (isShifted(state, row) ? R : 0),
    y: CEILING_Y + R + row * ROW_H,
  };
}

function get(state: PopShotState, row: number, col: number): Cell {
  return state.grid[row]?.[col] ?? null;
}

function set(state: PopShotState, row: number, col: number, value: Cell): void {
  while (state.grid.length <= row) state.grid.push(new Array<Cell>(COLS).fill(null));
  const cells = state.grid[row];
  if (cells) cells[col] = value;
}

/** The up-to-six cells touching one, on the board. */
export function neighbours(state: PopShotState, row: number, col: number): [number, number][] {
  // A shifted row's neighbours above and below are at col and col + 1; an unshifted row's at
  // col − 1 and col.
  const lean = isShifted(state, row) ? 0 : -1;
  const out: [number, number][] = [];
  const add = (r: number, c: number) => {
    if (r >= 0 && c >= 0 && c < rowLength(state, r)) out.push([r, c]);
  };
  add(row, col - 1);
  add(row, col + 1);
  for (const r of [row - 1, row + 1]) {
    add(r, col + lean);
    add(r, col + lean + 1);
  }
  return out;
}

function bubbles(state: PopShotState, cells: [number, number][]): Bubble[] {
  return cells.map(([row, col]) => ({
    ...cellCentre(state, row, col),
    colour: get(state, row, col) ?? 0,
  }));
}

/** The colours on the board, lowest first. */
function present(state: PopShotState): number[] {
  const seen = new Set<number>();
  for (const cells of state.grid) for (const c of cells) if (c !== null) seen.add(c);
  return [...seen].sort((a, b) => a - b);
}

/** The colour a roll deals: one of those still on the board (any, on an empty board). */
export function colourFor(state: PopShotState, roll: number): number {
  const colours = present(state);
  if (colours.length === 0) return Math.floor(roll * activeColours(state.pushes));
  return colours[Math.floor(roll * colours.length)] ?? 0;
}

/**
 * Pushes a new row in at the top, moving every row down one. Always draws COLS numbers, so the
 * n-th row of a seed is the same for everyone however their board looks.
 */
export function pushRow(state: PopShotState, random: RandomFn): void {
  state.pushes += 1;
  const colours = activeColours(state.pushes);
  const cells = new Array<Cell>(COLS).fill(null);
  const length = rowLength(state, 0);
  for (let col = 0; col < COLS; col++) {
    const roll = random();
    if (col < length) cells[col] = Math.floor(roll * colours);
  }
  state.grid.unshift(cells);
}

export function createPopShot(random: RandomFn): PopShotState {
  const state: PopShotState = {
    timeMs: 0,
    grid: [],
    pushes: 0,
    shotsSinceRow: 0,
    current: 0,
    next: 0,
    aim: { x: NO_INPUT.aimX, y: NO_INPUT.aimY },
    shot: null,
    readyAtMs: 0,
    score: 0,
    over: false,
  };
  for (let row = 0; row < START_ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const roll = random();
      if (col < rowLength(state, row)) set(state, row, col, Math.floor(roll * START_COLOURS));
    }
  }
  state.current = random();
  state.next = random();
  return state;
}

/** The unit direction a shot takes towards an aim point, never flatter than MIN_UP. */
export function aimDirection(aim: { x: number; y: number }): { dx: number; dy: number } {
  const vx = aim.x - SHOOTER_X;
  const vy = aim.y - SHOOTER_Y;
  const length = Math.sqrt(vx * vx + vy * vy);
  if (length === 0 || (vx === 0 && vy >= 0)) return { dx: 0, dy: -1 };
  const dx = vx / length;
  const dy = vy / length;
  if (dy <= -MIN_UP) return { dx, dy };
  return { dx: (vx < 0 ? -1 : 1) * Math.sqrt(1 - MIN_UP * MIN_UP), dy: -MIN_UP };
}

/** True if a bubble at (x, y) touches the ceiling or a bubble on the board. */
function touching(state: PopShotState, x: number, y: number): boolean {
  if (y - R <= CEILING_Y) return true;
  // Only rows near y can be within reach.
  const near = Math.floor((y - CEILING_Y - R) / ROW_H);
  for (let row = Math.max(0, near - 1); row <= near + 2 && row < state.grid.length; row++) {
    for (let col = 0; col < COLS; col++) {
      if (get(state, row, col) === null) continue;
      const c = cellCentre(state, row, col);
      const ex = c.x - x;
      const ey = c.y - y;
      if (ex * ex + ey * ey < COLLIDE * COLLIDE) return true;
    }
  }
  return false;
}

/**
 * Moves a flying bubble up to `distance`, in steps of at most 4 px, bouncing off the side walls.
 * Stops where it first touches something.
 */
export function moveShot(
  state: PopShotState,
  shot: Shot,
  distance: number,
): { stuck: boolean; bounces: number } {
  const parts = Math.max(1, Math.ceil(distance / 4));
  const step = distance / parts;
  let bounces = 0;
  for (let i = 0; i < parts; i++) {
    shot.x += shot.dx * step;
    shot.y += shot.dy * step;
    if (shot.x < R || shot.x > WIDTH - R) {
      shot.x = shot.x < R ? 2 * R - shot.x : 2 * (WIDTH - R) - shot.x;
      shot.dx = -shot.dx;
      bounces += 1;
    }
    if (touching(state, shot.x, shot.y)) {
      shot.y = Math.max(shot.y, CEILING_Y + R);
      return { stuck: true, bounces };
    }
  }
  return { stuck: false, bounces };
}

/**
 * The empty cell a stuck bubble settles in: the nearest one hanging from the ceiling or a bubble.
 * While COLLIDE < 2R the nearest empty cell to where a shot stops is always beside a bubble, so
 * the `hangs` test never changes the answer (a mutation test confirms it); it stays so a change
 * of COLLIDE can never leave a bubble floating.
 */
export function snapCell(state: PopShotState, x: number, y: number): [number, number] {
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (let row = 0; row <= state.grid.length; row++) {
    for (let col = 0; col < rowLength(state, row); col++) {
      if (get(state, row, col) !== null) continue;
      const hangs =
        row === 0 || neighbours(state, row, col).some(([r, c]) => get(state, r, c) !== null);
      if (!hangs) continue;
      const c = cellCentre(state, row, col);
      const distance = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [row, col];
      }
    }
  }
  if (!best) throw new Error('Pop Shot: nowhere for the bubble to settle');
  return best;
}

/**
 * Flies a shot fired at `aim` now, without changing anything, calling `visit` with each step's
 * position; returns the cell it settles in. Moved exactly as tick() moves a real shot, a frame at
 * a time: smaller steps stop at slightly different points and can settle in a different cell.
 */
function flyToRest(
  state: PopShotState,
  aim: { x: number; y: number },
  visit: (x: number, y: number) => void,
): [number, number] {
  const shot: Shot = { x: SHOOTER_X, y: SHOOTER_Y, ...aimDirection(aim), colour: 0 };
  // The ceiling stops every shot (it always rises), so this ends; the cap only guards a bug.
  for (let i = 0; i < 1000; i++) {
    const stuck = moveShot(state, shot, SHOT_STEP).stuck;
    visit(shot.x, shot.y);
    if (stuck) return snapCell(state, shot.x, shot.y);
  }
  throw new Error('Pop Shot: a shot never landed');
}

/** Where a shot fired at `aim` now would settle: for tests and bots. */
export function landingCell(state: PopShotState, aim: { x: number; y: number }): [number, number] {
  return flyToRest(state, aim, () => undefined);
}

/**
 * The path a shot fired at `aim` now would take, from the shooter, a point per step, ending at
 * the centre of the cell it settles in: what the aim guide draws, so the guide cannot lie.
 */
export function shotPath(state: PopShotState, aim: { x: number; y: number }) {
  const points = [{ x: SHOOTER_X, y: SHOOTER_Y }];
  const [row, col] = flyToRest(state, aim, (x, y) => points.push({ x, y }));
  points.push(cellCentre(state, row, col));
  return points;
}

/** The cells joined to (row, col) through cells of the same colour, including it. */
export function sameColourGroup(state: PopShotState, row: number, col: number): [number, number][] {
  const colour = get(state, row, col);
  if (colour === null) return [];
  const seen = new Set<string>([`${row},${col}`]);
  const group: [number, number][] = [[row, col]];
  for (let i = 0; i < group.length; i++) {
    const [r, c] = group[i] ?? [0, 0];
    for (const [nr, nc] of neighbours(state, r, c)) {
      const key = `${nr},${nc}`;
      if (seen.has(key) || get(state, nr, nc) !== colour) continue;
      seen.add(key);
      group.push([nr, nc]);
    }
  }
  return group;
}

/** Bubbles no longer joined to the ceiling through other bubbles. */
export function looseCells(state: PopShotState): [number, number][] {
  const held = new Set<string>();
  const queue: [number, number][] = [];
  for (let col = 0; col < COLS; col++) {
    if (get(state, 0, col) !== null) {
      held.add(`0,${col}`);
      queue.push([0, col]);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i] ?? [0, 0];
    for (const [nr, nc] of neighbours(state, r, c)) {
      const key = `${nr},${nc}`;
      if (held.has(key) || get(state, nr, nc) === null) continue;
      held.add(key);
      queue.push([nr, nc]);
    }
  }
  const loose: [number, number][] = [];
  state.grid.forEach((cells, row) => {
    cells.forEach((cell, col) => {
      if (cell !== null && !held.has(`${row},${col}`)) loose.push([row, col]);
    });
  });
  return loose;
}

function isEmpty(state: PopShotState): boolean {
  return state.grid.every((cells) => cells.every((c) => c === null));
}

function fire(state: PopShotState, auto: boolean, random: RandomFn, events: PopShotEvent[]): void {
  state.shot = {
    x: SHOOTER_X,
    y: SHOOTER_Y,
    ...aimDirection(state.aim),
    colour: colourFor(state, state.current),
  };
  state.current = state.next;
  state.next = random();
  events.push({ type: 'fire', auto });
}

/** Settles the shot: pops a group of MATCH or more, drops what came loose, then the pressure. */
function land(state: PopShotState, shot: Shot, random: RandomFn, events: PopShotEvent[]): void {
  state.shot = null;
  const [row, col] = snapCell(state, shot.x, shot.y);
  set(state, row, col, shot.colour);
  events.push({ type: 'stick', bubble: { ...cellCentre(state, row, col), colour: shot.colour } });

  const group = sameColourGroup(state, row, col);
  if (group.length >= MATCH) {
    const points = POP_POINTS * group.length;
    events.push({ type: 'pop', bubbles: bubbles(state, group), points });
    for (const [r, c] of group) set(state, r, c, null);
    state.score += points;
    const loose = looseCells(state);
    if (loose.length > 0) {
      const dropPoints = DROP_POINTS * loose.length;
      events.push({ type: 'drop', bubbles: bubbles(state, loose), points: dropPoints });
      for (const [r, c] of loose) set(state, r, c, null);
      state.score += dropPoints;
    }
  }

  if (isEmpty(state)) {
    state.grid = [];
    state.score += CLEAR_POINTS;
    events.push({ type: 'clear', points: CLEAR_POINTS });
    for (let i = 0; i < CLEAR_ROWS; i++) pushRow(state, random);
    state.shotsSinceRow = 0;
    events.push({ type: 'row' });
  } else {
    state.shotsSinceRow += 1;
    if (state.shotsSinceRow >= shotsPerRow(state.pushes)) {
      pushRow(state, random);
      state.shotsSinceRow = 0;
      events.push({ type: 'row' });
    }
  }

  // Drop empty rows from the bottom, then: has the pile reached the line?
  while (state.grid.length > 0 && (state.grid.at(-1) ?? []).every((c) => c === null)) {
    state.grid.pop();
  }
  if (state.grid.length > LOSE_ROW) {
    state.over = true;
    events.push({ type: 'over' });
    return;
  }
  state.readyAtMs = state.timeMs;
}

/** Advances one step. Mutates `state`; returns what happened, for sound and effects. */
export function tick(state: PopShotState, input: PopShotInput, random: RandomFn): PopShotEvent[] {
  if (state.over) return [];
  state.timeMs += STEP_MS;
  state.aim = { x: input.aimX, y: input.aimY };
  const events: PopShotEvent[] = [];
  if (!state.shot) {
    if (input.fire) fire(state, false, random, events);
    else if (state.timeMs - state.readyAtMs >= HURRY_MS) fire(state, true, random, events);
  }
  const shot = state.shot;
  if (shot) {
    const moved = moveShot(state, shot, SHOT_STEP);
    for (let i = 0; i < moved.bounces; i++) events.push({ type: 'bounce' });
    if (moved.stuck) land(state, shot, random, events);
  }
  return events;
}
