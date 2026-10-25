import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  createCoil,
  queueTurn,
  step,
  stepMs,
  type Cell,
  type CoilState,
  type Dir,
} from '../logic/coil';
import { swipeDirection } from '../logic/swipe';

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 600;

const CELL = 24;
const COLS = WORLD_WIDTH / CELL; // 15
const ROWS = 22;
const BOARD_Y = 48;
/** Ignore input briefly after game over so the losing swipe does not also restart. */
const RETRY_DELAY_MS = 500;
/** A long pause (tab hidden, slow frame) must not fast-forward the snake into a wall. */
const MAX_FRAME_MS = 250;

const COLOR = {
  board: 0x161823,
  boardAlt: 0x1a1d29,
  snake: 0x5ee08a,
  head: 0x9cf5b8,
  eye: 0x0d0e14,
  food: 0xffd23f,
  bonus: 0xff7aa8,
};

const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

export class CoilScene extends Phaser.Scene {
  private state!: CoilState;
  private random!: RandomFn;
  private elapsed = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private swipeStart: { x: number; y: number } | null = null;
  private gfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  /** Survives restarts (the constructor runs once), so retries compare against this session too. */
  private best: number;

  constructor(private readonly services: GameServices) {
    super('coil');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createCoil(this.random, COLS, ROWS);
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.swipeStart = null;

    this.gfx = this.add.graphics();
    this.scoreText = this.add.text(12, 16, '0', {
      fontFamily: PIXEL_FONT,
      fontSize: '16px',
      color: INK.text,
    });
    // The best score lives in the shell's top bar; a copy here would go stale mid-session.
    this.hint = this.add
      .text(WORLD_WIDTH / 2, BOARD_Y + CELL * 16, 'Swipe or press an\narrow key to start', {
        fontFamily: BODY_FONT,
        fontSize: '16px',
        color: INK.muted,
        align: 'center',
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipeStart = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const start = this.swipeStart;
      this.swipeStart = null;
      if (this.over) return this.tryRestart();
      if (!start) return;
      // Pointer coordinates are in world units; convert back to screen pixels so the swipe
      // threshold feels the same on every screen size.
      const scale = this.scale.displayScale;
      const dir = swipeDirection((p.x - start.x) / scale.x, (p.y - start.y) / scale.y);
      if (dir) this.turn(dir);
    });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      if (this.over && (event.code === 'Space' || event.code === 'Enter')) return this.tryRestart();
      const dir = KEY_TO_DIR[event.code];
      if (dir) {
        event.preventDefault(); // arrows must not scroll the page
        this.turn(dir);
      }
    });

    this.draw();
  }

  override update(_time: number, delta: number) {
    if (!this.started || this.over) return;
    this.elapsed += Math.min(delta, MAX_FRAME_MS);
    let ms = stepMs(this.state.eaten);
    while (this.elapsed >= ms && !this.over) {
      this.elapsed -= ms;
      this.advance();
      ms = stepMs(this.state.eaten);
    }
  }

  private turn(dir: Dir) {
    if (this.over) return;
    this.state = queueTurn(this.state, dir);
    if (!this.started) {
      // Any first move starts the run; one into the body (left) just starts it heading right.
      this.started = true;
      this.hint.setVisible(false);
    }
  }

  private advance() {
    const { state, events } = step(this.state, this.random);
    this.state = state;
    for (const event of events) {
      switch (event) {
        case 'ate':
          this.services.sfx.blip(660, 50);
          break;
        case 'ate-bonus':
          this.services.sfx.blip(990, 120);
          break;
        case 'bonus-appeared':
          this.services.sfx.blip(520, 40);
          break;
        case 'bonus-expired':
          break;
        case 'died':
          this.endRun();
          break;
      }
    }
    this.scoreText.setText(String(this.state.score));
    this.draw();
  }

  private tryRestart() {
    if (this.time.now - this.overAt >= RETRY_DELAY_MS) this.scene.restart();
  }

  private cellRect(cell: Cell, inset: number) {
    return [
      cell.x * CELL + inset,
      BOARD_Y + cell.y * CELL + inset,
      CELL - inset * 2,
      CELL - inset * 2,
    ] as const;
  }

  private draw() {
    const g = this.gfx;
    g.clear();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        g.fillStyle((x + y) % 2 === 0 ? COLOR.board : COLOR.boardAlt);
        g.fillRect(x * CELL, BOARD_Y + y * CELL, CELL, CELL);
      }
    }

    g.fillStyle(COLOR.food);
    g.fillRect(...this.cellRect(this.state.food, 6));

    const bonus = this.state.bonus;
    // Blinks for its last few steps, as a warning.
    if (bonus && (bonus.stepsLeft > 8 || bonus.stepsLeft % 2 === 0)) {
      g.fillStyle(COLOR.bonus);
      const [x, y, w, h] = this.cellRect(bonus.cell, 3);
      g.fillRect(x + w / 3, y, w / 3, h);
      g.fillRect(x, y + h / 3, w, h / 3);
    }

    this.state.snake.forEach((cell, i) => {
      g.fillStyle(i === 0 ? COLOR.head : COLOR.snake);
      g.fillRect(...this.cellRect(cell, 1));
    });
    const head = this.state.snake[0];
    if (head) this.drawEyes(head, this.state.queue[0] ?? this.state.dir);
  }

  private drawEyes(head: Cell, dir: Dir) {
    const g = this.gfx;
    const [x, y] = this.cellRect(head, 1);
    const s = CELL - 2;
    const e = 4;
    const near = 5;
    const far = s - near - e;
    const spots: Record<Dir, [number, number][]> = {
      right: [
        [far, near],
        [far, far],
      ],
      left: [
        [near, near],
        [near, far],
      ],
      up: [
        [near, near],
        [far, near],
      ],
      down: [
        [near, far],
        [far, far],
      ],
    };
    g.fillStyle(COLOR.eye);
    for (const [dx, dy] of spots[dir]) g.fillRect(x + dx, y + dy, e, e);
  }

  private endRun() {
    this.over = true;
    this.overAt = this.time.now;
    this.services.sfx.blip(110, 300);
    this.services.onRunComplete({ score: this.state.score });

    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.cameras.main.shake(180, 0.006);
    showGameOver(this, WORLD_WIDTH / 2, BOARD_Y + (ROWS * CELL) / 2, {
      score: this.state.score,
      isBest,
    });
  }
}
