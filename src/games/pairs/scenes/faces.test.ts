import { describe, expect, it } from 'vitest';
import { SYMBOLS } from '../logic/pairs';
import { BACK, FACES } from './faces';

describe('card faces', () => {
  it('there is one for every symbol the rules can deal, all different', () => {
    expect(FACES).toHaveLength(SYMBOLS);
    expect(new Set(FACES.map((f) => f.rows.join('/'))).size).toBe(SYMBOLS);
  });

  it('every pixel has a colour (a missing one crashes the game as it loads)', () => {
    for (const { rows, palette } of [...FACES, BACK]) {
      const missing = [...rows.join('')].filter((ch) => ch !== '.' && !(ch in palette));
      expect(missing).toEqual([]);
      expect(rows).toHaveLength(8);
      expect(rows.every((row) => row.length === 8)).toBe(true);
    }
  });
});
