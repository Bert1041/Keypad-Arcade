import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { isForShellControl } from '@/games/shared/input';
import { place } from '../logic/placement';

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 640;

const BLOCK_HEIGHT = 24;
const START_WIDTH = 200;
const BASE_Y = WORLD_HEIGHT - 60;
const PERFECT_TOLERANCE = 4;
/** Ignore taps briefly after game over so the losing tap does not also restart. */
const RETRY_DELAY_MS = 400;
const COLORS = [0xc7f464, 0x8fd14f] as const;
const colorFor = (row: number) => COLORS[row % 2 === 0 ? 0 : 1];
const INK = '#c7f464';

interface Block {
  x: number;
  width: number;
  rect: Phaser.GameObjects.Rectangle;
}

export class StackScene extends Phaser.Scene {
  private stack: Block[] = [];
  private moving!: Block;
  private direction = 1;
  private speed = 0;
  private score = 0;
  private over = false;
  private overAt = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private random!: RandomFn;
  /** Survives scene restarts (the constructor runs once), so retries compare against this session's runs too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('stack');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so every piece of run state is reset here.
    this.random = this.services.beginRun();
    this.stack = [];
    this.direction = 1;
    this.speed = 120 + Math.floor(this.random() * 40);
    this.score = 0;
    this.over = false;
    this.cameras.main.setScroll(0, 0);

    this.stack.push(this.makeBlock((WORLD_WIDTH - START_WIDTH) / 2, START_WIDTH, 0));
    this.spawnMovingBlock();

    this.scoreText = this.add
      .text(WORLD_WIDTH / 2, 40, '0', { fontFamily: 'monospace', fontSize: '40px', color: INK })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.input.on('pointerdown', () => this.handleTap());
    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-SPACE', (event: KeyboardEvent) => {
        if (!isForShellControl(event)) this.handleTap();
      });
      keyboard.on('keydown-ESC', () => this.services.onExitRequested());
    }
  }

  override update(_time: number, delta: number) {
    if (this.over) return;
    const block = this.moving;
    block.x += this.direction * this.speed * (delta / 1000);
    if (block.x <= 0) {
      block.x = 0;
      this.direction = 1;
    } else if (block.x + block.width >= WORLD_WIDTH) {
      block.x = WORLD_WIDTH - block.width;
      this.direction = -1;
    }
    block.rect.x = block.x;
  }

  private rowY(row: number): number {
    return BASE_Y - row * BLOCK_HEIGHT;
  }

  private makeBlock(x: number, width: number, row: number): Block {
    const rect = this.add
      .rectangle(x, this.rowY(row), width, BLOCK_HEIGHT - 2, colorFor(row))
      .setOrigin(0, 0);
    return { x, width, rect };
  }

  private topBlock(): Block {
    const top = this.stack.at(-1);
    if (!top) throw new Error('StackScene: the stack always holds the base block');
    return top;
  }

  private spawnMovingBlock() {
    const top = this.topBlock();
    const fromLeft = this.random() < 0.5;
    this.direction = fromLeft ? 1 : -1;
    this.moving = this.makeBlock(
      fromLeft ? 0 : WORLD_WIDTH - top.width,
      top.width,
      this.stack.length,
    );
  }

  private handleTap() {
    if (this.over) {
      if (this.time.now - this.overAt >= RETRY_DELAY_MS) this.scene.restart();
      return;
    }

    const top = this.topBlock();
    const block = this.moving;
    const result = place(block, top, PERFECT_TOLERANCE);

    switch (result.kind) {
      case 'miss':
        this.dropOff(block.rect);
        this.endRun();
        return;
      case 'cut': {
        // Animate the overhang falling away.
        const row = this.stack.length;
        const piece = this.add
          .rectangle(
            result.offcut.x,
            this.rowY(row),
            result.offcut.width,
            BLOCK_HEIGHT - 2,
            colorFor(row),
          )
          .setOrigin(0, 0);
        this.dropOff(piece);
        break;
      }
      case 'perfect':
        break;
    }

    block.x = result.placed.x;
    block.width = result.placed.width;
    block.rect.setPosition(block.x, block.rect.y).setSize(block.width, BLOCK_HEIGHT - 2);
    this.stack.push(block);

    this.score += 1;
    this.scoreText.setText(String(this.score));
    this.services.sfx.blip(result.kind === 'perfect' ? 880 : 440 + this.score * 10);
    this.speed = Math.min(this.speed + 8, 420);

    // Keep the top of the tower in the middle of the screen.
    const targetScroll = Math.min(0, this.rowY(this.stack.length) - WORLD_HEIGHT / 2);
    this.tweens.add({ targets: this.cameras.main, scrollY: targetScroll, duration: 200 });

    this.spawnMovingBlock();
  }

  private dropOff(rect: Phaser.GameObjects.Rectangle) {
    this.tweens.add({
      targets: rect,
      y: rect.y + WORLD_HEIGHT,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeIn',
      onComplete: () => rect.destroy(),
    });
  }

  private endRun() {
    this.over = true;
    this.overAt = this.time.now;
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.score });

    const isBest = this.score > this.best;
    this.best = Math.max(this.best, this.score);
    const lines = ['GAME OVER', `Score ${this.score}`, isBest ? 'New best!' : '', 'Tap to retry'];
    this.add
      .text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, lines.filter(Boolean).join('\n'), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: INK,
        align: 'center',
        backgroundColor: '#10200fdd',
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setName('game-over');
  }
}
