/**
 * Pixel maps for makePixelTexture (2 px per pixel): a floor is 36 × 14, drawn 72 × 28 — the
 * logic's FLOOR_W × FLOOR_H. r roof, w wall, e edge, g lit window, d dark window, b base.
 */
export const FLOOR = [
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  'ewwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwe',
  'ewwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwe',
  'ewggggwwwddddwwwggggwwwggggwwwddddwe',
  'ewggggwwwddddwwwggggwwwggggwwwddddwe',
  'ewggggwwwddddwwwggggwwwggggwwwddddwe',
  'ewggggwwwddddwwwggggwwwggggwwwddddwe',
  'ewwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwe',
  'ewddddwwwggggwwwddddwwwggggwwwggggwe',
  'ewddddwwwggggwwwddddwwwggggwwwggggwe',
  'ewddddwwwggggwwwddddwwwggggwwwggggwe',
  'ewddddwwwggggwwwddddwwwggggwwwggggwe',
  'ewwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwe',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
] as const;

const WINDOWS = { g: 0xfff1c1, d: 0x2a2d40 };

/** One palette per floor colour the seed can pick (logic: 0–3). */
export const FLOOR_PALETTES = [
  { r: 0x7ff0e3, w: 0x2ec4b6, e: 0x1a7a71, b: 0x10514b, ...WINDOWS },
  { r: 0xffa3a3, w: 0xff6b6b, e: 0xb03f3f, b: 0x7a2626, ...WINDOWS },
  { r: 0xc4b8ff, w: 0x8f7aff, e: 0x5a46c2, b: 0x3a2c85, ...WINDOWS },
  { r: 0xffd9a0, w: 0xffb347, e: 0xb87414, b: 0x7d4d0a, ...WINDOWS },
] as const;
