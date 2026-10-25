import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSfx } from './sfx';

class FakeAudioContext {
  static created = 0;
  state = 'running';
  currentTime = 0;
  destination = {};
  constructor() {
    FakeAudioContext.created++;
  }
  createOscillator() {
    return { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start() {}, stop() {} };
  }
  createGain() {
    const node = {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (n: unknown) => n,
    };
    return node;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('createSfx', () => {
  it('produces no audio at all while sound is disabled', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const osc = vi.spyOn(FakeAudioContext.prototype, 'createOscillator');
    createSfx(() => false).blip(440);
    expect(osc).not.toHaveBeenCalled();
  });

  it('plays when enabled and follows the setting live', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const osc = vi.spyOn(FakeAudioContext.prototype, 'createOscillator');
    let enabled = true;
    const sfx = createSfx(() => enabled);
    sfx.blip(440);
    enabled = false;
    sfx.blip(440);
    expect(osc).toHaveBeenCalledTimes(1);
  });

  it('handles a resume the browser rejects, instead of leaving it unhandled', async () => {
    // Firefox rejects a pending resume() with "Navigated away from page" when the page reloads
    // before audio is allowed; unhandled, that is a console error on every reload.
    vi.resetModules(); // sfx.ts keeps one AudioContext per page; start from a fresh module
    const resume = vi.fn(() =>
      Promise.reject(new DOMException('Navigated away from page', 'InvalidStateError')),
    );
    class Suspended extends FakeAudioContext {
      override state = 'suspended';
      resume = resume;
    }
    vi.stubGlobal('AudioContext', Suspended);
    const { createSfx: fresh } = await import('./sfx');
    const sfx = fresh(() => true);
    sfx.blip(440);
    sfx.blip(440);
    await new Promise((r) => setTimeout(r, 0)); // let the rejection settle (Vitest fails on unhandled ones)
    expect(resume).toHaveBeenCalledTimes(1); // one wake-up attempt at a time, not one per blip
  });
});
