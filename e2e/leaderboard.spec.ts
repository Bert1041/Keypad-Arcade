import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { dailySeed } from '../src/core/challenge/daily';
import { seededRandom } from '../src/core/random/seededRandom';
import { createSkyline, hookAt, tick, topX } from '../src/games/skyline/logic/skyline';
import type { SkylineReplay } from '../src/games/skyline/verify';
import { postRun } from '../server/leaderboard';
import { testRedis, wipe } from '../server/testRedis';
import { expect, press, test } from './fixtures';
import { expectOneRunningGame } from './helpers';
import { LEADERBOARD_DAY, LEADERBOARD_NOW } from './leaderboardClock';
import { debug, nextFloorSwings, tap, tapWhenLinedUp } from './skyline';

// Real API (scripts/dev-api.ts, the handlers Vercel runs) and a real Redis; the browser's and the
// server's clocks are both fixed to LEADERBOARD_NOW, after Daily #1.

const redis = testRedis();
const NOW = Date.parse(LEADERBOARD_NOW);

// One database for every test in this file, so they take turns.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await wipe(redis);
  await page.clock.setFixedTime(new Date(LEADERBOARD_NOW));
});

/** Another player's real run, posted straight to the server: `floors` lined-up drops. */
async function otherPlayer(n: number, nickname: string, floors: number) {
  const random = seededRandom(dailySeed('skyline', LEADERBOARD_DAY));
  const state = createSkyline(random);
  const replay: SkylineReplay = { v: 1, drops: [] };
  for (let step = 1; state.phase !== 'over' && step < 100_000; step++) {
    const early = state.drops > floors && state.timeMs - state.hook.spawnMs < 40;
    const lined = Math.abs(hookAt(state).x - topX(state)) < 3;
    const drop = state.phase === 'swinging' && (early || lined);
    if (drop) replay.drops.push(step);
    tick(state, { drop }, random);
  }
  const posted = await postRun(
    redis,
    {
      game: 'skyline',
      date: LEADERBOARD_DAY,
      player: n.toString(16).padStart(64, 'b'),
      nickname,
      score: state.score,
      replay,
    },
    { now: NOW, ip: `10.0.0.${n}` },
  );
  expect(posted, 'fixture post').toMatchObject({ ok: true });
  return state.score;
}

/** Plays today's Skyline daily: `floors` lined-up drops, then three misses. */
async function playDaily(page: Page, floors: number) {
  await page.goto(`/play/skyline?daily=${LEADERBOARD_DAY}`);
  await expectOneRunningGame(page);
  await tap(page);
  for (let floor = 1; floor <= floors; floor++) {
    await tapWhenLinedUp(page);
    await expect.poll(async () => (await debug(page))?.floors).toBe(floor);
  }
  for (let miss = 1; miss <= 3; miss++) {
    await nextFloorSwings(page);
    await tap(page);
    await expect.poll(async () => (await debug(page))?.inHand).toBe(3 - miss);
  }
  await expect.poll(() => page.evaluate(() => window.__LAST_RUN__?.gameId)).toBe('skyline');
  return (await page.evaluate(() => window.__LAST_RUN__?.score)) ?? -1;
}

test('a daily run is posted with a nickname, checked by the server, and shown on the board', async ({
  page,
}) => {
  const theirs = await otherPlayer(1, 'Chioma', 6);
  const mine = await playDaily(page, 3);
  expect(mine).toBeGreaterThan(0);
  expect(theirs).toBeGreaterThan(mine);

  await press(page.getByTestId('post-button'));
  // First time: asks for a name, and refuses one that breaks the rule before sending anything.
  const name = page.getByTestId('nickname-input');
  await name.fill('x');
  await press(page.getByTestId('nickname-save'));
  await expect(page.getByRole('alert')).toContainText('3–12');
  await name.fill('Tunde');
  await press(page.getByTestId('nickname-save'));
  await expect(page.getByTestId('run-status')).toHaveText('#2 of 2 today');

  await press(page.getByTestId('see-board'));
  await expect(page).toHaveURL(/\/boards\?game=skyline$/);
  const rows = page.getByTestId('board-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Chioma');
  await expect(rows.nth(0)).toContainText(String(theirs));
  await expect(rows.nth(1)).toContainText('Tunde (you)');
  await expect(rows.nth(1)).toContainText(String(mine));
  await expect(page.getByTestId('board-players')).toHaveText('2 players today');
});

test('the next daily run posts without asking for the name again', async ({ page }) => {
  await playDaily(page, 2);
  await press(page.getByTestId('post-button'));
  await page.getByTestId('nickname-input').fill('Ngozi');
  await press(page.getByTestId('nickname-save'));
  await expect(page.getByTestId('run-status')).toHaveText('#1 of 1 today');

  await page.waitForTimeout(700); // past the retry guard
  await tap(page); // retry
  await playDaily(page, 1);
  await press(page.getByTestId('post-button'));
  await expect(page.getByTestId('nickname-input')).toHaveCount(0);
  await expect(page.getByTestId('run-status')).toContainText('is #1 of 1'); // the better run stands
});

test('only daily runs can be posted', async ({ page }) => {
  await page.goto('/play/skyline');
  await expectOneRunningGame(page);
  await tap(page);
  for (let miss = 1; miss <= 3; miss++) {
    await nextFloorSwings(page);
    await tap(page);
    await expect.poll(async () => (await debug(page))?.inHand).toBe(3 - miss);
  }
  await expect(page.getByTestId('share-button')).toBeVisible();
  await expect(page.getByTestId('post-button')).toHaveCount(0);
});

test.describe('without a connection', () => {
  // The test cuts the network; Chrome logs the failed request itself. Nothing else is allowed.
  test.use({ expectedErrors: [/^Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/] });

  test('the boards: a tab per daily game, an empty board, and no connection', async ({ page }) => {
    await page.goto('/');
    await press(page.getByTestId('boards-link'));
    await expect(page.getByTestId('board-empty')).toBeVisible();
    for (const id of ['skyline', 'coil', 'star-raid']) {
      await expect(page.getByTestId(`board-tab-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('board-tab-rebound')).toHaveCount(0);

    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
    await press(page.getByTestId('board-tab-coil'));
    await expect(page.getByTestId('board-error')).toContainText('check your connection');
    await page.unroute('**/api/**');
    await otherPlayer(2, 'Kemi', 2);
    await press(page.getByTestId('board-tab-skyline'));
    await expect(page.getByTestId('board-row')).toHaveCount(1);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
});

test('the nickname dialog is accessible, and Settings can change the name', async ({ page }) => {
  await page.goto('/settings');
  await press(page.getByTestId('nickname-edit'));
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByTestId('nickname-input').fill('  Ada   L ');
  await press(page.getByTestId('nickname-save'));
  await expect(page.getByTestId('nickname-edit')).toHaveText('Ada L');
  await page.reload();
  await expect(page.getByTestId('nickname-edit')).toHaveText('Ada L');
});
