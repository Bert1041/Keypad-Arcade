import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { RetryGate } from '@/games/shared/retry';
import { makePixelTexture } from '@/games/shared/pixelArt';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  MAX_MS,
  STEP_MS,
  canTurn,
  createPairs,
  tick,
  type Face,
  type PairsEvent,
  type PairsState,
} from '../logic/pairs';
import type { PairsReplay } from '../verify';
import { BACK, FACES } from './faces';

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 600;

// e2e hooks (window.__PAIRS_DEBUG__) are typed in src/types/e2e-globals.d.ts.
const E2E = import.meta.env.VITE_E2E === '1';

/** Ignore input briefly after game over so the last tap does not also restart. */
const RETRY_DELAY_MS = 600;
/** A long pause (tab hidden, slow frame) must not fast-forward the clock. */
const MAX_FRAME_MS = 250;
/** The play area under the score bar. */
const AREA = { x: 10, y: 74, w: 340, h: 516 };
const GAP = 6;
const FLIP_MS = 90;

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Image;
  shown: Face;
}

export class PairsScene extends Phaser.Scene {
  private state!: PairsState;
  private random!: RandomFn;
  /** Taps waiting for the next step: two quick taps in one frame both count, one per step. */
  private taps: number[] = [];
  private elapsed = 0;
  private started = false;
  private over = false;
  private retry = new RetryGate(RETRY_DELAY_MS);
  /** Steps run so far, and each tap with the step it was handled on: the replay. */
  private steps = 0;
  private replay: PairsReplay = { v: 1, taps: [] };
  private views: CardView[] = [];
  private layout = { x: 0, y: 0, w: 0, h: 0 };
  private dealtBoard = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private boardText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private clockBar!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  /** Survives restarts (the constructor runs once), so retries compare against this session too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('pairs');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createPairs(this.random);
    this.taps = [];
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.steps = 0;
    this.replay = { v: 1, taps: [] };
    this.views = [];
    this.dealtBoard = 0;

    FACES.forEach((face, i) =>
      makePixelTexture(this, `pairs-face-${i}`, face.rows, face.palette, 1),
    );
    makePixelTexture(this, 'pairs-back', BACK.rows, BACK.palette, 1);

    const hud = { fontFamily: PIXEL_FONT, fontSize: '16px', color: INK.text };
    this.scoreText = this.add.text(12, 14, '0', hud).setDepth(10);
    this.boardText = this.add
      .text(WORLD_WIDTH / 2, 16, '', { ...hud, fontSize: '11px', color: INK.muted })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.clockText = this.add
      .text(WORLD_WIDTH - 12, 14, '', hud)
      .setOrigin(1, 0)
      .setDepth(10);
    this.clockBar = this.add.graphics().setDepth(10);
    this.hint = this.add
      .text(WORLD_WIDTH / 2, WORLD_HEIGHT - 40, 'Find the pairs — tap a card to start', {
        fontFamily: BODY_FONT,
        fontSize: '15px',
        color: INK.muted,
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.retry = new RetryGate(RETRY_DELAY_MS);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) return this.retry.press(this.time.now);
      // Between boards the old cards are still drawn: a tap there was aimed at nothing.
      if (this.state.nextBoardAtMs !== null) return;
      const card = this.cardAt(p.x, p.y);
      if (card === null) return;
      if (!this.started) {
        this.started = true;
        this.hint.setVisible(false);
      }
      this.taps.push(card);
    });
    this.input.on('pointerup', () => {
      if (this.over && this.retry.release()) this.scene.restart();
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      const restartKey = event.code === 'Space' || event.code === 'Enter';
      if (this.over && restartKey && this.retry.key(this.time.now, event.repeat)) {
        this.scene.restart();
      }
    });

    if (E2E) {
      window.__PAIRS_DEBUG__ = () => ({
        started: this.started,
        over: this.over,
        board: this.state.board,
        cols: this.state.cols,
        rows: this.state.rows,
        score: this.state.score,
        leftMs: this.state.leftMs,
        faces: this.state.cards.map((c) => c.face),
        symbols: this.state.cards.map((c) => c.symbol),
        // Where each card is drawn (world px), so a test can tap it.
        centres: this.views.map((v) => ({ x: v.bg.x, y: v.bg.y })),
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
        // A tap waits for the coming step to accept it (TAP_GAP_MS), rather than being lost.
        const tap = canTurn(this.state, this.state.timeMs + STEP_MS)
          ? (this.taps.shift() ?? null)
          : null;
        if (tap !== null) this.replay.taps.push([this.steps, tap]);
        for (const event of tick(this.state, { tap }, this.random)) this.handle(event);
      }
    }
    this.render();
  }

  /** The card under a point, by the board's grid, or null between cards and off the board. */
  private cardAt(x: number, y: number): number | null {
    const { cols, rows } = this.state;
    const { x: left, y: top, w, h } = this.layout;
    const col = Math.floor((x - left) / (w + GAP));
    const row = Math.floor((y - top) / (h + GAP));
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    const inX = x - left - col * (w + GAP) <= w;
    const inY = y - top - row * (h + GAP) <= h;
    return inX && inY ? row * cols + col : null;
  }

  private handle(event: PairsEvent) {
    const sfx = this.services.sfx;
    switch (event.type) {
      case 'flip':
        sfx.blip(520, 25);
        break;
      case 'match':
        sfx.blip(660 + Math.min(event.streak, 5) * 110, 80);
        break;
      case 'miss':
        sfx.blip(200, 90);
        break;
      case 'clear':
        // Taps queued for the cleared board must not land on the next one.
        this.taps = [];
        sfx.blip(1320, 180);
        this.pop(`BOARD CLEAR +${event.points}`);
        break;
      case 'over':
        this.endRun();
        break;
      case 'hide':
      case 'board':
        break;
    }
  }

  /** Lays out the board's cards when a new one is dealt. */
  private dealViews() {
    for (const view of this.views) {
      view.bg.destroy();
      view.face.destroy();
    }
    const { cols, rows } = this.state;
    const w = Math.floor((AREA.w - GAP * (cols - 1)) / cols);
    const h = Math.min(Math.floor(w * 1.25), Math.floor((AREA.h - GAP * (rows - 1)) / rows));
    const x = AREA.x + (AREA.w - (w * cols + GAP * (cols - 1))) / 2;
    const y = AREA.y + (AREA.h - (h * rows + GAP * (rows - 1))) / 2;
    this.layout = { x, y, w, h };
    const scale = Math.max(3, Math.floor((Math.min(w, h) * 0.62) / 8));
    this.views = this.state.cards.map((_, i) => {
      const cx = x + (i % cols) * (w + GAP) + w / 2;
      const cy = y + Math.floor(i / cols) * (h + GAP) + h / 2;
      const bg = this.add.rectangle(cx, cy, w, h, 0x1f2232).setStrokeStyle(2, 0x444a68);
      const face = this.add.image(cx, cy, 'pairs-back').setScale(scale);
      return { bg, face, shown: 'down' as Face };
    });
    this.dealtBoard = this.state.board;
  }

  /** Turns a card over on screen: squeeze, swap what it shows, open again. */
  private show(i: number, face: Face) {
    const view = this.views[i];
    const card = this.state.cards[i];
    if (!view || !card || view.shown === face) return;
    view.shown = face;
    const texture = face === 'down' ? 'pairs-back' : `pairs-face-${card.symbol}`;
    const targets = [view.bg, view.face];
    this.tweens.killTweensOf(targets);
    this.tweens.add({
      targets,
      scaleX: 0,
      duration: FLIP_MS,
      onComplete: () => {
        view.face.setTexture(texture);
        view.bg.setFillStyle(face === 'down' ? 0x1f2232 : 0x2c3046);
        view.face.setAlpha(face === 'matched' ? 0.45 : 1);
        view.bg.setAlpha(face === 'matched' ? 0.45 : 1);
        this.tweens.add({ targets: view.bg, scaleX: 1, duration: FLIP_MS });
        this.tweens.add({ targets: view.face, scaleX: view.face.scaleY, duration: FLIP_MS });
      },
    });
  }

  private render() {
    const s = this.state;
    if (this.dealtBoard !== s.board) this.dealViews();
    s.cards.forEach((card, i) => this.show(i, card.face));

    this.scoreText.setText(String(s.score));
    this.boardText.setText(`BOARD ${s.board}`);
    const seconds = Math.ceil(s.leftMs / 1000);
    this.clockText.setText(String(seconds)).setColor(seconds <= 10 ? '#ff7a7a' : INK.text);
    const bar = this.clockBar;
    bar.clear();
    bar.fillStyle(0x2c3046);
    bar.fillRect(12, 46, WORLD_WIDTH - 24, 6);
    bar.fillStyle(seconds <= 10 ? 0xff7a7a : INK.accent);
    bar.fillRect(12, 46, ((WORLD_WIDTH - 24) * s.leftMs) / MAX_MS, 6);
  }

  private pop(text: string) {
    const label = this.add
      .text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, text, {
        fontFamily: PIXEL_FONT,
        fontSize: '14px',
        color: '#ffd23f',
        backgroundColor: `${INK.bgCss}cc`,
        padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({
      targets: label,
      y: label.y - 40,
      alpha: 0,
      delay: 300,
      duration: 600,
      onComplete: () => label.destroy(),
    });
  }

  private endRun() {
    this.over = true;
    this.retry.end(this.time.now);
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.state.score, replay: this.replay });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.render();
    showGameOver(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, { score: this.state.score, isBest });
  }
}
