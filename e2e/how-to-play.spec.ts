import { type Page } from '@playwright/test';
import { expect, press, test } from './fixtures';
import { GAME_IDS, expectOneRunningGame } from './helpers';

const pausedGames = (page: Page) =>
  page.evaluate(() => window.__GAME_HOST_E2E__?.pausedGames() ?? -1);
const howTo = (page: Page) => page.getByRole('dialog', { name: 'How to play' });
const pauseScreen = (page: Page) => page.getByRole('dialog', { name: 'Paused' });

for (const id of GAME_IDS) {
  test(`${id}: "How to play" shows the rules over the paused game`, async ({ page }) => {
    await page.goto(`/play/${id}`);
    await expectOneRunningGame(page);
    await press(page.getByRole('button', { name: 'How to play' }));
    const dialog = howTo(page);
    await expect(dialog).toBeVisible();
    // It opens at the top, on the goal: not scrolled down to the button that has the focus.
    await expect(dialog.getByRole('heading', { name: 'How to play' })).toBeInViewport();
    await expect(dialog.getByRole('heading', { name: 'Controls' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Rules' })).toBeVisible();
    expect(await dialog.getByRole('listitem').count()).toBeGreaterThanOrEqual(2);
    await expect.poll(() => pausedGames(page)).toBe(1);
    // The last line can be read: the screen scrolls on a short phone rather than cutting it off.
    const close = dialog.getByRole('button', { name: 'Back to game' });
    await close.scrollIntoViewIfNeeded();
    await expect(close).toBeInViewport();
    await press(close);
    await expect(dialog).toBeHidden();
    await expect.poll(() => pausedGames(page)).toBe(0);
  });
}

test('opened from the pause screen, it goes back there: the run stays paused', async ({ page }) => {
  await page.goto('/play/coil');
  await expectOneRunningGame(page);
  await press(page.getByRole('button', { name: 'Pause' }));
  await press(pauseScreen(page).getByRole('button', { name: 'How to play' }));
  await expect(howTo(page)).toBeVisible();
  await expect(pauseScreen(page)).toBeHidden();
  await press(howTo(page).getByRole('button', { name: 'Back', exact: true }));
  await expect(pauseScreen(page)).toBeVisible();
  await expect.poll(() => pausedGames(page)).toBe(1);
});

test('Escape closes it and returns to the game, without leaving', async ({ page }) => {
  await page.goto('/play/pop-shot');
  await expectOneRunningGame(page);
  await press(page.getByRole('button', { name: 'How to play' }));
  await expect(howTo(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(howTo(page)).toBeHidden();
  await expect(page).toHaveURL(/\/play\/pop-shot/);
  await expect.poll(() => pausedGames(page)).toBe(0);
});
