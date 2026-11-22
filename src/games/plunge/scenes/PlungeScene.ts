import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { RetryGate } from '@/games/shared/retry';
import { makePixelTexture } from '@/games/shared/pixelArt';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  BALL_R,
  CEILING_Y,
  HEIGHT,
  NO_INPUT,
  PLATFORM_H,
  STEP_MS,
  WIDTH,
  createPlunge,
  tick,
  type PlungeEvent,
  type PlungeInput,
  type PlungeState,
} from '../logic/plunge';
import type { PlungeReplay } from '../verify';
import {
  BALL,
  BALL_PALETTE,
  LIFE,
  LIFE_PALETTE,
  SPIKE,
  SPIKE_PALETTE,
  STAR,
  STAR_PALETTE,
} from './sprites';

export const WORLD_WIDTH = WIDTH;
export const WORLD_HEIGHT = HEIGHT;

// e2e hooks (window.__PLUNGE_DEBUG__) are typed in src/types/e2e-globals.d.ts.
const E2E = import.meta.env.VITE_E2E === '1';

/** Ignore input briefly after game over so a held finger does not also restart. */
const RETRY_DELAY_MS = 600;
/** A long pause (tab hidden, slow frame) must not fast-forward the shaft. */
const MAX_FRAME_MS = 250;

export class PlungeScene extends Phaser.Scene {
  private state!: PlungeState;
  private random!: RandomFn;
  private input_: PlungeInput = NO_INPUT;
  /** Directions held, by pointer id or key, so letting go of one keeps the other. */
  private held = new Map<string, -1 | 1>();
  private elapsed = 0;
  private started = false;
  private over = false;
  private retry = new RetryGate(RETRY_DELAY_MS);
  /** Steps run so far, and each change of direction with its step: the replay. */
  private steps = 0;
  private replay: PlungeReplay = { v: 1, input: [] };
  private recorded = 0;
  /** Where the ball was at each death (e2e: compared with a replay in Node). */
  private deaths: { x: number; y: number }[] = [];
  private platformsGfx!: Phaser.GameObjects.Graphics;
  private pickups = new Map<number, Phaser.GameObjects.Image>();
  private ball!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private livesGfx!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  /** Survives restarts (the constructor runs once), so retries compare against this session too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('plunge');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createPlunge(this.random);
    this.input_ = NO_INPUT;
    this.held.clear();
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.steps = 0;
    this.replay = { v: 1, input: [] };
    this.recorded = 0;
    this.deaths = [];
    this.pickups.clear();

    makePixelTexture(this, 'plunge-ball', BALL, BALL_PALETTE, 2);
    makePixelTexture(this, 'plunge-star', STAR, STAR_PALETTE, 2);
    makePixelTexture(this, 'plunge-life', LIFE, LIFE_PALETTE, 2);
    makePixelTexture(this, 'plunge-spike', SPIKE, SPIKE_PALETTE, 2);

    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x10121b).setOrigin(0);
    this.platformsGfx = this.add.graphics();
    this.add
      .tileSprite(0, CEILING_Y - 8, WIDTH, 8, 'plunge-spike')
      .setOrigin(0)
      .setFlipY(true);
    this.add.rectangle(0, 0, WIDTH, CEILING_Y - 8, INK.bg).setOrigin(0);
    // 16 px drawn, shown at the ball's 18 px size.
    this.ball = this.add
      .image(0, 0, 'plunge-ball')
      .setDepth(5)
      .setDisplaySize(BALL_R * 2, BALL_R * 2);

    const hud = { fontFamily: PIXEL_FONT, fontSize: '16px', color: INK.text };
    this.scoreText = this.add.text(12, 12, '0', hud).setDepth(10);
    this.livesGfx = this.add.graphics().setDepth(10);
    this.hint = this.add
      .text(WIDTH / 2, HEIGHT - 70, 'Hold left or right to roll\nDrop down — keep off the spikes', {
        fontFamily: BODY_FONT,
        fontSize: '15px',
        color: INK.muted,
        align: 'center',
        lineSpacing: 6,
        backgroundColor: `${INK.bgCss}e6`,
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.retry = new RetryGate(RETRY_DELAY_MS);
    this.input.addPointer(1); // a thumb on each side
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) return this.retry.press(this.time.now);
      this.hold(`p${p.id}`, p.x < WIDTH / 2 ? -1 : 1);
    });
    const release = (p: Phaser.Input.Pointer) => {
      this.held.delete(`p${p.id}`);
      this.updateInput();
      if (this.over && this.retry.release()) this.scene.restart();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      if (this.over) {
        const restartKey = event.code === 'Space' || event.code === 'Enter';
        if (restartKey && this.retry.key(this.time.now, event.repeat)) this.scene.restart();
        return;
      }
      const side = this.sideFor(event.code);
      if (side) {
        event.preventDefault();
        this.hold(event.code, side);
      }
    });
    keyboard?.on('keyup', (event: KeyboardEvent) => {
      if (this.sideFor(event.code)) {
        this.held.delete(event.code);
        this.updateInput();
      }
    });

    if (E2E) {
      window.__PLUNGE_DEBUG__ = () => ({
        started: this.started,
        over: this.over,
        lives: this.state.lives,
        score: this.state.score,
        ball: { x: this.state.ball.x, y: this.state.ball.y, on: this.state.ball.on },
        deaths: this.deaths,
      });
    }

    this.render();
  }

  override update(_time: number, delta: number) {
    if (this.started && !this.over) {
      this.elapsed += Math.min(delta, MAX_FRAME_MS);
      while (this.elapsed >= STEP_MS && !this.over) {
        this.elapsed -= STEP_MS;
        this.steps += 1;
        const axis = this.input_.axis;
        if (axis !== this.recorded) {
          this.replay.input.push([this.steps, axis]);
          this.recorded = axis;
        }
        for (const event of tick(this.state, this.input_, this.random)) this.handle(event);
      }
    }
    this.render();
  }

  private sideFor(code: string): -1 | 1 | null {
    if (code === 'ArrowLeft' || code === 'KeyA') return -1;
    if (code === 'ArrowRight' || code === 'KeyD') return 1;
    return null;
  }

  /** The first press starts the run; the newest held direction wins. */
  private hold(key: string, side: -1 | 1) {
    if (!this.started) {
      this.started = true;
      this.hint.setVisible(false);
    }
    this.held.delete(key);
    this.held.set(key, side);
    this.updateInput();
  }

  private updateInput() {
    const latest = [...this.held.values()].at(-1) ?? 0;
    this.input_ = { axis: latest };
  }

  private handle(event: PlungeEvent) {
    const sfx = this.services.sfx;
    switch (event.type) {
      case 'land':
        sfx.blip(300, 30);
        break;
      case 'star':
        sfx.blip(1040, 90);
        break;
      case 'life':
        sfx.blip(780, 160);
        break;
      case 'died':
        this.deaths.push({ x: this.state.ball.x, y: this.state.ball.y });
        sfx.blip(140, 200);
        this.cameras.main.shake(180, 0.008);
        break;
      case 'over':
        this.endRun();
        break;
      case 'respawn':
        break;
    }
  }

  private render() {
    const s = this.state;
    const g = this.platformsGfx;
    g.clear();
    const alive = new Set<number>();
    for (const p of s.platforms) {
      g.fillStyle(p.spiked ? 0x5a3340 : 0x2ec4b6);
      g.fillRect(p.x, p.y, p.w, PLATFORM_H);
      g.fillStyle(p.spiked ? 0x3a222a : 0x1a7a71);
      g.fillRect(p.x, p.y + PLATFORM_H - 3, p.w, 3);
      if (p.spiked) {
        g.fillStyle(0xd9a3b0);
        for (let x = p.x + 2; x + 8 <= p.x + p.w; x += 10) {
          g.fillTriangle(x, p.y, x + 4, p.y - 8, x + 8, p.y);
        }
      }
      if (p.pickup) {
        alive.add(p.id);
        let icon = this.pickups.get(p.id);
        if (!icon) {
          icon = this.add.image(0, 0, `plunge-${p.pickup}`).setDepth(4);
          this.pickups.set(p.id, icon);
        }
        icon.setPosition(p.x + p.w / 2, p.y - 9);
      }
    }
    for (const [id, icon] of this.pickups) {
      if (!alive.has(id)) {
        icon.destroy();
        this.pickups.delete(id);
      }
    }

    const respawning = s.respawnAtMs !== null;
    this.ball
      .setPosition(s.ball.x, s.ball.y)
      .setVisible(!respawning || Math.floor(s.timeMs / 100) % 2 === 0)
      .setRotation((s.ball.x / BALL_R) % (Math.PI * 2));

    this.scoreText.setText(String(s.score));
    const lives = this.livesGfx;
    lives.clear();
    lives.fillStyle(BALL_PALETTE.b);
    for (let i = 0; i < s.lives; i++) lives.fillCircle(WIDTH - 18 - i * 20, 21, 6);
  }

  private endRun() {
    this.over = true;
    this.retry.end(this.time.now);
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.state.score, replay: this.replay });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.render();
    this.ball.setVisible(false);
    showGameOver(this, WIDTH / 2, HEIGHT / 2, { score: this.state.score, isBest });
  }
}
