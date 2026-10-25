import type { Dir } from './coil';

/** Minimum travel, in screen pixels, for a gesture to count as a swipe rather than a tap. */
export const MIN_SWIPE_PX = 24;

/** The swipe's dominant axis decides the direction; short or ambiguous movements are ignored. */
export function swipeDirection(dx: number, dy: number, minDistance = MIN_SWIPE_PX): Dir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < minDistance) return null;
  if (ax === ay) return null;
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
