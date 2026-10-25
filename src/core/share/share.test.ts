import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareRun } from './share';

const image = new Blob(['png'], { type: 'image/png' });
const abort = () => new DOMException('cancelled', 'AbortError');

function stubNavigator(nav: Partial<Navigator>) {
  vi.stubGlobal('navigator', nav);
}

afterEach(() => vi.unstubAllGlobals());

describe('shareRun', () => {
  it('shares the image and text when files are supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, canShare: () => true });
    expect(await shareRun({ text: 'hi', image })).toBe('shared');
    expect(share.mock.calls[0]![0].files[0].type).toBe('image/png');
    expect(share.mock.calls[0]![0].text).toBe('hi');
  });

  it('shares text alone when files are not supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, canShare: () => false });
    expect(await shareRun({ text: 'hi', image })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('retries with text when the browser refuses the image it said it could share', async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('nope'))
      .mockResolvedValueOnce(undefined);
    stubNavigator({ share, canShare: () => true });
    expect(await shareRun({ text: 'hi', image })).toBe('shared');
    expect(share).toHaveBeenLastCalledWith({ text: 'hi' });
  });

  it('treats closing the share sheet as a cancel, not a reason to copy', async () => {
    const writeText = vi.fn();
    const share = vi.fn().mockRejectedValue(abort());
    stubNavigator({ share, canShare: () => true, clipboard: { writeText } as never });
    expect(await shareRun({ text: 'hi', image })).toBe('cancelled');
    // Closing the sheet must not reopen it with a text-only retry.
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the text when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } as never });
    expect(await shareRun({ text: 'hi', image })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('reports failure when nothing works', async () => {
    stubNavigator({
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } as never,
    });
    expect(await shareRun({ text: 'hi' })).toBe('failed');
  });
});
