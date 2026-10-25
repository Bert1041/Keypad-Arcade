/**
 * sin and cos built only from + − × ÷ and Math.round, which IEEE 754 and the language spec make
 * exact and identical in every engine. Math.sin and Math.cos are not: V8 (Chrome, Node) and
 * JavaScriptCore (Safari) may differ in the last bit, and the leaderboard server replays a run
 * in Node — one bit apart, a floor lands on the other side of a line and an honest iPhone score
 * is rejected. Game logic uses these (a guard test bans the Math ones); scenes, which only draw,
 * may use either.
 *
 * Accurate to ~1e-9 against Math.sin. The output is pinned by golden values in detMath.test.ts:
 * changing it changes every replay already posted.
 */

const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
const TAU = 6.283185307179586;

// Taylor coefficients to x^13: on [-π/2, π/2] the first term left out is below 7e-10.
const C3 = -1 / 6;
const C5 = 1 / 120;
const C7 = -1 / 5040;
const C9 = 1 / 362880;
const C11 = -1 / 39916800;
const C13 = 1 / 6227020800;

export function sin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  // Into [-π, π], then [-π/2, π/2] by sin(π − r) = sin(r).
  let r = x - TAU * Math.round(x / TAU);
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 + r2 * (C3 + r2 * (C5 + r2 * (C7 + r2 * (C9 + r2 * (C11 + r2 * C13))))));
}

export function cos(x: number): number {
  return sin(x + HALF_PI);
}
