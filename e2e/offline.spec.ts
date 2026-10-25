import { expect, test, press } from './fixtures';
import { GAME_IDS, expectNoGames, expectOneRunningGame } from './helpers';

// Playwright only supports service workers in Chromium, which is our primary target anyway.
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'service workers need Chromium in Playwright',
);

test('after one online visit, the library and every game work offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first visit installs the worker; it controls the page from the next load.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  // Every game has its own lazily-loaded chunk that was never requested online, so each one is
  // checked: one game working offline proves nothing about the others' files.
  for (const id of GAME_IDS) {
    await expect(page.getByTestId(`game-card-${id}`)).toBeVisible();
    await press(page.getByTestId(`game-card-${id}`));
    await expectOneRunningGame(page);
    await press(page.getByRole('button', { name: 'Back to library' }));
    await expectNoGames(page);
  }
});
