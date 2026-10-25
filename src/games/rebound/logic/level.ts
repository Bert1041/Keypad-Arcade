/**
 * Levels are text maps: one character per 24 px tile. Hand-made, so they read and diff like
 * code. See TILE_LEGEND for the characters.
 */

export const TILE = 24;

export const TILE_LEGEND = {
  '.': 'empty',
  '#': 'solid',
  '^': 'spikes',
  v: 'ceiling spikes',
  H: 'grate (solid, except to a small ball)',
  o: 'ring',
  '*': 'gem',
  '+': 'extra life',
  C: 'checkpoint',
  E: 'exit (opens once every ring is collected)',
  S: 'start',
  s: 'shrink pad',
  n: 'normal-size pad',
  g: 'grow pad',
  '~': 'water',
} as const;

export type TileChar = keyof typeof TILE_LEGEND;

/** A solid platform that moves back and forth between two points, forever. */
export interface PlatformDef {
  /** Top-left, in tiles. */
  x: number;
  y: number;
  /** Width in tiles (always one tile thick). */
  width: number;
  /** Travel, in tiles, from the start point to the far point. */
  dx: number;
  dy: number;
  /** Milliseconds for a full there-and-back trip. */
  periodMs: number;
}

/** A level without its own par time gets this one. */
export const DEFAULT_PAR_MS = 30_000;

export interface LevelDef {
  name: string;
  rows: string[];
  platforms?: PlatformDef[];
  /** Finish faster than this for a time bonus (more the faster). */
  parMs?: number;
}

export interface Level {
  name: string;
  cols: number;
  rows: number;
  grid: TileChar[][];
  start: { x: number; y: number };
  rings: number;
  platforms: PlatformDef[];
  parMs: number;
}

/** Validates and parses a level; throws with the level name and position on any mistake. */
export function parseLevel(def: LevelDef): Level {
  const cols = def.rows[0]?.length ?? 0;
  let start: { x: number; y: number } | null = null;
  let exits = 0;
  let rings = 0;
  const grid = def.rows.map((row, y) => {
    if (row.length !== cols)
      throw new Error(`${def.name}: row ${y} is ${row.length} wide, expected ${cols}`);
    return [...row].map((ch, x) => {
      if (!(ch in TILE_LEGEND)) throw new Error(`${def.name}: unknown tile '${ch}' at ${x},${y}`);
      if (ch === 'S') {
        if (start) throw new Error(`${def.name}: more than one start`);
        start = { x, y };
      }
      if (ch === 'E') exits += 1;
      if (ch === 'o') rings += 1;
      return ch as TileChar;
    });
  });
  if (!start) throw new Error(`${def.name}: no start`);
  if (exits !== 1) throw new Error(`${def.name}: needs exactly one exit, found ${exits}`);
  if (rings === 0) throw new Error(`${def.name}: needs at least one ring`);
  for (let x = 0; x < cols; x++) {
    if (grid[0]?.[x] !== '#' || grid[grid.length - 1]?.[x] !== '#') {
      // A closed top and bottom keeps the ball in the level; pits are spikes, not holes.
      throw new Error(`${def.name}: top and bottom rows must be solid (column ${x})`);
    }
  }
  for (const row of grid) {
    if (row[0] !== '#' || row[cols - 1] !== '#')
      throw new Error(`${def.name}: side walls must be solid`);
  }
  return {
    name: def.name,
    cols,
    rows: grid.length,
    grid,
    start,
    rings,
    platforms: def.platforms ?? [],
    parMs: def.parMs ?? DEFAULT_PAR_MS,
  };
}
