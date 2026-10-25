import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fragileBoundaries, playScript } from '../logic/replay';
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
  // A jump that only works on one exact 16 ms tick is too precise for a person: every input
  // change in the solution must survive being two ticks early or late (see fragileBoundaries).
  it.each(LEVELS.map((level, i) => [i + 1, level.name, level, LEVEL_FILES[i]!] as const))(
    'level %i (%s): every input change can be ±2 ticks off without dying',
    (_n, _name, level, file) => {
      const fragile = fragileBoundaries(level, file.solution).map(
        (f) => `input change ${f.boundary}→${f.boundary + 1} ${f.late ? 'late' : 'early'}`,
      );
      expect(fragile).toEqual([]);
    },
  );
});
