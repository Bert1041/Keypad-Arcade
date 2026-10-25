import { expect, test, press } from './fixtures';
import { expectNoGames, expectOneRunningGame } from './helpers';

test('entering and leaving repeatedly never leaves an extra game running', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 4; i++) {
    await press(page.getByTestId('game-card-prototype'));
    await expectOneRunningGame(page);
    await press(page.getByRole('button', { name: 'Back to library' }));
    await expect(page).toHaveURL('/');
    await expectNoGames(page);
  }
});

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
