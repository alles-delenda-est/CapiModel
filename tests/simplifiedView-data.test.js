import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/simulation-engine.js';
import { SIMPLE_REFORM_IDS, SIMPLE_BASE } from '../src/reforms.js';
import { derivePerRetireePension } from '../src/pension.js';
import { extractSimplifiedKPIs } from '../src/simplified-kpis.js';

const R0 = 18.0;
const baseline = derivePerRetireePension(
  runSimulation(SIMPLE_BASE('actuel', 'neutre')).find(r => r.year === 2027), R0);

describe('SimplifiedView data contract — 5 reforms × 4 prices', () => {
  it.each(SIMPLE_REFORM_IDS)('%s produces finite, well-typed KPIs', (id) => {
    const rows = runSimulation(SIMPLE_BASE(id, 'neutre'));
    const k = extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027: baseline });
    expect(Number.isFinite(k.pensionDelta2070)).toBe(true);
    expect(Number.isFinite(k.sacrificesReal)).toBe(true);
    expect(Number.isFinite(k.fondsNet2070)).toBe(true);
    expect(k.collapseYear === null || Number.isInteger(k.collapseYear)).toBe(true);
  });

  // Directional invariants — the lay story. (Numeric bands can be tightened to
  // ±0.5 % per reform after visual sign-off, mirroring simulatorPage-data.)
  it('equilibre2070 clears its funded position (fonds net ≈ balanced at 2070)', () => {
    const rows = runSimulation(SIMPLE_BASE('equilibre2070', 'neutre'));
    const k = extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027: baseline });
    expect(k.fondsNet2070).toBeGreaterThan(-60);   // ~self-financing by construction
    expect(k.sacrificesReal).toBeCloseTo(0, 2);     // no transfers by construction
  });
  it('the statu quo with transfers OFF eventually collapses (year present)', () => {
    const rows = runSimulation({ ...SIMPLE_BASE('actuel', 'neutre'), fiscalTransferMode: 'none' });
    const k = extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027: baseline });
    expect(k.collapseYear).not.toBeNull();
  });
});
