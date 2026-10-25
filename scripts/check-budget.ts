// Fails the build if the first-load JavaScript grows past the budget in PLAN.md §4.
// First load = the entry chunk plus everything it statically imports; lazy game chunks are excluded.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 150;

const html = readFileSync('dist/index.html', 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
if (files.length === 0) throw new Error('check-budget: no scripts found in dist/index.html');

let total = 0;
for (const file of files) {
  const kb = gzipSync(readFileSync(`dist/${file}`)).length / 1024;
  total += kb;
  console.log(`  ${file}  ${kb.toFixed(1)} KB gz`);
}
console.log(`first-load JS: ${total.toFixed(1)} KB gz (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB) {
  console.error('check-budget: over budget');
  process.exit(1);
}
