import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/simulation-engine.js';
import { SIMPLE_BASE } from '../src/reforms.js';
import { derivePerRetireePension } from '../src/pension.js';
import { extractSimplifiedKPIs } from '../src/simplified-kpis.js';

const R0 = 18.0;
const runReform = id => runSimulation(SIMPLE_BASE(id, 'neutre'));
const baseline = () => {
  const rows = runReform('actuel');
  return derivePerRetireePension(rows.find(r => r.year === 2027), R0);
};

describe('extractSimplifiedKPIs', () => {
  it('returns the four prices with correct types', () => {
    const rows = runReform('chili_finance');
    const k = extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027: baseline() });
    expect(typeof k.pensionDelta2070).toBe('number');
    expect(typeof k.sacrificesReal).toBe('number');
    expect(typeof k.fondsNet2070).toBe('number');
    expect(k.collapseYear === null || typeof k.collapseYear === 'number').toBe(true);
  });
  it('a solvent reform reports NO collapse (→ "Système sain")', () => {
    const rows = runReform('chili_finance');   // financed, solvent
    const k = extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027: baseline() });
    expect(k.collapseYear).toBeNull();
  });
  it('fondsNet2070 equals K_t − D_t at 2070', () => {
    const rows = runReform('chili_finance');
    const r70 = rows.find(r => r.year === 2070);
    const k = extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027: baseline() });
    expect(k.fondsNet2070).toBeCloseTo(r70.K_t - r70.D_t, 6);
  });
  it('sacrifices are zero when transfers are off (equilibre2070)', () => {
    const rows = runReform('equilibre2070');   // fiscalTransferMode: 'none'
    const k = extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027: baseline() });
    expect(k.sacrificesReal).toBeCloseTo(0, 3);
  });
});
