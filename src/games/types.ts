import type { RandomFn } from '@/core/random/seededRandom';

// Re-exported so a game imports everything it needs from this one module.
export type { RandomFn };

/**
 * The contract between the React shell and a game module. Everything that crosses
 * the React/Phaser boundary is typed here — keep it small.
 */

/** Stable IDs. Saved scores are keyed by these, so never rename one after it ships. */
export type GameId = 'skyline' | 'coil' | 'star-raid' | 'rebound' | 'prototype';

export type Orientation = 'portrait' | 'landscape' | 'any';

export interface RunResult {
  score: number;
}

export interface SoundEffects {
  /** Short synthesized tone. A no-op when sound is disabled in settings. */
  blip(frequencyHz: number, durationMs?: number): void;
}

export interface LevelProgress {
  /** Furthest level unlocked at launch (1 = the first). Track later unlocks yourself. */
  reachedLevel: number;
  /** Record that `level` is now unlocked. Never goes backwards. */
  reachLevel(level: number): void;
}

/** What the shell hands to a game. Games must not reach into React or storage directly. */
export interface GameServices {
  sfx: SoundEffects;
  /**
   * Call once at the start of every run and use the returned function for ALL gameplay
   * randomness — never Math.random. The shell chooses the seed (a friend's, on a challenge
   * link), which is what makes "same run, beat my score" links replay the same game.
   */
  beginRun(): RandomFn;
  /** Personal best at launch, so the game can show "new best". */
  bestScore: number;
  /** For games with levels: where the player has got to, saved by the shell. */
  progress: LevelProgress;
  /** Called once per finished run. The shell persists it. */
  onRunComplete(result: RunResult): void;
  /** In-game request to leave (e.g. Escape key). */
  onExitRequested(): void;
}

export interface GameInstance {
  /** Must stop the loop, remove the canvas and release every listener. */
  destroy(): void;
  /** Freeze the game — simulation, timers and input — until resume(). */
  pause(): void;
  resume(): void;
}

export type CreateGame = (parent: HTMLElement, services: GameServices) => GameInstance;

export interface GameDefinition {
  id: GameId;
  title: string;
  description: string;
  thumbnail: string;
  orientation: Orientation;
  /**
   * Has a daily challenge: one seeded run per day, the same for everyone. Only for games whose
   * runs come from beginRun()'s seed — a game without randomness would be the same every day.
   */
  daily?: boolean;
  /** Lazy so the library never downloads Phaser; the service worker still precaches it. */
  load(): Promise<CreateGame>;
}
