import type { GameDefinition } from '@/games/types';
import thumbnail from './assets/thumbnail.svg';

/**
 * Everything the shell knows about this game. Kept free of Phaser: the library imports this
 * file, and Phaser must only load once the game is opened.
 */
export const skyline: GameDefinition = {
  id: 'skyline',
  title: 'Skyline',
  description: 'Drop each floor off the crane and build as high as you can. One tap.',
  thumbnail,
  howToPlay: {
    goal: 'Stack the swinging floors into the tallest tower you can.',
    controls: ['Tap anywhere to drop the floor from the crane.', 'Keyboard: Space, Enter or ↓.'],
    rules: [
      'A floor stays if more than half of it lands on the one below. If not, it falls and costs one of your 3 spare floors. Lose all 3 and the run ends.',
      'Drop it dead centre for a Perfect: bonus points that grow with a streak, and the tower leans less.',
      'Off-centre floors make the tower lean and sway. Higher up: faster swings, wind and a changing rope.',
      '10 points a floor, more for Perfects, and a bonus every 10th floor for each spare floor kept.',
    ],
  },
  orientation: 'portrait',
  daily: true,
  load: () => import('./createGame').then((m) => m.createGame),
};
