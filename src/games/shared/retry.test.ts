import { describe, expect, it } from 'vitest';
import { RetryGate } from './retry';

describe('RetryGate', () => {
  it('a finger still down when the run ended does not restart on release', () => {
    const gate = new RetryGate(600);
    gate.end(1000); // the player was dragging when they died
    expect(gate.release()).toBe(false); // …and lifts their thumb two seconds later
  });

  it('a fresh tap after the delay restarts', () => {
    const gate = new RetryGate(600);
    gate.end(1000);
    gate.press(1700);
    expect(gate.release()).toBe(true);
    expect(gate.release()).toBe(false); // once
  });

  it('a tap during the delay does not', () => {
    const gate = new RetryGate(600);
    gate.end(1000);
    gate.press(1200);
    expect(gate.release()).toBe(false);
  });

  it('keys: a fresh press after the delay restarts; auto-repeat from a held key does not', () => {
    const gate = new RetryGate(600);
    gate.end(1000);
    expect(gate.key(1300, false)).toBe(false);
    expect(gate.key(2000, true)).toBe(false);
    expect(gate.key(2000, false)).toBe(true);
  });

  it('nothing restarts before the run has ended', () => {
    const gate = new RetryGate(600);
    gate.press(5000);
    expect(gate.release()).toBe(false);
    expect(gate.key(5000, false)).toBe(false);
  });
});
