const SIZE = 1080;
const BG = '#10200f';
const INK = '#c7f464';
const INK_2 = '#8fd14f';
const FONT = 'ui-monospace, Menlo, Consolas, monospace';

export interface ShareCardContent {
  appName: string;
  gameTitle: string;
  score: number;
  /** Shown at the bottom so the image still leads somewhere when the text is dropped. */
  host: string;
}

/** Draws the image that travels with a share. Square, because WhatsApp and X crop to it. */
export function renderShareCard(content: ShareCardContent): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('2D canvas unavailable'));

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.strokeRect(36, 36, SIZE - 72, SIZE - 72);

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillText(content.appName.toUpperCase(), SIZE / 2, 150);
  ctx.font = `44px ${FONT}`;
  ctx.fillText(content.gameTitle, SIZE / 2, 240);

  ctx.font = `bold ${content.score >= 10_000 ? 200 : 300}px ${FONT}`;
  ctx.fillText(String(content.score), SIZE / 2, 520);

  ctx.font = `bold 64px ${FONT}`;
  ctx.fillText('Can you beat me?', SIZE / 2, 780);

  // Little stacked-block motif, in the app's two-tone palette.
  for (let i = 0; i < 4; i++) {
    const w = 240 - i * 48;
    ctx.fillStyle = i % 2 ? INK_2 : INK;
    ctx.fillRect((SIZE - w) / 2, 940 - i * 36, w, 30);
  }

  ctx.fillStyle = INK;
  ctx.font = `36px ${FONT}`;
  ctx.fillText(content.host, SIZE / 2, 1000);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
    ),
  );
}
