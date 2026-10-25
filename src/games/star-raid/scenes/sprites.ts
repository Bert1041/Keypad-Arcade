import type { EnemyKind, PowerKind } from '../logic/raid';

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
  // A saucer: dome, rim and running lights.
  weaver: [
    '....bbbb....',
    '...bbbbbb...',
    '.aaaaaaaaaa.',
    'aacaacaacaaa',
    '.aaaaaaaaaa.',
    '...a....a...',
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
  // A pod with a glowing core: shoot it to release the power-up inside.
  carrier: [
    '....aaaaaa....',
    '..aabbbbbbaa..',
    '.abbccccccbba.',
    'abbcc....ccbba',
    'abbcc....ccbba',
    '.abbccccccbba.',
    '..aabbbbbbaa..',
    '....aaaaaa....',
  ],
};

/** A capsule (frame colour 'a') around a 5×5 glyph ('b'). */
function capsule(glyph: string[]): string[] {
  return ['.aaaaaaa.', 'a.......a', ...glyph.map((row) => `a.${row}.a`), 'a.......a', '.aaaaaaa.'];
}

export const POWER_UPS: Record<PowerKind, string[]> = {
  twin: capsule(['.b.b.', '.b.b.', '.b.b.', '.b.b.', '.b.b.']),
  // A lightning bolt (a '>>' chevron blurred into a checkerboard at this size).
  rapid: capsule(['...b.', '..b..', '.bbb.', '..b..', '.b...']),
  shield: capsule(['.bbb.', 'b...b', 'b...b', 'b...b', '.bbb.']),
  bomb: capsule(['..b..', '.bbb.', 'bbbbb', '.bbb.', '..b..']),
  life: capsule(['..b..', '..b..', 'bbbbb', '..b..', '..b..']),
};

export const POWER_COLOR: Record<PowerKind, number> = {
  twin: 0xffd23f,
  rapid: 0xff9f43,
  shield: 0x5ee0f0,
  bomb: 0xff6b6b,
  life: 0x5ee08a,
};

export const POWER_LABEL: Record<PowerKind, string> = {
  twin: 'TWIN SHOT',
  rapid: 'RAPID FIRE',
  shield: 'SHIELD',
  bomb: 'BOMB!',
  life: '1UP',
};

export const PALETTE = {
  ship: { a: 0x8fb8ff, b: 0xffd23f, c: 0x5f7fd6, d: 0xff9f43 },
  drifter: { a: 0xff6b6b, b: 0x3a1418, c: 0xfff1c1 },
  weaver: { a: 0xc08bff, b: 0xe6d6ff, c: 0xffd23f },
  gunner: { a: 0xffa94d, b: 0x0d0e14, c: 0xfff1c1 },
  carrier: { a: 0x3ee6c8, b: 0x1d8f7c, c: 0xffd23f },
} as const;
