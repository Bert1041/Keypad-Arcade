import Phaser from 'phaser';
import type { GameServices } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { RetryGate } from '@/games/shared/retry';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import { LEVELS } from '../levels';
import { TILE, type Level } from '../logic/level';
import { scriptInputs, type ScriptStep } from '../logic/replay';
import {
  NO_INPUT,
  RADIUS,
  STEP_MS,
  createRebound,
  nextLevel,
  platformAt,
  tick,
  type ReboundEvent,
  type ReboundInput,
  type ReboundState,
  type Size,
} from '../logic/rebound';

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 600;
/** The level is shown above; the control pad lives in the strip below. */
const VIEW_HEIGHT = 480;
const PAD_HEIGHT = WORLD_HEIGHT - VIEW_HEIGHT;

const RETRY_DELAY_MS = 600;
const MAX_FRAME_MS = 250;
const LEVEL_CLEAR_PAUSE_MS = 1300;

const COLOR = {
  sky: 0x11131c,
  stone: 0x2c3046,
  stoneTop: 0x5a6188,
  spikes: 0xcfd4e8,
  grate: 0x7a82a8,
  water: 0x2f7bd6,
  ring: 0xffd23f,
  gem: 0xff7aa8,
  life: 0x5ee08a,
  checkpoint: 0x5ee0f0,
  exitClosed: 0x444a68,
  exitOpen: 0xffd23f,
  pad: { s: 0xff9f43, n: 0xa3a9c2, g: 0x5ee08a },
  ball: 0xff5a5f,
  ballShine: 0xffc2c4,
  platform: 0x8a6cff,
  button: 0x1f2232,
  buttonDown: 0x444a68,
};

type Button = 'left' | 'right' | 'jump';

// e2e hooks (window.__REBOUND_SCRIPT__ / __REBOUND_DEBUG__) are typed in src/types/e2e-globals.d.ts.
const E2E = import.meta.env.VITE_E2E === '1';

export class ReboundScene extends Phaser.Scene {
  private state!: ReboundState;
  private elapsed = 0;
  private started = false;
  private over = false;
  private retry = new RetryGate(RETRY_DELAY_MS);
  private clearUntil = 0;
  private world!: Phaser.GameObjects.Layer;
  private ui!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private levelGfx!: Phaser.GameObjects.Graphics;
  private exitGfx!: Phaser.GameObjects.Graphics;
  private platformGfx!: Phaser.GameObjects.Graphics;
  private items = new Map<string, Phaser.GameObjects.GameObject>();
  private ball!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private menu: Phaser.GameObjects.GameObject[] = [];
  private buttons = new Map<Button, Phaser.GameObjects.Graphics>();
  private held = new Set<Button>();
  private pointerButtons = new Map<number, Button>();
  private keysHeld = new Set<Button>();
  private script: Iterator<ReboundInput> | null = null;
  private scripts: ScriptStep[][] | null = null;
  /** Survive restarts (the constructor runs once). */
  private best: number;
  private reached: number;

  constructor(private readonly services: GameServices) {
    super('rebound');
    this.best = services.bestScore;
    this.reached = Math.min(Math.max(1, services.progress.reachedLevel), LEVELS.length);
  }

  create() {
    this.services.beginRun(); // Rebound has no randomness: hand-made levels, same for everyone.
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.clearUntil = 0;
    this.items.clear();
    this.held.clear();
    this.pointerButtons.clear();
    this.keysHeld.clear();
    this.menu = [];
    this.script = null;

    for (const size of ['small', 'normal', 'big'] as Size[]) this.makeBallTexture(size);

    this.world = this.add.layer();
    this.ui = this.add.layer();
    const main = this.cameras.main;
    main.setViewport(0, 0, WORLD_WIDTH, VIEW_HEIGHT).setBackgroundColor(COLOR.sky);
    this.uiCam = this.cameras.add(0, VIEW_HEIGHT, WORLD_WIDTH, PAD_HEIGHT);
    this.uiCam.setBackgroundColor(INK.bg);
    main.ignore(this.ui);
    this.uiCam.ignore(this.world);

    this.levelGfx = this.add.graphics();
    this.exitGfx = this.add.graphics();
    this.platformGfx = this.add.graphics();
    this.ball = this.add.image(0, 0, 'rebound-ball-normal');
    this.world.add([this.levelGfx, this.exitGfx, this.platformGfx, this.ball]);

    this.hud = this.add
      .text(10, 8, '', {
        fontFamily: PIXEL_FONT,
        fontSize: '10px',
        backgroundColor: `${INK.bgCss}b3`, // readable over walls in tall levels
        padding: { x: 6, y: 5 },
        color: INK.text,
        lineSpacing: 6,
      })
      .setScrollFactor(0)
      .setDepth(50);
    this.banner = this.add
      .text(WORLD_WIDTH / 2, VIEW_HEIGHT / 2, '', {
        fontFamily: PIXEL_FONT,
        fontSize: '16px',
        color: INK.text,
        align: 'center',
        lineSpacing: 8,
        backgroundColor: `${INK.bgCss}cc`,
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(60)
      .setVisible(false);
    this.world.add([this.hud, this.banner]);

    this.drawPad();
    this.bindInput();

    if (E2E) {
      window.__REBOUND_DEBUG__ = () => ({
        started: this.started,
        level: this.state.levelIndex + 1,
        score: this.state.score,
        x: this.state.ball.x,
        y: this.state.ball.y,
        over: this.over,
      });
    }
    this.scripts = E2E ? (window.__REBOUND_SCRIPT__ ?? null) : null;
    if (this.scripts) {
      this.begin(0);
    } else {
      this.loadLevel(createRebound(LEVELS, 0));
      this.showMenu();
    }
  }

  override update(_time: number, delta: number) {
    if (!this.started || this.over) return;
    if (this.clearUntil > 0) {
      if (this.time.now >= this.clearUntil) this.advanceLevel();
      return;
    }
    this.elapsed += Math.min(delta, MAX_FRAME_MS);
    while (this.elapsed >= STEP_MS && !this.over && this.clearUntil === 0) {
      this.elapsed -= STEP_MS;
      for (const event of tick(this.state, this.currentInput())) this.handle(event);
    }
    this.render();
  }

  // ---- Flow ----

  private showMenu() {
    const options =
      this.reached > 1
        ? [
            { label: `Continue: level ${this.reached}`, level: this.reached - 1 },
            { label: 'Start from level 1', level: 0 },
          ]
        : [{ label: 'Tap to start', level: 0 }];
    const title = this.add
      .text(WORLD_WIDTH / 2, 150, 'REBOUND', {
        fontFamily: PIXEL_FONT,
        fontSize: '22px',
        color: INK.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(70);
    const hint = this.add
      .text(WORLD_WIDTH / 2, 190, 'Collect every ring to open the exit', {
        fontFamily: BODY_FONT,
        fontSize: '14px',
        color: INK.muted,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(70);
    this.menu = [title, hint];
    options.forEach((option, i) => {
      const button = this.add
        .text(WORLD_WIDTH / 2, 260 + i * 56, option.label, {
          fontFamily: BODY_FONT,
          fontSize: '17px',
          fontStyle: 'bold',
          color: i === 0 ? '#1b1600' : INK.text,
          backgroundColor: i === 0 ? '#ffd23f' : '#1f2232',
          padding: { x: 18, y: 12 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(70)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.begin(option.level));
      this.menu.push(button);
    });
    this.world.add(this.menu);
  }

  private begin(levelIndex: number) {
    if (this.started) return;
    for (const item of this.menu) item.destroy();
    this.menu = [];
    this.loadLevel(createRebound(LEVELS, levelIndex));
    this.started = true;
    this.showBanner(`LEVEL ${levelIndex + 1}\n${LEVELS[levelIndex]?.name ?? ''}`, 1200);
  }

  private advanceLevel() {
    this.clearUntil = 0;
    this.loadLevel(nextLevel(this.state));
    this.showBanner(`LEVEL ${this.state.levelIndex + 1}\n${this.state.level.name}`, 1200);
  }

  private handle(event: ReboundEvent) {
    const sfx = this.services.sfx;
    switch (event.type) {
      case 'jump':
        sfx.blip(380, 40);
        break;
      case 'ring':
      case 'gem':
      case 'life':
        this.items.get(`${event.x},${event.y}`)?.destroy();
        sfx.blip(event.type === 'ring' ? 880 : event.type === 'gem' ? 1040 : 660, 70);
        break;
      case 'exit-open':
        this.showBanner('EXIT OPEN!', 900);
        sfx.blip(1200, 160);
        break;
      case 'checkpoint':
        sfx.blip(720, 90);
        break;
      case 'resize':
        sfx.blip(event.size === 'big' ? 220 : event.size === 'small' ? 990 : 500, 120);
        break;
      case 'died':
        this.cameras.main.shake(160, 0.008);
        sfx.blip(130, 220);
        break;
      case 'level-clear':
        sfx.blip(990, 200);
        // Unlock the next level now, so quitting during the banner still keeps it.
        if (event.level < LEVELS.length) {
          this.reached = Math.max(this.reached, event.level + 1);
          this.services.progress.reachLevel(event.level + 1);
        }
        if (!this.state.over) {
          this.clearUntil = this.time.now + LEVEL_CLEAR_PAUSE_MS;
          const time = event.timeBonus > 0 ? `\nTIME +${event.timeBonus}` : '';
          this.showBanner(`LEVEL CLEAR!\n+500${time}`, LEVEL_CLEAR_PAUSE_MS);
        }
        break;
      case 'all-clear':
        this.endRun('ALL CLEAR!');
        break;
      case 'game-over':
        this.endRun();
        break;
      case 'land':
        break;
    }
  }

  private endRun(headline?: string) {
    this.over = true;
    this.retry.end(this.time.now);
    this.render();
    this.services.onRunComplete({ score: this.state.score });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    const panel = showGameOver(this, WORLD_WIDTH / 2, VIEW_HEIGHT / 2, {
      score: this.state.score,
      isBest,
    });
    if (headline) panel.setText(panel.text.replace('GAME OVER', headline));
    this.world.add(panel);
  }

  private showBanner(text: string, ms: number) {
    this.banner.setText(text).setVisible(true);
    this.time.delayedCall(ms, () => {
      if (this.banner.text === text) this.banner.setVisible(false);
    });
  }

  // ---- Input ----

  private currentInput(): ReboundInput {
    if (this.script) {
      const next = this.script.next();
      return next.done ? NO_INPUT : next.value;
    }
    const left = this.held.has('left') || this.keysHeld.has('left');
    const right = this.held.has('right') || this.keysHeld.has('right');
    return {
      move: (right ? 1 : 0) - (left ? 1 : 0),
      jump: this.held.has('jump') || this.keysHeld.has('jump'),
    };
  }

  private bindInput() {
    // Hold a direction and press jump at the same time: needs more than one touch point.
    this.input.addPointer(2);
    this.retry = new RetryGate(RETRY_DELAY_MS);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) return this.retry.press(this.time.now);
      const button = this.buttonAt(p);
      if (button) {
        this.pointerButtons.set(p.id, button);
        this.syncHeld();
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.pointerButtons.delete(p.id)) this.syncHeld();
      if (this.over && this.retry.release()) this.scene.restart();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const keyFor = (code: string): Button | null => {
      if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
      if (code === 'ArrowRight' || code === 'KeyD') return 'right';
      if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') return 'jump';
      return null;
    };
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      if (this.over) {
        const restartKey = event.code === 'Space' || event.code === 'Enter';
        if (restartKey && this.retry.key(this.time.now, event.repeat)) this.scene.restart();
        return;
      }
      if (!this.started && (event.code === 'Space' || event.code === 'Enter')) {
        this.begin(this.reached > 1 ? this.reached - 1 : 0);
        return;
      }
      const button = keyFor(event.code);
      if (button) {
        event.preventDefault();
        this.keysHeld.add(button);
        this.drawButtons();
      }
    });
    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      const button = keyFor(event.code);
      if (button) {
        this.keysHeld.delete(button);
        this.drawButtons();
      }
    });
  }

  private buttonAt(p: Phaser.Input.Pointer): Button | null {
    // Screen-space y relative to the pad camera.
    const y = p.y - VIEW_HEIGHT;
    if (y < 0 || y > PAD_HEIGHT) return null;
    if (p.x < 90) return 'left';
    if (p.x < 180) return 'right';
    if (p.x > 230) return 'jump';
    return null;
  }

  private syncHeld() {
    this.held = new Set(this.pointerButtons.values());
    this.drawButtons();
  }

  private drawPad() {
    const layout: [Button, number, string][] = [
      ['left', 45, '◀'],
      ['right', 135, '▶'],
      ['jump', 295, 'JUMP'],
    ];
    for (const [button, x, label] of layout) {
      const g = this.add.graphics();
      this.buttons.set(button, g);
      g.setData('x', x);
      const text = this.add
        .text(x, PAD_HEIGHT / 2, label, {
          fontFamily: label === 'JUMP' ? PIXEL_FONT : BODY_FONT,
          fontSize: label === 'JUMP' ? '12px' : '24px',
          color: INK.text,
        })
        .setOrigin(0.5);
      this.ui.add([g, text]);
    }
    this.drawButtons();
  }

  private drawButtons() {
    for (const [button, g] of this.buttons) {
      const x = g.getData('x') as number;
      const down = this.held.has(button) || this.keysHeld.has(button);
      g.clear();
      g.fillStyle(down ? COLOR.buttonDown : COLOR.button);
      g.lineStyle(2, 0x444a68);
      const w = button === 'jump' ? 110 : 80;
      g.fillRoundedRect(x - w / 2, 20, w, 80, 16);
      g.strokeRoundedRect(x - w / 2, 20, w, 80, 16);
    }
  }

  // ---- Drawing ----

  private makeBallTexture(size: Size) {
    const key = `rebound-ball-${size}`;
    if (this.textures.exists(key)) return;
    const r = RADIUS[size];
    const g = this.make.graphics({}, false);
    g.fillStyle(COLOR.ball);
    g.fillCircle(r, r, r);
    // A stripe and a shine, so you can see it roll.
    g.fillStyle(0xd9363b);
    g.fillRect(r - 1, 1, 2, r * 2 - 2);
    g.fillStyle(COLOR.ballShine);
    g.fillCircle(r - r / 3, r - r / 3, Math.max(2, r / 4));
    g.generateTexture(key, r * 2, r * 2);
    g.destroy();
  }

  private loadLevel(state: ReboundState) {
    this.state = state;
    this.elapsed = 0;
    const steps = this.scripts?.[state.levelIndex];
    this.script = steps ? scriptInputs(steps) : null;
    for (const item of this.items.values()) item.destroy();
    this.items.clear();
    const level = state.level;
    this.drawTiles(level);
    // Phaser pins bounds smaller than the view to the top-left; grow them evenly instead, so a
    // short level sits in the middle of the view (and clear of the score at the top).
    const w = level.cols * TILE;
    const h = level.rows * TILE;
    const padX = Math.max(0, (WORLD_WIDTH - w) / 2);
    const padY = Math.max(0, (VIEW_HEIGHT - h) / 2);
    this.cameras.main.setBounds(-padX, -padY, w + padX * 2, h + padY * 2);
    this.cameras.main.startFollow(this.ball, true, 0.15, 0.15);
    this.render();
    this.cameras.main.centerOn(this.ball.x, this.ball.y);
  }

  private drawTiles(level: Level) {
    const g = this.levelGfx;
    g.clear();
    // Water first, from the mask, so pickups in a pool sit in water rather than in a dark hole.
    g.fillStyle(COLOR.water, 0.45);
    level.water.forEach((row, ty) =>
      row.forEach((wet, tx) => {
        if (wet) g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }),
    );
    level.grid.forEach((row, ty) =>
      row.forEach((tile, tx) => {
        const x = tx * TILE;
        const y = ty * TILE;
        switch (tile) {
          case '#': {
            g.fillStyle(COLOR.stone);
            g.fillRect(x, y, TILE, TILE);
            if (level.grid[ty - 1]?.[tx] !== '#') {
              g.fillStyle(COLOR.stoneTop);
              g.fillRect(x, y, TILE, 4);
            }
            break;
          }
          case '^':
            g.fillStyle(COLOR.spikes);
            for (let i = 0; i < 3; i++) {
              g.fillTriangle(
                x + i * 8,
                y + TILE,
                x + i * 8 + 4,
                y + TILE / 2,
                x + i * 8 + 8,
                y + TILE,
              );
            }
            break;
          case 'v':
            g.fillStyle(COLOR.spikes);
            for (let i = 0; i < 3; i++) {
              g.fillTriangle(x + i * 8, y, x + i * 8 + 4, y + TILE / 2, x + i * 8 + 8, y);
            }
            break;
          case 'H':
            // Bars a small ball slips between.
            g.fillStyle(COLOR.grate);
            g.fillRect(x, y, TILE, 3);
            g.fillRect(x, y + TILE - 3, TILE, 3);
            for (let i = 0; i < 4; i++) g.fillRect(x + 2 + i * 6, y, 2, TILE);
            break;
          case '~':
            break; // drawn from the water mask, below
          case 's':
          case 'n':
          case 'g':
            g.fillStyle(COLOR.pad[tile]);
            g.fillRect(x + 2, y + TILE - 6, TILE - 4, 6);
            break;
          case 'C':
            g.fillStyle(0xa3a9c2);
            g.fillRect(x + 6, y + 2, 2, TILE - 2);
            g.fillStyle(COLOR.checkpoint);
            g.fillTriangle(x + 8, y + 2, x + 20, y + 7, x + 8, y + 12);
            break;
          case 'o': {
            const ring = this.add.graphics();
            ring.lineStyle(3, COLOR.ring).strokeEllipse(x + TILE / 2, y + TILE / 2, 12, 20);
            this.addItem(tx, ty, ring);
            break;
          }
          case '*': {
            const gem = this.add.graphics();
            gem.fillStyle(COLOR.gem).fillTriangle(x + 12, y + 4, x + 20, y + 12, x + 12, y + 20);
            gem.fillTriangle(x + 12, y + 4, x + 4, y + 12, x + 12, y + 20);
            this.addItem(tx, ty, gem);
            break;
          }
          case '+': {
            const life = this.add.graphics();
            life.fillStyle(COLOR.life).fillCircle(x + 12, y + 12, 8);
            life
              .fillStyle(INK.bg)
              .fillRect(x + 11, y + 7, 2, 10)
              .fillRect(x + 7, y + 11, 10, 2);
            this.addItem(tx, ty, life);
            break;
          }
          case 'E':
          case 'S':
          case '.':
            break;
        }
      }),
    );
    this.world.sendToBack(g);
  }

  private addItem(tx: number, ty: number, obj: Phaser.GameObjects.Graphics) {
    if (this.state.collected.has(`${tx},${ty}`)) {
      obj.destroy();
      return;
    }
    this.items.set(`${tx},${ty}`, obj);
    this.world.add(obj);
  }

  private render() {
    const s = this.state;
    const b = s.ball;
    this.ball.setTexture(`rebound-ball-${b.size}`).setPosition(b.x, b.y).setRotation(b.angle);

    // The exit: a door that lights up once every ring is collected.
    const e = this.exitGfx;
    e.clear();
    s.level.grid.forEach((row, ty) =>
      row.forEach((tile, tx) => {
        if (tile !== 'E') return;
        e.fillStyle(s.ringsLeft === 0 ? COLOR.exitOpen : COLOR.exitClosed);
        e.fillRect(tx * TILE + 3, ty * TILE - TILE + 2, TILE - 6, TILE * 2 - 2);
        e.fillStyle(INK.bg);
        e.fillRect(tx * TILE + 7, ty * TILE - TILE + 6, TILE - 14, TILE * 2 - 6);
      }),
    );

    const p = this.platformGfx;
    p.clear();
    p.fillStyle(COLOR.platform);
    for (const def of s.level.platforms) {
      const box = platformAt(def, s.levelMs);
      p.fillRect(box.x, box.y, box.w, 10);
    }

    this.hud.setText(
      `${s.score}\nRINGS ${s.level.rings - s.ringsLeft}/${s.level.rings}  LIVES ${s.lives}  L${s.levelIndex + 1}`,
    );
  }
}
