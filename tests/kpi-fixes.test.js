// Regression tests for two extractKPIs defects found by the 2026-07 external
// review (weekend-review findings, CapiModel B7/B8):
//
//   B7 — the real-terms deflator was a dead ternary hardcoded to 2 %
//        (`rows[0].iota === undefined ? 0.02 : 0.02`), so every "real 2027 €"
//        KPI ignored the configured inflation. Rows now carry the configured
//        π and extractKPIs deflates with it.
//
//   B8 — debtFreeYear returned the FIRST year with D_t < 1 after t=5, even
//        when debt exploded afterwards (equinoxeAndLabour: debt-free
//        2033–2040, then spirals to five-digit debt — the KPI said 2034).
//        It now means PERMANENTLY cleared: the year after the last indebted
//        index, null if still indebted at horizon end.

import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/simulation-engine.js';
import { extractKPIs, PRESETS } from '../src/presets.js';

// Minimal synthetic row: extractKPIs only hard-requires D_t/spread_t/CI_t/K_t
// style numeric fields; everything else is `?? 0`-guarded.
function row(t, D_t) {
  return {
    t, year: 2027 + t, D_t, CI_t: 0, K_t: 0, spread_t: 0.02, shortfall_t: 0,
    CK_t: 0, pi: 0.02,
  };
}

describe('B7 — real-terms KPIs use the configured π', () => {
  it('rows carry the configured π', () => {
    const rows = runSimulation({ ...PRESETS.v1_default.params, pi: 0.04 });
    expect(rows[0].pi).toBe(0.04);
  });

  it('finalCapiReal deflates by (1+π)^t at π = 4 %, not 1.02^t', () => {
    const rows = runSimulation({ ...PRESETS.v1_default.params, pi: 0.04 });
    const kpis = extractKPIs(rows);
    const last = rows[rows.length - 1];
    const expected = last.K_t / Math.pow(1.04, last.t);
    expect(Math.abs(kpis.finalCapiReal - expected))
      .toBeLessThanOrEqual(Math.abs(expected) * 1e-9);
    // and it must differ from the old hardcoded-2 % result
    const oldBuggy = last.K_t / Math.pow(1.02, last.t);
    if (last.K_t > 1) {
      expect(Math.abs(kpis.finalCapiReal - oldBuggy))
        .toBeGreaterThan(Math.abs(expected) * 0.01);
    }
  });

  it('default π = 2 % KPIs are unchanged by the fix', () => {
    const rows = runSimulation(PRESETS.v1_default.params);
    const kpis = extractKPIs(rows);
    const last = rows[rows.length - 1];
    const expected = last.K_t / Math.pow(1.02, last.t);
    expect(Math.abs(kpis.finalCapiReal - expected))
      .toBeLessThanOrEqual(Math.abs(expected) * 1e-9);
  });
});

describe('B8 — debtFreeYear means permanently debt-free', () => {
  it('transient zero-debt window followed by renewed debt does not count', () => {
    // debt 2027-2032, clear 2033-2040, indebted again 2041 to horizon end
    const rows = [];
    for (let t = 0; t <= 20; t++) {
      const D = (t <= 5) ? 500 : (t <= 13) ? 0 : 1000 + 100 * t;
      rows.push(row(t, D));
    }
    expect(extractKPIs(rows).debtFreeYear).toBe(null);
  });

  it('permanent clearance reports the year after the last indebted year', () => {
    const rows = [];
    for (let t = 0; t <= 20; t++) rows.push(row(t, t <= 9 ? 800 : 0));
    expect(extractKPIs(rows).debtFreeYear).toBe(2027 + 10);
  });

  it('never indebted -> debt-free from the first year', () => {
    const rows = [];
    for (let t = 0; t <= 20; t++) rows.push(row(t, 0));
    expect(extractKPIs(rows).debtFreeYear).toBe(2027);
  });

  it('equinoxeAndLabour (dips to zero then spirals) is no longer "debt-free 2034"', () => {
    const rows = runSimulation(PRESETS.equinoxeAndLabour.params);
    const kpis = extractKPIs(rows);
    const last = rows[rows.length - 1];
    if (last.D_t >= 1) {
      expect(kpis.debtFreeYear).toBe(null);
    } else {
      // if a future recalibration makes it genuinely solvent, the KPI must
      // then point after the last indebted year
      const lastIndebted = rows.filter(r => r.D_t >= 1).pop();
      expect(kpis.debtFreeYear).toBe(lastIndebted ? lastIndebted.year + 1 : rows[0].year);
    }
  });

  it('v1_finance still reports debt-free 2074 (genuinely permanent clearance)', () => {
    const kpis = extractKPIs(runSimulation(PRESETS.v1_finance.params));
    expect(kpis.debtFreeYear).toBe(2074);
  });
});
