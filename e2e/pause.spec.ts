import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import { createCoil, queueTurn, step } from '../src/games/coil/logic/coil';
import { expect, press, test } from './fixtures';
import { GAME_IDS, expectNoGames, expectOneRunningGame } from './helpers';

const pausedGames = (page: Page) =>
  page.evaluate(() => window.__GAME_HOST_E2E__?.pausedGames() ?? -1);
const pauseScreen = (page: Page) => page.getByRole('dialog', { name: 'Paused' });
const lastScore = (page: Page) => page.getByTestId('run-bar').getAttribute('data-last-score');

for (const id of GAME_IDS) {
  test(`${id}: pause freezes the game, resume carries on`, async ({ page }) => {
    await page.goto(`/play/${id}`);
    await expectOneRunningGame(page);
    await press(page.getByRole('button', { name: 'Pause' }));
    await expect(pauseScreen(page)).toBeVisible();
    await expect.poll(() => pausedGames(page)).toBe(1);
    await press(page.getByRole('button', { name: 'Resume' }));
    await expect(pauseScreen(page)).toBeHidden();
    await expect.poll(() => pausedGames(page)).toBe(0);
    await press(page.getByRole('button', { name: 'Back to library' }));
    await expectNoGames(page);
  });
}

test('while paused the simulation stands still, then finishes exactly as it would have', async ({
  page,
}) => {
  // A seed where going straight up eats two pellets and hits the wall within ~2 s.
  const SEED = 5225;
  const random = seededRandom(SEED);
  let state = queueTurn(createCoil(random, 15, 22), 'up');
  while (state.alive) state = step(state, random).state;
  expect(state.score).toBeGreaterThan(0);

  await page.goto(`/play/coil?seed=${SEED}&beat=999`);
  await expectOneRunningGame(page);
  await page.keyboard.press('ArrowUp'); // starts the run
  await press(page.getByRole('button', { name: 'Pause' }));
  await page.waitForTimeout(3_000); // unpaused, the run would be over by now
  expect(await lastScore(page)).toBeNull();
  await press(page.getByRole('button', { name: 'Resume' }));
  await expect.poll(() => lastScore(page), { timeout: 10_000 }).toBe(String(state.score));
});

test('hiding the app pauses it, and coming back does not resume on its own', async ({ page }) => {
  await page.goto('/play/star-raid');
  await expectOneRunningGame(page);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await expect(pauseScreen(page)).toBeVisible();
  await setHidden(false);
  await page.waitForTimeout(500);
  await expect(pauseScreen(page)).toBeVisible();
  await expect.poll(() => pausedGames(page)).toBe(1);
});

test('keys pressed on the pause screen do not reach the game behind it', async ({ page }) => {
  await page.goto('/play/rebound');
  await expectOneRunningGame(page);
  const started = () => page.evaluate(() => window.__REBOUND_DEBUG__?.().started ?? null);
  await press(page.getByRole('button', { name: 'Pause' }));
  await page.keyboard.press('Space'); // presses the focused Resume button only
  await expect(pauseScreen(page)).toBeHidden();
  // Phaser queues keys while paused and replays them on resume, a frame later: give a leak time
  // to show before concluding there was none.
  await page.waitForTimeout(500);
  expect(await started()).toBe(false); // …and did not also start Rebound
  await page.keyboard.press('KeyP');
  await expect(pauseScreen(page)).toBeVisible();
  // Tap the empty background: focus leaves the buttons, so these keys go to the page — the path
  // where only switching the game's input off keeps them out.
  const screen = await pauseScreen(page).boundingBox();
  if (!screen) throw new Error('no pause screen');
  await page.mouse.click(screen.x + 8, screen.y + 8);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('KeyW');
  await page.keyboard.press('KeyP');
  await expect(pauseScreen(page)).toBeHidden();
  await page.waitForTimeout(500);
  expect(await started()).toBe(false);
});
