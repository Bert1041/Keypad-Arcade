import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import {
  NO_INPUT,
  STEP_MS,
  createRaid,
  tick,
  type RaidInput,
} from '../src/games/star-raid/logic/raid';
import { expect, test } from './fixtures';
import { expectOneRunningGame, readDb } from './helpers';

// Fixture seeds, found by simulation: each run ends within ~20 s and scores, so matching the
// predicted score proves the real game followed the seed and the input.
const SEED_IDLE = 237; // the ship never moves
const SEED_LEFT = 1390; // the ship is held at the left edge; idle, this seed would score 500

/** What the rules say a run scores with this seed and a constant input. */
function simulate(seed: number, input: RaidInput): { score: number; durationMs: number } {
  const random = seededRandom(seed);
  const state = createRaid();
  for (let t = 0; state.alive && t < 60_000; t += STEP_MS) tick(state, input, random);
  expect(state.alive, 'fixture run must end').toBe(false);
  expect(state.score, 'fixture run must score').toBeGreaterThan(0);
  return { score: state.score, durationMs: state.timeMs };
}
const predicted = (seed: number, input: RaidInput) => simulate(seed, input).score;

const lastScore = (page: Page) => page.getByTestId('run-bar').getAttribute('data-last-score');

async function canvasCentre(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('waits for a tap, then plays the run the seed defines', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/play/star-raid?seed=${SEED_IDLE}&beat=9999`);
  await expectOneRunningGame(page);
  await page.waitForTimeout(3_000);
  expect(await lastScore(page)).toBeNull();

  // A tap without movement starts the run and leaves the ship where it is.
  const run = simulate(SEED_IDLE, NO_INPUT);
  const { x, y } = await canvasCentre(page);
  await page.mouse.click(x, y);
  const tappedAt = Date.now();
  await expect.poll(() => lastScore(page), { timeout: 40_000 }).toBe(String(run.score));
  // An idle run scores the same whenever it starts, so timing is what proves it waited:
  // simulated time never runs ahead of the clock, so a run that began at the tap cannot end
  // sooner than its simulated length. One that started on load would end ~3 s early.
  expect(Date.now() - tappedAt).toBeGreaterThan(run.durationMs - 500);
  await expect.poll(() => readDb(page, 'gameStats', 'star-raid')).toMatchObject({ playCount: 1 });
});

test('dragging steers the ship (relative to the finger)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/play/star-raid?seed=${SEED_LEFT}&beat=9999`);
  await expectOneRunningGame(page);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const y = box.y + box.height / 2;
  // Press at the right edge and drag to the left edge, then hold. A drag across the whole
  // canvas moves the target ~360 world px left of the start, so the ship pins to the left edge
  // long before the first wave (at 1 s): the run equals one steered hard left from the start.
  // (Stay on screen: browsers send no pointer events beyond the viewport, as with a finger.)
  await page.mouse.move(box.x + box.width - 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, y, { steps: 6 });
  await expect
    .poll(() => lastScore(page), { timeout: 40_000 })
    .toBe(String(predicted(SEED_LEFT, { targetX: -1_000, axis: 0 })));
  await page.mouse.up();
});

test('Space starts the run on desktop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard is the desktop path');
  test.setTimeout(60_000);
  await page.goto(`/play/star-raid?seed=${SEED_IDLE}&beat=9999`);
  await expectOneRunningGame(page);
  await page.keyboard.press('Space');
  await expect
    .poll(() => lastScore(page), { timeout: 40_000 })
    .toBe(String(predicted(SEED_IDLE, NO_INPUT)));
});
