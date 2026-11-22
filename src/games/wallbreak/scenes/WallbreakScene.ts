import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { RetryGate } from '@/games/shared/retry';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  BALL_R,
  HEIGHT,
  NO_INPUT,
  PADDLE_H,
  PADDLE_Y,
  STEP_MS,
  WIDTH,
  brickRect,
  createWallbreak,
  tick,
  type PowerKind,
  type WallbreakEvent,
  type WallbreakInput,
  type WallbreakState,
} from '../logic/wallbreak';
import type { WallbreakReplay } from '../verify';

export const WORLD_WIDTH = WIDTH;
export const WORLD_HEIGHT = HEIGHT;

// e2e hooks (window.__WALLBREAK_DEBUG__) are typed in src/types/e2e-globals.d.ts.
const E2E = import.meta.env.VITE_E2E === '1';

/** Ignore input briefly after game over so the losing drag does not also restart. */
const RETRY_DELAY_MS = 600;
/** A long pause (tab hidden, slow frame) must not fast-forward the ball. */
const MAX_FRAME_MS = 250;

/** Brick colours by row, top to bottom; a strong brick is drawn darker until its first hit. */
const ROW_COLOURS = [
  0xff5c6c, 0xff9f43, 0xffd23f, 0x5fd068, 0x2ec4b6, 0x4fb3ff, 0x8f7aff, 0xc58bff,
];
const POWER_STYLE: Record<PowerKind, { colour: number; label: string }> = {
  wide: { colour: 0x4fb3ff, label: 'W' },
  multi: { colour: 0xffd23f, label: 'M' },
  slow: { colour: 0x5fd068, label: 'S' },
  life: { colour: 0xff5c6c, label: '+' },
};

export class WallbreakScene extends Phaser.Scene {
  private state!: WallbreakState;
  private random!: RandomFn;
  private input_: WallbreakInput = NO_INPUT;
  private servePressed = false;
  private keysDown = new Set<-1 | 1>();
  private elapsed = 0;
  private started = false;
  private over = false;
  private retry = new RetryGate(RETRY_DELAY_MS);
  /** Steps run so far, and each change of input with its step: the replay. */
  private steps = 0;
  private replay: WallbreakReplay = { v: 1, input: [] };
  private recorded: WallbreakInput = NO_INPUT;
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  /** Survives restarts (the constructor runs once), so retries compare against this session too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('wallbreak');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createWallbreak(this.random);
    this.input_ = NO_INPUT;
    this.servePressed = false;
    this.keysDown.clear();
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.steps = 0;
    this.replay = { v: 1, input: [] };
    this.recorded = NO_INPUT;
    this.labels.clear();

    this.gfx = this.add.graphics();
    const hud = { fontFamily: PIXEL_FONT, fontSize: '16px', color: INK.text };
    this.scoreText = this.add.text(12, 14, '0', hud).setDepth(10);
    this.levelText = this.add
      .text(WIDTH / 2, 16, '', { ...hud, fontSize: '11px', color: INK.muted })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.hint = this.add
      .text(WIDTH / 2, 430, 'Drag to move · tap to serve', {
        fontFamily: BODY_FONT,
        fontSize: '15px',
        color: INK.muted,
        backgroundColor: `${INK.bgCss}e6`,
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.retry = new RetryGate(RETRY_DELAY_MS);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) return this.retry.press(this.time.now);
      this.begin();
      this.servePressed = true;
      this.input_ = { targetX: Math.round(p.x), axis: 0, serve: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.over || (!p.isDown && !this.started)) return;
      // On touch the paddle follows the finger while it is down; a mouse steers by hovering.
      if (p.isDown || !p.wasTouch) {
        this.input_ = { ...this.input_, targetX: Math.round(p.x) };
      }
    });
    this.input.on('pointerup', () => {
      if (this.over && this.retry.release()) this.scene.restart();
    });

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      const restartKey = event.code === 'Space' || event.code === 'Enter';
      if (this.over) {
        if (restartKey && this.retry.key(this.time.now, event.repeat)) this.scene.restart();
        return;
      }
      const side = this.sideFor(event.code);
      if (side) {
        event.preventDefault();
        this.keysDown.add(side);
        this.begin();
        this.input_ = { targetX: null, axis: this.axis(), serve: false };
      }
      if (restartKey) {
        event.preventDefault();
        this.begin();
        this.servePressed = true;
      }
    });
    keyboard?.on('keyup', (event: KeyboardEvent) => {
      const side = this.sideFor(event.code);
      if (!side) return;
      this.keysDown.delete(side);
      if (this.input_.targetX === null) this.input_ = { ...this.input_, axis: this.axis() };
    });

    if (E2E) {
      window.__WALLBREAK_DEBUG__ = () => ({
        started: this.started,
        over: this.over,
        serving: this.state.serving,
        level: this.state.level,
        lives: this.state.lives,
        score: this.state.score,
        bricks: this.state.bricks.length,
        paddleX: this.state.paddle.x,
        balls: this.state.balls.map((b) => ({ x: b.x, y: b.y })),
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
        // A serve press lasts one step.
        const input = { ...this.input_, serve: this.servePressed };
        this.servePressed = false;
        const r = this.recorded;
        if (input.targetX !== r.targetX || input.axis !== r.axis || input.serve !== r.serve) {
          this.replay.input.push([this.steps, input.targetX, input.axis, input.serve ? 1 : 0]);
          this.recorded = input;
        }
        for (const event of tick(this.state, input, this.random)) this.handle(event);
      }
    }
    this.render();
  }

  private begin() {
    if (this.started) return;
    this.started = true;
    this.hint.setVisible(false);
  }

  private sideFor(code: string): -1 | 1 | null {
    if (code === 'ArrowLeft' || code === 'KeyA') return -1;
    if (code === 'ArrowRight' || code === 'KeyD') return 1;
    return null;
  }

  private axis(): number {
    return (this.keysDown.has(1) ? 1 : 0) - (this.keysDown.has(-1) ? 1 : 0);
  }

  private handle(event: WallbreakEvent) {
    const sfx = this.services.sfx;
    switch (event.type) {
      case 'paddle':
        sfx.blip(440, 30);
        break;
      case 'brick':
        sfx.blip(event.broken ? 660 : 520, 35);
        break;
      case 'catch':
        sfx.blip(1040, 120);
        break;
      case 'lost':
        sfx.blip(140, 220);
        this.cameras.main.shake(160, 0.006);
        break;
      case 'clear':
        sfx.blip(1320, 200);
        break;
      case 'over':
        this.endRun();
        break;
      case 'serve':
      case 'wall':
      case 'level':
        break;
    }
  }

  private render() {
    const s = this.state;
    const g = this.gfx;
    g.clear();

    for (const brick of s.bricks) {
      const r = brickRect(brick);
      const colour = ROW_COLOURS[brick.row % ROW_COLOURS.length] ?? 0xffffff;
      g.fillStyle(colour, brick.hits > 1 ? 0.55 : 1);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle(0xffffff, 0.25);
      g.fillRect(r.x, r.y, r.w, 3);
      if (brick.hits > 1) {
        g.lineStyle(2, colour, 1);
        g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    }

    // Power-ups falling: a capsule with a letter.
    const alive = new Set<number>();
    for (const drop of s.drops) {
      alive.add(drop.id);
      const style = POWER_STYLE[drop.kind];
      g.fillStyle(style.colour);
      g.fillRoundedRect(drop.x - 12, drop.y - 7, 24, 14, 6);
      let label = this.labels.get(drop.id);
      if (!label) {
        label = this.add
          .text(0, 0, style.label, { fontFamily: PIXEL_FONT, fontSize: '9px', color: '#0d0e14' })
          .setOrigin(0.5)
          .setDepth(5);
        this.labels.set(drop.id, label);
      }
      label.setPosition(drop.x, drop.y + 1);
    }
    for (const [id, label] of this.labels) {
      if (!alive.has(id)) {
        label.destroy();
        this.labels.delete(id);
      }
    }

    g.fillStyle(s.paddle.w > 64 ? 0x4fb3ff : INK.accent);
    g.fillRoundedRect(s.paddle.x - s.paddle.w / 2, PADDLE_Y, s.paddle.w, PADDLE_H, 4);

    g.fillStyle(0xeef0f8);
    for (const ball of s.balls) g.fillCircle(ball.x, ball.y, BALL_R);

    this.scoreText.setText(String(s.score));
    this.levelText.setText(`LEVEL ${s.level}`);
    g.fillStyle(INK.accent);
    for (let i = 0; i < s.lives; i++) g.fillRoundedRect(WIDTH - 30 - i * 22, 20, 18, 6, 3);
  }

  private endRun() {
    this.over = true;
    this.retry.end(this.time.now);
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.state.score, replay: this.replay });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.render();
    showGameOver(this, WIDTH / 2, HEIGHT / 2, { score: this.state.score, isBest });
  }
}
