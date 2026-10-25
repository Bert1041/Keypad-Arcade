import { type Page } from '@playwright/test';
import { LEVEL_FILES, LEVELS } from '../src/games/rebound/levels';
import { playScript } from '../src/games/rebound/logic/replay';
import { expect, test } from './fixtures';
import { expectOneRunningGame, readDb } from './helpers';

const debug = (page: Page) => page.evaluate(() => window.__REBOUND_DEBUG__?.() ?? null);
const lastScore = (page: Page) => page.getByTestId('run-bar').getAttribute('data-last-score');

/** Pointer position for a point in the game's 360 × 600 world. */
async function at(page: Page, x: number, y: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + (x * box.width) / 360, y: box.y + (y * box.height) / 600 };
}

async function tapWorld(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** Menu buttons: the first at y=260, the second at y=316 (see ReboundScene.showMenu). */
const MENU_FIRST = { x: 180, y: 260 };
const PAD_RIGHT = { x: 135, y: 540 };

test('the real game plays every level from its solution to an all-clear run, saving progress', async ({
  page,
}) => {
  // All ten levels at real speed: about 2.5 minutes of play.
  test.setTimeout(330_000);
  const scripts = LEVEL_FILES.map((f) => f.solution);
  await page.addInitScript((s) => {
    window.__REBOUND_SCRIPT__ = s;
  }, scripts);
  // What the rules say the whole run scores: every level's points, added up.
  const expected = LEVELS.reduce((sum, level, i) => {
    const { state } = playScript(level, scripts[i] ?? []);
    expect(state.levelCleared, `solution for level ${i + 1}`).toBe(true);
    return sum + state.score;
  }, 0);

  await page.goto('/play/rebound');
  await expectOneRunningGame(page);
  await expect.poll(() => lastScore(page), { timeout: 300_000 }).toBe(String(expected));
  await expect
    .poll(() => readDb(page, 'gameStats', 'rebound'))
    .toMatchObject({ reachedLevel: LEVELS.length, playCount: 1, bestScore: expected });
});

test('after clearing a level, the menu continues from the next one', async ({ page, context }) => {
  test.setTimeout(60_000);
  const first = LEVEL_FILES[0]?.solution ?? [];
  await page.addInitScript(
    (s) => {
      window.__REBOUND_SCRIPT__ = s;
    },
    [first],
  );
  await page.goto('/play/rebound');
  await expect
    .poll(() => readDb(page, 'gameStats', 'rebound'), { timeout: 30_000 })
    .toMatchObject({
      reachedLevel: 2,
    });

  // A fresh page, without the script: a player coming back later.
  const later = await context.newPage();
  await later.goto('/play/rebound');
  await expectOneRunningGame(later);
  await expect.poll(() => debug(later)).toMatchObject({ started: false });
  await tapWorld(later, MENU_FIRST.x, MENU_FIRST.y); // "Continue: level 2"
  await expect.poll(() => debug(later)).toMatchObject({ started: true, level: 2 });
});

test('the on-screen pad rolls the ball', async ({ page }) => {
  await page.goto('/play/rebound');
  await expectOneRunningGame(page);
  await tapWorld(page, MENU_FIRST.x, MENU_FIRST.y); // "Tap to start"
  await expect.poll(() => debug(page)).toMatchObject({ started: true, level: 1 });
  const startX = (await debug(page))?.x ?? 0;

  const right = await at(page, PAD_RIGHT.x, PAD_RIGHT.y);
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await page.waitForTimeout(1_200);
  await page.mouse.up();
  const after = await debug(page);
  expect(after?.x).toBeGreaterThan(startX + 48); // rolled at least two tiles right
  expect(after?.score).toBeGreaterThanOrEqual(20); // through the first ring
});

test('keyboard: Space starts, the arrow keys roll', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard is the desktop path');
  await page.goto('/play/rebound');
  await expectOneRunningGame(page);
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page)).toMatchObject({ started: true, level: 1 });
  const startX = (await debug(page))?.x ?? 0;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  expect((await debug(page))?.x).toBeGreaterThan(startX + 48);
});

test('two fingers: hold ▶ and tap JUMP — the ball jumps while it keeps rolling', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium', 'multi-touch is sent through Chrome’s devtools protocol');
  test.skip(!isMobile, 'the pad is for touchscreens; desktop plays with the keyboard');
  await page.goto('/play/rebound');
  await expectOneRunningGame(page);
  await tapWorld(page, MENU_FIRST.x, MENU_FIRST.y);
  await expect.poll(() => debug(page)).toMatchObject({ started: true });
  await page.waitForTimeout(500); // settle on the floor
  const start = await debug(page);
  const right = await at(page, PAD_RIGHT.x, PAD_RIGHT.y);
  const jump = await at(page, 295, 540);
  const cdp = await page.context().newCDPSession(page);
  const finger = (id: number, p: { x: number; y: number }) => ({ id, x: p.x, y: p.y });
  // Finger 1 holds ▶ …
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger(1, right)],
  });
  await page.waitForTimeout(250);
  // … finger 2 presses JUMP without finger 1 letting go.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger(1, right), finger(2, jump)],
  });
  let highest = start?.y ?? 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(40);
    highest = Math.min(highest, (await debug(page))?.y ?? highest);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [finger(1, right)] });
  await page.waitForTimeout(150);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const end = await debug(page);
  expect(highest).toBeLessThan((start?.y ?? 0) - 24); // rose over a tile: it jumped
  expect(end?.x ?? 0).toBeGreaterThan((start?.x ?? 0) + 24); // and kept rolling right
});

test('dying while holding a button does not restart the moment you let go', async ({ page }) => {
  // Level 2 starts with spikes ahead: hold ▶ and the ball rolls into them, three lives running.
  await page.goto('/');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keypad-arcade');
        open.onsuccess = () => {
          const tx = open.result.transaction('gameStats', 'readwrite');
          tx.objectStore('gameStats').put({
            gameId: 'rebound',
            bestScore: 0,
            playCount: 0,
            lastPlayedAt: 0,
            reachedLevel: 2,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.goto('/play/rebound');
  await expectOneRunningGame(page);
  await tapWorld(page, MENU_FIRST.x, MENU_FIRST.y); // "Continue: level 2"
  await expect.poll(() => debug(page)).toMatchObject({ started: true, level: 2 });
  const right = await at(page, PAD_RIGHT.x, PAD_RIGHT.y);
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await expect.poll(() => debug(page), { timeout: 20_000 }).toMatchObject({ over: true });
  await page.waitForTimeout(1_000); // still holding, well past the retry delay
  await page.mouse.up();
  await page.waitForTimeout(500);
  // The game-over screen (and the score to share) must still be there.
  expect(await debug(page)).toMatchObject({ over: true, started: true });
  // A fresh tap does restart.
  await tapWorld(page, 180, 240);
  await expect.poll(() => debug(page)).toMatchObject({ over: false, started: false });
});
