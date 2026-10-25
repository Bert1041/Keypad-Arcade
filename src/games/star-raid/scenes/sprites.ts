import type { EnemyKind } from '../logic/raid';

/** Original pixel art. One character per pixel; see makePixelTexture. Drawn at 2× scale. */

export const SHIP = [
  '.....aa.....',
  '....abba....',
  '....abba....',
  '...aabbaa...',
  '..aaabbaaa..',
  '.aaaaaaaaaa.',
  'aaccaaaaccaa',
  'aa..aaaa..aa',
  'a...d..d...a',
  '....d..d....',
];

export const ENEMIES: Record<EnemyKind, string[]> = {
  // A one-eyed drone. (Deliberately not an insect/crab silhouette: that reads as a well-known
  // arcade alien, and every sprite here must be original.)
  drifter: [
    '....aaaa....',
    '..aaaaaaaa..',
    '.aaabbbbaaa.',
    'aaabbccbbaaa',
    '.aaabbbbaaa.',
    '..a.aaaa.a..',
    '.a...aa...a.',
  ],
  weaver: [
    '....aaaa....',
    '..aaaaaaaa..',
    '.aabbaabbaa.',
    'aaaaaaaaaaaa',
    '..aa.aa.aa..',
    '.a..a..a..a.',
  ],
  gunner: [
    '.aaaaaaaaaa.',
    'aabaaaaaabaa',
    'aaaaaaaaaaaa',
    '.aaacccaaaa.',
    '..aaacaaa...',
    '....aca.....',
    '.....c......',
  ],
};

export const PALETTE = {
  ship: { a: 0x8fb8ff, b: 0xffd23f, c: 0x5f7fd6, d: 0xff9f43 },
  drifter: { a: 0xff6b6b, b: 0x3a1418, c: 0xfff1c1 },
  weaver: { a: 0xc08bff, b: 0x0d0e14 },
  gunner: { a: 0xffa94d, b: 0x0d0e14, c: 0xfff1c1 },
} as const;
