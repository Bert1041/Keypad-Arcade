import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { makePixelTexture } from '@/games/shared/pixelArt';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  HEIGHT,
  NO_INPUT,
  SHIP_Y,
  STEP_MS,
  WIDTH,
  createRaid,
  tick,
  type EnemyKind,
  type RaidEvent,
  type RaidInput,
  type RaidState,
} from '../logic/raid';
import { ENEMIES, PALETTE, SHIP } from './sprites';

export const WORLD_WIDTH = WIDTH;
export const WORLD_HEIGHT = HEIGHT;

/** Ignore input briefly after game over so the losing drag does not also restart. */
const RETRY_DELAY_MS = 600;
/** A long pause (tab hidden, slow frame) must not fast-forward the simulation. */
const MAX_FRAME_MS = 250;
const STAR_COUNT = 60;

const ENEMY_KINDS: EnemyKind[] = ['drifter', 'weaver', 'gunner'];

export class RaidScene extends Phaser.Scene {
  private state!: RaidState;
  private random!: RandomFn;
  private input_: RaidInput = NO_INPUT;
  private keysDown = new Set<'left' | 'right'>();
  private drag: { pointerX: number; shipX: number } | null = null;
  private elapsed = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private ship!: Phaser.GameObjects.Image;
  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private shotsGfx!: Phaser.GameObjects.Graphics;
  private stars!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private livesGfx!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  /** Survives restarts (the constructor runs once), so retries compare against this session too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('star-raid');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createRaid();
    this.input_ = NO_INPUT;
    this.keysDown.clear();
    this.drag = null;
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.enemySprites.clear();

    makePixelTexture(this, 'raid-ship', SHIP, PALETTE.ship);
    for (const kind of ENEMY_KINDS)
      makePixelTexture(this, `raid-${kind}`, ENEMIES[kind], PALETTE[kind]);

    this.stars = this.add.graphics();
    this.shotsGfx = this.add.graphics();
    this.ship = this.add.image(this.state.ship.x, SHIP_Y, 'raid-ship');
    this.scoreText = this.add
      .text(12, 14, '0', { fontFamily: PIXEL_FONT, fontSize: '16px', color: INK.text })
      .setDepth(10);
    this.livesGfx = this.add.graphics().setDepth(10);
    this.hint = this.add
      .text(WIDTH / 2, HEIGHT / 2, 'Drag to steer · auto-fire\nTap to start', {
        fontFamily: BODY_FONT,
        fontSize: '16px',
        color: INK.muted,
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) return;
      this.start();
      this.drag = { pointerX: p.x, shipX: this.state.ship.x };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Relative steering: the ship moves with the finger, never under it.
      if (this.drag && p.isDown) {
        this.input_ = { targetX: this.drag.shipX + (p.x - this.drag.pointerX), axis: 0 };
      }
    });
    this.input.on('pointerup', () => {
      this.drag = null;
      this.input_ = this.keyInput();
      if (this.over) this.tryRestart();
    });

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      if (this.over) {
        if (event.code === 'Space' || event.code === 'Enter') this.tryRestart();
        return;
      }
      const side = this.sideFor(event.code);
      if (side) {
        event.preventDefault();
        this.keysDown.add(side);
      }
      if (side || event.code === 'Space' || event.code === 'Enter') this.start();
      if (!this.drag) this.input_ = this.keyInput();
    });
    keyboard?.on('keyup', (event: KeyboardEvent) => {
      const side = this.sideFor(event.code);
      if (side) this.keysDown.delete(side);
      if (!this.drag) this.input_ = this.keyInput();
    });

    this.render(0);
  }

  override update(time: number, delta: number) {
    this.drawStars(time);
    if (!this.started || this.over) return;
    this.elapsed += Math.min(delta, MAX_FRAME_MS);
    while (this.elapsed >= STEP_MS && !this.over) {
      this.elapsed -= STEP_MS;
      for (const event of tick(this.state, this.input_, this.random)) this.handle(event);
    }
    this.render(time);
  }

  private sideFor(code: string): 'left' | 'right' | null {
    if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
    if (code === 'ArrowRight' || code === 'KeyD') return 'right';
    return null;
  }

  private keyInput(): RaidInput {
    const axis = (this.keysDown.has('right') ? 1 : 0) - (this.keysDown.has('left') ? 1 : 0);
    return { targetX: null, axis };
  }

  private start() {
    if (this.started) return;
    this.started = true;
    this.hint.setVisible(false);
  }

  private tryRestart() {
    if (this.time.now - this.overAt >= RETRY_DELAY_MS) this.scene.restart();
  }

  private handle(event: RaidEvent) {
    switch (event.type) {
      case 'kill':
        this.burst(event.x, event.y, PALETTE[event.kind].a);
        this.services.sfx.blip(event.kind === 'gunner' ? 330 : 520, 60);
        break;
      case 'enemy-hit':
        this.burst(event.x, event.y, 0xffffff, 3);
        break;
      case 'ship-hit':
        this.cameras.main.shake(200, 0.01);
        this.services.sfx.blip(140, 160);
        break;
      case 'died':
        this.endRun();
        break;
      case 'wave':
      case 'spawn':
        break;
    }
  }

  private burst(x: number, y: number, color: number, count = 8) {
    for (let i = 0; i < count; i++) {
      // Cosmetic only: spread evenly rather than randomly, so no gameplay randomness is used.
      const angle = (i / count) * Math.PI * 2;
      const bit = this.add.rectangle(x, y, 4, 4, color);
      this.tweens.add({
        targets: bit,
        x: x + Math.cos(angle) * 22,
        y: y + Math.sin(angle) * 22,
        alpha: 0,
        duration: 320,
        onComplete: () => bit.destroy(),
      });
    }
  }

  private drawStars(time: number) {
    // Two parallax layers from a fixed pattern (cosmetic, so no gameplay randomness).
    const g = this.stars;
    g.clear();
    for (let i = 0; i < STAR_COUNT; i++) {
      const near = i % 3 === 0;
      const speed = near ? 0.06 : 0.025;
      const x = (i * 97) % WIDTH;
      const y = (((i * 211) % HEIGHT) + time * speed) % HEIGHT;
      g.fillStyle(near ? 0xa3a9c2 : 0x444a68);
      g.fillRect(x, y, near ? 2 : 1, near ? 2 : 1);
    }
  }

  private render(time: number) {
    const s = this.state;
    this.ship.setPosition(s.ship.x, SHIP_Y);
    // Blink while invulnerable.
    this.ship.setVisible(s.invulnerableMs === 0 || Math.floor(time / 100) % 2 === 0);

    const alive = new Set<number>();
    for (const enemy of s.enemies) {
      alive.add(enemy.id);
      let sprite = this.enemySprites.get(enemy.id);
      if (!sprite) {
        sprite = this.add.image(enemy.cx, enemy.y, `raid-${enemy.kind}`);
        this.enemySprites.set(enemy.id, sprite);
      }
      sprite.setPosition(enemy.cx, enemy.y);
    }
    for (const [id, sprite] of this.enemySprites) {
      if (!alive.has(id)) {
        sprite.destroy();
        this.enemySprites.delete(id);
      }
    }

    const g = this.shotsGfx;
    g.clear();
    g.fillStyle(INK.accent);
    for (const shot of s.shots) g.fillRect(shot.x - 2, shot.y - 5, 4, 10);
    g.fillStyle(0xff7aa8);
    for (const shot of s.enemyShots) g.fillRect(shot.x - 3, shot.y - 3, 6, 6);

    this.scoreText.setText(String(s.score));
    const lives = this.livesGfx;
    lives.clear();
    lives.fillStyle(PALETTE.ship.a);
    for (let i = 0; i < s.lives; i++) lives.fillRect(WIDTH - 20 - i * 18, 18, 12, 12);
  }

  private endRun() {
    this.over = true;
    this.overAt = this.time.now;
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.state.score });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.render(this.time.now);
    this.ship.setVisible(false);
    this.burst(this.state.ship.x, SHIP_Y, PALETTE.ship.a, 14);
    showGameOver(this, WIDTH / 2, HEIGHT / 2, { score: this.state.score, isBest });
  }
}
