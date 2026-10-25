import { describe, expect, it } from 'vitest';
import { cleanNickname } from './nickname';

describe('nicknames', () => {
  it('accept 3–12 plain characters, tidying spaces', () => {
    expect(cleanNickname('Ada')).toBe('Ada');
    expect(cleanNickname('  Tunde  K  ')).toBe('Tunde K');
    expect(cleanNickname('x_y.z-9')).toBe('x_y.z-9');
    expect(cleanNickname('TwelveChars1')).toBe('TwelveChars1');
  });

  it('refuse too short, too long, other scripts and symbols', () => {
    for (const bad of ['ab', 'ThirteenChars', 'Аda', 'a<b>c', 'emoji😀', '', 42, null]) {
      expect(cleanNickname(bad), String(bad)).toBeNull();
    }
  });

  it('refuse blocked words, also disguised with digits, symbols and spacing', () => {
    for (const bad of ['shithead', 'Sh1t', 's.h.i.t', 'Admin', '4dm1n', 'n a z i']) {
      expect(cleanNickname(bad), bad).toBeNull();
    }
    expect(cleanNickname('Scunthorpe')).toBeNull(); // the known cost of substring matching
    expect(cleanNickname('Shitake')).toBeNull();
    expect(cleanNickname('Classic')).toBe('Classic');
  });
});
