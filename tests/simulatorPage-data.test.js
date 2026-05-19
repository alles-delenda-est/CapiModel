// SimulatorPage data-contract tests.
//
// The SimulatorPage renders five pedagogical "rungs" from LADDER_RUNGS. Each
// rung maps a set of paramOverrides onto the simulation engine. These tests pin
// the key invariants that the page's narrative depends on:
//
//   Rung 1 (Actuel)        — no reform → D_t spirals, no ABM
//   Rung 2 (Équinoxe)      — partial rebalancing → D_t contained but not zero
//   Rung 3 (Suède)         — ABM self-balances PAYG → D_t = 0 throughout
//   Rung 4 (Chili)         — full capitalisation, unfunded transition → large D_t
//   Rung 5 (Chili financé) — funded transition (tauK + fiscal) → D_t peak <<  rung 4
//
// This mirrors what introPage-data.test.js does for the IntroPage preset, but
// covers the five-rung ladder and the swedenMode (PR #30) ABM invariants.
//
// buildParams replicates SimulatorPage.jsx's internal helper exactly (UI_BASE
// + rung.paramOverrides, no conditions overrides, no tweaks — i.e. "neutral").

import { describe, it, expect } from 'vitest';
import { runSimulation, DEFAULT_CONFIG } from '../src/simulation-engine.js';
import { LADDER_RUNGS } from '../src/pages/IntroLadderRungs.js';

// Mirror of SimulatorPage.jsx UI_BASE (lines 29-34).
const UI_BASE = {
  ...DEFAULT_CONFIG,
  cashFlowMode: 'balanced',
  geKneeRatio: 3.0,
  geFloorRatio: 8.0,
};

function buildParams(rungIdx) {
  const rung = LADDER_RUNGS[rungIdx];
  return { ...UI_BASE, ...rung.paramOverrides };
}

// Cache simulation runs — each takes ~200 ms, reuse across tests.
const runsByIdx = LADDER_RUNGS.map((_, i) => runSimulation(buildParams(i)));

// ---------------------------------------------------------------
// 1. Basic contract — all rungs run cleanly and return 70 rows
// ---------------------------------------------------------------
describe('SimulatorPage — LADDER_RUNGS basic contract', () => {
  LADDER_RUNGS.forEach((rung, i) => {
    it(`rung ${rung.num} (${rung.id}) produces 70 rows without error`, () => {
      expect(runsByIdx[i]).toHaveLength(70);
      expect(runsByIdx[i][0].year).toBe(DEFAULT_CONFIG.Y0);
      expect(runsByIdx[i][69].year).toBe(DEFAULT_CONFIG.Y0 + 69);
    });

    it(`rung ${rung.num} (${rung.id}) — D_t is finite and non-negative throughout`, () => {
      for (const row of runsByIdx[i]) {
        expect(Number.isFinite(row.D_t), `D_t finite at t=${row.t}`).toBe(true);
        expect(row.D_t, `D_t ≥ 0 at t=${row.t}`).toBeGreaterThanOrEqual(-1e-6);
      }
    });
  });
});

// ---------------------------------------------------------------
// 2. Rung 1 (Actuel) — status-quo debt spiral
// ---------------------------------------------------------------
describe('SimulatorPage — Rung 1 (Actuel) status-quo debt spiral', () => {
  const rows = runsByIdx[0];

  it('D_t grows substantially (no reform → debt accumulates)', () => {
    const peakD = Math.max(...rows.map(r => r.D_t));
    // Without reform the model accumulates > 5 000 Md€ by end of horizon.
    expect(peakD).toBeGreaterThan(5_000);
  });

  it('ABM never fires in status-quo mode (swedenMode off)', () => {
    const abmYears = rows.filter(r => (r.abmFactor_t ?? 1) < 0.999).length;
    expect(abmYears).toBe(0);
  });

  it('abmCut_t = 0 throughout (no ABM cuts in status-quo)', () => {
    for (const row of rows) {
      expect(row.abmCut_t ?? 0).toBe(0);
    }
  });
});

// ---------------------------------------------------------------
// 3. Rung 2 (Équinoxe) — partial rebalancing reduces D_t vs rung 1
// ---------------------------------------------------------------
describe('SimulatorPage — Rung 2 (Équinoxe) partial rebalancing', () => {
  const rowsRef  = runsByIdx[0]; // rung 1 = reference
  const rows     = runsByIdx[1]; // rung 2 = equinoxe

  it('peak D_t is substantially lower than the status-quo (rung 1)', () => {
    const peakRef = Math.max(...rowsRef.map(r => r.D_t));
    const peakEq  = Math.max(...rows.map(r => r.D_t));
    expect(peakEq).toBeLessThan(peakRef * 0.5);
  });

  it('ABM never fires (swedenMode off)', () => {
    const abmYears = rows.filter(r => (r.abmFactor_t ?? 1) < 0.999).length;
    expect(abmYears).toBe(0);
  });
});

// ---------------------------------------------------------------
// 4. Rung 3 (Suède) — ABM self-balances PAYG, D_t stays at zero
// ---------------------------------------------------------------
describe('SimulatorPage — Rung 3 (Suède) ABM self-balancing invariant', () => {
  const rows = runsByIdx[2];

  it('D_t = 0 throughout the 70-year horizon (ABM prevents any PAYG borrowing)', () => {
    for (const row of rows) {
      expect(row.D_t, `D_t at t=${row.t}`).toBeCloseTo(0, 3);
    }
  });

  it('ABM fires in every year (constant demographic pressure)', () => {
    const abmYears = rows.filter(r => (r.abmFactor_t ?? 1) < 0.999).length;
    expect(abmYears).toBe(70);
  });

  it('abmFactor_t stays within [swedenABMFloor, 1] every year', () => {
    const floor = LADDER_RUNGS[2].paramOverrides.swedenABMFloor ?? 0.5;
    for (const row of rows) {
      expect(row.abmFactor_t, `abmFactor_t at t=${row.t}`).toBeGreaterThanOrEqual(floor - 1e-9);
      expect(row.abmFactor_t, `abmFactor_t ≤ 1 at t=${row.t}`).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('abmCut_t > 0 in every year that ABM fires', () => {
    for (const row of rows) {
      if ((row.abmFactor_t ?? 1) < 0.999) {
        expect(row.abmCut_t, `abmCut_t > 0 at t=${row.t}`).toBeGreaterThan(0);
      }
    }
  });

  it('K_t (PPM funded pillar) grows monotonically through the horizon', () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].K_t, `K_t non-decreasing at t=${rows[i].t}`)
        .toBeGreaterThanOrEqual(rows[i - 1].K_t - 1e-3);
    }
  });

  it('sigma_capi_t = swedenCapiRate / tau_s throughout', () => {
    const params = buildParams(2);
    const expected = params.swedenCapiRate / params.tau_s;
    for (const row of rows) {
      expect(row.sigma_capi_t, `sigma_capi_t at t=${row.t}`).toBeCloseTo(expected, 9);
    }
  });
});

// ---------------------------------------------------------------
// 5. Rung 4 (Chili) vs Rung 5 (Chili financé) — funded vs unfunded
// ---------------------------------------------------------------
describe('SimulatorPage — Rung 4 vs Rung 5: unfunded vs funded Chilean transition', () => {
  const rowsChile    = runsByIdx[3]; // rung 4 — unfunded
  const rowsFinanced = runsByIdx[4]; // rung 5 — funded (tauK + fiscal)

  it('rung 4 peak D_t is substantially higher than rung 5 (unfunded > funded)', () => {
    const peakChile    = Math.max(...rowsChile.map(r => r.D_t));
    const peakFinanced = Math.max(...rowsFinanced.map(r => r.D_t));
    // The whole point of rung 5 is to finance the transition — peak should be <30% of rung 4.
    expect(peakFinanced).toBeLessThan(peakChile * 0.3);
  });

  it('rung 5 (Chili financé) peak D_t stays below 1 500 Md€ (~137% GDP)', () => {
    const peakFinanced = Math.max(...rowsFinanced.map(r => r.D_t));
    expect(peakFinanced).toBeLessThan(1_500);
  });

  it('neither Chilean rung has ABM active (swedenMode off)', () => {
    for (const rows of [rowsChile, rowsFinanced]) {
      const abmYears = rows.filter(r => (r.abmFactor_t ?? 1) < 0.999).length;
      expect(abmYears).toBe(0);
    }
  });
});

// ---------------------------------------------------------------
// 6. Cross-rung ordering — reform reduces debt vs status quo
// ---------------------------------------------------------------
describe('SimulatorPage — cross-rung debt ordering', () => {
  it('all reform rungs (2-5) have lower peak D_t than the status-quo (rung 1)', () => {
    const peakRef = Math.max(...runsByIdx[0].map(r => r.D_t));
    for (let i = 1; i < 5; i++) {
      const peak = Math.max(...runsByIdx[i].map(r => r.D_t));
      expect(peak, `rung ${i + 1} peak D_t < rung 1`).toBeLessThan(peakRef);
    }
  });
});
