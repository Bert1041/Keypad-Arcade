import { type Page } from '@playwright/test';
import { seededRandom } from '../src/core/random/seededRandom';
import { NO_INPUT, createPopShot, rowLength, tick } from '../src/games/pop-shot/logic/popShot';
import { replayRun, type PopShotReplay } from '../src/games/pop-shot/verify';
import { expect, test } from './fixtures';
import { expectOneRunningGame } from './helpers';

const debug = (page: Page) => page.evaluate(() => window.__POP_SHOT_DEBUG__?.());

async function canvasPoint(page: Page, x: number, y: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const k = box.width / 360;
  return { x: box.x + x * k, y: box.y + y * k };
}

async function tapAt(page: Page, x: number, y: number) {
  const p = await canvasPoint(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}

test('letting go shoots where the finger aims; letting go by the shooter cancels', async ({
  page,
}) => {
  await page.goto('/play/pop-shot');
  await expectOneRunningGame(page);
  expect(await debug(page)).toMatchObject({ started: false, shots: 0 });
  const before = (await debug(page))?.rows ?? [];

  await tapAt(page, 180, 570); // by the shooter: aims, starts the run, but cancels the shot
  await page.waitForTimeout(500);
  expect(await debug(page)).toMatchObject({ started: true, shots: 0, rows: before });

  await tapAt(page, 40, 300);
  await expect.poll(async () => (await debug(page))?.shots).toBe(1);
  await expect.poll(async () => (await debug(page))?.flying).toBe(false);
  const after = (await debug(page))?.rows ?? [];
  // One more bubble on the board (or a group popped): either way, the board changed on the left.
  expect(after).not.toEqual(before);
});

test('the run the browser played replays on the server to the same score and board', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.goto('/play/pop-shot');
  await expectOneRunningGame(page);
  // Sweep the aim across the board, a shot as soon as each bubble is loaded, until buried.
  const aims = [30, 330, 120, 250, 70, 290, 180, 10, 350];
  for (let shot = 0; shot < 150; shot++) {
    const state = await debug(page);
    if (state?.over) break;
    await expect.poll(async () => (await debug(page))?.flying).toBe(false);
    await tapAt(page, aims[shot % aims.length] ?? 180, 280 + (shot % 4) * 30);
    await expect
      .poll(async () => {
        const s = await debug(page);
        return (s?.shots ?? 0) > shot || s?.over;
      })
      .toBe(true);
  }
  await expect.poll(() => page.evaluate(() => window.__LAST_RUN__?.gameId)).toBe('pop-shot');
  const run = await page.evaluate(() => window.__LAST_RUN__);
  const final = await debug(page);
  expect(final?.over).toBe(true);
  expect(run?.score).toBe(final?.score);
  expect(replayRun(seededRandom(run?.seed ?? 0), run?.replay)).toEqual({
    ok: true,
    score: run?.score,
  });
  // And the same board: Node, fed the recorded input, buries the player under the same bubbles.
  const random = seededRandom(run?.seed ?? 0);
  const state = createPopShot(random);
  const recorded = (run?.replay as PopShotReplay).input;
  let input = NO_INPUT;
  for (let step = 1, next = 0; !state.over && step < 200_000; step++) {
    const change = recorded[next];
    if (change?.[0] === step) {
      input = { aimX: change[1], aimY: change[2], fire: change[3] === 1 };
      next += 1;
    }
    tick(state, input, random);
  }
  const rows = state.grid.map((row, r) =>
    row
      .slice(0, rowLength(state, r))
      .map((c) => (c === null ? '.' : String(c)))
      .join(''),
  );
  expect(rows).toEqual(final?.rows);
});
