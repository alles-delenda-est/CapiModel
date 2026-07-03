// SimulatorPage data-contract tests.
//
// The SimulatorPage renders five pedagogical "rungs" from LADDER_RUNGS. Each
// rung maps a set of paramOverrides onto the simulation engine. These tests pin
// the key invariants that the page's narrative depends on:
//
//   Rung 1 (Actuel)         — no reform → D_t spirals, no ABM
//   Rung 2 (Équinoxe)       — partial rebalancing → D_t contained but not zero
//   Rung 3 (Suède)          — ABM self-balances PAYG → D_t = 0 throughout
//   Rung 4 (Chili financé)  — funded Chilean transition → D_t peak < 1 500 Md€
//   Rung 5 (Capi pur)       — immediate full capitalisation, no financing → D_t spirals
//
// NOTE: the unfunded "Mode Chilien" rung (formerly rung 4) was removed from the
// intro ladder (PR: fix/intro-chili-tauk). Rung 4 is now the FUNDED transition;
// Rung 5 is the unfinanced pure-capi extreme. REFORMS.chili remains defined.
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
// 5. Rung 4 (Chili financé) vs Rung 5 (Capi pur) — funded vs unfunded extreme
// ---------------------------------------------------------------
describe('SimulatorPage — Rung 4 vs Rung 5: funded Chilean transition vs unfinanced pure capi', () => {
  const rowsFinanced = runsByIdx[3]; // rung 4 — Chili financé (funded: tauK + fiscal)
  const rowsCapiPur  = runsByIdx[4]; // rung 5 — Capi pur (unfinanced extreme)

  it('rung 4 (Chili financé) peak D_t stays below 1 500 Md€ (~137% GDP)', () => {
    const peakFinanced = Math.max(...rowsFinanced.map(r => r.D_t));
    expect(peakFinanced).toBeLessThan(1_500);
  });

  it('rung 5 (Capi pur) peak D_t is substantially higher than rung 4 (unfunded > funded)', () => {
    const peakFinanced = Math.max(...rowsFinanced.map(r => r.D_t));
    const peakCapiPur  = Math.max(...rowsCapiPur.map(r => r.D_t));
    // Pure-capi diverts all contributions without financing legacy pensions —
    // debt grows far beyond the financed case.
    expect(peakCapiPur).toBeGreaterThan(peakFinanced * 10);
  });

  it('neither rung has ABM active (swedenMode off)', () => {
    for (const rows of [rowsFinanced, rowsCapiPur]) {
      const abmYears = rows.filter(r => (r.abmFactor_t ?? 1) < 0.999).length;
      expect(abmYears).toBe(0);
    }
  });
});

// ---------------------------------------------------------------
// 6. Cross-rung ordering — reform reduces debt vs status quo
// ---------------------------------------------------------------
describe('SimulatorPage — cross-rung debt ordering (PR B: financing decides)', () => {
  // Under the INSEE-2026 / COR-RA2026 demographics, financing — not merely
  // "doing a reform" — is what keeps debt below the no-reform path.
  it('well-financed reforms (Équinoxe, Suède, Chili financé) stay below no-reform', () => {
    const peakRef = Math.max(...runsByIdx[0].map(r => r.D_t));
    for (const i of [1, 2, 3]) { // rungs 2, 3, 4 (Équinoxe, Suède, Chili financé)
      const peak = Math.max(...runsByIdx[i].map(r => r.D_t));
      expect(peak, `rung ${i + 1} peak D_t < rung 1`).toBeLessThan(peakRef);
    }
  });

  it('the UNFINANCED pure-capi transition (rung 5) exceeds no-reform — financing is the point', () => {
    const peakRef = Math.max(...runsByIdx[0].map(r => r.D_t));
    const peak5   = Math.max(...runsByIdx[4].map(r => r.D_t));
    // Diverting all contributions to a fund without financing legacy pensions
    // is worse than the status quo — the cautionary lesson rung 5 now shows.
    expect(peak5).toBeGreaterThan(peakRef);
  });
});
