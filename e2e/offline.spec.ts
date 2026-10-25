import { expect, test, press } from './fixtures';
import { expectOneRunningGame } from './helpers';

// Playwright only supports service workers in Chromium, which is our primary target anyway.
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'service workers need Chromium in Playwright',
);

test('after one online visit, the library and a lazily-loaded game work offline', async ({
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
  await expect(page.getByTestId('game-card-prototype')).toBeVisible();
  // The game chunk (with Phaser) was never requested online — it must come from the precache.
  await press(page.getByTestId('game-card-prototype'));
  await expectOneRunningGame(page);
});
