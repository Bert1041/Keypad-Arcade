/**
 * The 18 card faces, as 8 × 8 pixel maps for makePixelTexture ('.' is transparent). Each differs
 * from the others in shape as well as colour, so no pair depends on telling colours apart.
 */
export const FACES: readonly { rows: readonly string[]; palette: Record<string, number> }[] = [
  {
    // heart
    rows: [
      '.HH..HH.',
      'HHHHHHHH',
      'HHHHHHHH',
      'HHHHHHHH',
      '.HHHHHH.',
      '..HHHH..',
      '...HH...',
      '........',
    ],
    palette: { H: 0xff5c6c },
  },
  {
    // star
    rows: [
      '...SS...',
      '...SS...',
      'SSSSSSSS',
      '.SSSSSS.',
      '..SSSS..',
      '.SSSSSS.',
      '.SS..SS.',
      'S......S',
    ],
    palette: { S: 0xffd23f },
  },
  {
    // moon
    rows: [
      '..MMM...',
      '.MMM....',
      'MMM.....',
      'MMM.....',
      'MMM.....',
      '.MMM....',
      '..MMM...',
      '........',
    ],
    palette: { M: 0xf3f0c8 },
  },
  {
    // sun
    rows: [
      '...O....',
      '.O.O.O..',
      '..OOO...',
      'OOOOOOO.',
      '..OOO...',
      '.O.O.O..',
      '...O....',
      '........',
    ],
    palette: { O: 0xff9f43 },
  },
  {
    // key
    rows: [
      '.KKK....',
      'K...K...',
      'K...K...',
      '.KKK....',
      '..K.....',
      '..KK....',
      '..K.....',
      '..KK....',
    ],
    palette: { K: 0xe0b341 },
  },
  {
    // bell
    rows: [
      '...BB...',
      '..BBBB..',
      '..BBBB..',
      '.BBBBBB.',
      '.BBBBBB.',
      'BBBBBBBB',
      '...bb...',
      '........',
    ],
    palette: { B: 0x8fb8ff, b: 0x4d6fb0 },
  },
  {
    // music note
    rows: [
      '....NN..',
      '....N.N.',
      '....N..N',
      '....N...',
      '..NNN...',
      '.NNNN...',
      '.NNN....',
      '........',
    ],
    palette: { N: 0xc58bff },
  },
  {
    // fish
    rows: [
      '........',
      '..FF...F',
      '.FFFF.FF',
      'FFwFFFFF',
      'FFFFFFFF',
      '.FFFF.FF',
      '..FF...F',
      '........',
    ],
    palette: { F: 0x4fb3ff, w: 0x0d0e14 },
  },
  {
    // cherries
    rows: [
      '.....G..',
      '....GG..',
      '...G.G..',
      '..G..G..',
      '.RR.RR..',
      'RRRRRRR.',
      'RRRRRRR.',
      '.RR.RR..',
    ],
    palette: { G: 0x5fd068, R: 0xe63950 },
  },
  {
    // cat
    rows: [
      'C......C',
      'CC....CC',
      'CCCCCCCC',
      'CkCCCCkC',
      'CCCCCCCC',
      'CCCppCCC',
      '.CCCCCC.',
      '........',
    ],
    palette: { C: 0xb8a48c, k: 0x0d0e14, p: 0xff8fb1 },
  },
  {
    // crown
    rows: [
      '........',
      'Y..YY..Y',
      'YY.YY.YY',
      'YYYYYYYY',
      'YrYYYYrY',
      'YYYYYYYY',
      '........',
      '........',
    ],
    palette: { Y: 0xf5c518, r: 0xe63950 },
  },
  {
    // gem
    rows: [
      '.DDDDDD.',
      'DDdDDdDD',
      'DDDDDDDD',
      '.DDDDDD.',
      '..DDDD..',
      '...DD...',
      '........',
      '........',
    ],
    palette: { D: 0x2ee6d6, d: 0xbffaf4 },
  },
  {
    // house
    rows: [
      '...RR...',
      '..RRRR..',
      '.RRRRRR.',
      'RRRRRRRR',
      '.HHHHHH.',
      '.HHddHH.',
      '.HHddHH.',
      '........',
    ],
    palette: { R: 0xd9534f, H: 0xe8d5b0, d: 0x6b4a2b },
  },
  {
    // tree
    rows: [
      '...TT...',
      '..TTTT..',
      '.TTTTTT.',
      '..TTTT..',
      '.TTTTTT.',
      'TTTTTTTT',
      '...bb...',
      '...bb...',
    ],
    palette: { T: 0x2fa84f, b: 0x8a5a2b },
  },
  {
    // water drop
    rows: [
      '...DD...',
      '...DD...',
      '..DDDD..',
      '.DDDDDD.',
      'DDDDDDDD',
      'DDDDDDDD',
      '.DDDDDD.',
      '..DDDD..',
    ],
    palette: { D: 0x3d7bff },
  },
  {
    // lightning bolt
    rows: [
      '....YY..',
      '...YY...',
      '..YY....',
      '.YYYYY..',
      '...YY...',
      '..YY....',
      '.YY.....',
      'YY......',
    ],
    palette: { Y: 0xfff275 },
  },
  {
    // anchor
    rows: [
      '...AA...',
      '..A..A..',
      '...AA...',
      '...AA...',
      'AAAAAAAA',
      '...AA...',
      'A..AA..A',
      '.AAAAAA.',
    ],
    palette: { A: 0x9aa7bd },
  },
  {
    // mushroom
    rows: [
      '..RRRR..',
      '.RwRRwR.',
      'RRRRRRRR',
      'RRwRRwRR',
      '...ww...',
      '...ww...',
      '..wwww..',
      '........',
    ],
    palette: { R: 0xff6b3d, w: 0xf6efe3 },
  },
];

/** The back of every card. */
export const BACK = {
  rows: [
    'bbbbbbbb',
    'b.b.b.b.',
    'bbbbbbbb',
    '.b.b.b.b',
    'bbbbbbbb',
    'b.b.b.b.',
    'bbbbbbbb',
    '.b.b.b.b',
  ],
  palette: { b: 0x2c3046 },
};
