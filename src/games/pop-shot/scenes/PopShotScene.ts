import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { RetryGate } from '@/games/shared/retry';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  CEILING_Y,
  HEIGHT,
  HURRY_MS,
  LOSE_ROW,
  NO_INPUT,
  R,
  SHOOTER_X,
  SHOOTER_Y,
  STEP_MS,
  WIDTH,
  cellCentre,
  colourFor,
  createPopShot,
  rowLength,
  shotPath,
  shotsPerRow,
  tick,
  type Bubble,
  type PopShotEvent,
  type PopShotInput,
  type PopShotState,
} from '../logic/popShot';
import type { PopShotReplay } from '../verify';

export const WORLD_WIDTH = WIDTH;
export const WORLD_HEIGHT = HEIGHT;

// e2e hooks (window.__POP_SHOT_DEBUG__) are typed in src/types/e2e-globals.d.ts.
const E2E = import.meta.env.VITE_E2E === '1';

/** Ignore input briefly after game over so the losing release does not also restart. */
const RETRY_DELAY_MS = 600;
/** A long pause (tab hidden, slow frame) must not fast-forward the shot. */
const MAX_FRAME_MS = 250;
/** Letting go this close to the shooter (or below it) cancels the shot. */
const CANCEL_Y = SHOOTER_Y - 24;
/** Keys sweep the aim along this line above the shooter, px/s. */
const KEY_AIM_Y = SHOOTER_Y - 240;
const KEY_AIM_SPEED = 320;
/** Guide dots drawn along the shot's path (one per step, ~18 px apart). */
const GUIDE_DOTS = 14;
/** The hurry countdown shows for the last few seconds. */
const HURRY_SHOWN_MS = 3_000;
const LOSE_LINE_Y = cellCentre({ pushes: 0 }, LOSE_ROW, 0).y - R;

const COLOURS = [0xff5c6c, 0xffd23f, 0x4fb3ff, 0x5fd068, 0xc58bff, 0xff9f43];

interface Effect {
  bubble: Bubble;
  kind: 'pop' | 'drop';
  ageMs: number;
  vx: number;
  vy: number;
}

export class PopShotScene extends Phaser.Scene {
  private state!: PopShotState;
  private random!: RandomFn;
  private input_: PopShotInput = NO_INPUT;
  private firePending = false;
  private keysDown = new Set<-1 | 1>();
  private keyAimX = SHOOTER_X;
  private elapsed = 0;
  private started = false;
  private over = false;
  private retry = new RetryGate(RETRY_DELAY_MS);
  private shots = 0;
  /** Steps run so far, and each change of input with its step: the replay. */
  private steps = 0;
  private replay: PopShotReplay = { v: 1, input: [] };
  private recorded: PopShotInput = NO_INPUT;
  private effects: Effect[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private hurryText!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  /** Survives restarts (the constructor runs once), so retries compare against this session too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('pop-shot');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createPopShot(this.random);
    this.input_ = NO_INPUT;
    this.firePending = false;
    this.keysDown.clear();
    this.keyAimX = SHOOTER_X;
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.shots = 0;
    this.steps = 0;
    this.replay = { v: 1, input: [] };
    this.recorded = NO_INPUT;
    this.effects = [];

    this.gfx = this.add.graphics();
    this.fx = this.add.graphics().setDepth(6);
    const hud = { fontFamily: PIXEL_FONT, fontSize: '16px', color: INK.text };
    this.scoreText = this.add.text(12, 16, '0', hud).setDepth(10);
    this.add
      .text(SHOOTER_X + 64, SHOOTER_Y + 30, 'NEXT', { ...hud, fontSize: '8px', color: INK.muted })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.hurryText = this.add
      .text(SHOOTER_X - 70, SHOOTER_Y, '', { ...hud, fontSize: '20px', color: '#ff5c6c' })
      .setOrigin(0.5)
      .setDepth(10);
    this.flash = this.add
      .text(WIDTH / 2, 300, '', { ...hud, fontSize: '18px', color: '#ffd23f' })
      .setOrigin(0.5)
      .setDepth(10)
      .setVisible(false);
    this.hint = this.add
      .text(WIDTH / 2, 420, 'Drag to aim · let go to shoot\nMatch 3 to pop them', {
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
    const aimAt = (p: Phaser.Input.Pointer) => {
      this.input_ = { aimX: Math.round(p.x), aimY: Math.round(p.y), fire: false };
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) return this.retry.press(this.time.now);
      this.begin();
      aimAt(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.over) return;
      // A finger aims while it is down; a mouse aims by hovering.
      if (p.isDown || !p.wasTouch) aimAt(p);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.over) {
        if (this.retry.release()) this.scene.restart();
        return;
      }
      if (!this.started) return;
      aimAt(p);
      if (p.y < CANCEL_Y) this.firePending = true;
    };
    this.input.on('pointerup', release);

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      const fireKey = event.code === 'Space' || event.code === 'Enter' || event.code === 'ArrowUp';
      if (this.over) {
        if (fireKey && this.retry.key(this.time.now, event.repeat)) this.scene.restart();
        return;
      }
      const side = this.sideFor(event.code);
      if (side) {
        event.preventDefault();
        if (this.keysDown.size === 0) this.keyAimX = this.aimOnKeyLine();
        this.keysDown.add(side);
        this.begin();
      }
      if (fireKey && !event.repeat) {
        event.preventDefault();
        this.begin();
        this.firePending = true;
      }
    });
    keyboard?.on('keyup', (event: KeyboardEvent) => {
      const side = this.sideFor(event.code);
      if (side) this.keysDown.delete(side);
    });

    if (E2E) {
      window.__POP_SHOT_DEBUG__ = () => ({
        started: this.started,
        over: this.over,
        score: this.state.score,
        shots: this.shots,
        pushes: this.state.pushes,
        flying: this.state.shot !== null,
        rows: this.state.grid.map((row, r) =>
          row
            .slice(0, rowLength(this.state, r))
            .map((c) => (c === null ? '.' : String(c)))
            .join(''),
        ),
      });
    }

    this.render();
  }

  override update(_time: number, delta: number) {
    const frame = Math.min(delta, MAX_FRAME_MS);
    const axis = (this.keysDown.has(1) ? 1 : 0) - (this.keysDown.has(-1) ? 1 : 0);
    if (axis !== 0 && !this.over) {
      this.keyAimX = Math.max(
        -400,
        Math.min(WIDTH + 400, this.keyAimX + (axis * KEY_AIM_SPEED * frame) / 1000),
      );
      this.input_ = { aimX: Math.round(this.keyAimX), aimY: KEY_AIM_Y, fire: false };
    }
    if (this.started && !this.over) {
      this.elapsed += frame;
      while (this.elapsed >= STEP_MS && !this.over) {
        this.elapsed -= STEP_MS;
        this.steps += 1;
        // A press fires the next bubble as soon as one is loaded, and only once.
        const fire = this.firePending && this.state.shot === null;
        if (fire) this.firePending = false;
        const input = { ...this.input_, fire };
        const r = this.recorded;
        if (input.aimX !== r.aimX || input.aimY !== r.aimY || input.fire !== r.fire) {
          this.replay.input.push([this.steps, input.aimX, input.aimY, input.fire ? 1 : 0]);
          this.recorded = input;
        }
        for (const event of tick(this.state, input, this.random)) this.handle(event);
      }
    }
    this.updateEffects(frame);
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

  /** Where the current aim crosses the keys' aim line, so keys carry on from the finger's aim. */
  private aimOnKeyLine(): number {
    const { aimX, aimY } = this.input_;
    if (aimY >= SHOOTER_Y) return SHOOTER_X;
    return SHOOTER_X + ((aimX - SHOOTER_X) * (SHOOTER_Y - KEY_AIM_Y)) / (SHOOTER_Y - aimY);
  }

  private handle(event: PopShotEvent) {
    const sfx = this.services.sfx;
    switch (event.type) {
      case 'fire':
        this.shots += 1;
        sfx.blip(event.auto ? 300 : 520, 40);
        break;
      case 'bounce':
        sfx.blip(380, 20);
        break;
      case 'stick':
        sfx.blip(240, 40);
        break;
      case 'pop':
        sfx.blip(880, 90);
        for (const bubble of event.bubbles) {
          this.effects.push({ bubble, kind: 'pop', ageMs: 0, vx: 0, vy: 0 });
        }
        break;
      case 'drop':
        sfx.blip(660, 160);
        event.bubbles.forEach((bubble, i) => {
          // A little sideways spread, varied by position — looks only, never part of the rules.
          const vx = ((i * 37) % 9) * 12 - 48;
          this.effects.push({ bubble, kind: 'drop', ageMs: 0, vx, vy: -120 });
        });
        this.showFlash(`+${event.points}`);
        break;
      case 'clear':
        sfx.blip(1320, 240);
        this.showFlash(`CLEAR +${event.points}`);
        break;
      case 'row':
        sfx.blip(160, 120);
        this.cameras.main.shake(140, 0.004);
        break;
      case 'over':
        this.endRun();
        break;
    }
  }

  private showFlash(text: string) {
    this.flash.setText(text).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.flash);
    this.tweens.add({ targets: this.flash, alpha: 0, delay: 500, duration: 400 });
  }

  private updateEffects(ms: number) {
    const dt = ms / 1000;
    for (const e of this.effects) {
      e.ageMs += ms;
      if (e.kind === 'drop') {
        e.vy += 1400 * dt;
        e.bubble = { ...e.bubble, x: e.bubble.x + e.vx * dt, y: e.bubble.y + e.vy * dt };
      }
    }
    this.effects = this.effects.filter((e) =>
      e.kind === 'pop' ? e.ageMs < 220 : e.bubble.y - R < HEIGHT,
    );
  }

  /** A bubble with a shine, and a mark per colour so colours are told apart without colour. */
  private drawBubble(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    colour: number,
    scale = 1,
    alpha = 1,
  ) {
    const r = (R - 1) * scale;
    g.fillStyle(COLOURS[colour] ?? 0xffffff, alpha);
    g.fillCircle(x, y, r);
    g.fillStyle(0xffffff, 0.35 * alpha);
    g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.25);
    g.fillStyle(INK.bg, 0.4 * alpha);
    const m = r * 0.32;
    switch (colour) {
      case 0:
        g.fillCircle(x, y, m * 0.8);
        break;
      case 1:
        g.fillRect(x - m, y - m * 0.35, m * 2, m * 0.7);
        break;
      case 2:
        g.fillTriangle(x, y - m, x - m, y + m * 0.8, x + m, y + m * 0.8);
        break;
      case 3:
        g.fillRect(x - m * 0.8, y - m * 0.8, m * 1.6, m * 1.6);
        break;
      case 4:
        g.fillTriangle(x, y - m, x - m, y, x + m, y);
        g.fillTriangle(x, y + m, x - m, y, x + m, y);
        break;
      default:
        g.fillRect(x - m, y - m * 0.3, m * 2, m * 0.6);
        g.fillRect(x - m * 0.3, y - m, m * 0.6, m * 2);
    }
  }

  private render() {
    const s = this.state;
    const g = this.gfx;
    g.clear();

    // The ceiling, and the line the pile must not reach.
    g.fillStyle(0x23263a);
    g.fillRect(0, CEILING_Y - 6, WIDTH, 6);
    g.fillStyle(0xff5c6c, 0.35);
    for (let x = 0; x < WIDTH; x += 16) g.fillRect(x, LOSE_LINE_Y, 9, 2);

    s.grid.forEach((row, r) => {
      row.forEach((colour, col) => {
        if (colour === null) return;
        const c = cellCentre(s, r, col);
        this.drawBubble(g, c.x, c.y, colour);
      });
    });

    // The aim guide: the path the shot will really take (shotPath runs the rules).
    if (!this.over && !s.shot) {
      const aim = { x: this.input_.aimX, y: this.input_.aimY };
      const cancelled = this.input.activePointer.isDown && this.input_.aimY >= CANCEL_Y;
      const path = shotPath(s, aim);
      for (let i = 1; i < Math.min(path.length - 1, GUIDE_DOTS + 1); i++) {
        const p = path[i];
        if (!p) continue;
        g.fillStyle(0xeef0f8, (cancelled ? 0.15 : 0.55) * (1 - i / (GUIDE_DOTS + 2)));
        g.fillCircle(p.x, p.y, 2.5);
      }
    }

    if (s.shot) this.drawBubble(g, s.shot.x, s.shot.y, s.shot.colour);

    // The shooter, the loaded bubble and the next one.
    g.fillStyle(0x23263a);
    g.fillCircle(SHOOTER_X, SHOOTER_Y, R + 8);
    if (!this.over) {
      this.drawBubble(g, SHOOTER_X, SHOOTER_Y, colourFor(s, s.current), 1, s.shot ? 0.4 : 1);
      this.drawBubble(g, SHOOTER_X + 64, SHOOTER_Y + 14, colourFor(s, s.next), 0.7);
    }

    // Shots left before the next row pushes in: filled dots are used up.
    const per = shotsPerRow(s.pushes);
    for (let i = 0; i < per; i++) {
      g.fillStyle(i < s.shotsSinceRow ? 0xff5c6c : 0x3a3e55);
      g.fillCircle(WIDTH - 14 - i * 12, 24, 4);
    }

    const fx = this.fx;
    fx.clear();
    for (const e of this.effects) {
      if (e.kind === 'pop') {
        const t = e.ageMs / 220;
        this.drawBubble(fx, e.bubble.x, e.bubble.y, e.bubble.colour, 1 + t * 0.5, 1 - t);
      } else {
        this.drawBubble(fx, e.bubble.x, e.bubble.y, e.bubble.colour);
      }
    }

    this.scoreText.setText(String(s.score));
    const left = HURRY_MS - (s.timeMs - s.readyAtMs);
    const hurrying = this.started && !this.over && !s.shot && left <= HURRY_SHOWN_MS;
    this.hurryText.setVisible(hurrying).setText(String(Math.max(1, Math.ceil(left / 1000))));
  }

  private endRun() {
    this.over = true;
    this.firePending = false;
    this.retry.end(this.time.now);
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.state.score, replay: this.replay });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.render();
    showGameOver(this, WIDTH / 2, HEIGHT / 2, { score: this.state.score, isBest });
  }
}
