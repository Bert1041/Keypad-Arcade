import { describe, expect, it } from 'vitest';
import { cos, sin } from './detMath';

describe('deterministic sin and cos', () => {
  it('match Math.sin and Math.cos to 1e-9 across many turns, both signs', () => {
    let worst = 0;
    for (let x = -60; x <= 60; x += 0.001) {
      worst = Math.max(worst, Math.abs(sin(x) - Math.sin(x)), Math.abs(cos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('are exact where it matters for symmetry', () => {
    expect(sin(0)).toBe(0);
    expect(sin(-1.2)).toBe(-sin(1.2));
    expect(sin(Number.NaN)).toBeNaN();
    expect(sin(Number.POSITIVE_INFINITY)).toBeNaN();
  });

  it('give exactly these values (replays already posted depend on every bit)', () => {
    // Generated from this implementation; any change to it must be deliberate and fail here.
    expect([0.5, 1, 2, 3, 10, -7.25, 1234.5678].map(sin)).toEqual(GOLDEN_SIN);
    expect([0.5, 1, 2, 3, 10, -7.25, 1234.5678].map(cos)).toEqual(GOLDEN_COS);
  });
});

const GOLDEN_SIN = [
  0.479425538604203, 0.8414709848086585, 0.909297426831229, 0.1411200080598671, -0.5440211108893703,
  -0.823080879011965, 0.07803344919988728,
];
const GOLDEN_COS = [
  0.8775825618924973, 0.5403023058681399, -0.4161468365471424, -0.9899924967613833,
  -0.8390715290771652, 0.567924173288695, -0.9969507417226697,
];
