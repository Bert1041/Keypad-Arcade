import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import { createWallbreak, tick } from '../src/games/wallbreak/logic/wallbreak';
import { replayRun, type WallbreakReplay } from '../src/games/wallbreak/verify';
import { expect, test } from './fixtures';
import { expectOneRunningGame } from './helpers';

const debug = (page: Page) => page.evaluate(() => window.__WALLBREAK_DEBUG__?.());

async function canvasPoint(page: Page, x: number, y: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const k = box.width / 360;
  return { x: box.x + x * k, y: box.y + y * k };
}

test('the ball waits until a tap serves it; the paddle follows a drag', async ({ page }) => {
  await page.goto('/play/wallbreak');
  await expectOneRunningGame(page);
  await page.waitForTimeout(600);
  expect(await debug(page)).toMatchObject({ started: false, serving: true });
  const start = await canvasPoint(page, 180, 500);
  await page.mouse.click(start.x, start.y);
  await expect.poll(async () => (await debug(page))?.serving).toBe(false);
  const left = await canvasPoint(page, 60, 500);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(left.x, left.y, { steps: 5 });
  await expect.poll(async () => (await debug(page))?.paddleX).toBeLessThan(80);
  await page.mouse.up();
});

test('the run the browser played replays on the server to the same score and wall', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/play/wallbreak');
  await expectOneRunningGame(page);
  const at = (x: number) => canvasPoint(page, x, 520);
  // Serve each ball, follow it for a while, then let it go past.
  for (let ball = 0; ball < 3; ball++) {
    const centre = await at(180);
    await page.mouse.click(centre.x, centre.y);
    await page.mouse.down();
    for (let i = 0; i < 25; i++) {
      const b = (await debug(page))?.balls[0];
      if (!b) break;
      const p = await at(b.x + 5);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(60);
    }
    const away = await at(350);
    await page.mouse.move(away.x, away.y);
    await page.mouse.up();
    await expect.poll(async () => (await debug(page))?.lives, { timeout: 30_000 }).toBe(2 - ball);
  }
  await expect.poll(() => page.evaluate(() => window.__LAST_RUN__?.gameId)).toBe('wallbreak');
  const run = await page.evaluate(() => window.__LAST_RUN__);
  expect(run?.score).toBeGreaterThan(0);
  expect(replayRun(seededRandom(run?.seed ?? 0), run?.replay)).toEqual({
    ok: true,
    score: run?.score,
  });
  // And the same wall left standing: Node, fed the recorded input, breaks the same bricks.
  const random = seededRandom(run?.seed ?? 0);
  const state = createWallbreak(random);
  const recorded = (run?.replay as WallbreakReplay).input;
  let input = { targetX: null as number | null, axis: 0, serve: false };
  for (let step = 1, next = 0; !state.over; step++) {
    const change = recorded[next];
    if (change?.[0] === step) {
      input = { targetX: change[1], axis: change[2], serve: change[3] === 1 };
      next += 1;
    }
    tick(state, input, random);
  }
  expect(state.bricks.length).toBe((await debug(page))?.bricks);
});
