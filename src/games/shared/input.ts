/**
 * True when a key press is meant for a shell control (a focused button, link or field), not
 * the game. Phaser listens to keys on the whole window, so without this check Space would
 * both play the game and — if we captured it instead — stop keyboard users pressing buttons.
 */
export function isForShellControl(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest('button, a[href], input, select, textarea, [contenteditable="true"]') !== null
  );
}
