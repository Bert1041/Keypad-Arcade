"""Writes src/games/rebound/levels/levelNN.ts from levels.json (build.py) and solutions.json."""
import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
levels = json.load(open(os.path.join(HERE, 'levels.json')))
out = os.path.join(HERE, '..', '..', 'src', 'games', 'rebound', 'levels')
solutions = json.load(open(os.path.join(HERE, 'solutions.json')))
for key, lv in levels.items():
    rows = ',\n'.join(f"    '{r}'" for r in lv['rows'])
    plats = ''
    if lv['platforms']:
        plats = '\n  platforms: [\n' + ''.join(f"    {{ x: {p['x']}, y: {p['y']}, width: {p['width']}, dx: {p['dx']}, dy: {p['dy']}, periodMs: {p['periodMs']} }},\n" for p in lv['platforms']) + '  ],'
    par = f"\n  parMs: {lv['parMs']}," if lv.get('parMs') else ''
    sol = solutions.get(key, [])
    steps = ''.join('    { ' + ', '.join(f"{k}: {('true' if v is True else 'false' if v is False else v)}" for k, v in s.items()) + ' },\n' for s in sol)
    open(f"{out}/{key}.ts", 'w').write(f"""import type {{ LevelDef }} from '../logic/level';
import type {{ ScriptStep }} from '../logic/replay';

export const level: LevelDef = {{
  name: '{lv['name']}',
  rows: [
{rows},
  ],{plats}{par}
}};

/** A recorded playthrough that finishes the level; the tests replay it. */
export const solution: ScriptStep[] = [
{steps}];
""")
print('emitted', list(levels))
