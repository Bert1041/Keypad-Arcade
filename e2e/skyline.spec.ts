import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectOneRunningGame } from './helpers';

const debug = (page: Page) => page.evaluate(() => window.__SKYLINE_DEBUG__?.());
const lastScore = (page: Page) => page.getByTestId('run-bar').getAttribute('data-last-score');

async function tap(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
}

/**
 * Taps on the first frame the floor on the crane is drawn lined up over the tower's top — from
 * inside the page, because a round trip from the test runner can take 200 ms under load, long
 * enough for the floor to swing a whole floor-width past. Returns what was on screen.
 */
function tapWhenLinedUp(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ hookX: number; topX: number }>((resolve) => {
        const check = () => {
          const d = window.__SKYLINE_DEBUG__?.();
          const canvas = document.querySelector('canvas');
          if (d?.phase === 'swinging' && canvas && Math.abs(d.hookX - d.topX) < 4) {
            const box = canvas.getBoundingClientRect();
            const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.6 };
            canvas.dispatchEvent(new MouseEvent('mousedown', { ...at, bubbles: true }));
            window.dispatchEvent(new MouseEvent('mouseup', { ...at, bubbles: true }));
            resolve({ hookX: d.hookX, topX: d.topX });
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      }),
  );
}

/**
 * Waits, frame by frame, for the next floor to start swinging. (expect.poll checks up to a second
 * apart — long enough for the floor to swing over the tower.)
 */
function nextFloorSwings(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (window.__SKYLINE_DEBUG__?.().phase === 'swinging') resolve();
          else requestAnimationFrame(check);
        };
        check();
      }),
  );
}

test('the first tap starts the run without dropping the floor', async ({ page }) => {
  await page.goto('/play/skyline');
  await expectOneRunningGame(page);
  expect(await debug(page)).toMatchObject({ started: false, phase: 'swinging', drops: 1 });
  await tap(page);
  await expect.poll(() => debug(page)).toMatchObject({ started: true });
  await page.waitForTimeout(400);
  expect(await debug(page)).toMatchObject({ phase: 'swinging', drops: 1, floors: 0 });
});

test('what you see is what you get: tapping when a floor looks lined up lands it, every time', async ({
  page,
}) => {
  await page.goto('/play/skyline');
  await expectOneRunningGame(page);
  await tap(page);
  for (let floor = 1; floor <= 8; floor++) {
    const before = (await debug(page))?.topRest ?? Number.NaN;
    const seen = await tapWhenLinedUp(page);
    const message = `floor ${floor}, tapped with the floor at ${JSON.stringify(seen)}`;
    await expect.poll(async () => (await debug(page))?.floors, { message }).toBe(floor);
    // Not just on: close to where it looked lined up — within a quarter of a floor (18 px), as
    // the unit tests promise for a tap on the exact frame.
    const after = (await debug(page))?.topRest ?? Number.NaN;
    expect(Math.abs(after - before), message).toBeLessThanOrEqual(18);
  }
  expect(await debug(page)).toMatchObject({ inHand: 3, over: false });
});

test('three misses end the run; only a fresh tap after a moment starts the next', async ({
  page,
}) => {
  await page.goto('/play/skyline');
  await expectOneRunningGame(page);
  await tap(page);
  // A floor dropped the moment it arrives is still at the end of its swing, far off the tower.
  for (let miss = 1; miss <= 3; miss++) {
    await nextFloorSwings(page);
    await tap(page);
    await expect.poll(async () => (await debug(page))?.inHand).toBe(3 - miss);
  }
  await expect.poll(() => debug(page)).toMatchObject({ over: true, floors: 0 });
  await expect.poll(() => lastScore(page)).toBe('0');

  await tap(page); // too soon after the end: ignored
  await page.waitForTimeout(300);
  expect(await debug(page)).toMatchObject({ over: true });
  await page.waitForTimeout(400);
  await tap(page);
  await expect.poll(() => debug(page)).toMatchObject({ over: false, started: false, inHand: 3 });
});

test('keyboard: Space starts, then drops', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard is the desktop path');
  await page.goto('/play/skyline');
  await expectOneRunningGame(page);
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page)).toMatchObject({ started: true, drops: 1 });
  await page.keyboard.press('Space');
  // Landed or missed, the floor was dropped: the crane gets the next one.
  await expect.poll(async () => (await debug(page))?.drops).toBe(2);
});
