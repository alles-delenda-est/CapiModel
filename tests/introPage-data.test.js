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

describe('IntroPage data contract — v1_finance preset (financed base case)', () => {
  // PR B: the intro's "reform that works" base is now the FINANCED transition
  // (v1_finance). The minimal balanced cascade (v1_default) spirals under the
  // INSEE-2026 / COR-RA2026 demographics, so it is the cautionary case, not the
  // base. NOTE: this file still asserts the pre-PR34 KPI-strip/footnote layout;
  // a rewrite against the live LADDER_RUNGS intro is a pending cleanup.
  const params = PRESETS.v1_finance.params;
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

    it('peakDebtYear under v1_finance is 2065', () => {
      expect(kpis.peakDebtYear).toBe(2065);
    });

    it('debtFreeYear (gold ReferenceLine) = 2074 — the financed reform clears its debt', () => {
      expect(kpis.debtFreeYear).toBe(2074);
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

    it('Dette pic ≈ 1 272 Md€ (±0.5 %)', () => {
      expectClose(kpis.peakDebt, 1271.9);
    });

    it('Intérêts cumulés ≈ 1 689 Md€ (±0.5 %)', () => {
      expectClose(kpis.totalInterest, 1689.3);
    });

    it('Pot capi (fin) nominal ≈ 85 592 Md€ (±0.5 %)', () => {
      expectClose(kpis.finalCapi, 85591.5);
    });

    it('Pot capi (fin) real (2027 €) ≈ 21 828 Md€ (±0.5 %)', () => {
      expectClose(kpis.finalCapiReal, 21828.3);
    });

    it('Spread minimum ≈ +3.0 % (sign is OK → is-ok class)', () => {
      expectClose(kpis.minSpread, 0.03, 0.01);
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

    // NB: the no-reform counterfactual is an uncontrolled exponential, so its
    // absolute level is highly sensitive to inputs. The robust guards are the
    // order-of-magnitude invariants below (≫ reform peak; ratio large); this
    // exact pin just tracks the current base.
    it('counterfactual final D_t ≈ 342 256 Md€ (±0.5 %)', () => {
      expectClose(cfFinalDebt, 342255.8);
    });

    it('counterfactual final D_t materially exceeds the reform peak (page narrative)', () => {
      expect(cfFinalDebt).toBeGreaterThan(kpis.peakDebt * 10);
    });

    it('cfRatio (displayed ×N multiplier) ≈ 269', () => {
      expect(cfRatio).toBe(269);
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

    it('v1_finance is the balanced cascade + financed transition (fiscalTransferMode=full)', () => {
      expect(params.cashFlowMode).toBe('balanced');
      expect(params.fiscalTransferMode).toBe('full');
      expect(params.chileMode).toBe(true);
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
