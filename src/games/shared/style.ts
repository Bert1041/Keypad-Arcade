/**
 * The look the real games share, so they match the app shell (src/styles/tokens.css).
 * Phaser draws to a canvas and cannot read CSS variables, so the values are repeated here.
 */
export const PIXEL_FONT = '"Press Start 2P", monospace';
export const BODY_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const INK = {
  bg: 0x0d0e14,
  bgCss: '#0d0e14',
  text: '#eef0f8',
  muted: '#a3a9c2',
  accent: 0xffd23f,
} as const;
