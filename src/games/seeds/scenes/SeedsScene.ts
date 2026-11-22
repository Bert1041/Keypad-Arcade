import Phaser from 'phaser';
import type { GameServices, RandomFn } from '@/games/types';
import { showGameOver } from '@/games/shared/gameOver';
import { isForShellControl } from '@/games/shared/input';
import { RetryGate } from '@/games/shared/retry';
import { BODY_FONT, INK, PIXEL_FONT } from '@/games/shared/style';
import {
  GAMES,
  PHONE_STORE,
  PITS,
  PLAYER_STORE,
  createSeeds,
  legalMoves,
  move,
  phoneChoice,
  type Result,
  type SeedsEvent,
  type SeedsState,
} from '../logic/seeds';
import type { SeedsReplay } from '../verify';

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 600;

// e2e hooks (window.__SEEDS_DEBUG__) are typed in src/types/e2e-globals.d.ts.
const E2E = import.meta.env.VITE_E2E === '1';

const RETRY_DELAY_MS = 600;
/** Each seed of a move lands this long after the last. */
const SEED_MS = 90;
/** The phone "thinks" this long before moving, so its move can be followed. */
const THINK_MS = 450;
/** A finished game's score stays up this long before the next game is laid out. */
const RESULT_MS = 1_800;

/**
 * The board stands upright, sown anticlockwise: your pits down the left (0 at the top), your
 * store at the bottom, the phone's pits up the right (7 at the bottom), its store at the top.
 * A pit faces the one beside it.
 */
const PIT_R = 25;
const ROW_Y = (row: number) => 150 + row * 58;
const YOU_X = 105;
const PHONE_X = 255;
const STORE = { w: 230, h: 46 } as const;
const PHONE_STORE_Y = 92;
const YOUR_STORE_Y = 508;

export function placeCentre(place: number): { x: number; y: number } {
  if (place === PLAYER_STORE) return { x: WORLD_WIDTH / 2, y: YOUR_STORE_Y };
  if (place === PHONE_STORE) return { x: WORLD_WIDTH / 2, y: PHONE_STORE_Y };
  if (place < PITS) return { x: YOU_X, y: ROW_Y(place) };
  return { x: PHONE_X, y: ROW_Y(12 - place) };
}

const RESULT_COLOUR: Record<Result, number> = { won: 0x5fd068, lost: 0xff5c6c, drawn: 0xa3a9c2 };

export class SeedsScene extends Phaser.Scene {
  private state!: SeedsState;
  private random!: RandomFn;
  /** What is drawn: trails the rules while a move is animated. */
  private shown: number[] = [];
  private shownScore = 0;
  private shownResults: Result[] = [];
  private lit = new Set<number>();
  private busy = false;
  private started = false;
  private over = false;
  private cursor = 0;
  private retry = new RetryGate(RETRY_DELAY_MS);
  private replay: SeedsReplay = { v: 1, moves: [] };
  private gfx!: Phaser.GameObjects.Graphics;
  private counts = new Map<number, Phaser.GameObjects.Text>();
  private scoreText!: Phaser.GameObjects.Text;
  private gameText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  /** The line under the score: set when something happens, not worked out each frame. */
  private message = { text: '', highlight: false };
  /** The side whose last move earned it another turn, if any. */
  private extraFor: 'player' | 'phone' | null = null;
  private best: number;

  constructor(private readonly services: GameServices) {
    super('seeds');
    this.best = services.bestScore;
  }

  create() {
    // create() runs again on restart, so all run state is reset here.
    this.random = this.services.beginRun();
    this.state = createSeeds(this.random);
    this.shown = [...this.state.board];
    this.shownScore = 0;
    this.shownResults = [];
    this.lit.clear();
    this.busy = false;
    this.started = false;
    this.over = false;
    this.cursor = 0;
    this.replay = { v: 1, moves: [] };
    this.counts.clear();
    this.extraFor = null;
    this.say('Tap one of your pits to sow its seeds');

    this.gfx = this.add.graphics();
    const hud = { fontFamily: PIXEL_FONT, fontSize: '16px', color: INK.text };
    this.scoreText = this.add.text(12, 16, '0', hud).setDepth(10);
    this.gameText = this.add
      .text(WORLD_WIDTH - 12, 18, '', { ...hud, fontSize: '10px', color: INK.muted })
      .setOrigin(1, 0)
      .setDepth(10);
    this.status = this.add
      .text(WORLD_WIDTH / 2, 38, '', { fontFamily: BODY_FONT, fontSize: '15px', color: INK.text })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.banner = this.add
      .text(WORLD_WIDTH / 2, 300, '', {
        fontFamily: PIXEL_FONT,
        fontSize: '14px',
        color: INK.text,
        align: 'center',
        lineSpacing: 10,
        backgroundColor: `${INK.bgCss}f0`,
        padding: { x: 18, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);
    const label = { fontFamily: PIXEL_FONT, fontSize: '8px', color: INK.muted };
    const labelX = WORLD_WIDTH / 2 - STORE.w / 2 + 14;
    this.add.text(labelX, PHONE_STORE_Y, 'PHONE', label).setOrigin(0, 0.5).setDepth(5);
    this.add.text(labelX, YOUR_STORE_Y, 'YOU', label).setOrigin(0, 0.5).setDepth(5);
    for (let place = 0; place < 14; place++) {
      const { x, y } = placeCentre(place);
      const store = place === PLAYER_STORE || place === PHONE_STORE;
      this.counts.set(
        place,
        this.add
          .text(x, y, '', { ...hud, fontSize: store ? '18px' : '14px' })
          .setOrigin(0.5)
          .setDepth(5),
      );
    }

    this.retry = new RetryGate(RETRY_DELAY_MS);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) return this.retry.press(this.time.now);
      const pit = this.pitAt(p.x, p.y);
      if (pit !== null) this.choose(pit);
    });
    this.input.on('pointerup', () => {
      if (this.over && this.retry.release()) this.scene.restart();
    });

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isForShellControl(event)) return;
      if (event.code === 'Escape') return this.services.onExitRequested();
      const playKey = event.code === 'Space' || event.code === 'Enter';
      if (this.over) {
        if (playKey && this.retry.key(this.time.now, event.repeat)) this.scene.restart();
        return;
      }
      const digit = /^Digit([1-6])$/.exec(event.code)?.[1];
      if (digit) return this.choose(Number(digit) - 1);
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        event.preventDefault();
        this.cursor = (this.cursor + (event.code === 'ArrowUp' ? PITS - 1 : 1)) % PITS;
      } else if (playKey && !event.repeat) {
        event.preventDefault();
        this.choose(this.cursor);
      }
    });

    if (E2E) {
      window.__SEEDS_DEBUG__ = () => ({
        started: this.started,
        over: this.over,
        busy: this.busy,
        turn: this.state.turn,
        game: this.state.game,
        score: this.state.score,
        board: [...this.state.board],
        shown: [...this.shown],
        results: [...this.state.results],
        pits: Array.from({ length: PITS }, (_, i) => placeCentre(i)),
      });
    }

    this.render();
  }

  override update() {
    this.render();
  }

  private pitAt(x: number, y: number): number | null {
    for (let pit = 0; pit < PITS; pit++) {
      const c = placeCentre(pit);
      if ((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) <= (PIT_R + 8) * (PIT_R + 8)) return pit;
    }
    return null;
  }

  private yourMove(): boolean {
    return !this.over && !this.busy && this.state.turn === 'player';
  }

  private choose(pit: number) {
    if (!this.yourMove() || !legalMoves(this.state.board, 'player').includes(pit)) return;
    this.started = true;
    this.cursor = pit;
    this.replay.moves.push(pit);
    this.say('');
    this.animate(move(this.state, pit));
  }

  /** Plays out a move's events one by one, then hands the turn on. */
  private animate(events: SeedsEvent[]) {
    this.busy = true;
    const [event, ...rest] = events;
    if (!event) {
      this.busy = false;
      this.afterMove();
      return;
    }
    const next = () => this.animate(rest);
    if (event.type === 'sow') return this.animateSow(event, next);
    if (event.type === 'game') return this.showResult(event, next);
    this.endRun();
  }

  private animateSow(event: Extract<SeedsEvent, { type: 'sow' }>, done: () => void) {
    const sfx = this.services.sfx;
    this.shown[event.pit] = 0;
    this.lit = new Set([event.pit]);
    this.extraFor = null;
    event.path.forEach((place, i) => {
      this.time.delayedCall(SEED_MS * (i + 1), () => {
        this.shown[place] = (this.shown[place] ?? 0) + 1;
        this.lit = new Set([place]);
        sfx.blip(place === PLAYER_STORE || place === PHONE_STORE ? 660 : 420 + i * 12, 25);
      });
    });
    this.time.delayedCall(SEED_MS * (event.path.length + 1), () => {
      this.shown = [...event.board];
      this.lit.clear();
      if (event.captured > 0) {
        sfx.blip(event.side === 'player' ? 990 : 200, 160);
        this.say(
          event.side === 'player' ? `You took ${event.captured}!` : `Phone took ${event.captured}`,
          true,
        );
      } else if (event.extra) {
        sfx.blip(1180, 90);
        this.extraFor = event.side;
        this.say(event.side === 'player' ? 'Extra turn!' : 'Phone goes again', true);
      }
      this.time.delayedCall(event.captured > 0 || event.extra ? 450 : 150, done);
    });
  }

  private showResult(event: Extract<SeedsEvent, { type: 'game' }>, done: () => void) {
    this.shown = [...event.board];
    this.shownScore += event.points;
    this.shownResults = [...this.shownResults, event.result];
    const title = { won: 'YOU WIN', lost: 'PHONE WINS', drawn: 'DRAW' }[event.result];
    this.banner
      .setText(`GAME ${event.game}\n${title}\n${event.you} – ${event.phone}\n+${event.points}`)
      .setVisible(true);
    this.services.sfx.blip(
      event.result === 'won' ? 1320 : event.result === 'lost' ? 140 : 520,
      260,
    );
    this.time.delayedCall(RESULT_MS, () => {
      this.banner.setVisible(false);
      if (!this.state.over) this.shown = [...this.state.board];
      done();
    });
  }

  private afterMove() {
    if (this.over || this.state.over) return;
    if (this.state.turn === 'phone') {
      this.busy = true;
      this.say(this.extraFor === 'phone' ? 'Phone goes again…' : 'Phone is thinking…');
      this.time.delayedCall(THINK_MS, () => {
        this.say('');
        this.animate(move(this.state, phoneChoice(this.state, this.random)));
      });
    } else {
      this.say(
        this.extraFor === 'player' ? 'Extra turn — go again' : 'Your turn',
        this.extraFor === 'player',
      );
    }
  }

  private say(text: string, highlight = false) {
    this.message = { text, highlight };
  }

  private render() {
    const g = this.gfx;
    g.clear();
    // The board.
    g.fillStyle(0x3a2a1e);
    g.fillRoundedRect(28, 60, WORLD_WIDTH - 56, 482, 26);
    g.fillStyle(0x4a3626);
    g.fillRoundedRect(34, 66, WORLD_WIDTH - 68, 470, 22);

    const yourTurn = this.yourMove();
    const legal = new Set(yourTurn ? legalMoves(this.state.board, 'player') : []);
    for (let place = 0; place < 14; place++) {
      const { x, y } = placeCentre(place);
      const store = place === PLAYER_STORE || place === PHONE_STORE;
      g.fillStyle(0x2a1d14);
      if (store) g.fillRoundedRect(x - STORE.w / 2, y - STORE.h / 2, STORE.w, STORE.h, STORE.h / 2);
      else g.fillCircle(x, y, PIT_R);
      if (this.lit.has(place)) {
        g.lineStyle(3, INK.accent, 1);
        if (store)
          g.strokeRoundedRect(x - STORE.w / 2, y - STORE.h / 2, STORE.w, STORE.h, STORE.h / 2);
        else g.strokeCircle(x, y, PIT_R);
      } else if (legal.has(place)) {
        g.lineStyle(2, INK.accent, place === this.cursor ? 1 : 0.45);
        g.strokeCircle(x, y, PIT_R + 3);
      }
      const seeds = this.shown[place] ?? 0;
      this.drawSeeds(g, x, y, seeds, store);
      this.counts.get(place)?.setText(String(seeds));
    }

    // The ladder: one box a game, coloured by its result.
    for (let i = 0; i < GAMES; i++) {
      const x = WORLD_WIDTH / 2 - (GAMES * 34) / 2 + i * 34 + 4;
      const result = this.shownResults[i];
      g.fillStyle(result ? RESULT_COLOUR[result] : 0x23263a);
      g.fillRoundedRect(x, 560, 26, 16, 4);
      if (!result && i === this.state.game - 1 && !this.over) {
        g.lineStyle(2, INK.accent, 1);
        g.strokeRoundedRect(x, 560, 26, 16, 4);
      }
    }

    this.scoreText.setText(String(this.shownScore));
    this.gameText.setText(`GAME ${this.state.game}/${GAMES}`);
    this.status
      .setText(this.over ? '' : this.message.text)
      .setColor(this.message.highlight ? '#ffd23f' : INK.text);
  }

  /** Up to 12 seeds as dots round the pit (the count is written in the middle). */
  private drawSeeds(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    seeds: number,
    store: boolean,
  ) {
    if (store) return;
    g.fillStyle(0xe8d8b0, 0.85);
    const shown = Math.min(seeds, 12);
    for (let i = 0; i < shown; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      g.fillCircle(x + Math.cos(a) * 17, y + Math.sin(a) * 17, 3);
    }
  }

  private endRun() {
    this.over = true;
    this.busy = false;
    this.retry.end(this.time.now);
    this.services.onRunComplete({ score: this.state.score, replay: this.replay });
    const isBest = this.state.score > this.best;
    this.best = Math.max(this.best, this.state.score);
    this.render();
    showGameOver(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, { score: this.state.score, isBest });
  }
}
