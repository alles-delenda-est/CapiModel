// One-off: regenerate the engine regression fixtures after an intentional
// DEFAULT_CONFIG change (PR A: existingDebt 3450 -> 3570). Run from repo root:
//   node scripts/regen-fixtures.mjs
// The configs below MUST mirror tests/engine-reference.test.js exactly.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runSimulation } from '../src/simulation-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = resolve(__dirname, '../tests/fixtures');

const parametric = runSimulation({ demoMode: 'parametric' });
const actuarial  = runSimulation({
  demoMode: 'actuarial',
  demoScenario: 'cor_central',
  mortalityFemaleFraction: 0.52,
});

writeFileSync(resolve(fxDir, 'v1.1-default-trace.json'), JSON.stringify(parametric, null, 2) + '\n');
writeFileSync(resolve(fxDir, 'v2.0-actuarial-cor-central-trace.json'), JSON.stringify(actuarial, null, 2) + '\n');

// Headline diff anchors for human validation.
const p0 = parametric[0], p69 = parametric[69];
console.log('Parametric  t=0 : D_ext_t=%s debtRatio_t=%s r_d_t=%s', p0.D_ext_t, p0.debtRatio_t.toFixed(4), p0.r_d_t);
console.log('Parametric t=69 : D_t=%s debtInterest_t=%s CI_t=%s', p69.D_t.toFixed(1), p69.debtInterest_t.toFixed(2), p69.CI_t.toFixed(1));
console.log('Rows: parametric=%d actuarial=%d', parametric.length, actuarial.length);
