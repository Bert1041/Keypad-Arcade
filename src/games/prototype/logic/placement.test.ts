import { describe, expect, it } from 'vitest';
import { place } from './placement';

const top = { x: 100, width: 100 };

describe('place', () => {
  it('misses when the block is entirely off the stack', () => {
    expect(place({ x: 0, width: 100 }, top, 4)).toEqual({ kind: 'miss' });
    expect(place({ x: 200, width: 50 }, top, 4)).toEqual({ kind: 'miss' }); // touching edges is a miss
  });

  it('cuts the overhang on the left', () => {
    expect(place({ x: 70, width: 100 }, top, 4)).toEqual({
      kind: 'cut',
      placed: { x: 100, width: 70 },
      offcut: { x: 70, width: 30 },
    });
  });

  it('cuts the overhang on the right', () => {
    expect(place({ x: 130, width: 100 }, top, 4)).toEqual({
      kind: 'cut',
      placed: { x: 130, width: 70 },
      offcut: { x: 200, width: 30 },
    });
  });

  it('snaps to a perfect drop within the tolerance, keeping the full width', () => {
    expect(place({ x: 103, width: 100 }, top, 4)).toEqual({ kind: 'perfect', placed: top });
    expect(place({ x: 96, width: 100 }, top, 4)).toEqual({ kind: 'perfect', placed: top });
  });

  it('is not perfect just outside the tolerance', () => {
    expect(place({ x: 105, width: 100 }, top, 4).kind).toBe('cut');
  });

  it('never loses or invents width: placed + offcut = moving', () => {
    for (let x = -150; x <= 250; x += 7) {
      const result = place({ x, width: 100 }, top, 0);
      if (result.kind === 'cut') expect(result.placed.width + result.offcut.width).toBeCloseTo(100);
    }
  });
});
