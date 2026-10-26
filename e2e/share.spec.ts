import { expect, test, press } from './fixtures';
import { captureShares, playOneRun, shares } from './helpers';

function linkIn(text: string): URL {
  const match = text.match(/https?:\/\/\S+/);
  expect(match, `no link in: ${text}`).toBeTruthy();
  return new URL(match![0]);
}

test('a shared run becomes a challenge that replays the same seed, and passes it on', async ({
  page,
  browser,
}) => {
  await captureShares(page);
  await page.goto('/play/prototype');
  const box = async () => page.locator('canvas').boundingBox();
  const canvasBefore = await (async () => {
    await expect(page.locator('canvas')).toHaveCount(1);
    return box();
  })();

  const score = await playOneRun(page);
  await expect(page.getByTestId('run-status')).toHaveText(`Score ${score}`);
  // The result bar is reserved from the start, so game over must not rescale the game.
  // Phaser only notices its parent resizing on a 500 ms poll — measure after it would have fired.
  await page.waitForTimeout(1_200);
  expect(await box()).toEqual(canvasBefore);

  await press(page.getByTestId('share-button'));
  await expect.poll(async () => (await shares(page)).length).toBe(1);
  const [sent] = await shares(page);
  // Inside the tap, with the card already drawn: Safari refuses a share sheet opened later.
  expect(sent!.duringTap).toBe(true);
  expect(sent!.files).toHaveLength(1);
  expect(sent!.files[0]!.type).toBe('image/png');
  expect(sent!.files[0]!.size).toBeGreaterThan(5_000); // a real rendered card, not an empty canvas
  const link = linkIn(sent!.text);
  expect(link.pathname).toBe('/play/prototype');
  expect(link.searchParams.get('beat')).toBe(String(score));
  const seed = link.searchParams.get('seed');
  expect(seed).toMatch(/^\d+$/);

  // A friend opens the link on their own phone: separate storage, separate best score.
  const friendPhone = await browser.newContext(test.info().project.use);
  const friend = await friendPhone.newPage();
  await captureShares(friend);
  await friend.goto(link.pathname + link.search);
  await expect(friend.getByTestId('run-status')).toHaveText(`Challenge: beat ${score}`);
  const friendScore = await playOneRun(friend);
  await expect(friend.getByTestId('run-status')).toContainText(
    friendScore > score ? `You beat ${score}!` : 'short of the challenge',
  );

  await press(friend.getByTestId('share-button'));
  await expect.poll(async () => (await shares(friend)).length).toBe(1);
  const passedOn = linkIn((await shares(friend))[0]!.text);
  // Same run travels down the chain; only the score to beat changes.
  expect(passedOn.searchParams.get('seed')).toBe(seed);
  expect(passedOn.searchParams.get('beat')).toBe(String(friendScore));
  await friendPhone.close();
});

test('a malformed challenge link still opens a normal game', async ({ page }) => {
  await page.goto('/play/prototype?seed=banana&beat=-4');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('run-status')).toHaveText('');
  const score = await playOneRun(page);
  await expect(page.getByTestId('run-status')).toHaveText(`Score ${score}`);
});

test.describe('without a share sheet', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'clipboard permissions are Chromium-only in Playwright',
  );

  test('the link is copied instead', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      delete (Navigator.prototype as Partial<Navigator>).share;
    });
    await page.goto('/play/prototype');
    const score = await playOneRun(page);
    await press(page.getByTestId('share-button'));
    await expect(page.getByTestId('run-status')).toHaveText('Link copied — paste it in WhatsApp');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(linkIn(copied).searchParams.get('beat')).toBe(String(score));
  });
});

test('with no share sheet and no clipboard (in-app browsers), the message is shown to copy by hand', async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as Partial<Navigator>).share;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
  });
  await page.goto('/play/prototype');
  const score = await playOneRun(page);
  await press(page.getByTestId('share-button'));
  const box = page.getByTestId('manual-share');
  await expect(box).toBeVisible();
  const message = await box.inputValue();
  expect(message).toContain(`I scored ${score}`);
  expect(linkIn(message).searchParams.get('beat')).toBe(String(score));
  await expect(box).toHaveAttribute('readonly', '');
});
