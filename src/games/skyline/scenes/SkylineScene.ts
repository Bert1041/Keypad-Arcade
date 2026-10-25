import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { RetryGate } from '@/games/shared/retry';
import { makePixelTexture } from '@/games/shared/pixelArt';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  DROP_PX,
  FLOOR_H,
  FLOOR_W,
  NEXT_FLOOR_MS,
  STEP_MS,
  createSkyline,
  hookAt,
  swayAt,
  tick,
  topX,
  type Falling,
  type SkylineEvent,
  type SkylineState,
} from '../logic/skyline';
import { FLOOR, FLOOR_PALETTES } from './sprites';

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 600;

// e2e hooks (window.__SKYLINE_DEBUG__) are typed in src/types/e2e-globals.d.ts.
const E2E = import.meta.env.VITE_E2E === '1';

/** Ignore input briefly after game over so the losing tap does not also restart. */
const RETRY_DELAY_MS = 600;
/** A long pause (tab hidden, slow frame) must not fast-forward the simulation. */
const MAX_FRAME_MS = 250;
/** Where the foundation's top sits in the world; floors stack upwards from here. */
const GROUND_Y = 540;
/** The camera keeps the top of the tower this far down the screen. */
const TOP_ON_SCREEN = 400;
/** The crane's pivot, on screen. */
const PIVOT_ON_SCREEN = 70;
const STAR_COUNT = 50;
/** The next floor is lowered in from this far above where it will swing. */
const LOWER_PX = 90;

export class SkylineScene extends Phaser.Scene {
  private state!: SkylineState;
  private random!: RandomFn;
  private dropQueued = false;
  private elapsed = 0;
  private started = false;
  private over = false;
  private retry = new RetryGate(RETRY_DELAY_MS);
  /** The falling floor as of the last step, so a miss can tumble from where it was. */
  private lastFall: Falling | null = null;
  /**
   * The tower top as the camera has caught up with it. The crane hangs from this, so the floor
   * on it rises with the camera instead of jumping a floor's height when one lands.
   */
  private shownTop = GROUND_Y;
  private floorImages: Phaser.GameObjects.Image[] = [];
  private hooked!: Phaser.GameObjects.Image;
  private falling!: Phaser.GameObjects.Image;
  private crane!: Phaser.GameObjects.Graphics;
  private ground!: Phaser.GameObjects.Graphics;
  private stars!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private floorsText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private inHandGfx!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  /** Survives restarts (the constructor runs once), so retries compare against this session too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('skyline');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createSkyline(this.random);
    this.dropQueued = false;
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.lastFall = null;
    this.floorImages = [];
    this.shownTop = GROUND_Y;

    FLOOR_PALETTES.forEach((palette, i) => {
      makePixelTexture(this, `skyline-floor-${i}`, FLOOR, palette);
    });

    this.stars = this.add.graphics().setScrollFactor(0);
    this.drawStars();
    this.ground = this.add.graphics();
    this.drawGround();
    this.crane = this.add.graphics().setDepth(2);
    this.hooked = this.add.image(0, 0, 'skyline-floor-0').setDepth(3);
    this.falling = this.add.image(0, 0, 'skyline-floor-0').setDepth(3).setVisible(false);

    const hud = { fontFamily: PIXEL_FONT, fontSize: '16px', color: INK.text };
    this.scoreText = this.add.text(12, 14, '0', hud).setScrollFactor(0).setDepth(10);
    this.floorsText = this.add
      .text(WORLD_WIDTH / 2, 14, '', { ...hud, fontSize: '12px', color: INK.muted })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);
    this.windText = this.add
      .text(WORLD_WIDTH / 2, 36, '', { ...hud, fontSize: '10px', color: '#8fb8ff' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);
    this.inHandGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.hint = this.add
      .text(WORLD_WIDTH / 2, 230, 'Tap to drop the floor\nLand it on the tower\n\nTap to start', {
        fontFamily: BODY_FONT,
        fontSize: '16px',
        color: INK.muted,
        align: 'center',
        lineSpacing: 6,
        // Backed, so the rope swinging behind it does not cross the words.
        backgroundColor: `${INK.bgCss}e6`,
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10);

    this.retry = new RetryGate(RETRY_DELAY_MS);
    this.input.on('pointerdown', () => {
      if (this.over) return this.retry.press(this.time.now);
      this.press();
    });
    this.input.on('pointerup', () => {
      if (this.over && this.retry.release()) this.scene.restart();
    });
    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      const dropKey = ['Space', 'Enter', 'ArrowDown', 'KeyS'].includes(event.code);
      if (!dropKey) return;
      event.preventDefault();
      if (this.over) {
        if (this.retry.key(this.time.now, event.repeat)) this.scene.restart();
        return;
      }
      if (!event.repeat) this.press();
    });

    if (E2E) {
      window.__SKYLINE_DEBUG__ = () => ({
        started: this.started,
        over: this.over,
        phase: this.state.phase,
        floors: this.state.floors.length,
        drops: this.state.drops,
        score: this.state.score,
        inHand: this.state.inHand,
        // Where things are drawn (world px): what a player is looking at when they tap.
        hookX: this.hooked.x,
        /** The top floor's resting centre (logic px), to measure how far off a floor landed. */
        topRest: topX(this.state),
        topX: this.worldX(topX(this.state) + swayAt(this.state, this.state.timeMs)),
      });
    }

    this.cameras.main.setScroll(0, this.targetScrollY());
    this.render();
  }

  override update(_time: number, delta: number) {
    if (this.started && !this.over) {
      this.elapsed += Math.min(delta, MAX_FRAME_MS);
      while (this.elapsed >= STEP_MS && !this.over) {
        this.elapsed -= STEP_MS;
        this.lastFall = this.state.falling && { ...this.state.falling };
        const drop = this.dropQueued;
        this.dropQueued = false;
        for (const event of tick(this.state, { drop }, this.random)) this.handle(event);
      }
    }
    this.followTower(delta);
    this.render();
  }

  /** The first press starts the run; every later one drops the floor on the crane. */
  private press() {
    if (!this.started) {
      this.started = true;
      this.hint.setVisible(false);
      return;
    }
    if (this.state.phase === 'swinging') this.dropQueued = true;
  }

  private handle(event: SkylineEvent) {
    const sfx = this.services.sfx;
    switch (event.type) {
      case 'drop':
        sfx.blip(660, 30);
        break;
      case 'perfect':
        sfx.blip(880 + Math.min(event.streak, 5) * 110, 90);
        this.pop(event.streak > 1 ? `PERFECT ×${Math.min(event.streak, 5)}` : 'PERFECT', '#ffd23f');
        this.cameras.main.shake(60, 0.002);
        break;
      case 'land':
        sfx.blip(180, 70);
        this.cameras.main.shake(90, 0.004);
        break;
      case 'miss':
        sfx.blip(120, 220);
        this.tumble();
        break;
      case 'bonus':
        sfx.blip(1320, 160);
        this.pop(`+${event.points}`, '#7ff0e3', 26);
        break;
      case 'over':
        this.endRun();
        break;
      case 'spawn':
        break;
    }
  }

  // ── Placement: logic x (0 = foundation centre) and floor index → world position ──

  private worldX(x: number) {
    return WORLD_WIDTH / 2 + x;
  }

  /** Centre y of the floor at `index` (0 = the first above the foundation). */
  private floorY(index: number) {
    return GROUND_Y - FLOOR_H * index - FLOOR_H / 2;
  }

  private topSurfaceY() {
    return GROUND_Y - FLOOR_H * this.state.floors.length;
  }

  private targetScrollY() {
    return Math.min(0, this.topSurfaceY() - TOP_ON_SCREEN);
  }

  /** Eases the camera up the tower and across to its top, so the crane stays centred. */
  private followTower(delta: number) {
    const cam = this.cameras.main;
    const ease = 1 - Math.exp(-delta / 180);
    cam.scrollY += (this.targetScrollY() - cam.scrollY) * ease;
    this.shownTop += (this.topSurfaceY() - this.shownTop) * ease;
    cam.scrollX += (topX(this.state) - cam.scrollX) * ease;
  }

  private render() {
    const s = this.state;
    const sway = swayAt(s, s.timeMs);
    const count = s.floors.length;

    // Floors: the sway grows with height, so the tower bends rather than slides.
    while (this.floorImages.length < count) {
      const i = this.floorImages.length;
      this.floorImages.push(
        this.add.image(0, this.floorY(i), `skyline-floor-${s.floors[i]?.color ?? 0}`),
      );
    }
    s.floors.forEach((floor, i) => {
      this.floorImages[i]?.setX(this.worldX(floor.x + (sway * (i + 1)) / count));
    });

    // A falling floor is placed against the real top, so it lands exactly on it.
    const fallY = this.topSurfaceY() - DROP_PX - FLOOR_H / 2;
    // The floor on the crane: lowered in while the last one settles, then swinging.
    const lowering =
      s.phase === 'waiting' ? Math.max(0, (s.waitUntilMs - s.timeMs) / NEXT_FLOOR_MS) : 0;
    // While it waits it follows the camera; once it swings it hangs from the real top, so a drop
    // starts exactly where it was drawn.
    const hangTop = s.phase === 'waiting' ? this.shownTop : this.topSurfaceY();
    const hangY = hangTop - DROP_PX - FLOOR_H / 2 - lowering * LOWER_PX;
    const pivot = { x: this.worldX(topX(s)), y: this.cameras.main.scrollY + PIVOT_ON_SCREEN };

    const crane = this.crane;
    crane.clear();
    crane.fillStyle(0x444a68);
    crane.fillRect(pivot.x - 60, pivot.y - 6, 120, 6);
    crane.fillStyle(INK.accent);
    crane.fillRect(pivot.x - 4, pivot.y - 4, 8, 8);

    const onCrane = s.phase === 'swinging' || s.phase === 'waiting';
    this.hooked.setVisible(onCrane);
    if (onCrane) {
      const x = this.worldX(hookAt(s).x);
      crane.lineStyle(2, 0xa3a9c2);
      crane.lineBetween(pivot.x, pivot.y, x, hangY - FLOOR_H / 2);
      this.hooked
        .setTexture(`skyline-floor-${s.hook.color}`)
        .setPosition(x, hangY)
        .setAlpha(1 - lowering * 0.7);
    }
    this.falling.setVisible(s.falling !== null);
    if (s.falling) {
      this.falling
        .setTexture(`skyline-floor-${s.falling.color}`)
        .setPosition(this.worldX(s.falling.x), fallY + s.falling.y);
    }

    this.scoreText.setText(String(s.score));
    this.floorsText.setText(count === 1 ? '1 FLOOR' : `${count} FLOORS`);
    this.windText.setText(s.wind > 0 ? 'WIND  >>>' : s.wind < 0 ? '<<<  WIND' : '');
    const hand = this.inHandGfx;
    hand.clear();
    hand.fillStyle(FLOOR_PALETTES[1].w);
    for (let i = 0; i < s.inHand; i++) hand.fillRect(WORLD_WIDTH - 26 - i * 20, 18, 14, 10);
  }

  /** A missed floor tips off the side it overhangs and falls out of sight. */
  private tumble() {
    const f = this.lastFall;
    if (!f) return;
    const side = f.x >= topX(this.state) ? 1 : -1;
    const y = this.topSurfaceY() - FLOOR_H / 2;
    const image = this.add.image(this.worldX(f.x), y, `skyline-floor-${f.color}`).setDepth(4);
    this.tweens.add({
      targets: image,
      x: image.x + side * 90,
      y: y + 420,
      angle: side * 160,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeIn',
      onComplete: () => image.destroy(),
    });
  }

  private pop(text: string, color: string, rise = 40) {
    const label = this.add
      .text(WORLD_WIDTH / 2, TOP_ON_SCREEN - 70, text, {
        fontFamily: PIXEL_FONT,
        fontSize: '14px',
        color,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
    this.tweens.add({
      targets: label,
      y: label.y - rise,
      alpha: 0,
      duration: 800,
      onComplete: () => label.destroy(),
    });
  }

  private drawStars() {
    // A fixed pattern (cosmetic, so no gameplay randomness).
    const g = this.stars;
    for (let i = 0; i < STAR_COUNT; i++) {
      g.fillStyle(i % 4 === 0 ? 0xa3a9c2 : 0x444a68);
      g.fillRect((i * 97) % WORLD_WIDTH, (i * 211) % WORLD_HEIGHT, i % 4 === 0 ? 2 : 1, 1);
    }
  }

  /** The street and a low skyline behind the foundation. */
  private drawGround() {
    const g = this.ground;
    const far = 2000;
    g.fillStyle(0x1b1d2b);
    for (let i = 0; i < 14; i++) {
      const w = 30 + ((i * 37) % 40);
      const h = 40 + ((i * 53) % 90);
      g.fillRect(-far / 4 + i * 70, GROUND_Y - h, w, h);
    }
    g.fillStyle(0x2a2d40);
    g.fillRect(-far, GROUND_Y, far * 2 + WORLD_WIDTH, 200);
    g.fillStyle(0x444a68);
    g.fillRect(this.worldX(-FLOOR_W / 2 - 8), GROUND_Y - 4, FLOOR_W + 16, 4);
  }

  private endRun() {
    this.over = true;
    this.retry.end(this.time.now);
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.state.score });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.render();
    showGameOver(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, { score: this.state.score, isBest });
  }
}
