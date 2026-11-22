import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import { createPlunge, tick } from '../src/games/plunge/logic/plunge';
import { replayRun, type PlungeReplay } from '../src/games/plunge/verify';
import { expect, test } from './fixtures';
import { expectOneRunningGame } from './helpers';

const debug = (page: Page) => page.evaluate(() => window.__PLUNGE_DEBUG__?.());

/** Holds the left or right half of the game for `ms`. */
async function hold(page: Page, side: 'left' | 'right', ms: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const x = box.x + box.width * (side === 'left' ? 0.2 : 0.8);
  await page.mouse.move(x, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('nothing moves until the first press; holding a side rolls the ball that way', async ({
  page,
}) => {
  await page.goto('/play/plunge');
  await expectOneRunningGame(page);
  const at = await debug(page);
  await page.waitForTimeout(800);
  expect(await debug(page)).toEqual(at); // waiting, not rising
  await hold(page, 'left', 250);
  await expect.poll(async () => (await debug(page))?.started).toBe(true);
  expect((await debug(page))?.ball.x ?? 999).toBeLessThan(at?.ball.x ?? 0);
});

test('the run the browser played replays on the server to the same score', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/play/plunge');
  await expectOneRunningGame(page);
  await hold(page, 'right', 400);
  await hold(page, 'left', 700);
  await hold(page, 'right', 300);
  // Then ride up into the spikes, three times.
  await expect
    .poll(() => page.evaluate(() => window.__LAST_RUN__?.gameId), { timeout: 60_000 })
    .toBe('plunge');
  const run = await page.evaluate(() => window.__LAST_RUN__);
  expect(run?.score).toBeGreaterThan(30);
  const replay = run?.replay as { input?: unknown[] } | undefined;
  expect(replay?.input?.length).toBeGreaterThanOrEqual(4);
  expect(replayRun(seededRandom(run?.seed ?? 0), run?.replay)).toEqual({
    ok: true,
    score: run?.score,
  });
  // The score alone can match by luck (it counts survival time). Where the ball died cannot:
  // Node, fed the recorded input, must lose each life on exactly the browser's spot.
  const browser = await debug(page);
  const random = seededRandom(run?.seed ?? 0);
  const state = createPlunge(random);
  const recorded = (run?.replay as PlungeReplay).input;
  const deaths: { x: number; y: number }[] = [];
  let axis = 0;
  for (let step = 1, next = 0; !state.over; step++) {
    if (recorded[next]?.[0] === step) axis = recorded[next++]?.[1] ?? 0;
    for (const e of tick(state, { axis }, random)) {
      if (e.type === 'died') deaths.push({ x: state.ball.x, y: state.ball.y });
    }
  }
  expect(deaths).toHaveLength(3);
  expect(deaths).toEqual(browser?.deaths);
});
