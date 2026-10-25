import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { games } from '@/games/registry';

// Guard tests: the architecture rules in docs/ARCHITECTURE.md, checked on every run so a
// refactor cannot quietly break them. Each failure says what to do instead.

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const GAMES = join(SRC, 'games');
/** Folders under src/games that are not games. */
const NOT_GAMES = new Set(['shared']);

const rel = (file: string) => relative(ROOT, file).split(sep).join('/');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Source without comments, so documentation that names a banned API is not flagged. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importsOf(file: string): string[] {
  const text = code(file);
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
    (m) => m[1] ?? '',
  );
}

const gameFolders = readdirSync(GAMES).filter(
  (name) => statSync(join(GAMES, name)).isDirectory() && !NOT_GAMES.has(name),
);

describe('game folders', () => {
  it('every game folder is registered under its own name, and every registered game has a folder', () => {
    expect(games.map((g) => g.id).sort()).toEqual([...gameFolders].sort());
  });

  it.each(gameFolders)('%s has its entry point, Phaser factory and design brief', (id) => {
    for (const required of ['index.ts', 'createGame.ts', 'README.md']) {
      expect(
        statSync(join(GAMES, id, required), { throwIfNoEntry: false })?.isFile(),
        required,
      ).toBe(true);
    }
  });

  it.each(gameFolders)('%s registers its Phaser game with the lifecycle counter', (id) => {
    // Without it the e2e tests cannot see a leaked game loop.
    expect(code(join(GAMES, id, 'createGame.ts'))).toMatch(/trackPhaserGame\(/);
  });

  it('game ids are unique', () => {
    const ids = games.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('a game is self-contained', () => {
  // What a game may import from outside its own folder.
  const ALLOWED_OUTSIDE = [/^phaser$/, /^@\/games\/types$/, /^@\/games\/shared\//];

  it.each(gameFolders)('%s imports only its own files, the game contract and Phaser', (id) => {
    const offenders = sourceFiles(join(GAMES, id)).flatMap((file) =>
      importsOf(file)
        .filter((spec) => !spec.startsWith('./') && !spec.startsWith('../'))
        .filter((spec) => !ALLOWED_OUTSIDE.some((pattern) => pattern.test(spec)))
        .map((spec) => `${rel(file)} imports '${spec}' — use GameServices instead`),
    );
    expect(offenders).toEqual([]);
  });

  it.each(gameFolders)('%s never climbs out of its folder with ../', (id) => {
    const folder = join(GAMES, id);
    const offenders = sourceFiles(folder).flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.startsWith('.'))
        .filter((spec) => !join(file, '..', spec).startsWith(folder + sep))
        .map((spec) => `${rel(file)} imports '${spec}'`),
    );
    expect(offenders).toEqual([]);
  });

  it.each(gameFolders)('%s game logic uses only maths every engine computes alike', (id) => {
    // The leaderboard server replays runs in Node; a result one bit different from Safari's
    // rejects an honest score. Use sin/cos from @/games/shared/detMath, and x * x for powers.
    const banned =
      /Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b|\*\*/;
    const logic = ['logic', 'levels'].map((dir) => join(GAMES, id, dir));
    const offenders = logic
      .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => banned.test(code(file)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it.each(gameFolders)('%s uses only the seeded random from beginRun()', (id) => {
    // Any other randomness makes a challenge link replay a different run.
    const banned = /Math\.random\s*\(|crypto\.getRandomValues|crypto\.randomUUID/;
    const offenders = sourceFiles(join(GAMES, id))
      .filter((file) => banned.test(code(file)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe('the shell stays light', () => {
  it('only game code imports Phaser', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.startsWith(GAMES + sep))
      .filter((file) => importsOf(file).includes('phaser'))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('outside its folder, a game is reached only through the registry and its index.ts', () => {
    const registry = join(GAMES, 'registry.ts');
    const offenders = sourceFiles(SRC).flatMap((file) =>
      importsOf(file).flatMap((spec) => {
        const target = spec.startsWith('@/')
          ? join(SRC, spec.slice(2))
          : spec.startsWith('.')
            ? join(file, '..', spec)
            : null;
        const id = gameFolders.find((g) => target?.startsWith(join(GAMES, g)));
        if (!target || !id) return [];
        const gameDir = join(GAMES, id);
        const insideSameGame = file.startsWith(gameDir + sep);
        const registryImportingIndex =
          file === registry &&
          [gameDir, join(gameDir, 'index'), join(gameDir, 'index.ts')].includes(target);
        return insideSameGame || registryImportingIndex ? [] : [`${rel(file)} imports '${spec}'`];
      }),
    );
    expect(offenders).toEqual([]);
  });

  it('only src/core/storage/db.ts talks to the database library', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => importsOf(file).includes('dexie'))
      .map(rel)
      .filter((file) => file !== 'src/core/storage/db.ts');
    expect(offenders).toEqual([]);
  });
});

describe('the leaderboard server stays small and headless', () => {
  it('reaches a game only through its verify.ts, and nothing from the browser app', () => {
    // A function bundles everything it imports: Phaser, React or IndexedDB code would bloat it or
    // crash on the server. Game rules come in through each game's verify.ts.
    const FROM_SRC = [
      /^\.\.\/src\/games\/[a-z-]+\/verify$/,
      /^\.\.\/src\/games\/types$/,
      /^\.\.\/src\/core\/(challenge\/daily|random\/seededRandom)$/,
    ];
    const allowed = (spec: string) =>
      spec.startsWith('../src/')
        ? FROM_SRC.some((pattern) => pattern.test(spec))
        : /^(\.\.?\/|node:|@upstash\/redis$)/.test(spec);
    const offenders = sourceFiles(join(ROOT, 'server'))
      .filter((file) => !file.endsWith('testRedis.ts'))
      .flatMap((file) =>
        importsOf(file)
          .filter((spec) => !allowed(spec))
          .map((spec) => `${rel(file)} imports '${spec}'`),
      );
    expect(offenders).toEqual([]);
  });
});

describe('the shell uses design tokens', () => {
  const TOKENS = join(SRC, 'styles', 'tokens.css');
  const shellFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (path === GAMES) return []; // games keep their own palettes
      if (statSync(path).isDirectory()) return shellFiles(path);
      return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

  it('has no raw colours outside src/styles/tokens.css', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
    const offenders = shellFiles(SRC)
      .filter((file) => file !== TOKENS && raw.test(code(file)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('uses only tokens that exist', () => {
    // CSS ignores an unknown variable silently, so a renamed token would just lose its colour.
    const defined = new Set(
      [...readFileSync(TOKENS, 'utf8').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
    );
    const missing = shellFiles(SRC).flatMap((file) =>
      [...code(file).matchAll(/var\((--[\w-]+)/g)]
        .map((m) => m[1] ?? '')
        .filter((name) => !defined.has(name))
        .map((name) => `${rel(file)} uses ${name}`),
    );
    expect(missing).toEqual([]);
  });
});
