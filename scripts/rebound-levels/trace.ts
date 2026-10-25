/**
 * Prints the ball and moving platforms tick by tick for a scripted run of one level, between two
 * times — for working out why a route dies or a solution is fragile.
 *
 *   npm run levels:trace -- level06 '[{"ms":800,"move":1}, ...]' 5000 8000
 *
 * (`npm run levels:solve -- levelNN --dump` prints the solver's raw route in this format.)
 */
import { TILE, parseLevel } from '../../src/games/rebound/logic/level';
import { createRebound, platformAt, tick } from '../../src/games/rebound/logic/rebound';
import { scriptInputs, type ScriptStep } from '../../src/games/rebound/logic/replay';
const [file, json, from, to] = process.argv.slice(2);
const { level: def } = await import(`../../src/games/rebound/levels/${file}.ts`);
const steps: ScriptStep[] = JSON.parse(json ?? '[]');
const lv = parseLevel(def);
const s = createRebound([lv]);
let t = 0;
for (const input of scriptInputs(steps)) {
  const ev = tick(s, input);
  t += 1000 / 60;
  const plats = lv.platforms
    .map((p) => {
      const b = platformAt(p, s.levelMs);
      return `(${(b.x / TILE).toFixed(1)},${(b.y / TILE).toFixed(1)})`;
    })
    .join(' ');
  if (t >= Number(from) && t <= Number(to))
    console.log(
      `${(t / 1000).toFixed(2)} x=${(s.ball.x / TILE).toFixed(2)} y=${(s.ball.y / TILE).toFixed(2)}${s.ball.grounded ? ' G' : '  '} in:${input.move}${input.jump ? 'J' : ' '} ${plats} ${ev.map((e) => e.type).join(',')}`,
    );
  if (t > Number(to)) break;
}
