import type Phaser from 'phaser';
import { INK, PIXEL_FONT } from './style';

/** The game-over panel every game shows, centred on (x, y) and fixed to the camera. */
export function showGameOver(
  scene: Phaser.Scene,
  x: number,
  y: number,
  { score, isBest }: { score: number; isBest: boolean },
): Phaser.GameObjects.Text {
  const lines = ['GAME OVER', '', String(score), isBest ? 'NEW BEST!' : '', '', 'Tap to retry'];
  return scene.add
    .text(x, y, lines.join('\n'), {
      fontFamily: PIXEL_FONT,
      fontSize: '16px',
      lineSpacing: 6,
      color: INK.text,
      align: 'center',
      backgroundColor: `${INK.bgCss}e6`,
      padding: { x: 20, y: 18 },
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(1000);
}
