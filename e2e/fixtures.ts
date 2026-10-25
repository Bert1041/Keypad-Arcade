import { test as base, expect, type Locator } from '@playwright/test';

/**
 * Every test fails on an uncaught page error or a console error, so a crash that the
 * assertions don't happen to look at still turns the run red.
 */
export const test = base.extend<{ failOnPageErrors: void }>({
  failOnPageErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      context.on('page', (page) => {
        page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
        });
      });
      await use();
      expect(errors, 'the page reported errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Tap on touch devices, click with a mouse — whichever this project's device has. */
export async function press(target: Locator) {
  const hasTouch = await target.page().evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await target.tap();
  else await target.click();
}
