// reforms.js — canonical reform library (single source of truth).
//
// These reform definitions are consumed by the intro ladder (IntroLadderRungs.js)
// and, from Project B, the SimplifiedView. The referential-identity test below is
// the guard that keeps them ONE source: if someone re-inlines a rung's params in
// the intro instead of referencing REFORMS, this fails.

import { describe, it, expect } from 'vitest';
import { runSimulation, DEFAULT_CONFIG } from '../src/simulation-engine.js';
import { REFORMS, SIMPLE_REFORM_IDS, MACRO_CONDITIONS, SIMPLE_BASE } from '../src/reforms.js';
import { LADDER_RUNGS } from '../src/pages/IntroLadderRungs.js';

const UI_BASE = { ...DEFAULT_CONFIG, cashFlowMode: 'balanced', geKneeRatio: 3.0, geFloorRatio: 8.0 };
const run = id => runSimulation({ ...UI_BASE, ...REFORMS[id].paramOverrides });

describe('reforms.js — canonical reform library', () => {
  it('exposes the expected reform ids', () => {
    expect(Object.keys(REFORMS).sort()).toEqual(
      ['actuel', 'capi_pur', 'chili', 'chili_finance', 'equilibre2070', 'equinoxe', 'suede']
    );
  });

  it('every reform runs cleanly (70 finite rows)', () => {
    for (const id of Object.keys(REFORMS)) {
      const rows = run(id);
      expect(rows, id).toHaveLength(70);
      for (const r of rows) expect(Number.isFinite(r.D_t), `${id} D_t finite`).toBe(true);
    }
  });

  // Single source of truth: the intro ladder must REFERENCE reforms.js, not copy it.
  it('LADDER_RUNGS sources its params from REFORMS (referential identity)', () => {
    for (const rung of LADDER_RUNGS) {
      expect(REFORMS[rung.id], `REFORMS has ${rung.id}`).toBeDefined();
      expect(rung.paramOverrides, `${rung.id} paramOverrides`).toBe(REFORMS[rung.id].paramOverrides);
      expect(rung.greekCollapse, `${rung.id} greekCollapse`).toBe(REFORMS[rung.id].greekCollapse);
    }
  });

  it('equilibre2070 (parametric balance) clears its debt by 2070', () => {
    const rows = run('equilibre2070');
    const d70 = rows.find(r => r.year === 2070).D_t;
    expect(d70).toBeLessThan(50);                                   // ~self-financing
    expect(Math.max(...rows.map(r => r.D_t))).toBeLessThan(1000);   // modest peak
  });

  it('equilibre2070 uses NO capitalisation and NO budget transfers (parametric only)', () => {
    const p = REFORMS.equilibre2070.paramOverrides;
    expect(p.enableCapi).toBe(false);
    expect(p.fiscalTransferMode).toBe('none');
  });
});

describe('reforms.js — SimplifiedView presentation layer', () => {
  it('exposes exactly the 5 simple-view reforms, in order', () => {
    expect(SIMPLE_REFORM_IDS).toEqual(
      ['actuel', 'equinoxe', 'equilibre2070', 'suede', 'chili_finance']
    );
  });
  it('every simple reform has a lay label and blurb', () => {
    for (const id of SIMPLE_REFORM_IDS) {
      expect(REFORMS[id].label, `${id} label`).toBeTruthy();
      expect(REFORMS[id].blurb, `${id} blurb`).toBeTruthy();
    }
  });
  it('exposes the three macro conditions', () => {
    expect(Object.keys(MACRO_CONDITIONS).sort()).toEqual(['neutre', 'optimiste', 'prudent']);
  });
  it('SIMPLE_BASE layers condition over reform over UI_CONFIG', () => {
    const cfg = SIMPLE_BASE('actuel', 'optimiste');
    expect(cfg.demoProfile).toBeDefined();                      // from UI_CONFIG/reform
    expect(cfg.r_c).toBe(MACRO_CONDITIONS.optimiste.params.r_c); // condition wins
  });
});
