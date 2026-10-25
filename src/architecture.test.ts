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
