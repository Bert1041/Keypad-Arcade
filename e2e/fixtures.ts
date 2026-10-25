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
        // Where it happened matters: CI annotations are often the only view of a failure
        // (e.g. Firefox, which cannot run on every developer machine).
        page.on('pageerror', (error) =>
          errors.push(`pageerror on ${page.url()}: ${error.message}\n${error.stack ?? ''}`),
        );
        page.on('console', (message) => {
          if (message.type() !== 'error') return;
          const { url, lineNumber, columnNumber } = message.location();
          errors.push(
            `console.error on ${page.url()}: ${message.text()} (from ${url || 'unknown'}:${lineNumber}:${columnNumber})`,
          );
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
