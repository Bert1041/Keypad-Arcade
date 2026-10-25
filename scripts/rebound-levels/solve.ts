/**
 * Finds a solution for a Rebound level by beam search, and records it in solutions.json.
 *
 *   npm run levels:solve -- level04
 *
 * Every 100 ms it tries each input (left / none / right × jump / no jump), keeps the most
 * promising few thousand paths — more collected, closer to the next pickup, alive — and stops
 * at the first path that clears the level having collected everything without dying. Failing
 * to find one is a warning sign about the level, not just the solver.
 *
 * The tests then judge the result (levels.test.ts): finished, everything collected, and every
 * input change survives being ±2 ticks off.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, parseLevel, type LevelDef } from '../../src/games/rebound/logic/level';
import {
  START_LIVES,
  STEP_MS,
  createRebound,
  tick,
  type ReboundInput,
  type ReboundState,
} from '../../src/games/rebound/logic/rebound';
import {
  NUDGE_MS,
  REACTION_MS,
  fragileBoundaries,
  playNudged,
  playScript,
  type ScriptStep,
} from '../../src/games/rebound/logic/replay';

const HERE = dirname(fileURLToPath(import.meta.url));
const key = process.argv[2];
if (!key) throw new Error('usage: npm run levels:solve -- levelNN');
const beamWidth = Number(process.argv.slice(3).find((a) => /^\d+$/.test(a)) ?? 2500);

const DECISION_TICKS = 6; // 100 ms
const MAX_DECISIONS = 900; // 90 s
const ACTIONS: ReboundInput[] = [-1, 0, 1].flatMap((move) =>
  [false, true].map((jump) => ({ move, jump })),
);

const file = (await import(join(HERE, '../../src/games/rebound/levels', `${key}.ts`))) as {
  level: LevelDef;
};
const level = parseLevel(file.level);

const pickups: { x: number; y: number; k: string }[] = [];
let exit = { x: 0, y: 0 };
level.grid.forEach((row, y) =>
  row.forEach((t, x) => {
    if (t === 'o' || t === '*' || t === '+') pickups.push({ x, y, k: `${x},${y}` });
    if (t === 'E') exit = { x, y };
  }),
);

interface Node {
  state: ReboundState;
  actions: number[];
  /** Input changes so far: fewer is more natural, and each change is a chance to be fragile. */
  changes: number;
  /** Jump presses so far. */
  jumps: number;
  /** The state two ticks before this node's decision ended: where an early input change starts. */
  pre: ReboundState;
}

/** Ticks to keep playing a nudged input change, to see whether it survives. */
const SAFETY_TICKS = 30; // 500 ms
const NUDGE_TICKS = 2;

/** Plays `ticks` steps of `first` for `firstTicks`, then `then`; true if the ball survives. */
function survives(from: ReboundState, first: ReboundInput, firstTicks: number, then: ReboundInput) {
  const s = clone(from);
  for (let t = 0; t < SAFETY_TICKS; t++) {
    const events = tick(s, t < firstTicks ? first : then);
    if (events.some((e) => e.type === 'died')) return false;
    if (s.levelCleared) return true;
  }
  return true;
}

/**
 * Score of a path: progress, minus a cost for every input change and more for every jump press,
 * so plain, human-like routes win over hop-spam — each needless input is a place to be fragile.
 */
const CHANGE_COST = 3;
const JUMP_COST = 12;
const score = (n: Node) => heuristic(n.state) - n.changes * CHANGE_COST - n.jumps * JUMP_COST;

const clone = (s: ReboundState): ReboundState => ({
  ...s,
  ball: { ...s.ball },
  collected: new Set(s.collected),
  checkpoint: { ...s.checkpoint },
});

function heuristic(s: ReboundState): number {
  const bx = s.ball.x / TILE;
  const by = s.ball.y / TILE;
  const left = pickups.filter((p) => !s.collected.has(p.k));
  const targets = left.length > 0 ? left : [exit];
  const dist = Math.min(...targets.map((p) => Math.hypot(p.x + 0.5 - bx, p.y + 0.5 - by)));
  return s.collected.size * 1000 - dist * 10 - s.levelMs / 1000;
}

function bucket(s: ReboundState): string {
  const b = s.ball;
  const phase = level.platforms.length > 0 ? `,${Math.floor(s.levelMs / 250)}` : '';
  return `${Math.round(b.x / 4)},${Math.round(b.y / 4)},${Math.round(b.vx / 40)},${Math.round(
    b.vy / 60,
  )},${b.size},${b.grounded},${s.collected.size}${phase}`;
}

const start = createRebound([level]);
let beam: Node[] = [{ state: start, actions: [], changes: 0, jumps: 0, pre: start }];
// Boxed so TypeScript keeps the type across the loop's assignments.
const result: { found: Node | null } = { found: null };
for (let depth = 0; depth < MAX_DECISIONS && !result.found && beam.length > 0; depth++) {
  const next = new Map<string, Node>();
  for (const node of beam) {
    for (let a = 0; a < ACTIONS.length; a++) {
      const state = clone(node.state);
      const input = ACTIONS[a] ?? ACTIONS[0]!;
      let dead = false;
      let pre = state;
      for (let t = 0; t < DECISION_TICKS; t++) {
        if (t === DECISION_TICKS - NUDGE_TICKS) pre = clone(state);
        const events = tick(state, input);
        if (events.some((e) => e.type === 'died')) dead = true;
        if (dead || state.levelCleared) break;
      }
      if (dead || state.lives < START_LIVES) continue;
      const previous = node.actions.at(-1);
      const changed = previous !== undefined && previous !== a;
      if (changed) {
        // Fair to a person: the same change two ticks early or late must not be fatal either.
        const old = ACTIONS[previous] ?? ACTIONS[0]!;
        const early = survives(node.pre, input, SAFETY_TICKS, input);
        const late = survives(node.state, old, NUDGE_TICKS, input);
        if (!early || !late) continue;
      }
      const pressed = input.jump && !(previous !== undefined && ACTIONS[previous]?.jump);
      const child = {
        state,
        actions: [...node.actions, a],
        changes: node.changes + (changed ? 1 : 0),
        jumps: node.jumps + (pressed ? 1 : 0),
        pre,
      };
      if (state.levelCleared) {
        if (state.collected.size === pickups.length) result.found = child;
        continue; // cleared without everything: not a solution
      }
      const k = bucket(state);
      const seen = next.get(k);
      if (!seen || score(child) > score(seen)) next.set(k, child);
    }
    if (result.found) break;
  }
  beam = [...next.values()].sort((a, b) => score(b) - score(a)).slice(0, beamWidth);
  if (depth % 50 === 0 && beam[0]) {
    const s = beam[0].state;
    console.log(
      `t=${depth / 10}s beam=${beam.length} best: collected ${s.collected.size}/${pickups.length} at (${(s.ball.x / TILE).toFixed(1)},${(s.ball.y / TILE).toFixed(1)})`,
    );
  }
}

const found = result.found;
if (!found) {
  console.error(
    `${key}: no solution found (beam ${beamWidth}). Check the level, or widen the beam.`,
  );
  process.exit(1);
}

// Merge repeated actions into steps of whole 100 ms decisions.
const steps: ScriptStep[] = [];
for (const a of found.actions) {
  const input = ACTIONS[a] ?? ACTIONS[0]!;
  const last = steps.at(-1);
  if (last && (last.move ?? 0) === input.move && (last.jump ?? false) === input.jump) {
    last.ms += 100;
  } else {
    steps.push({
      ms: 100,
      ...(input.move ? { move: input.move } : {}),
      ...(input.jump ? { jump: true } : {}),
    });
  }
}

// Repair: the search happily finds knife-edge timing. Slide each fragile input change to where
// it has room either side (smallest shift first), keeping the level finished with everything.
const clears = (solution: ScriptStep[]) => {
  const { state, events } = playScript(level, solution);
  const picked = events.filter((e) => e.type === 'ring' || e.type === 'gem' || e.type === 'life');
  return (
    state.levelCleared && !events.some((e) => e.type === 'died') && picked.length === pickups.length
  );
};
/**
 * Moves the steps after step `i` by `ms`: step i grows by `ms`, the `block` steps after it keep
 * their length (so they start later or earlier), and the step after the block absorbs it.
 * block 0 slides one input change; block 1–2 slide a short move (e.g. "pause, then jump").
 */
const move = (solution: ScriptStep[], i: number, block: number, ms: number) =>
  solution.map((st, j) =>
    j === i ? { ...st, ms: st.ms + ms } : j === i + 1 + block ? { ...st, ms: st.ms - ms } : st,
  );
const candidates = (solution: ScriptStep[], i: number) => {
  const out: ScriptStep[][] = [];
  for (let k = 1; k <= 12; k++) {
    for (const sign of [1, -1]) {
      for (const block of [0, 1, 2]) {
        if (i + 1 + block < solution.length)
          out.push(move(solution, i, block, Math.round(sign * k * STEP_MS)));
      }
    }
  }
  return out; // smallest moves first
};
// --dump: print the raw search result (before repair) as JSON, for debugging a level.
if (process.argv.includes('--dump')) {
  console.log(JSON.stringify(steps));
  process.exit(0);
}
let solution = steps;
for (let round = 0; round < 150; round++) {
  const first = fragileBoundaries(level, solution)[0];
  if (!first) break;
  const i = first.boundary;
  const repaired = candidates(solution, i).find(
    (c) =>
      c.every((st) => st.ms > 0) &&
      clears(c) &&
      !fragileBoundaries(level, c).some((f) => f.boundary === i),
  );
  if (!repaired) {
    const at = solution.slice(0, i + 1).reduce((t, st) => t + st.ms, 0);
    const nudged = playNudged(level, solution, i, first.late ? NUDGE_MS : -NUDGE_MS);
    const deaths = nudged?.events.filter((e) => e.type === 'died').length ?? 0;
    console.error(
      `${key}: input change ${i}->${i + 1} (at ${(at / 1000).toFixed(2)} s) has no safe timing within ±12 ticks.`,
    );
    console.error(
      `  steps ${i - 1}..${i + 3}: ${JSON.stringify(solution.slice(Math.max(0, i - 1), i + 4))}`,
    );
    console.error(
      `  2 ticks ${first.late ? 'late' : 'early'}: ${deaths} death(s) within ${REACTION_MS} ms — make that part more forgiving.`,
    );
    process.exit(1);
  }
  solution = repaired;
}
if (fragileBoundaries(level, solution).length > 0 || !clears(solution)) {
  console.error(`${key}: could not make every input change forgiving.`);
  process.exit(1);
}

const path = join(HERE, 'solutions.json');
const solutions = JSON.parse(readFileSync(path, 'utf8')) as Record<string, ScriptStep[]>;
solutions[key] = solution;
writeFileSync(path, JSON.stringify(solutions));
console.log(
  `${key}: solved in ${(found.state.levelMs / 1000).toFixed(1)} s, ${solution.length} steps, every input change forgiving -> solutions.json (run emit.py)`,
);
