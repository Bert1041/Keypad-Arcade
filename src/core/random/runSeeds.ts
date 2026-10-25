import { randomSeed, seededRandom, type RandomFn } from './seededRandom';

export interface RunSeeds {
  /** Starts a run: picks its seed and returns the generator for it. */
  begin(): RandomFn;
  /** The seed of the run most recently begun, so its result can be shared as a replay. */
  current(): number;
}

/**
 * On a challenge every run (including retries) replays the challenger's seed, so the
 * friend is always playing the run they were sent. Otherwise each run gets a new seed.
 */
export function createRunSeeds(challengeSeed: number | null): RunSeeds {
  let seed = challengeSeed ?? 0;
  return {
    begin() {
      seed = challengeSeed ?? randomSeed();
      return seededRandom(seed);
    },
    current: () => seed,
  };
}
