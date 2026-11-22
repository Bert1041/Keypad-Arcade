/** Pixel maps for makePixelTexture (2 px per pixel). '.' is transparent. */

export const BALL = [
  '..bbbb..',
  '.bwwbbb.',
  'bwwbbbbb',
  'bwbbbbbb',
  'bbbbbbbd',
  'bbbbbbdd',
  '.bbbbdd.',
  '..dddd..',
] as const;
export const BALL_PALETTE = { b: 0xff5c6c, w: 0xffc2c8, d: 0xb03244 };

export const STAR = [
  '...yy...',
  '...yy...',
  'yyyyyyyy',
  '.yyyyyy.',
  '..yyyy..',
  '.yy..yy.',
] as const;
export const STAR_PALETTE = { y: 0xffd23f };

export const LIFE = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'] as const;
export const LIFE_PALETTE = { r: 0x7ff0a8 };

/** One spike, repeated along the ceiling and along spiked platforms. */
export const SPIKE = ['...s....', '..sss...', '.sssss..', 'sssssss.'] as const;
export const SPIKE_PALETTE = { s: 0xa3a9c2 };
