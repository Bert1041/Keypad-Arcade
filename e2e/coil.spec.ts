import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import { createCoil, queueTurn, step, type Dir } from '../src/games/coil/logic/coil';
import { expect, test } from './fixtures';
import { captureShares, expectOneRunningGame, readDb, shares } from './helpers';

// Seeds where a single straight move eats two pellets before the wall, so matching the score
// proves the real game followed the seed (a run that scores 0 would match by accident).
const SEED_UP = 5225;
const SEED_DOWN = 14400;

/** What the rules say a run must score from this seed when the only input is one turn. */
function expectedScore(seed: number, firstMove: Dir): number {
  const random = seededRandom(seed);
  let state = queueTurn(createCoil(random, 15, 22), firstMove);
  while (state.alive) state = step(state, random).state;
  expect(state.score, 'fixture seed must score, or the comparison proves nothing').toBeGreaterThan(
    0,
  );
  return state.score;
}

async function swipe(page: Page, dx: number, dy: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

const lastScore = (page: Page) => page.getByTestId('run-bar').getAttribute('data-last-score');

test('waits for the first move, then plays the exact run the seed defines — twice', async ({
  page,
}) => {
  await page.goto(`/play/coil?seed=${SEED_UP}&beat=999`);
  await expectOneRunningGame(page);

  // Nothing moves until the player does.
  await page.waitForTimeout(2_000);
  expect(await lastScore(page)).toBeNull();

  const expected = expectedScore(SEED_UP, 'up');
  await swipe(page, 0, -120);
  await expect.poll(() => lastScore(page), { timeout: 10_000 }).toBe(String(expected));

  // Retry the same challenge: same seed, same move, same score.
  await page.waitForTimeout(600); // past the retry guard
  await page.locator('canvas').click();
  await swipe(page, 0, -120);
  await expect
    .poll(
      async () => (await readDb(page, 'gameStats', 'coil')) as { playCount?: number } | undefined,
    )
    .toMatchObject({ playCount: 2 });
  expect(await lastScore(page)).toBe(String(expected));
});

test('a swipe sideways steers too', async ({ page }) => {
  await page.goto(`/play/coil?seed=${SEED_DOWN}&beat=999`);
  await expectOneRunningGame(page);
  await swipe(page, 0, 120); // start heading down
  await expect
    .poll(() => lastScore(page), { timeout: 10_000 })
    .toBe(String(expectedScore(SEED_DOWN, 'down')));
});

test('arrow keys play on desktop, and the result can be shared as a challenge', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard is the desktop path');
  await captureShares(page);
  await page.goto(`/play/coil?seed=${SEED_UP}&beat=999`);
  await expectOneRunningGame(page);
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(() => lastScore(page), { timeout: 10_000 })
    .toBe(String(expectedScore(SEED_UP, 'up')));

  await page.getByTestId('share-button').click();
  await expect.poll(async () => (await shares(page)).length).toBe(1);
  expect((await shares(page))[0]?.text).toContain(`/play/coil?seed=${SEED_UP}&beat=`);
});
