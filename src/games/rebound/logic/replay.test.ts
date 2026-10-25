import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { STEP_MS } from './rebound';
import {
  fragileBoundaries,
  nudgeScript,
  playScript,
  scriptInputs,
  type ScriptStep,
} from './replay';

// A runway, a 3-wide spike pit, and the exit beyond it: one jump, nothing to steer after.
const WIDTH = 30;
const row = (inner: string) => `#${inner.padEnd(WIDTH - 2, '.')}#`; // built, not typed: no miscounts
const pit = parseLevel({
  name: 'pit',
  rows: [
    '#'.repeat(WIDTH),
    ...Array<string>(8).fill(row('')),
    row('S........^^^.......o.....E'),
    '#'.repeat(WIDTH),
  ],
});

/** Roll right for `runMs`, then jump and hold right to the end: no input after the jump. */
const leap = (runMs: number): ScriptStep[] => [
  { ms: runMs, move: 1 },
  { ms: 3000, move: 1, jump: true },
];
const clears = (script: ScriptStep[]) => {
  const { state, events } = playScript(pit, script);
  return state.levelCleared && !events.some((e) => e.type === 'died');
};

describe('scriptInputs', () => {
  it('holds each step for its length in whole ticks', () => {
    const inputs = [
      ...scriptInputs([
        { ms: 100, move: 1 },
        { ms: 50, jump: true },
      ]),
    ];
    expect(inputs).toHaveLength(Math.round(100 / STEP_MS) + Math.round(50 / STEP_MS));
    expect(inputs[0]).toEqual({ move: 1, jump: false });
    expect(inputs.at(-1)).toEqual({ move: 0, jump: true });
  });
});

describe('nudgeScript', () => {
  const script: ScriptStep[] = [
    { ms: 500 },
    { ms: 300, jump: true },
    { ms: 400, move: 1 },
    { ms: 200 },
  ];
  const total = (s: ScriptStep[] | null) => (s ?? []).reduce((t, x) => t + x.ms, 0);

  it('moves one input change and keeps every later input on schedule', () => {
    const late = nudgeScript(script, 0, 33);
    expect(late?.map((s) => s.ms)).toEqual([533, 267, 400, 200]);
    expect(total(late)).toBe(total(script));
  });

  it('moves the next input change by the compensation, nothing else', () => {
    expect(nudgeScript(script, 0, 33, -50)?.map((s) => s.ms)).toEqual([533, 217, 450, 200]);
  });

  it('refuses a nudge that would make a step negative', () => {
    expect(nudgeScript(script, 0, -600)).toBeNull();
  });
});

describe('fragileBoundaries', () => {
  // Find the window of take-off times that clear the pit, tick by tick.
  const ticks = Array.from({ length: 120 }, (_, k) => k);
  const ok = ticks.filter((k) => clears(leap(k * STEP_MS)));
  const first = ok[0] ?? -1;
  const last = ok.at(-1) ?? -1;

  it('the test pit has a take-off window several ticks wide', () => {
    expect(last - first).toBeGreaterThan(6);
    expect(ok).toEqual(ticks.slice(first, last + 1)); // one unbroken window
  });

  it('flags a jump pressed at the very edge of its window, even with compensation', () => {
    // Nothing follows the jump, so re-timing a later input cannot save a mistimed press.
    expect(fragileBoundaries(pit, leap(last * STEP_MS))).toContainEqual({
      boundary: 0,
      late: true,
    });
    expect(fragileBoundaries(pit, leap(first * STEP_MS))).toContainEqual({
      boundary: 0,
      late: false,
    });
  });

  it('passes the same jump pressed in the middle of its window', () => {
    expect(fragileBoundaries(pit, leap(((first + last) / 2) * STEP_MS))).toEqual([]);
  });
});
