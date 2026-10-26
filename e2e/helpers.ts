import { type Page } from '@playwright/test';
import { expect, press } from './fixtures';

/** Games in an e2e build, in library order (the prototype is test-only). */
export const GAME_IDS = ['skyline', 'coil', 'star-raid', 'rebound', 'prototype'] as const;
import { DB_NAME } from '../src/appInfo';

export const liveGames = (page: Page) =>
  page.evaluate(() => window.__GAME_HOST_E2E__?.liveGames() ?? -1);
const playableGames = (page: Page) =>
  page.evaluate(() => window.__GAME_HOST_E2E__?.playableGames() ?? -1);

/** Waits until Phaser has actually booted and drawn, not just until a canvas exists. */
export async function expectOneRunningGame(page: Page) {
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(() => liveGames(page)).toBe(1);
  await expect.poll(() => playableGames(page)).toBe(1);
}

export async function expectNoGames(page: Page) {
  await expect(page.locator('canvas')).toHaveCount(0);
  // Phaser destroys on its next frame; poll rather than assert once.
  await expect.poll(() => liveGames(page)).toBe(0);
}

/** Reads a value straight from the app's real IndexedDB, bypassing app code. */
export function readDb(page: Page, store: 'gameStats' | 'settings', key: string) {
  return page.evaluate(
    ([store, key, dbName]) =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction(store).objectStore(store).get(key);
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    [store, key, DB_NAME] as const,
  );
}

/**
 * Plays the page's first run to game over and returns its score, as reported to the shell.
 * Real-time play can't be scripted to an exact score (each tap takes ~100 ms while the block
 * moves), so tap until the run ends. The first block overlaps the base for over a second,
 * so the first tap always scores: a finished run scores at least 1.
 */
export async function playOneRun(page: Page): Promise<number> {
  const canvas = page.locator('canvas');
  const bar = page.getByTestId('run-bar');
  await expectOneRunningGame(page);
  for (let taps = 0; taps < 60; taps++) {
    await press(canvas);
    // Game over ignores taps for 400 ms, so checking between taps cannot start a second run.
    await page.waitForTimeout(60);
    const score = await bar.getAttribute('data-last-score');
    if (score !== null) return Number(score);
  }
  throw new Error('run did not end after 60 taps');
}

interface Captured {
  text: string;
  files: { type: string; size: number }[];
  /** Whether the share call started inside the tap that asked for it. */
  duringTap: boolean;
}

/** The OS share sheet can't open headless, so record what the app hands to it. */
export async function captureShares(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shares: unknown[]; __inTap: boolean };
    w.__shares = [];
    w.__inTap = false;
    // Browsers only open a share sheet from inside a tap (Safari strictly), so note whether
    // each share started while the tap's click was still being handled: the first listener
    // to see the click sets the flag, the last one (on window, after the app's) clears it.
    document.addEventListener('click', () => (w.__inTap = true), true);
    window.addEventListener('click', () => (w.__inTap = false));
    Navigator.prototype.canShare = () => true;
    Navigator.prototype.share = async (data?: ShareData) => {
      w.__shares.push({
        text: data?.text,
        files: (data?.files ?? []).map((f) => ({ type: f.type, size: f.size })),
        duringTap: w.__inTap,
      });
    };
  });
}

export const shares = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shares: Captured[] }).__shares);
