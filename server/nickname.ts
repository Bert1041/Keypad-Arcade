/**
 * Nicknames shown on the public boards: 3–12 characters of plain letters, digits, space, _ . -
 * (ASCII only, so no look-alike letters from other scripts), and nothing from a short list of
 * words we will not display — checked after undoing common letter swaps (0→o, 1→i, $→s, …) and
 * ignoring spaces and punctuation, so "B.A.D" and "b4d" read as "bad".
 */

const ALLOWED = /^[A-Za-z0-9 _.-]{3,12}$/;

const SWAPS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
};

// Kept short and generic on purpose; extend from what players actually try.
const BLOCKED = [
  'fuck',
  'shit',
  'cunt',
  'nigg',
  'fag',
  'bitch',
  'whore',
  'slut',
  'rape',
  'nazi',
  'hitler',
  'dick',
  'pussy',
  'penis',
  'vagina',
  'porn',
  'admin',
  'moderator',
];

export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!ALLOWED.test(name)) return null;
  const plain = [...name.toLowerCase()]
    .map((ch) => SWAPS[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
  return BLOCKED.some((word) => plain.includes(word)) ? null : name;
}
