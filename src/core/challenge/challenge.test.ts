import { describe, expect, it } from 'vitest';
import { challengeUrl, parseChallenge } from './challenge';

const parse = (query: string) => parseChallenge(new URLSearchParams(query));

describe('parseChallenge', () => {
  it('reads a valid challenge', () => {
    expect(parse('seed=12345&beat=40')).toEqual({ seed: 12345, beat: 40 });
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

describe('challengeUrl', () => {
  it('round-trips through parseChallenge', () => {
    const url = new URL(
      challengeUrl('https://example.com', 'prototype', { seed: 4294967295, beat: 7 }),
    );
    expect(url.pathname).toBe('/play/prototype');
    expect(parseChallenge(url.searchParams)).toEqual({ seed: 4294967295, beat: 7 });
  });
});
