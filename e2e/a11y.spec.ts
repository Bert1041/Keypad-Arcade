import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectOneRunningGame, playOneRun } from './helpers';

// Automated WCAG A/AA checks on the app shell. The game canvas itself is not inspectable
// by axe; docs/MANUAL_QA.md covers it on real phones.
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-card-prototype')).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
});

test('settings', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('sound-toggle')).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
});

test('game screen after a run, with the share button showing', async ({ page }) => {
  await page.goto('/play/prototype?seed=1&beat=5');
  await expectOneRunningGame(page);
  await playOneRun(page);
  await expect(page.getByTestId('share-button')).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
});
