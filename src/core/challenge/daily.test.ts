import { describe, expect, it } from 'vitest';
import { DAILY_EPOCH, dailyNumber, dailySeed, hasDaily, isDate, utcDate } from './daily';

describe('daily', () => {
  it('uses the UTC date, not the phone’s local one', () => {
    // Run as if in Lagos (UTC+1): 23:30 UTC is already 00:30 tomorrow locally. CI runs in UTC,
    // where a local-date bug would be invisible — so the zone is set here, not assumed.
    const zone = process.env.TZ;
    process.env.TZ = 'Africa/Lagos';
    try {
      expect(new Date('2026-11-02T23:30:00Z').getDate()).toBe(3); // the zone really applies
      expect(utcDate(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-02');
      expect(utcDate(new Date('2026-11-03T00:00:00Z'))).toBe('2026-11-03');
    } finally {
      process.env.TZ = zone;
    }
  });

  it('accepts only real calendar dates', () => {
    expect(isDate('2026-10-26')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-10-6')).toBe(false);
    expect(isDate('yesterday')).toBe(false);
  });

  it('has no daily before Daily #1', () => {
    expect(hasDaily('2026-10-25')).toBe(false);
    expect(hasDaily(DAILY_EPOCH)).toBe(true);
  });

  it('numbers days from the epoch, starting at 1', () => {
    expect(dailyNumber(DAILY_EPOCH)).toBe(1);
    expect(dailyNumber('2026-11-03')).toBe(9);
  });

  // Golden values from an independent FNV-1a implementation. If they change, every daily
  // already played and shared becomes a different run.
  it.each([
    ['coil', '2026-10-26', 3579328423],
    ['star-raid', '2026-10-26', 2985172157],
    ['coil', '2026-10-27', 3562550804],
  ])('the %s daily for %s is seed %i', (game, date, seed) => {
    expect(dailySeed(game, date)).toBe(seed);
  });
});
