import { type Page } from '@playwright/test';

/** Skyline helpers shared by its spec and the leaderboard spec. */

export const debug = (page: Page) => page.evaluate(() => window.__SKYLINE_DEBUG__?.());
export const lastScore = (page: Page) =>
  page.getByTestId('run-bar').getAttribute('data-last-score');

export async function tap(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
}

/**
 * Taps on the first frame the floor on the crane is drawn lined up over the tower's top — from
 * inside the page, because a round trip from the test runner can take 200 ms under load, long
 * enough for the floor to swing a whole floor-width past. Returns what was on screen.
 */
export function tapWhenLinedUp(page: Page) {
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
export function nextFloorSwings(page: Page) {
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
