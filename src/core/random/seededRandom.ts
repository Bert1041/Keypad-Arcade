export type RandomFn = () => number;

const UINT32 = 0x1_0000_0000;

/** A fresh seed for a run nobody asked to reproduce. */
export function randomSeed(): number {
  return Math.floor(Math.random() * UINT32);
}

export function isSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < UINT32;
}

/**
 * Mulberry32: tiny, fast, and identical on every browser — which is the point. A challenge link
 * only works if the friend's phone generates exactly the same sequence as the sharer's.
 * Returns floats in [0, 1), like Math.random.
 */
export function seededRandom(seed: number): RandomFn {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}
