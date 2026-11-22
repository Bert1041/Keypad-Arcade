import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import { replayRun } from '../src/games/pairs/verify';
import { expect, test } from './fixtures';
import { expectOneRunningGame } from './helpers';

const debug = (page: Page) => page.evaluate(() => window.__PAIRS_DEBUG__?.());

/** Taps card `index` where it is drawn on screen. */
async function tapCard(page: Page, index: number) {
  const d = await debug(page);
  const box = await page.locator('canvas').boundingBox();
  const centre = d?.centres[index];
  if (!box || !d || !centre) throw new Error(`no card ${index}`);
  const scale = box.width / 360;
  await page.mouse.click(box.x + centre.x * scale, box.y + centre.y * scale);
}

/** Clears the board on screen with a perfect memory (the debug hook knows the symbols). */
async function clearBoard(page: Page) {
  const d = await debug(page);
  if (!d) throw new Error('no game');
  const done = new Set<number>();
  for (let i = 0; i < d.symbols.length; i++) {
    if (done.has(i) || d.faces[i] !== 'down') continue;
    const partner = d.symbols.findIndex((s, j) => j !== i && s === d.symbols[i]);
    await tapCard(page, i);
    await tapCard(page, partner);
    done.add(i).add(partner);
  }
}

test('the first tap starts the clock and turns that card', async ({ page }) => {
  await page.goto('/play/pairs');
  await expectOneRunningGame(page);
  await page.waitForTimeout(1_200);
  expect(await debug(page)).toMatchObject({ started: false, leftMs: 60_000 });
  await tapCard(page, 5);
  await expect.poll(async () => (await debug(page))?.faces[5]).toBe('up');
  await page.waitForTimeout(600);
  expect((await debug(page))?.leftMs).toBeLessThan(60_000);
});

test('a pair stays up; a mismatch turns back; a cleared board deals a bigger one', async ({
  page,
}) => {
  await page.goto('/play/pairs');
  await expectOneRunningGame(page);
  const d = await debug(page);
  if (!d) throw new Error('no game');
  const partner = d.symbols.findIndex((s, j) => j !== 0 && s === d.symbols[0]);
  const stranger = d.symbols.findIndex((s, j) => j !== 0 && s !== d.symbols[0]);

  await tapCard(page, 0);
  await tapCard(page, stranger);
  await expect.poll(async () => (await debug(page))?.faces[stranger]).toBe('up');
  await expect.poll(async () => (await debug(page))?.faces[stranger]).toBe('down');

  await tapCard(page, 0);
  await tapCard(page, partner);
  await expect.poll(async () => (await debug(page))?.faces[partner]).toBe('matched');
  expect((await debug(page))?.score).toBe(10);

  await clearBoard(page);
  await expect.poll(async () => (await debug(page))?.board).toBe(2);
  expect(await debug(page)).toMatchObject({ cols: 4, rows: 5 });
});

test('the run the browser played replays on the server to the same score', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/play/pairs');
  await expectOneRunningGame(page);
  await clearBoard(page);
  await expect.poll(async () => (await debug(page))?.board).toBe(2);
  // Then let the clock run out.
  await expect
    .poll(() => page.evaluate(() => window.__LAST_RUN__?.gameId), { timeout: 120_000 })
    .toBe('pairs');
  const run = await page.evaluate(() => window.__LAST_RUN__);
  expect(run?.score).toBeGreaterThan(100);
  expect(replayRun(seededRandom(run?.seed ?? 0), run?.replay)).toEqual({
    ok: true,
    score: run?.score,
  });
});
