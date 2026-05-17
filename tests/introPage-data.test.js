// IntroPage data-contract tests.
//
// The Direction-D introduction page (src/pages/IntroPage.jsx) renders five
// kinds of live engine output: (1) a read-only knobs sidebar pulling raw
// values from PRESETS.v1_default.params, (2) chart data driven by D_t per
// year, (3) chart reference lines pulled from extractKPIs (peakDebtYear,
// debtFreeYear), (4) a four-cell KPI strip (peakDebt, totalInterest,
// finalCapiReal, minSpread) plus a finalYear sub-label, and (5) a footnote
// computed from a counterfactual run via buildCounterfactualParams.
//
// These tests pin those values so engine drift surfaces here instead of in
// production. Numerical values use a ±0.5 % relative tolerance so minor
// engine refinements don't trip the tests, but any material change does.
//
// They also assert two invariants the page's narrative depends on:
//   - the counterfactual final debt materially exceeds the reform peak
//   - the counterfactual-to-reform ratio is large (the page asserts ×N)

import { describe, it, expect } from 'vitest';
import { runSimulation, buildCounterfactualParams } from '../src/simulation-engine.js';
import { extractKPIs, PRESETS } from '../src/presets.js';

// Mirror the IntroPage's PRESET_DISPLAY (src/pages/IntroPage.jsx, line 19–25).
const KNOB_KEYS = ['cutoffAge', 'r_c', 'w_r', 'rho', 'employmentRateTarget'];

// Relative tolerance helper. Replaces toBeCloseTo, which uses absolute
// digits-after-decimal precision unsuitable for values spanning 1e0–1e6.
function expectClose(actual, expected, relTol = 0.005) {
  const tol = Math.max(Math.abs(expected) * relTol, 1e-9);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe('IntroPage data contract — v1_default preset', () => {
  const params = PRESETS.v1_default.params;
  const results = runSimulation(params);
  const kpis = extractKPIs(results);

  // ---------------------------------------------------------------
  // 1. Knobs sidebar — raw param values the page displays
  // ---------------------------------------------------------------
  describe('Knobs sidebar (cc-knobs)', () => {
    it('lists exactly five knobs in the documented order', () => {
      expect(KNOB_KEYS).toEqual(['cutoffAge', 'r_c', 'w_r', 'rho', 'employmentRateTarget']);
    });

    it('every knob key resolves to a defined number on v1_default.params', () => {
      for (const key of KNOB_KEYS) {
        expect(params[key]).toBeTypeOf('number');
        expect(Number.isFinite(params[key])).toBe(true);
      }
    });

    it('cutoffAge = 50', () => expect(params.cutoffAge).toBe(50));
    it('r_c = 4.5 % real (matches risk-panel prose)', () => {
      expect(params.r_c).toBe(0.045);
    });
    it('w_r = 0.4 % real', () => expect(params.w_r).toBe(0.004));
    it('rho = 5 %/yr (matches HLM risk-panel prose)', () => {
      expect(params.rho).toBe(0.05);
    });
    it('employmentRateTarget = 76 %', () => {
      expect(params.employmentRateTarget).toBe(0.76);
    });
  });

  // ---------------------------------------------------------------
  // 2. Chart data — debt trajectory + reference lines
  // ---------------------------------------------------------------
  describe('Chart (cc-chart-card)', () => {
    it('chartData rows = engine horizon length (N = 70)', () => {
      expect(results.length).toBe(70);
    });

    it('first row year = Y0 = 2027', () => {
      expect(results[0].year).toBe(2027);
    });

    it('last row year = Y0 + N - 1 = 2096', () => {
      expect(results[results.length - 1].year).toBe(2096);
    });

    it('peakDebtYear (red ReferenceLine) lies within [Y0, Y0+N-1]', () => {
      expect(kpis.peakDebtYear).toBeGreaterThanOrEqual(2027);
      expect(kpis.peakDebtYear).toBeLessThanOrEqual(2096);
    });

    it('peakDebtYear under v1_default is 2064', () => {
      expect(kpis.peakDebtYear).toBe(2064);
    });

    it('debtFreeYear (gold ReferenceLine) is null — D_t never clears under v1_default', () => {
      expect(kpis.debtFreeYear).toBeNull();
    });

    it('every chart row has a finite D_t', () => {
      for (const r of results) {
        expect(Number.isFinite(r.D_t)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------
  // 3. KPI strip — four cells + final-year subtitle
  // ---------------------------------------------------------------
  describe('KPI strip (cc-kpi-grid)', () => {
    it('extractKPIs exposes every field the strip reads', () => {
      for (const field of [
        'peakDebt', 'peakDebtYear', 'totalInterest', 'finalCapi',
        'finalCapiReal', 'minSpread',
      ]) {
        expect(kpis[field]).toBeDefined();
        expect(Number.isFinite(kpis[field])).toBe(true);
      }
    });

    it('Dette pic ≈ 7 573 Md€ (±0.5 %)', () => {
      expectClose(kpis.peakDebt, 7572.6);
    });

    it('Intérêts cumulés ≈ 13 874 Md€ (±0.5 %)', () => {
      expectClose(kpis.totalInterest, 13873.6);
    });

    it('Pot capi (fin) nominal ≈ 132 500 Md€ (±0.5 %)', () => {
      expectClose(kpis.finalCapi, 132500.2);
    });

    it('Pot capi (fin) real (2027 €) ≈ 33 791 Md€ (±0.5 %)', () => {
      expectClose(kpis.finalCapiReal, 33791.3);
    });

    it('Spread minimum ≈ +1.51 % (sign is OK → is-ok class)', () => {
      expectClose(kpis.minSpread, 0.01505, 0.01);
      expect(kpis.minSpread).toBeGreaterThan(0);
    });

    it('finalYear subtitle = 2096', () => {
      const finalYear = results[results.length - 1].year;
      expect(finalYear).toBe(2096);
    });

    it('finalCapiReal deflator pins 2027 € basis (π = 2 % constant)', () => {
      // The IntroPage subtitle reads "€ constants 2027". extractKPIs computes
      // finalCapiReal = finalCapi / (1+π)^(N-1). Reproduce here so a change
      // in iota or the deflator basis trips this test.
      const N_minus_1 = results.length - 1; // 69
      const expected = kpis.finalCapi / Math.pow(1.02, N_minus_1);
      expectClose(kpis.finalCapiReal, expected, 1e-6);
    });
  });

  // ---------------------------------------------------------------
  // 4. Counterfactual footnote — buildCounterfactualParams contract
  // ---------------------------------------------------------------
  describe('Counterfactual footnote (cc-chart-footnote)', () => {
    const cfRows = runSimulation(buildCounterfactualParams(params));
    const cfFinalDebt = cfRows[cfRows.length - 1].D_t;
    const cfRatio = Math.round(cfFinalDebt / Math.max(kpis.peakDebt, 1));

    it('counterfactual run yields a finite final D_t', () => {
      expect(Number.isFinite(cfFinalDebt)).toBe(true);
    });

    it('counterfactual final D_t ≈ 710 522 Md€ (±0.5 %)', () => {
      expectClose(cfFinalDebt, 710521.6);
    });

    it('counterfactual final D_t materially exceeds the reform peak (page narrative)', () => {
      expect(cfFinalDebt).toBeGreaterThan(kpis.peakDebt * 10);
    });

    it('cfRatio (displayed ×N multiplier) ≈ 94', () => {
      expect(cfRatio).toBe(94);
    });

    it('cfRatio is large (≥ 50) so the rhetorical footnote stays meaningful', () => {
      expect(cfRatio).toBeGreaterThanOrEqual(50);
    });
  });

  // ---------------------------------------------------------------
  // 5. Invariants the page's framing depends on
  // ---------------------------------------------------------------
  describe('Page-narrative invariants', () => {
    it('peakDebt > 0 (otherwise the "Une bosse, puis une décrue" headline is misleading)', () => {
      expect(kpis.peakDebt).toBeGreaterThan(0);
    });

    it('finalCapiReal > peakDebt (the page implies the reform is solvent net of debt)', () => {
      expect(kpis.finalCapiReal).toBeGreaterThan(kpis.peakDebt);
    });

    it('minSpread is finite (no NaN propagation into the colour-coded KPI)', () => {
      expect(Number.isFinite(kpis.minSpread)).toBe(true);
    });

    it('UI default is the v2.1 balanced cascade with fiscalTransferMode=none', () => {
      expect(params.cashFlowMode).toBe('balanced');
      expect(params.fiscalTransferMode).toBe('none');
      expect(params.geKneeRatio).toBe(3);
      expect(params.geFloorRatio).toBe(8);
    });
  });
});

describe('buildCounterfactualParams — engine contract used by IntroPage', () => {
  it('returns a config that runs without throwing', () => {
    const cf = buildCounterfactualParams(PRESETS.v1_default.params);
    expect(() => runSimulation(cf)).not.toThrow();
  });

  it('counterfactual run produces N rows', () => {
    const cf = buildCounterfactualParams(PRESETS.v1_default.params);
    expect(runSimulation(cf).length).toBe(70);
  });

  it('counterfactual final D_t is catastrophic (≥ 100 000 Md€) — sanity', () => {
    const cf = buildCounterfactualParams(PRESETS.v1_default.params);
    const rows = runSimulation(cf);
    expect(rows[rows.length - 1].D_t).toBeGreaterThan(100_000);
  });

  it('does not mutate the input params object', () => {
    const before = { ...PRESETS.v1_default.params };
    buildCounterfactualParams(PRESETS.v1_default.params);
    for (const key of Object.keys(before)) {
      expect(PRESETS.v1_default.params[key]).toEqual(before[key]);
    }
  });
});
