import type Phaser from 'phaser';

/**
 * Builds a texture from a text pixel map: one character per pixel, '.' is transparent, every
 * other character is looked up in `palette`. Drawn once at `scale` px per pixel, so it stays
 * crisp, needs no image download, and lives in code review like any other change.
 */
export function makePixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: readonly string[],
  palette: Readonly<Record<string, number>>,
  scale = 2,
): void {
  if (scene.textures.exists(key)) return;
  const width = Math.max(...rows.map((r) => r.length));
  const g = scene.make.graphics({}, false);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const color = palette[ch];
      if (color === undefined) throw new Error(`pixel art '${key}': no colour for '${ch}'`);
      g.fillStyle(color);
      g.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  g.generateTexture(key, width * scale, rows.length * scale);
  g.destroy();
}
