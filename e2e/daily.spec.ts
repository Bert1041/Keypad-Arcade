import { type Page } from '@playwright/test';
import { dailySeed } from '../src/core/challenge/daily';
import { seededRandom } from '../src/core/random/seededRandom';
import { createCoil, queueTurn, step } from '../src/games/coil/logic/coil';
import { expect, press, test } from './fixtures';
import { captureShares, expectOneRunningGame, shares } from './helpers';

// A fixed "today" (timers keep running). On this date the Coil daily, played straight up,
// eats a pellet before the wall — so matching its score proves the game used the day's seed.
const TODAY = '2026-11-13';
const NUMBER = 19;

const lastScore = (page: Page) => page.getByTestId('run-bar').getAttribute('data-last-score');

function dailyUpScore(): number {
  const random = seededRandom(dailySeed('coil', TODAY));
  let state = queueTurn(createCoil(random, 15, 22), 'up');
  while (state.alive) state = step(state, random).state;
  expect(state.score, 'fixture day must score').toBeGreaterThan(0);
  return state.score;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00Z`));
});

test('the library offers today’s daily for seeded games only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('daily-coil')).toHaveText(`Daily #${NUMBER}`);
  await expect(page.getByTestId('daily-star-raid')).toHaveText(`Daily #${NUMBER}`);
  await expect(page.getByTestId('daily-rebound')).toHaveCount(0); // hand-made levels: no daily
});

test('the daily plays the day’s run, and shares as the day with a score to beat', async ({
  page,
  browser,
}) => {
  await captureShares(page);
  await page.goto('/');
  await press(page.getByTestId('daily-coil'));
  await expect(page).toHaveURL(`/play/coil?daily=${TODAY}`);
  await expect(page.getByTestId('run-status')).toHaveText(
    `Daily #${NUMBER} — the same run for everyone today`,
  );
  await expectOneRunningGame(page);
  await page.keyboard.press('ArrowUp');
  const expected = dailyUpScore();
  await expect.poll(() => lastScore(page), { timeout: 10_000 }).toBe(String(expected));

  await press(page.getByTestId('share-button'));
  await expect.poll(async () => (await shares(page)).length).toBe(1);
  const text = (await shares(page))[0]?.text ?? '';
  expect(text).toContain(`Coil Daily #${NUMBER}: I scored ${expected}`);
  const link = new URL(text.match(/https?:\/\/\S+/)?.[0] ?? 'http://x');
  expect(link.searchParams.get('daily')).toBe(TODAY);
  expect(link.searchParams.get('beat')).toBe(String(expected));

  // A friend opens it the same day.
  const friend = await (await browser.newContext(test.info().project.use)).newPage();
  await friend.clock.setFixedTime(new Date(`${TODAY}T18:00:00Z`));
  await friend.goto(link.pathname + link.search);
  await expect(friend.getByTestId('run-status')).toHaveText(`Daily #${NUMBER}: beat ${expected}`);
});

test('before Daily #1 the library offers no daily (not a "Daily #0")', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-25T10:00:00Z'));
  await page.goto('/');
  await expect(page.getByTestId('game-card-coil')).toBeVisible();
  await expect(page.getByTestId('daily-coil')).toHaveCount(0);
});

test('a daily link from the future opens a normal game', async ({ page }) => {
  await page.goto('/play/coil?daily=2026-11-14');
  await expectOneRunningGame(page);
  await expect(page.getByTestId('run-status')).toHaveText('');
});
