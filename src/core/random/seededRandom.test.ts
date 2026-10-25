import { describe, expect, it } from 'vitest';
import { isSeed, seededRandom } from './seededRandom';

const take = (seed: number, n = 5) => Array.from({ length: n }, seededRandom(seed));

describe('seededRandom', () => {
  it('replays the same sequence for the same seed', () => {
    expect(take(12345)).toEqual(take(12345));
  });

  // Golden values from the reference Mulberry32 (bryc/code, PRNGs.md). If these change, every
  // challenge link already shared replays a different run.
  it.each([
    [1, ['0.62707394', '0.00273572', '0.52744704']],
    [12345, ['0.97972827', '0.30675226', '0.48420542']],
    [4294967295, ['0.89642261', '0.18947826', '0.71565268']],
  ])('matches the reference sequence for seed %i', (seed, expected) => {
    expect(take(seed, 3).map((x) => x.toFixed(8))).toEqual(expected);
  });

  it('gives different runs for different seeds', () => {
    expect(take(1)).not.toEqual(take(2));
  });

  it('stays within [0, 1)', () => {
    const r = seededRandom(99);
    for (let i = 0; i < 10_000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('isSeed', () => {
  it('accepts 32-bit unsigned integers only', () => {
    expect(isSeed(0)).toBe(true);
    expect(isSeed(4294967295)).toBe(true);
    expect(isSeed(4294967296)).toBe(false);
    expect(isSeed(-1)).toBe(false);
    expect(isSeed(1.5)).toBe(false);
  });
});
