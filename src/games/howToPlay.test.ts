import { describe, expect, it } from 'vitest';
import { games } from './registry';

describe('every game says how to play it', () => {
  for (const game of games) {
    it(`${game.id}: a goal, controls and rules, in short lines`, () => {
      const { goal, controls, rules } = game.howToPlay;
      expect(goal.trim().length).toBeGreaterThan(10);
      expect(controls.length).toBeGreaterThanOrEqual(1);
      expect(rules.length).toBeGreaterThanOrEqual(1);
      for (const line of [goal, ...controls, ...rules]) {
        // Read on a phone between turns: a line longer than this is a paragraph.
        expect(line.length, line).toBeLessThanOrEqual(160);
        expect(line.trim()).toBe(line);
      }
      // Lines are list keys on screen: a repeat would also be a copy-paste slip.
      expect(new Set([...controls, ...rules]).size).toBe(controls.length + rules.length);
    });
  }

  it('covers every registered game, including the test prototype', () => {
    expect(games.map((g) => g.id)).toContain('prototype');
  });
});
