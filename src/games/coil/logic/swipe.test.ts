import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

describe('swipeDirection', () => {
  it.each([
    [40, 5, 'right'],
    [-40, 5, 'left'],
    [5, 40, 'down'],
    [5, -40, 'up'],
  ] as const)('dx=%i dy=%i → %s', (dx, dy, dir) => {
    expect(swipeDirection(dx, dy)).toBe(dir);
  });

  it('ignores taps and tiny movements', () => {
    expect(swipeDirection(0, 0)).toBeNull();
    expect(swipeDirection(10, -12)).toBeNull();
  });

  it('ignores a perfectly diagonal swipe rather than guessing', () => {
    expect(swipeDirection(30, 30)).toBeNull();
  });
});
