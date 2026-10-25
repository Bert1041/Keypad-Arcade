import { describe, expect, it } from 'vitest';
import { challengeUrl, dailyPath, parseChallenge } from './challenge';
import { dailySeed } from './daily';

const TODAY = '2026-11-03';
const coil = { id: 'coil', daily: true };
const rebound = { id: 'rebound' };
const parse = (query: string, game: { id: string; daily?: boolean } = coil) =>
  parseChallenge(new URLSearchParams(query), game, TODAY);

describe('parseChallenge: a friend’s run', () => {
  it('reads a valid challenge', () => {
    expect(parse('seed=12345&beat=40')).toEqual({ seed: 12345, beat: 40, daily: null });
  });

  it.each([
    ['missing beat', 'seed=1'],
    ['missing seed', 'beat=1'],
    ['negative', 'seed=-1&beat=3'],
    ['fraction', 'seed=1.5&beat=3'],
    ['seed above 32 bits', 'seed=4294967296&beat=3'],
    ['implausible score', 'seed=1&beat=1000001'],
    ['junk', 'seed=abc&beat=3'],
    ['exponent', 'seed=1e3&beat=3'],
    ['empty', 'seed=&beat='],
  ])('ignores a %s link', (_label, query) => {
    expect(parse(query)).toBeNull();
  });
});

describe('parseChallenge: the daily', () => {
  it('gives today’s run its seed and number', () => {
    expect(parse(`daily=${TODAY}`)).toEqual({
      seed: dailySeed('coil', TODAY),
      beat: null,
      daily: { date: TODAY, number: 9 },
    });
  });

  it('keeps a score to beat when one was shared, and drops a malformed one', () => {
    expect(parse(`daily=${TODAY}&beat=230`)?.beat).toBe(230);
    expect(parse(`daily=${TODAY}&beat=lots`)?.beat).toBeNull();
  });

  it('still opens an earlier day’s daily (an old link in a chat)', () => {
    expect(parse('daily=2026-10-30')?.daily?.number).toBe(5);
  });

  it.each([
    ['a future day', 'daily=2026-11-04'],
    ['a day before Daily #1', 'daily=2026-10-25'],
    ['an impossible date', 'daily=2026-02-30'],
    ['junk', 'daily=today'],
  ])('ignores %s', (_label, query) => {
    expect(parse(query)).toBeNull();
  });

  it('ignores a daily link for a game without dailies', () => {
    expect(parse(`daily=${TODAY}`, rebound)).toBeNull();
  });
});

describe('links', () => {
  it('a friend’s run round-trips through its link', () => {
    const url = new URL(
      challengeUrl('https://example.com', 'coil', { seed: 4294967295, daily: null }, 7),
    );
    expect(url.pathname).toBe('/play/coil');
    expect(parseChallenge(url.searchParams, coil, TODAY)).toEqual({
      seed: 4294967295,
      beat: 7,
      daily: null,
    });
  });

  it('a daily round-trips as the date, not the seed', () => {
    const daily = parse(`daily=${TODAY}`);
    if (!daily) throw new Error('no daily');
    const url = new URL(challengeUrl('https://example.com', 'coil', daily, 230));
    expect(url.searchParams.get('seed')).toBeNull();
    expect(parseChallenge(url.searchParams, coil, TODAY)).toEqual({ ...daily, beat: 230 });
  });

  it('dailyPath opens today’s daily', () => {
    const query = dailyPath('coil', TODAY).split('?')[1] ?? '';
    expect(parse(query)?.daily?.date).toBe(TODAY);
  });
});
