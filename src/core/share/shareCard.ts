const SIZE = 1080;
const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';
const BODY_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface ShareCardContent {
  appName: string;
  gameTitle: string;
  score: number;
  /** Shown at the bottom so the image still leads somewhere when the text is dropped. */
  host: string;
}

/** The card uses the app's own tokens (src/styles/tokens.css), so a restyle restyles it too. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Draws the image that travels with a share. Square, because WhatsApp and X crop to it. */
export async function renderShareCard(content: ShareCardContent): Promise<Blob> {
  // Canvas text does not wait for web fonts; without this the first card can fall back.
  await document.fonts.load(`48px ${PIXEL_FONT}`).catch(() => undefined);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  const accent = token('--accent');
  ctx.fillStyle = token('--bg');
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = token('--surface');
  ctx.beginPath();
  ctx.roundRect(60, 60, SIZE - 120, SIZE - 120, 48);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accent;
  ctx.font = `40px ${PIXEL_FONT}`;
  ctx.fillText(content.appName.toUpperCase(), SIZE / 2, 190);

  ctx.fillStyle = token('--text-muted');
  ctx.font = `600 48px ${BODY_FONT}`;
  ctx.fillText(content.gameTitle, SIZE / 2, 290);

  ctx.fillStyle = token('--text');
  const digits = String(content.score).length;
  ctx.font = `${digits > 4 ? 120 : digits > 2 ? 170 : 220}px ${PIXEL_FONT}`;
  ctx.fillText(String(content.score), SIZE / 2, 540);

  // Pixel underline in the accent colour.
  ctx.fillStyle = accent;
  for (let i = 0; i < 9; i++) ctx.fillRect(SIZE / 2 - 216 + i * 48, 690, 36, 12);

  ctx.fillStyle = token('--text');
  ctx.font = `700 64px ${BODY_FONT}`;
  ctx.fillText('Can you beat me?', SIZE / 2, 800);

  ctx.fillStyle = token('--text-muted');
  ctx.font = `36px ${BODY_FONT}`;
  ctx.fillText(content.host, SIZE / 2, 920);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
    ),
  );
}
