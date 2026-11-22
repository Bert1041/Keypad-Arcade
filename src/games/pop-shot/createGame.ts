import Phaser from 'phaser';
import type { CreateGame } from '@/games/types';
import { trackPhaserGame } from '@/games/shared/phaserLifecycle';
import { INK } from '@/games/shared/style';
import { PopShotScene, WORLD_HEIGHT, WORLD_WIDTH } from './scenes/PopShotScene';

export const createGame: CreateGame = (parent, services) => {
  return trackPhaserGame(
    new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      backgroundColor: INK.bgCss,
      // Bubbles are smooth circles, not pixel art: keep them antialiased.
      pixelArt: false,
      // Sound is synthesized through services.sfx, so Phaser's audio system is not needed.
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new PopShotScene(services)],
    }),
  );
};
