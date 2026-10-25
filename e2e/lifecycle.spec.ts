import { type Page } from '@playwright/test';
import { expect, test, press } from './fixtures';
import { GAME_IDS, expectNoGames, expectOneRunningGame } from './helpers';

test('the library lists exactly the games in this build', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('[data-testid^="game-card-"]');
  await expect(cards).toHaveCount(GAME_IDS.length);
  const ids = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual(GAME_IDS.map((id) => `game-card-${id}`));
});

for (const id of GAME_IDS) {
  test(`${id}: entering and leaving repeatedly never leaves an extra game running`, async ({
    page,
  }) => {
    await page.goto('/');
    for (let i = 0; i < 4; i++) {
      await press(page.getByTestId(`game-card-${id}`));
      await expectOneRunningGame(page);
      await press(page.getByRole('button', { name: 'Back to library' }));
      await expect(page).toHaveURL('/');
      await expectNoGames(page);
    }
  });
}

test('the browser/Android back gesture also tears the game down', async ({ page }) => {
  await page.goto('/');
  await press(page.getByTestId('game-card-prototype'));
  await expectOneRunningGame(page);
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expectNoGames(page);
});

test('a shared deep link plays, and Back stays inside the app', async ({ page }) => {
  await page.goto('/play/prototype');
  await expectOneRunningGame(page);
  await press(page.getByRole('button', { name: 'Back to library' }));
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('game-card-prototype')).toBeVisible();
  await expectNoGames(page);
});

test('the canvas fits inside the stage without overflowing the screen', async ({ page }) => {
  await page.goto('/play/prototype');
  await expectOneRunningGame(page);
  const canvas = await page.locator('canvas').boundingBox();
  const stage = await page.getByTestId('game-container').boundingBox();
  expect(canvas && stage).toBeTruthy();
  expect(canvas!.y).toBeGreaterThanOrEqual(stage!.y - 1);
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(stage!.y + stage!.height + 1);
  expect(canvas!.width).toBeLessThanOrEqual(stage!.width + 1);
  // Not shrunk to a postage stamp either.
  expect(canvas!.height).toBeGreaterThan(stage!.height * 0.9);
});

test('an unknown game id goes back to the library', async ({ page }) => {
  await page.goto('/play/does-not-exist');
  await expect(page).toHaveURL('/');
});

/** Canvas and stage rectangles, in CSS pixels. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const r = (el: Element | null) => {
      const b = el?.getBoundingClientRect();
      return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    };
    return {
      canvas: r(document.querySelector('canvas')),
      stage: r(document.querySelector('[data-testid="game-container"]')),
    };
  });

for (const id of GAME_IDS) {
  test(`${id}: rotating the phone resizes the game to fit, both ways`, async ({ page }) => {
    await page.goto(`/play/${id}`);
    await expectOneRunningGame(page);
    const portrait = page.viewportSize();
    if (!portrait) throw new Error('no viewport');
    const fits = async () => {
      const { canvas, stage } = await layout(page);
      if (!canvas || !stage) return false;
      const inside =
        canvas.x >= stage.x - 1 &&
        canvas.y >= stage.y - 1 &&
        canvas.x + canvas.w <= stage.x + stage.w + 1 &&
        canvas.y + canvas.h <= stage.y + stage.h + 1;
      // …and as big as it can be: touching the stage on at least one axis.
      const filled = canvas.w >= stage.w - 2 || canvas.h >= stage.h - 2;
      return inside && filled;
    };
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await expect.poll(fits, { timeout: 3_000 }).toBe(true);
    await page.setViewportSize(portrait);
    await expect.poll(fits, { timeout: 3_000 }).toBe(true);
  });
}

test('on a slow connection, the game says it is loading instead of showing nothing', async ({
  page,
}) => {
  // Hold back every game-code download, as a weak 3G signal would.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  // Built: /assets/createGame-<hash>.js; dev server: /src/games/<id>/createGame.ts.
  await page.route(/createGame(-[\w-]+)?\.(js|ts)(\?.*)?$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  await press(page.getByTestId('game-card-star-raid'));
  await expect(page.getByRole('status').filter({ hasText: 'Loading Star Raid…' })).toBeVisible();
  release();
  await expectOneRunningGame(page);
  await expect(page.getByText('Loading Star Raid…')).toHaveCount(0);
});
