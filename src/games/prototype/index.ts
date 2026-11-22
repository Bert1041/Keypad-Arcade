import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const prototype: GameDefinition = {
  id: 'prototype',
  title: 'Stack Test',
  description: 'Disposable prototype that proves the game host. Tap to drop the block.',
  thumbnail,
  howToPlay: {
    goal: 'Stack the sliding blocks as high as you can.',
    controls: ['Tap or click anywhere, or press Space, to drop the block.'],
    rules: [
      'Any overhang is cut off. Miss the tower completely and the run ends.',
      '1 point a block.',
    ],
  },
  orientation: 'portrait',
  load: () => import('./createGame').then((m) => m.createGame),
};
