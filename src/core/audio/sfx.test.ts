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
});
