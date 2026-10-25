import { expect, test, press } from './fixtures';
import { playOneRun, readDb } from './helpers';

test('a finished run saves the best score to real IndexedDB and survives a reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('best-prototype')).toHaveText('Best: 0');

  await press(page.getByTestId('game-card-prototype'));
  await expect(page.getByTestId('player-best')).toHaveText('Best: 0');
  const best = await playOneRun(page);
  expect(best).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('player-best')).toHaveText(`Best: ${best}`);

  await expect
    .poll(() => readDb(page, 'gameStats', 'prototype'))
    .toMatchObject({ gameId: 'prototype', bestScore: best, playCount: 1 });

  await page.reload();
  await expect(page.getByTestId('player-best')).toHaveText(`Best: ${best}`);
  await press(page.getByRole('button', { name: 'Back to library' }));
  await expect(page.getByTestId('best-prototype')).toHaveText(`Best: ${best}`);
});

test('the sound setting survives a reload', async ({ page }) => {
  await page.goto('/settings');
  const toggle = page.getByTestId('sound-toggle');
  await expect(toggle).toBeChecked();
  await press(toggle);
  await expect(toggle).not.toBeChecked();
  // The write is async; reload only once it has really committed.
  await expect
    .poll(() => readDb(page, 'settings', 'soundEnabled'))
    .toEqual({ key: 'soundEnabled', value: false });
  await page.reload();
  await expect(page.getByTestId('sound-toggle')).not.toBeChecked();
});
