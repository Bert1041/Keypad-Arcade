import { expect, test } from './fixtures';
import { captureShares, expectNoGames, expectOneRunningGame, shares } from './helpers';

test.skip(({ isMobile }) => isMobile, 'keyboard play is the desktop path');

test('Space plays the game, still presses a focused button, and Esc leaves', async ({ page }) => {
  await captureShares(page);
  await page.goto('/');
  await page.getByTestId('game-card-prototype').click();
  await expectOneRunningGame(page);

  const bar = page.getByTestId('run-bar');
  for (let i = 0; i < 60 && (await bar.getAttribute('data-last-score')) === null; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(60);
  }
  expect(Number(await bar.getAttribute('data-last-score'))).toBeGreaterThanOrEqual(1);

  // A keyboard user tabs to the share button: Space must press it, not drop a block.
  await page.getByTestId('share-button').focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await shares(page)).length).toBe(1);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
  await expectNoGames(page);
});
