import { describe, expect, it } from 'vitest';
import { createRunSeeds } from './runSeeds';
import { seededRandom } from './seededRandom';

describe('createRunSeeds', () => {
  it('replays the challenge seed on every run, retries included', () => {
    const seeds = createRunSeeds(777);
    const first = seeds.begin();
    const retry = seeds.begin();
    expect(seeds.current()).toBe(777);
    expect([first(), first()]).toEqual([retry(), retry()]);
    const reference = seededRandom(777);
    expect(seeds.begin()()).toBe(reference());
  });

  it('gives each free run a fresh seed and remembers it for sharing', () => {
    const seeds = createRunSeeds(null);
    const generated = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const random = seeds.begin();
      const seed = seeds.current();
      generated.add(seed);
      // The remembered seed really is the one that produced this run.
      expect(random()).toBe(seededRandom(seed)());
    }
    expect(generated.size).toBeGreaterThan(15);
  });
});
