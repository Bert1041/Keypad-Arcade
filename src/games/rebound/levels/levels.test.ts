import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { playScript } from '../logic/replay';
import { LEVEL_FILES, LEVELS } from './index';

const collectibles = (rows: string[]) => rows.join('').replace(/[^o*+]/g, '').length;

describe('every level', () => {
  it('is in the level list, and the list has no strays', () => {
    const files = readdirSync(join(__dirname))
      .filter((f) => /^level\d+\.ts$/.test(f))
      .sort();
    expect(files).toHaveLength(LEVEL_FILES.length);
    expect(LEVELS.map((l) => l.name)).toEqual(LEVEL_FILES.map((f) => f.level.name));
  });

  it.each(LEVELS.map((level, i) => [i + 1, level.name, level, LEVEL_FILES[i]!] as const))(
    'level %i (%s) can be finished, without dying, collecting everything',
    (_n, _name, level, file) => {
      const { state, events } = playScript(level, file.solution);
      expect(events.filter((e) => e.type === 'died')).toEqual([]);
      expect(state.levelCleared).toBe(true);
      // Every ring, gem and extra life is reachable — none is a trap you can only reach by dying.
      const picked = events.filter(
        (e) => e.type === 'ring' || e.type === 'gem' || e.type === 'life',
      );
      expect(picked).toHaveLength(collectibles(file.level.rows));
    },
  );
});

describe('every level is fair to a human', () => {
  // A finish that only works on one exact 16 ms tick is too precise for a person. Move each
  // input change (the boundary between two steps) two ticks earlier or later, one at a time,
  // and the level must still be finished without dying.
  //
  // Only the boundary moves, and only the moves right after it are judged: a slip must not
  // wreck the jump it belongs to. Later inputs in a fixed script cannot adapt to the ball
  // landing a little elsewhere, but a player's can — so a fixed script's later steps are not a
  // fair judge of an early slip. (Finishing at all is proven by the un-nudged solution above.)
  const NUDGE_MS = 2 * (1000 / 60);
  /** How many steps after the nudge must play out without dying: the move and its landing. */
  const REACTION_STEPS = 3;

  it.each(LEVELS.map((level, i) => [i + 1, level.name, level, LEVEL_FILES[i]!] as const))(
    'level %i (%s): every input change can be ±2 ticks off without dying',
    (_n, _name, level, file) => {
      const fragile: string[] = [];
      for (let i = 0; i < file.solution.length - 1; i++) {
        for (const delta of [-NUDGE_MS, NUDGE_MS]) {
          const nudged = file.solution.map((s, j) =>
            j === i ? { ...s, ms: s.ms + delta } : j === i + 1 ? { ...s, ms: s.ms - delta } : s,
          );
          if (nudged.some((s) => s.ms < 0)) continue;
          const { events } = playScript(level, nudged.slice(0, i + 1 + REACTION_STEPS));
          if (events.some((e) => e.type === 'died')) {
            fragile.push(`input change ${i}→${i + 1} ${delta > 0 ? 'late' : 'early'}`);
          }
        }
      }
      expect(fragile).toEqual([]);
    },
  );
});
