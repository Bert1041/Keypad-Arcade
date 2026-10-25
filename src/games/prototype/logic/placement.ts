/** A horizontal extent in world pixels. */
export interface Span {
  x: number;
  width: number;
}

export type Placement =
  | { kind: 'miss' }
  | { kind: 'perfect'; placed: Span }
  | { kind: 'cut'; placed: Span; offcut: Span };

/**
 * Drops the moving block onto the top of the stack. Pure, so the rules are tested without
 * Phaser. Within `perfectTolerance` px the block snaps to the top exactly and keeps its width.
 */
export function place(moving: Span, top: Span, perfectTolerance: number): Placement {
  const left = Math.max(moving.x, top.x);
  const right = Math.min(moving.x + moving.width, top.x + top.width);
  if (right - left <= 0) return { kind: 'miss' };

  if (Math.abs(moving.x - top.x) <= perfectTolerance) {
    return { kind: 'perfect', placed: { x: top.x, width: top.width } };
  }

  const placed = { x: left, width: right - left };
  const offcut =
    moving.x < top.x
      ? { x: moving.x, width: top.x - moving.x }
      : { x: right, width: moving.x + moving.width - right };
  return { kind: 'cut', placed, offcut };
}
