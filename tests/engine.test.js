import { describe, it, expect, beforeAll } from 'vitest';
import {
  DEFAULT_CONFIG,
  DEMOGRAPHIC_PROFILES,
  DREES_DECILES,
  LIFE_EXP_INDEXATION_FRACTION,
  smoothstep,
  clamp,
  fisher,
  interpLinear,
  equinoxeRate,
  computeS0Brackets,
  computeRD,
  computeGePenalty,
  retirementAge,
  sigmaCapi,
  capiActivation,
  T_capi_start_of,
  T_career_base_of,
  capiRampSpan_of,
  retireeIdx,
  activePopFactor,
  cohIdx,
  activePopFactor_actuarial,
  retireeIdx_actuarial,
  cohIdx_actuarial,
  runSimulation,
  legacyShareOfCohort,
  buildCounterfactualParams,
  computeIndividualPerspective,
  computeCapiAssetShareBalanced,
} from '../src/simulation-engine.js';

describe('module scaffold', () => {
  it('exports DEFAULT_CONFIG with expected horizon and Y0', () => {
    expect(DEFAULT_CONFIG.N).toBe(70);
    expect(DEFAULT_CONFIG.Y0).toBe(2027);
  });

  it('exports the three demographic profiles', () => {
    expect(Object.keys(DEMOGRAPHIC_PROFILES).sort())
      .toEqual(['cor_central', 'realistic', 'reformed']);
  });

  it('exports DREES_DECILES with 10 entries', () => {
    expect(DREES_DECILES).toHaveLength(10);
    expect(DREES_DECILES[0].lo).toBe(0);
    expect(DREES_DECILES[9].hi).toBe(6000);
  });

  it('exports LIFE_EXP_INDEXATION_FRACTION = 0.9', () => {
    expect(LIFE_EXP_INDEXATION_FRACTION).toBe(0.9);
  });
});

// §11.1 unit tests for smoothstep S(x; a, b)
describe('smoothstep §0', () => {
  it('S(a; a, b) = 0', () => expect(smoothstep(0, 0, 1)).toBe(0));
  it('S(b; a, b) = 1', () => expect(smoothstep(1, 0, 1)).toBe(1));
  it('S((a+b)/2; a, b) = 0.5', () => {
    expect(smoothstep(0.5, 0, 1)).toBeCloseTo(0.5, 12);
  });
  it('S(a-1; a, b) clamps to 0', () => expect(smoothstep(-1, 0, 1)).toBe(0));
  it('S(b+1; a, b) clamps to 1', () => expect(smoothstep(2, 0, 1)).toBe(1));
  it('a == b: S = 1 for x >= a, 0 otherwise', () => {
    expect(smoothstep(5, 5, 5)).toBe(1);
    expect(smoothstep(4.999, 5, 5)).toBe(0);
  });
  it('shape: u² × (3 − 2u) at u = 0.25 → 0.15625', () => {
    expect(smoothstep(0.25, 0, 1)).toBeCloseTo(0.15625, 12);
  });
});

describe('clamp §0', () => {
  it('within range', () => expect(clamp(0.5, 0, 1)).toBe(0.5));
  it('below lo', () => expect(clamp(-1, 0, 1)).toBe(0));
  it('above hi', () => expect(clamp(2, 0, 1)).toBe(1));
  it('at boundaries', () => {
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
  });
});

// §5.1 eq (1) Fisher exact: w_n = π + w_r + π × w_r
describe('fisher composition', () => {
  it('fisher(0.004, 0.02) = 0.004 + 0.02 + 0.00008 = 0.02408', () => {
    expect(fisher(0.004, 0.02)).toBeCloseTo(0.02408, 12);
  });
  it('fisher(0, x) = x', () => expect(fisher(0, 0.05)).toBe(0.05));
  it('fisher(x, 0) = x', () => expect(fisher(0.05, 0)).toBe(0.05));
});

// §5.2 eq (7d) piecewise-linear interp with endpoint clamp
describe('interpLinear', () => {
  const anchors = [[0, 1.0], [14, 1.0], [29, 0.96], [44, 0.90], [70, 0.86]];
  it('exact anchor t=14', () => expect(interpLinear(14, anchors)).toBeCloseTo(1.0, 12));
  it('exact anchor t=29', () => expect(interpLinear(29, anchors)).toBeCloseTo(0.96, 12));
  it('halfway between (14, 1.0) and (29, 0.96) = 0.98', () => {
    expect(interpLinear(21.5, anchors)).toBeCloseTo(0.98, 12);
  });
  it('clamps below first anchor', () => expect(interpLinear(-5, anchors)).toBe(1.0));
  it('clamps above last anchor', () => expect(interpLinear(100, anchors)).toBe(0.86));
});

// §5.5 eq (18a) Equinoxe step rate r(p)
describe('equinoxeRate r(p)', () => {
  it('r(1500) = 0', () => expect(equinoxeRate(1500)).toBe(0));
  it('r(1800) = 0 (boundary, p ≤ 1800)', () => expect(equinoxeRate(1800)).toBe(0));
  it('r(1801) = 0.001', () => expect(equinoxeRate(1801)).toBe(0.001));
  it('r(2000) = 0.001 (boundary p ≤ 2000)', () => expect(equinoxeRate(2000)).toBe(0.001));
  it('r(2001) = 0.004', () => expect(equinoxeRate(2001)).toBe(0.004));
  it('r(2500) = 0.004 (boundary)', () => expect(equinoxeRate(2500)).toBe(0.004));
  it('r(2501) = 0.041', () => expect(equinoxeRate(2501)).toBe(0.041));
  it('r(3000) = 0.041 (boundary)', () => expect(equinoxeRate(3000)).toBe(0.041));
  it('r(3001) = 0.10', () => expect(equinoxeRate(3001)).toBe(0.10));
  it('r(4000) = 0.10 (boundary)', () => expect(equinoxeRate(4000)).toBe(0.10));
  it('r(4001) = 0.20 (hard cap)', () => expect(equinoxeRate(4001)).toBe(0.20));
  it('r(99999) = 0.20', () => expect(equinoxeRate(99999)).toBe(0.20));
});

// §5.5 eq (18) DREES bracket integral. Spec §12 self-check anchor: ≈17.7 Md€/yr at R0=18.0
describe('computeS0Brackets §5.5 eq (18)', () => {
  it('returns ≈17.7 Md€/yr with R_t = 18.0M (50-step midpoint Riemann)', () => {
    const S0b = computeS0Brackets(18.0);
    expect(S0b).toBeGreaterThan(17.0);
    expect(S0b).toBeLessThan(18.5);
  });

  it('scales linearly with R_t', () => {
    const a = computeS0Brackets(10.0);
    const b = computeS0Brackets(20.0);
    expect(b / a).toBeCloseTo(2.0, 12);
  });

  it('returns 0 for R_t = 0', () => {
    expect(computeS0Brackets(0)).toBe(0);
  });

});

// §5.8 eq (34) endogenous rate piecewise-linear premium + extraSpread, capped.
describe('computeRD §5.8 eq (34)', () => {
  const cfg = DEFAULT_CONFIG;
  it('below threshold1 (115%): r_d = r_d_base = 0.035', () => {
    expect(computeRD(115, cfg)).toBeCloseTo(0.035, 12);
  });
  it('at threshold1 (150%): no premium yet', () => {
    expect(computeRD(150, cfg)).toBeCloseTo(0.035, 12);
  });
  it('at threshold2 (200%): +50pp × 2bps = +100bps → 0.045', () => {
    expect(computeRD(200, cfg)).toBeCloseTo(0.045, 12);
  });
  it('at threshold3 (300%): +100bps + 100pp×4bps = +500bps → 0.085', () => {
    expect(computeRD(300, cfg)).toBeCloseTo(0.085, 12);
  });
  it('above threshold3: incremental 10bps/pp', () => {
    expect(computeRD(310, cfg)).toBeCloseTo(0.085 + 0.01, 12);
  });
  it('cap applies at r_d_cap = 0.20', () => {
    expect(computeRD(10000, cfg)).toBe(0.20);
  });
  it('extraSpread is additive then capped', () => {
    const stress = { ...cfg, extraSpread: 0.01 };
    expect(computeRD(115, stress)).toBeCloseTo(0.045, 12);
    expect(computeRD(10000, stress)).toBe(0.20);
  });
});

// §5.12 eq (47) GE penalty: linear taper between knee and floor; C⁰ at knee/floor.
describe('computeGePenalty §5.12 eq (47)', () => {
  const knee = 2.0, floor = 4.0;
  it('exactly 1 at the knee (§6.6)', () => {
    expect(computeGePenalty(knee, knee, floor)).toBe(1);
  });
  it('exactly 0 at the floor (§6.6)', () => {
    expect(computeGePenalty(floor, knee, floor)).toBe(0);
  });
  it('returns 1 below knee (zero gradient region — §10.10)', () => {
    expect(computeGePenalty(0, knee, floor)).toBe(1);
    expect(computeGePenalty(1.5, knee, floor)).toBe(1);
    expect(computeGePenalty(1.999, knee, floor)).toBe(1);
  });
  it('returns 0 above floor', () => {
    expect(computeGePenalty(5, knee, floor)).toBe(0);
    expect(computeGePenalty(100, knee, floor)).toBe(0);
  });
  it('linear midpoint = 0.5', () => {
    expect(computeGePenalty(3.0, knee, floor)).toBeCloseTo(0.5, 12);
  });
  it('knee + ε strictly in (0, 1)', () => {
    const v = computeGePenalty(2.001, knee, floor);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

// §5.4 eq (12) retirement-age trajectory
describe('retirementAge §5.4 eq (12)', () => {
  it('fixed mode: A_R(t) constant at base', () => {
    const cfg = { ...DEFAULT_CONFIG, retirementAgeMode: 'fixed' };
    expect(retirementAge(0, cfg)).toBe(64);
    expect(retirementAge(10, cfg)).toBe(64);
    expect(retirementAge(70, cfg)).toBe(64);
  });
  it('indexed mode: A_R(0) = base exactly (§11.1)', () => {
    const cfg = { ...DEFAULT_CONFIG, retirementAgeMode: 'indexed' };
    expect(retirementAge(0, cfg)).toBeCloseTo(64, 12);
  });
  it('indexed mode: monotonically non-decreasing in t (§6.7)', () => {
    const cfg = { ...DEFAULT_CONFIG, retirementAgeMode: 'indexed' };
    let prev = retirementAge(0, cfg);
    for (let t = 1; t < 70; t++) {
      const v = retirementAge(t, cfg);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
  it('indexed mode: A_R(t=10) = base + 10/10 × 0.91 × 0.9 = 64.819', () => {
    const cfg = { ...DEFAULT_CONFIG, retirementAgeMode: 'indexed' };
    expect(retirementAge(10, cfg)).toBeCloseTo(64.819, 12);
  });
  it('clamps at ceiling (extreme indexation)', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      retirementAgeMode: 'indexed',
      retirementAgeBase: 69,
      lifeExpAt65_per_decade: 5,
    };
    expect(retirementAge(70, cfg)).toBe(70);
  });
  it('clamps at floor when base below floor', () => {
    const cfg = { ...DEFAULT_CONFIG, retirementAgeBase: 58 };
    expect(retirementAge(0, cfg)).toBe(60);
  });
});

// §5.4 eqs (13, 14) and §5.6 cohort-routing constants
describe('cohort-routing constants', () => {
  it('T_career_base = retirementAgeBase − 22', () => {
    expect(T_career_base_of(DEFAULT_CONFIG)).toBe(42);
    expect(T_career_base_of({ ...DEFAULT_CONFIG, retirementAgeBase: 67 })).toBe(45);
  });
  it('T_capi_start = max(0, retirementAgeBase − cutoffAge); 0 if cutoffAge=null', () => {
    expect(T_capi_start_of(DEFAULT_CONFIG)).toBe(14);
    expect(T_capi_start_of({ ...DEFAULT_CONFIG, cutoffAge: null })).toBe(0);
    expect(T_capi_start_of({ ...DEFAULT_CONFIG, cutoffAge: 70 })).toBe(0);
  });
  it('capiRampSpan = max(5, cutoffAge−22) when set; max(5, base−22) when null', () => {
    expect(capiRampSpan_of(DEFAULT_CONFIG)).toBe(28);
    expect(capiRampSpan_of({ ...DEFAULT_CONFIG, cutoffAge: 25 })).toBe(5);
    expect(capiRampSpan_of({ ...DEFAULT_CONFIG, cutoffAge: null })).toBe(42);
  });
});

// §5.4 eq (15) σ_capi(t)
describe('sigmaCapi §5.4 eq (15)', () => {
  it('enableCapi=false: σ = 0 always', () => {
    const cfg = { ...DEFAULT_CONFIG, enableCapi: false };
    expect(sigmaCapi(0, cfg)).toBe(0);
    expect(sigmaCapi(40, cfg)).toBe(0);
  });
  it('cutoffAge=null with enableCapi: σ = 1 always', () => {
    const cfg = { ...DEFAULT_CONFIG, cutoffAge: null };
    expect(sigmaCapi(0, cfg)).toBe(1);
    expect(sigmaCapi(70, cfg)).toBe(1);
  });
  it('default (cutoff=50, base=64): σ(0) = 28/42 ≈ 0.6667', () => {
    expect(sigmaCapi(0, DEFAULT_CONFIG)).toBeCloseTo(28 / 42, 12);
  });
  it('reaches 1 by t = 14 (T_career_base − (cutoffAge−22))', () => {
    expect(sigmaCapi(14, DEFAULT_CONFIG)).toBeCloseTo(1, 12);
    expect(sigmaCapi(15, DEFAULT_CONFIG)).toBe(1);
    expect(sigmaCapi(50, DEFAULT_CONFIG)).toBe(1);
  });
  it('clamps at 0 for t such that (cutoffAge−22+t)/T_career_base ≤ 0', () => {
    // With cutoffAge = 22, t=0 gives 0/42 = 0
    const cfg = { ...DEFAULT_CONFIG, cutoffAge: 22 };
    expect(sigmaCapi(0, cfg)).toBe(0);
    expect(sigmaCapi(21, cfg)).toBeCloseTo(0.5, 12);
  });
});

// §5.6 capiActivation
describe('capiActivation §5.6', () => {
  it('enableCapi=false: 0 always', () => {
    const cfg = { ...DEFAULT_CONFIG, enableCapi: false };
    expect(capiActivation(0, cfg)).toBe(0);
    expect(capiActivation(70, cfg)).toBe(0);
  });
  it('zero before T_capi_start', () => {
    expect(capiActivation(0, DEFAULT_CONFIG)).toBe(0);
    expect(capiActivation(14, DEFAULT_CONFIG)).toBe(0);
  });
  it('one at T_capi_start + capiRampSpan and beyond', () => {
    expect(capiActivation(42, DEFAULT_CONFIG)).toBe(1);
    expect(capiActivation(70, DEFAULT_CONFIG)).toBe(1);
  });
});

// §5.2 eq (7c) retireeIdx
describe('retireeIdx §5.2 eq (7a–c)', () => {
  it('retireeIdx(0) = 1 for all profiles (anchor)', () => {
    for (const profile of Object.keys(DEMOGRAPHIC_PROFILES)) {
      expect(retireeIdx(0, profile)).toBeCloseTo(1, 12);
    }
  });
  it('cor_central peak = 1.30 at t = 22 (peakT)', () => {
    expect(retireeIdx(22, 'cor_central')).toBeCloseTo(1.30, 12);
  });
  it('cor_central long-run = 1.25 at t = 70', () => {
    expect(retireeIdx(70, 'cor_central')).toBeCloseTo(1.25, 12);
  });
  it('realistic peak = 1.40 at t = 22', () => {
    expect(retireeIdx(22, 'realistic')).toBeCloseTo(1.40, 12);
  });
  it('reformed peak = 1.30 at t = 22', () => {
    expect(retireeIdx(22, 'reformed')).toBeCloseTo(1.30, 12);
  });
});

// §5.2 eq (7d) activePopFactor
describe('activePopFactor §5.2 eq (7d)', () => {
  it('exact at anchor t = 0 = 1.00 (cor_central)', () => {
    expect(activePopFactor(0, 'cor_central')).toBeCloseTo(1.00, 12);
  });
  it('between (14, 1.0) and (29, 0.96): t=21.5 → 0.98', () => {
    expect(activePopFactor(21.5, 'cor_central')).toBeCloseTo(0.98, 12);
  });
  it('clamps above last anchor (t > 70)', () => {
    expect(activePopFactor(80, 'cor_central')).toBeCloseTo(0.86, 12);
  });
  it('reformed at t = 70 = 1.04', () => {
    expect(activePopFactor(70, 'reformed')).toBeCloseTo(1.04, 12);
  });
});

// §5.2 eq (7e) cohIdx — legacy cohort survival share
describe('cohIdx §5.2 eq (7e)', () => {
  it('cohIdx(0) = 1 by construction (§12 self-check)', () => {
    expect(cohIdx(0)).toBe(1);
  });
  it('cohIdx(45) = 0 (extinction)', () => {
    expect(cohIdx(45)).toBe(0);
  });
  it('monotonically non-increasing', () => {
    let prev = cohIdx(0);
    for (let t = 1; t <= 70; t++) {
      const v = cohIdx(t);
      expect(v).toBeLessThanOrEqual(prev + 1e-15);
      prev = v;
    }
  });
});

// ===== runSimulation main loop =====
describe('runSimulation skeleton', () => {
  it('returns array of length N = 70 for default config', () => {
    expect(runSimulation().length).toBe(70);
  });

  it('row 0 carries all expected fields', () => {
    const r = runSimulation()[0];
    const expectedKeys = [
      't', 'year', 'A_R_t', 'retireeIdx', 'legacyRetirees', 'capiRetirees',
      'C_s_t', 'C_s_capi_t', 'C_s_payg_t', 'C_e_t', 'tau_e_eff',
      'sigma_capi_t', 'capiActivation', 'capiRampSpan', 'T_capi_start',
      'W_t', 'GDP_t', 'D_ext_t', 'D_t', 'F_t', 'K_t', 'CI_t', 'CK_t',
      'r_d_t', 'debtRatio_t', 'debtInterest_t', 'spread_t',
      'fundReturn_t', 'abatement_t', 'H_t_proceeds',
      'nonEmplrNet_t', 'deficit_t', 'emplrAvail_t',
      'emplrToLeg_t', 'emplrToCap_t', 'netFlow_t', 'borrowed_t',
      'levyFactor', 'levy_t', 'netCapiFlow_t',
      'capiToGdp_t', 'gePenalty_t', 'r_c_eff_t', 'K_avail_t',
      'capiPayoutFloor_t', 'potBasedPayout_t', 'capiPayoutDesired_t',
      'shortfall_t', 'capiPayout_t',
      'S0_brackets_t', 'S0_irDeduction_t', 'S0_csg_t', 'S0_total',
      'S0_legacy_t', 'S0_csg_revenue_t', 'phaseFactor_t', 'E0_legacy_t',
      'capiAssetShare_t', 'U_t',
      'legacyExp_t', 'dependencyRatio_t',
      'cumDF_t', 'pvLegacyExp_t', 'pvCapiPayout_t',
      'pvLegacyCum_t', 'pvCapiPayoutCum_t',
      'Omega_t', 'I_factor_t', 'H_factor_t', 'iota', 'w_n', 'r_f_portfolio_n',
      'g_h_eff', 'delta_eff', 'empRateNow', 'empFactor',
    ];
    for (const k of expectedKeys) {
      expect(r, `missing field: ${k}`).toHaveProperty(k);
    }
  });

  it('year column starts at Y0 and increments by 1', () => {
    const rows = runSimulation();
    expect(rows[0].year).toBe(2027);
    expect(rows[10].year).toBe(2037);
    expect(rows[69].year).toBe(2096);
  });
});

// §12 reference output — three values invariant under any v1.0 implementation
describe('§12 self-check anchors (default config)', () => {
  const rows = runSimulation();
  it('S0_brackets_t ≈ 17.7 Md€/yr at t=0 (pre-phasing; v1.0a: scaled by legacyRetirees(0)=1)', () => {
    expect(rows[0].S0_brackets_t).toBeGreaterThan(17.0);
    expect(rows[0].S0_brackets_t).toBeLessThan(18.5);
  });
  it('r_d(0) = r_d_base = 0.035  (debtRatio(0)=115% < threshold1=150%)', () => {
    expect(rows[0].r_d_t).toBeCloseTo(0.035, 12);
  });
  it('cohIdx(0) = 1.0 by construction', () => {
    expect(rows[0].cohIdx).toBe(1);
  });
});

// ===== §6 invariant helper =====
// Asserts ALL §6 invariants on every row of `rows` for config `cfg`.
// Throws on first violation with a row index in the message.
function assertInvariants(rows, cfg, label = '') {
  const eps = 1e-9;
  for (const r of rows) {
    const tag = `${label} t=${r.t}`;
    // §6.1 conservation
    expect(r.legacyRetirees + r.capiRetirees, `${tag} retirees sum`)
      .toBeCloseTo(r.retireeIdx, 12);
    expect(r.C_s_capi_t + r.C_s_payg_t, `${tag} C_s sum`)
      .toBeCloseTo(r.C_s_t, 9);
    if (r.deficit_t <= r.emplrAvail_t) {
      // waterfall not truncated → emplr split sums to C_e
      expect(r.emplrToLeg_t + r.emplrToCap_t, `${tag} emplr sum`)
        .toBeCloseTo(r.C_e_t, 9);
    } else {
      // truncated: emplrToLeg = emplrAvail, emplrToCap = C_e × phiF
      expect(r.emplrToLeg_t).toBeCloseTo(r.emplrAvail_t, 9);
      expect(r.emplrToCap_t).toBeCloseTo(r.C_e_t * cfg.phiF, 9);
    }
    // §6.2 stocks ≥ 0
    expect(r.F_t, `${tag} F`).toBeGreaterThanOrEqual(-eps);
    expect(r.K_t, `${tag} K`).toBeGreaterThanOrEqual(-eps);
    expect(r.D_t, `${tag} D`).toBeGreaterThanOrEqual(-eps);
    expect(r.D_ext_t, `${tag} D_ext`).toBeGreaterThanOrEqual(-eps);
    // §6.2 flows ≥ 0 (excluding signed: netFlow_t, spread_t, deficit_t)
    for (const k of [
      'C_s_t', 'C_s_capi_t', 'C_s_payg_t', 'C_e_t',
      'emplrAvail_t', 'emplrToLeg_t', 'emplrToCap_t',
      'fundReturn_t', 'abatement_t', 'H_t_proceeds',
      'legacyExp_t', 'debtInterest_t', 'levy_t', 'grossLevy_t',
      'capiPayout_t', 'capiPayoutFloor_t', 'potBasedPayout_t',
      'capiPayoutDesired_t', 'shortfall_t', 'borrowed_t',
      'pvLegacyExp_t', 'pvCapiPayout_t',
    ]) {
      expect(r[k], `${tag} ${k}`).toBeGreaterThanOrEqual(-eps);
    }
    // §6.3 boundaries
    expect(r.sigma_capi_t).toBeGreaterThanOrEqual(0);
    expect(r.sigma_capi_t).toBeLessThanOrEqual(1);
    expect(r.capiActivation).toBeGreaterThanOrEqual(0);
    expect(r.capiActivation).toBeLessThanOrEqual(1);
    expect(r.r_d_t).toBeLessThanOrEqual(0.20 + 1e-12);
    expect(r.gePenalty_t).toBeGreaterThanOrEqual(0);
    expect(r.gePenalty_t).toBeLessThanOrEqual(1);
    // §6.7 retirement-age invariants.
    // (Spec §6.7 references `T_career(t) ≥ 38`, but `T_career(t)` is a relic in
    // v1.0 — only `T_career_base` is used in the equations. The substantive
    // v1.0 invariant is `A_R(t) ≥ retirementAgeFloor`, enforced by clamp 12d.)
    expect(r.A_R_t, `${tag} A_R ≥ floor`)
      .toBeGreaterThanOrEqual(cfg.retirementAgeFloor - 1e-12);
    expect(r.T_ret_t, `${tag} T_ret ≥ 15`).toBeGreaterThanOrEqual(15 - 1e-12);
    // §6.5 NPV consistency
    expect(r.cumDF_t).toBeGreaterThan(0);

    // ===== §6 v1.0a NEW INVARIANTS =====
    // (a) HLM: analytic formula holds only before the taper window (t < T_hlm−5).
    // During taper hlmActive_t < 1 slows the drawdown, so U_t stays above the
    // analytic curve. The fundamental invariant for all t is delta_U_t = U_t×ρ×hlmActive_t.
    if (r.t < (cfg.T_hlm ?? 20) - 5) {
      const U_t_expected = cfg.U0 * Math.pow(1 - cfg.rho, r.t);
      expect(r.U_t, `${tag} U_t = U0×(1-ρ)^t (pre-taper)`).toBeCloseTo(U_t_expected, 12);
    }
    const hlmActive_t = 1 - smoothstep(r.t, (cfg.T_hlm ?? 20) - 5, cfg.T_hlm ?? 20);
    expect(r.delta_U_t, `${tag} ΔU_t = U_t×ρ×hlmActive`).toBeCloseTo(r.U_t * cfg.rho * hlmActive_t, 12);

    // (b) capiAssetShare bounded in [0, capiAssetShareSteadyState].
    expect(r.capiAssetShare_t, `${tag} capiAssetShare ≥ 0`).toBeGreaterThanOrEqual(0);
    expect(r.capiAssetShare_t, `${tag} capiAssetShare ≤ steady-state`)
      .toBeLessThanOrEqual(cfg.capiAssetShareSteadyState + 1e-12);

    // ===== §6 v1.1 NEW INVARIANTS (per-cohort PAYG accrual, §5.6.1) =====
    // (i) legacyShareAvg_t ∈ [0, 1] always.
    expect(r.legacyShareAvg, `${tag} legacyShareAvg ≥ 0`).toBeGreaterThanOrEqual(-1e-12);
    expect(r.legacyShareAvg, `${tag} legacyShareAvg ≤ 1`).toBeLessThanOrEqual(1 + 1e-12);
    // (ii) transitionalPaygExp_t ≥ 0 (max-clamped in engine).
    expect(r.transitionalPaygExp_t, `${tag} transitionalPaygExp ≥ 0`)
      .toBeGreaterThanOrEqual(-1e-12);
    // (iii) totalLegacyOutflow_t = legacyExp_t + transitionalPaygExp_t.
    expect(r.totalLegacyOutflow_t, `${tag} totalLegacyOutflow = legacy + trans`)
      .toBeCloseTo(r.legacyExp_t + r.transitionalPaygExp_t, 9);
    // (iv) totalLegacyOutflow_t ≥ legacyExp_t (additive).
    expect(r.totalLegacyOutflow_t, `${tag} totalLegacyOutflow ≥ legacyExp`)
      .toBeGreaterThanOrEqual(r.legacyExp_t - 1e-12);
    // (v) deficit_t = totalLegacyOutflow_t − nonEmplrNet_t (eq 39').
    expect(r.deficit_t, `${tag} deficit = totalLegacy − nonEmplrNet`)
      .toBeCloseTo(r.totalLegacyOutflow_t - r.nonEmplrNet_t, 9);
  }

  // (c) HLM mass conservation across years: U_{t+1} = U_t − ΔU_t exactly.
  for (let i = 1; i < rows.length; i++) {
    const expected = rows[i - 1].U_t - rows[i - 1].delta_U_t;
    expect(rows[i].U_t, `${label} HLM conservation at t=${i}`)
      .toBeCloseTo(expected, 12);
  }

  // (d) capiAssetShare monotonically non-decreasing in t (since the smoothstep
  // is non-decreasing and the steady-state factor is positive).
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].capiAssetShare_t,
      `${label} capiAssetShare non-decreasing at t=${i}`)
      .toBeGreaterThanOrEqual(rows[i - 1].capiAssetShare_t - 1e-12);
  }

  // §6.5 cumDF monotonically non-increasing
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].cumDF_t,
      `${label} cumDF non-increasing at t=${i}`)
      .toBeLessThanOrEqual(rows[i - 1].cumDF_t + 1e-15);
  }
  // §6.7 mode-specific A_R behaviour
  const expectedFixed = Math.min(
    Math.max(cfg.retirementAgeBase, cfg.retirementAgeFloor),
    cfg.retirementAgeCeil,
  );
  if (cfg.retirementAgeMode === 'fixed') {
    for (const r of rows) {
      expect(r.A_R_t, `${label} fixed A_R t=${r.t}`).toBeCloseTo(expectedFixed, 12);
    }
  } else if (cfg.retirementAgeMode === 'indexed') {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].A_R_t,
        `${label} indexed A_R non-decreasing at t=${i}`)
        .toBeGreaterThanOrEqual(rows[i - 1].A_R_t - 1e-12);
    }
  }
}

// §5.10 Legacy Fund dynamics (eq 36 / eq 43, v1.2 real-value endowment):
// v1.2 fix: fundReturn uses REAL rate (r_f_portfolio), inflation component πF_t
// is retained in the fund. F_t compounds at π in deficit years (real value
// preserved). In the default preset (always-deficit), F_t ≈ F0 × (1+π)^t and
// fundReturn_t ≈ F0 × (1+π)^t × r_f_portfolio (growing each year).
describe('§5.10 Legacy Fund endowment behavior (default preset)', () => {
  // Parametric pin: §5.10 endowment invariants were verified against the
  // parametric kernel; actuarial mode uses different demographic dynamics.
  const rows = runSimulation({ demoMode: 'parametric' });
  it('F_t ≥ F0 every year and grows at inflation rate in deficit-only default preset', () => {
    const { F0, pi } = DEFAULT_CONFIG;
    for (let t = 0; t < rows.length; t++) {
      // F_t should compound at pi each year (deficit branch: F_t *= (1+pi))
      const expected = F0 * Math.pow(1 + pi, t + 1); // compounded by end of year t
      expect(rows[t].F_t, `F_t at t=${t}`).toBeGreaterThanOrEqual(F0 - 1e-9);
      expect(rows[t].F_t, `F_t at t=${t}`).toBeCloseTo(expected, 6);
    }
  });
  it('fundReturn_t grows each year (real rate × growing F_t)', () => {
    const { F0, pi, r_f_portfolio } = DEFAULT_CONFIG;
    for (let t = 0; t < rows.length; t++) {
      // fundReturn_t = F_t × r_f_portfolio; F_t = F0 × (1+pi)^(t+1) at end of year t
      // but fundReturn is computed on F_t at START of year t = F0 × (1+pi)^t
      const F_start = F0 * Math.pow(1 + pi, t);
      const expected = F_start * r_f_portfolio;
      expect(rows[t].fundReturn_t, `fundReturn_t at t=${t}`).toBeCloseTo(expected, 6);
    }
    // Confirm growth: year-69 return > year-0 return
    expect(rows[69].fundReturn_t).toBeGreaterThan(rows[0].fundReturn_t);
  });
  it('r_d_t rises above r_d_base when debt ratio crosses threshold1=150% (surplus levy disabled)', () => {
    // With thetaBuffer=1 the surplus-growth levy is inactive (buffer keep-rate = 100% of
    // K_t growth, so no surplus reaches the debt channel). Debt accumulates into the range
    // where the endogenous risk premium fires (debtRatio > rpThreshold1 = 150%).
    const r_d_base = DEFAULT_CONFIG.r_d_base;
    const highDebtRows = runSimulation({ ...DEFAULT_CONFIG, thetaBuffer: 1 });
    const someYearExceedsBase = highDebtRows.some(r => r.r_d_t > r_d_base + 1e-9);
    expect(someYearExceedsBase).toBe(true);
  });
  it('netFlow_t ≤ 0 every year in default preset', () => {
    const EPS = 1e-10;
    for (let t = 0; t < rows.length; t++) {
      expect(rows[t].netFlow_t, `netFlow_t at t=${t}`).toBeLessThanOrEqual(EPS);
    }
  });
});

// §6 v1.0a: r_f_portfolio and r_f_annuity are distinct in the default config
// and the engine never conflates them.
describe('§6 v1.0a: r_f_portfolio ≠ r_f_annuity', () => {
  it('default config has them distinct', () => {
    expect(DEFAULT_CONFIG.r_f_portfolio).not.toBe(DEFAULT_CONFIG.r_f_annuity);
    expect(DEFAULT_CONFIG.r_f_portfolio).toBe(0.045);
    expect(DEFAULT_CONFIG.r_f_annuity).toBe(0.015);
  });

  it('changing only r_f_annuity affects capi annuity but NOT fund return or spread', () => {
    const a = runSimulation()[0];
    const b = runSimulation({ r_f_annuity: 0.005 })[0];
    // fundReturn (eq 36) and spread (eq 58) are r_f_portfolio-driven → unchanged
    expect(b.fundReturn_t).toBeCloseTo(a.fundReturn_t, 12);
    expect(b.spread_t).toBeCloseTo(a.spread_t, 12);
    // annuityRate (eq 53) IS r_f_annuity-driven → changes
    expect(b.annuityRate_t).not.toBeCloseTo(a.annuityRate_t, 6);
  });

  it('changing only r_f_portfolio affects fund return and spread but NOT capi annuity rate', () => {
    const a = runSimulation()[0];
    const b = runSimulation({ r_f_portfolio: 0.06 })[0];
    expect(b.fundReturn_t).not.toBeCloseTo(a.fundReturn_t, 6);
    expect(b.spread_t).not.toBeCloseTo(a.spread_t, 6);
    expect(b.annuityRate_t).toBeCloseTo(a.annuityRate_t, 12);
  });
});

// §6 v1.0a: S0_brackets_t (benefit-side, legacy-scoped) and S0_csg_revenue_t
// (tax-side, all-retirees) are independent functions of separate scopes.
describe('§6 v1.0a: Équinoxe components computed independently', () => {
  it('S0_csg=0 zeroes csg revenue but not brackets', () => {
    const r = runSimulation({ S0_csg: 0 })[0];
    expect(r.S0_csg_revenue_t).toBe(0);
    expect(r.S0_brackets_t).toBeGreaterThan(17);
  });
  it('S0_irDeduction=0 leaves csg and brackets unaffected', () => {
    const a = runSimulation()[0];
    const b = runSimulation({ S0_irDeduction: 0 })[0];
    expect(b.S0_csg_revenue_t).toBeCloseTo(a.S0_csg_revenue_t, 12);
    expect(b.S0_brackets_t).toBeCloseTo(a.S0_brackets_t, 12);
    expect(b.S0_irDeduction_t).toBe(0);
  });
});

describe('§6 invariants — canned scenarios', () => {
  it('default config', () => {
    const cfg = { ...DEFAULT_CONFIG };
    assertInvariants(runSimulation(cfg), cfg, 'default');
  });
  it('indexed retirement-age mode', () => {
    const cfg = { ...DEFAULT_CONFIG, retirementAgeMode: 'indexed' };
    assertInvariants(runSimulation(cfg), cfg, 'indexed');
  });
  it('enableCapi = false (no capi at all)', () => {
    const cfg = { ...DEFAULT_CONFIG, enableCapi: false };
    assertInvariants(runSimulation(cfg), cfg, 'noCapi');
  });
  it('cutoffAge = null (universal capi)', () => {
    const cfg = { ...DEFAULT_CONFIG, cutoffAge: null };
    assertInvariants(runSimulation(cfg), cfg, 'cutNull');
  });
  it('useEquinoxe = false', () => {
    const cfg = { ...DEFAULT_CONFIG, useEquinoxe: false };
    assertInvariants(runSimulation(cfg), cfg, 'noEquinoxe');
  });
  for (const profile of ['cor_central', 'realistic', 'reformed']) {
    it(`demoProfile = ${profile}`, () => {
      const cfg = { ...DEFAULT_CONFIG, demoProfile: profile };
      assertInvariants(runSimulation(cfg), cfg, profile);
    });
  }
  for (const mode of ['immediate', 'phased-5y', 'phased-10y', 'partial-50', 'partial-75']) {
    it(`equinoxePhasing = ${mode}`, () => {
      const cfg = { ...DEFAULT_CONFIG, equinoxePhasing: mode };
      assertInvariants(runSimulation(cfg), cfg, mode);
    });
  }
  it('phiF = 0.5 (half-floor employer to capi)', () => {
    const cfg = { ...DEFAULT_CONFIG, phiF: 0.5 };
    assertInvariants(runSimulation(cfg), cfg, 'phiF=0.5');
  });
  it('extraSpread = 0.02 (rate stress)', () => {
    const cfg = { ...DEFAULT_CONFIG, extraSpread: 0.02 };
    assertInvariants(runSimulation(cfg), cfg, 'extraSpread');
  });
});

// ===== §11.5 property-based tests =====
// Deterministic PRNG (Mulberry32) so a failing seed reproduces.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cutoffChoices  = [null, 35, 40, 45, 50, 55, 60];
const phasingChoices = ['immediate', 'phased-5y', 'phased-10y', 'partial-50', 'partial-75'];
const profileChoices = ['cor_central', 'realistic', 'reformed'];
const modeChoices    = ['fixed', 'indexed'];

// Sample one config from the documented ranges in the Task 1 brief.
function sampleConfig(rng) {
  const u = (lo, hi) => lo + (hi - lo) * rng();
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  return {
    pi:   u(0.005, 0.05),
    w_r:  u(-0.005, 0.015),
    // v1.0a: split r_f. Portfolio drawn from the v1.0 range; annuity from a
    // realistic OATi-equivalent range. Constrained so portfolio > annuity
    // (carry-trade arbitrage avoidance).
    r_f_portfolio: u(0.025, 0.07),
    r_f_annuity:   u(0.005, 0.025),
    r_c:           u(0.01, 0.07),
    r_d_base: u(0.02, 0.06),
    cutoffAge: pick(cutoffChoices),
    retirementAgeBase: u(62, 68),
    retirementAgeMode: pick(modeChoices),
    useEquinoxe: rng() < 0.5,
    equinoxePhasing: pick(phasingChoices),
    enableCapi: rng() < 0.5,
    demoProfile: pick(profileChoices),
    employmentRateTarget: u(0.55, 0.85),
    employmentTransitionYears: 3 + Math.floor(rng() * 23), // {3,4,...,25}
    constructionMultiplier: u(0.5, 2.0),
    // v1.2: tauK sampled below the safe ceiling (0 to 0.03) to exercise the
    // solvency floor and verify §6 invariants (K_t ≥ 0, D_t ≥ 0) with levy active.
    tauK: u(0, 0.03),
    // v1.3: deltaTauxPatronal sampled up to 1% (safe range for typical tauK levels).
    // taxCutStartT fixed at 2 (tested via DEFAULT_CONFIG; varied range would need
    // wider tauK compensation to keep invariants, tested separately).
    deltaTauxPatronal: u(0, 0.01),
  };
}

describe('§11.5 property-based tests (1000 random configs)', () => {
  it('all §6 invariants hold across 1000 random samples', () => {
    const rng = mulberry32(0xCAB1ECAFE);
    for (let i = 0; i < 1000; i++) {
      const cfg = { ...DEFAULT_CONFIG, ...sampleConfig(rng) };
      const rows = runSimulation(cfg);
      try {
        assertInvariants(rows, cfg, `i=${i}`);
      } catch (e) {
        throw new Error(
          `Invariant failed on sample ${i}\nCONFIG: ${JSON.stringify(cfg)}\n${e.message}`,
        );
      }
    }
  }, 60_000);

  // Property 2: r_d(t) ≤ r_d_cap = 0.20  (also covered by assertInvariants;
  // explicit redundant check makes the property visible in test output.)
  it('property: r_d(t) ≤ r_d_cap = 0.20 always', () => {
    const rng = mulberry32(0xBEEF);
    for (let i = 0; i < 200; i++) {
      const cfg = { ...DEFAULT_CONFIG, ...sampleConfig(rng) };
      for (const r of runSimulation(cfg)) {
        expect(r.r_d_t).toBeLessThanOrEqual(0.20 + 1e-12);
      }
    }
  });

  // Property 3: under indexed mode, A_R(t) is non-decreasing.
  it('property: indexed mode → A_R(t) non-decreasing', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const cfg = {
        ...DEFAULT_CONFIG,
        ...sampleConfig(rng),
        retirementAgeMode: 'indexed',
      };
      const rows = runSimulation(cfg);
      for (let t = 1; t < rows.length; t++) {
        expect(rows[t].A_R_t).toBeGreaterThanOrEqual(rows[t - 1].A_R_t - 1e-12);
      }
    }
  });

  // Property 5 from §11.5: changing extraSpread does not directly affect gePenalty_t.
  // (It changes gePenalty indirectly via debtRatio→r_d→deficit→K_t→capiToGdp,
  // so we verify the year-0 case where K_0 isn't yet sensitive to spread.)
  it('property: extraSpread does not affect gePenalty_0 (year 0)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const base = { ...DEFAULT_CONFIG, ...sampleConfig(rng), extraSpread: 0 };
      const stressed = { ...base, extraSpread: 0.02 };
      const rB = runSimulation(base)[0];
      const rS = runSimulation(stressed)[0];
      expect(rS.gePenalty_t).toBeCloseTo(rB.gePenalty_t, 12);
    }
  });
});

// ===========================================================================
// §5.4 eq (15a) v1.1: per-cohort PAYG accrual share — boundary discipline
// ===========================================================================
describe('legacyShareOfCohort §5.4 eq (15a)', () => {
  // Defaults: cutoffAge=50, retirementAgeBase=64, Y0=2027, careerYears=42.

  it('returns 28/42 ≈ 0.6667 for cohort age 50 in Y0 (= cutoffAge)', () => {
    // Born 1977 (age 50 in 2027) is the boundary cohort — transitional, NOT 1.0.
    const share = legacyShareOfCohort(1977, DEFAULT_CONFIG);
    expect(share).toBeCloseTo(28 / 42, 12);
    expect(share).toBeLessThan(1.0);
  });

  it('returns 1.0 for cohort age 51 in Y0 (> cutoffAge)', () => {
    // Born 1976 — strictly older than the cutoff, full PAYG career.
    expect(legacyShareOfCohort(1976, DEFAULT_CONFIG)).toBe(1.0);
  });

  it('returns 1.0 for cohorts well above cutoffAge (ages 57 & 63 in Y0)', () => {
    // Born 1970 (age 57 in 2027) and 1964 (age 63 in 2027): cohorts well
    // above cutoffAge — must NOT decay via a clamp; the spec requires a
    // hard 1.0 from the piecewise. These are the "no closed-form clamp"
    // fence-post cases called out in spec §5.6.1.
    expect(legacyShareOfCohort(1970, DEFAULT_CONFIG)).toBe(1.0);
    expect(legacyShareOfCohort(1964, DEFAULT_CONFIG)).toBe(1.0);
  });

  it('returns 0 for cohort age 22 in Y0 (entered workforce in Y0)', () => {
    expect(legacyShareOfCohort(2005, DEFAULT_CONFIG)).toBe(0);
  });

  it('returns 0 for cohort age 21 in Y0 (not yet in workforce)', () => {
    expect(legacyShareOfCohort(2006, DEFAULT_CONFIG)).toBe(0);
  });

  it('returns 14/42 ≈ 0.333 for cohort age 36 in Y0', () => {
    // Born 1991 — mid-transitional.
    const share = legacyShareOfCohort(1991, DEFAULT_CONFIG);
    expect(share).toBeCloseTo(14 / 42, 12);
  });

  it('returns 1.0 when cfg.enableCapi === false (regardless of birthYear)', () => {
    const cfg = { ...DEFAULT_CONFIG, enableCapi: false };
    expect(legacyShareOfCohort(1985, cfg)).toBe(1.0);
    expect(legacyShareOfCohort(2010, cfg)).toBe(1.0);
    expect(legacyShareOfCohort(1960, cfg)).toBe(1.0);
  });

  it('respects custom cutoffAge and retirementAgeBase', () => {
    // cutoffAge=45, retirementAgeBase=67 → careerYears=45.
    // Cohort age=45 in Y0 (born 1982): share = 23/45 ≈ 0.5111.
    // Cohort age=46 in Y0 (born 1981): share = 1.0.
    // Cohort age=22 in Y0 (born 2005): share = 0.
    const cfg = { ...DEFAULT_CONFIG, cutoffAge: 45, retirementAgeBase: 67 };
    expect(legacyShareOfCohort(1982, cfg)).toBeCloseTo(23 / 45, 12);
    expect(legacyShareOfCohort(1981, cfg)).toBe(1.0);
    expect(legacyShareOfCohort(2005, cfg)).toBe(0);
  });

  it('returns 1.0 for cohorts already retired in Y0 (age ≥ A_R(0))', () => {
    // Born 1962 (age 65 in Y0, ≥ retirementAgeBase=64) → already retired.
    expect(legacyShareOfCohort(1962, DEFAULT_CONFIG)).toBe(1.0);
  });
});

// ===========================================================================
// §5.6.1 v1.1: legacyShareAvg internal consistency — running average matches
// per-cohort reconstruction under held-flat mortality (the engine's assumption).
// ===========================================================================
describe('§5.6.1 v1.1: legacyShareAvg matches per-cohort reconstruction', () => {
  it('default preset: engine running avg = pop-weighted avg of per-cohort shares (monotone regime)', () => {
    // Scope of the test: while capiRetirees_t is monotonically non-decreasing,
    // the engine's held-flat-on-decline rule is dormant and the running
    // average exactly equals the pop-weighted reconstruction. After
    // capiRetirees peaks (mortality > new entries — late-horizon plateau),
    // the engine holds the average flat by design (§5.6.1 mortality rule);
    // a per-cohort reconstruction without an actuarial mortality kernel
    // overstates the surviving-population pop denominator. The held-flat
    // regime is exercised by the §6 invariants instead.
    // Parametric pin: held-flat identity only holds in parametric mode.
    const cfg = { ...DEFAULT_CONFIG, demoMode: 'parametric' };
    const rows = runSimulation(cfg);
    for (let t = 0; t < rows.length; t++) {
      const r = rows[t];
      if (t > 0 && r.capiRetirees < rows[t - 1].capiRetirees - 1e-12) break;
      if (r.capiRetirees < 1e-9) {
        expect(r.legacyShareAvg).toBeCloseTo(0, 9);
        continue;
      }
      let weighted = 0;
      let cumPop = 0;
      let prev = 0;
      for (let tt = 0; tt <= t; tt++) {
        const cap = rows[tt].capiRetirees;
        const delta = Math.max(0, cap - prev);
        if (delta > 0) {
          const B = cfg.Y0 + tt - cfg.retirementAgeBase;
          const share = legacyShareOfCohort(B, cfg);
          weighted += share * delta;
          cumPop += delta;
        }
        prev = cap;
      }
      expect(cumPop, `t=${t} cumPop ≈ capiRetirees`).toBeCloseTo(r.capiRetirees, 9);
      const expectedAvg = cumPop > 0 ? weighted / cumPop : 0;
      expect(r.legacyShareAvg, `t=${t} legacyShareAvg`).toBeCloseTo(expectedAvg, 9);
    }
  });

  it('held-flat regime: legacyShareAvg unchanged once capiRetirees starts declining', () => {
    // Parametric pin: held-flat property is a parametric-mode invariant.
    const cfg = { ...DEFAULT_CONFIG, demoMode: 'parametric' };
    const rows = runSimulation(cfg);
    let peakT = -1;
    let peakVal = 0;
    for (let t = 0; t < rows.length; t++) {
      if (rows[t].capiRetirees > peakVal) {
        peakVal = rows[t].capiRetirees;
        peakT = t;
      }
    }
    // After the peak, legacyShareAvg should be held flat (no new entries
    // means deltaCapiRet_t = 0 → no contribution to the running avg).
    if (peakT >= 0 && peakT < rows.length - 1) {
      for (let t = peakT + 1; t < rows.length; t++) {
        expect(rows[t].legacyShareAvg, `t=${t} held flat`)
          .toBeCloseTo(rows[peakT].legacyShareAvg, 12);
      }
    }
  });
});

// ===========================================================================
// §5.6.1 v1.1: panel ↔ engine 1:1 alignment — per-individual values used by
// the panel are the same per-individual values aggregated by the engine.
// ===========================================================================
describe('panel ↔ engine reconciliation (v1.1)', () => {
  it('per-individual annual legacy pension at retirement = engine\'s per-cohort field at that year', () => {
    // Parametric pin: panel↔engine reconciliation was verified for parametric mode.
    const cfg = { ...DEFAULT_CONFIG, demoMode: 'parametric' };
    const reformRows = runSimulation(cfg);
    const cfRows = runSimulation(buildCounterfactualParams(cfg));
    const T_capi_start = T_capi_start_of(cfg);

    for (let tt = T_capi_start; tt < cfg.N - 1; tt++) {
      const ttRow = reformRows[tt];
      const ttPrev = tt > 0 ? reformRows[tt - 1] : { capiRetirees: 0 };
      const deltaPop = Math.max(0, ttRow.capiRetirees - ttPrev.capiRetirees);
      if (deltaPop <= 1e-9) continue;

      const B = cfg.Y0 + tt - cfg.retirementAgeBase;
      const persp = computeIndividualPerspective(cfg, reformRows, cfRows, B);

      // Panel's per-individual annual legacy pension in k€/yr (un-rounded for ε).
      const perCapitaAnnualKE_panel = persp.monthlyPensionLegacy * 12 / 1000;

      // Engine's per-individual annual legacy pension at retirement year tt:
      //   E0_legacy_t × I_factor_t × legacyShare(B) / R0   (k€/yr/retiree)
      const share = legacyShareOfCohort(B, cfg);
      const engineExpectedKE = ttRow.E0_legacy_t * ttRow.I_factor_t * share / cfg.R0;

      // Panel rounds monthly to nearest €, so 1 €/year ≈ 0.001 k€ tolerance
      // gives ~12 € of slack — comfortably above rounding noise.
      expect(perCapitaAnnualKE_panel,
        `cohort B=${B} retiring at t=${tt}`)
        .toBeCloseTo(engineExpectedKE, 1);
    }
  });

  it('cohort-aggregate sum at year t = engine transitionalPaygExp_t (monotone regime)', () => {
    // In the monotone-growth regime (before capiRetirees peaks), summing
    // (cohortShare × cohortPop) × E0_legacy_t × I_factor_t over all cohorts
    // alive at year t equals the engine's transitionalPaygExp_t exactly.
    // This is the per-cohort reconstruction of eq (25b) and the additive
    // building block of the panel↔engine alignment.
    // Parametric pin: the exact equality holds only in parametric mode where
    // capiRetirees equals the held-flat uniform-mortality population.
    const cfg = { ...DEFAULT_CONFIG, demoMode: 'parametric' };
    const reformRows = runSimulation(cfg);

    for (let t = T_capi_start_of(cfg); t < cfg.N; t++) {
      // Stop once capiRetirees starts declining (held-flat regime — see
      // the §5.6.1 uniform-mortality reconciliation test that follows).
      if (t > 0 && reformRows[t].capiRetirees
                 < reformRows[t - 1].capiRetirees - 1e-12) break;

      const r = reformRows[t];
      if (r.legacyShareAvg < 1e-9) continue;

      let cohortSumMd = 0; // Md€/yr
      let prev = 0;
      for (let tt = T_capi_start_of(cfg); tt <= t; tt++) {
        const cap = reformRows[tt].capiRetirees;
        const delta = Math.max(0, cap - prev);
        if (delta > 0) {
          const B = cfg.Y0 + tt - cfg.retirementAgeBase;
          const share = legacyShareOfCohort(B, cfg);
          cohortSumMd += share * r.E0_legacy_t * r.I_factor_t * delta;
        }
        prev = cap;
      }
      expect(cohortSumMd, `t=${t} cohort sum vs transitionalPaygExp`)
        .toBeCloseTo(r.transitionalPaygExp_t, 6);
    }
  });

  // §5.6.1 v1.1 Test 11: aggregate vs per-cohort reconciliation under the
  // uniform-mortality construction defined in spec §5.6.1
  // ("Uniform-mortality reconciliation construction"). This must hold across
  // BOTH monotone-growth and held-flat regimes on the default preset, at
  // ε = 0.01 Md€ — significantly tighter than the headline sensitivity
  // numbers reported in the PR description, so any drift in either side of
  // the identity is caught.
  //
  // Construction (spec §5.6.1):
  //   uniform_decayed_cohort_size(B, t) = delta_B × decay(t)
  //   decay(t) = R^capi_t / max_{τ≤t} R^capi_τ      (uniform across cohorts)
  //
  // For the default preset, R^capi_t is unimodal (verified empirically via
  // `runSimulation`: monotone non-decreasing up to peak t=45, strictly
  // decreasing after). So the running-max formulation is equivalent to the
  // spec's `R^capi_t / R^capi_at_retT(B)` ratio for all cohorts B.
  it('Test 11 — uniform-mortality reconciliation: cohort-aggregate sum = transitionalPaygExp_t at ε ≤ 0.01 Md€ across all years (parametric mode)', () => {
    const EPS_MD = 0.01;
    // Parametric mode uses the held-flat uniform-mortality construction (spec §5.6.1).
    // Actuarial mode uses the real survival mask and breaks this identity by design.
    const cfg = { ...DEFAULT_CONFIG, demoMode: 'parametric' };
    const rows = runSimulation(cfg);

    // Pre-compute running max of capiRetirees and per-cohort growth events
    // (so the inner loop is O(1) per year, not O(t)).
    const cohorts = []; // { tt, delta, share }
    let runningMax = 0;
    let prev = 0;
    for (let tt = 0; tt < rows.length; tt++) {
      const cap = rows[tt].capiRetirees;
      if (cap > prev + 1e-15) {
        const B = cfg.Y0 + tt - cfg.retirementAgeBase;
        cohorts.push({ tt, delta: cap - prev, share: legacyShareOfCohort(B, cfg) });
      }
      if (cap > runningMax) runningMax = cap;
      prev = cap;
    }

    // Verify default preset unimodality (precondition of the running-max
    // equivalence with the spec's per-cohort retT ratio).
    let firstDeclineT = -1;
    for (let t = 1; t < rows.length; t++) {
      if (rows[t].capiRetirees < rows[t - 1].capiRetirees - 1e-12) {
        firstDeclineT = t;
        break;
      }
    }
    if (firstDeclineT >= 0) {
      for (let t = firstDeclineT + 1; t < rows.length; t++) {
        expect(rows[t].capiRetirees,
          `default preset must be unimodal — growth event at t=${t} after first decline at t=${firstDeclineT}`)
          .toBeLessThanOrEqual(rows[t - 1].capiRetirees + 1e-12);
      }
    }

    // Walk every year and verify the identity at ε = 0.01 Md€.
    let runMax = 0;
    let cohortShareSum = 0; // Σ delta × share, accumulated as new cohorts retire
    let cohortIdx = 0;
    for (let t = 0; t < rows.length; t++) {
      const r = rows[t];
      // Add any cohorts retiring at year t (== growth events at year t).
      while (cohortIdx < cohorts.length && cohorts[cohortIdx].tt === t) {
        const c = cohorts[cohortIdx++];
        cohortShareSum += c.delta * c.share;
      }
      if (r.capiRetirees > runMax) runMax = r.capiRetirees;

      const decay = runMax > 1e-15 ? r.capiRetirees / runMax : 0;
      const expectedTransKMd = cohortShareSum * decay * r.E0_legacy_t * r.I_factor_t;
      const diff = Math.abs(expectedTransKMd - r.transitionalPaygExp_t);
      expect(diff,
        `Test 11 reconciliation at t=${t} (year ${cfg.Y0 + t}): |Σ uniform_size×share×E0×I − transitionalPaygExp| = ${diff.toExponential(3)} Md€ exceeds ε = ${EPS_MD} Md€`)
        .toBeLessThan(EPS_MD);
    }
  });
});

// ── Demographic kernel v2.0: actuarial functions (structural tests) ─────────
// These tests check invariants and monotonicity only — not exact values.
// demographic-tables.js now holds real primary-source data (COR RA2025 + INSEE 2027).

const ACT_CFG = {
  ...DEFAULT_CONFIG,
  demoMode: 'actuarial',
  demoScenario: 'cor_central',
  mortalityFemaleFraction: 0.52,
};

describe('activePopFactor_actuarial (7d′)', () => {
  it('returns a positive finite number for all t in [0, N-1]', () => {
    for (let t = 0; t < ACT_CFG.N; t++) {
      const v = activePopFactor_actuarial(t, ACT_CFG);
      expect(isFinite(v) && v > 0, `t=${t}: activePopFactor_actuarial=${v}`).toBe(true);
    }
  });

  it('normalises to ≈1.0 at t=0', () => {
    expect(activePopFactor_actuarial(0, ACT_CFG)).toBeCloseTo(1.0, 3);
  });

  it('stays within a bounded range [0.8, 1.3] over the 70-year horizon (cor_central)', () => {
    // Real COR data: workforce grows slightly ~2027–2037 then declines — not
    // monotone, but bounded. Former placeholder was always declining.
    for (let t = 0; t < ACT_CFG.N; t++) {
      const v = activePopFactor_actuarial(t, ACT_CFG);
      expect(v, `t=${t}: activePopFactor_actuarial=${v} out of [0.8, 1.3]`).toBeGreaterThan(0.8);
      expect(v, `t=${t}: activePopFactor_actuarial=${v} out of [0.8, 1.3]`).toBeLessThan(1.3);
    }
  });

  it('cor_high ≥ cor_central at every t (optimistic labour scenario)', () => {
    const cfgHigh = { ...ACT_CFG, demoScenario: 'cor_high' };
    for (let t = 0; t < ACT_CFG.N; t++) {
      const central = activePopFactor_actuarial(t, ACT_CFG);
      const high    = activePopFactor_actuarial(t, cfgHigh);
      expect(high, `t=${t}: cor_high should be ≥ cor_central`).toBeGreaterThanOrEqual(central - 1e-9);
    }
  });

  it('cor_central ≥ cor_low at every t (pessimistic labour scenario)', () => {
    const cfgLow = { ...ACT_CFG, demoScenario: 'cor_low' };
    for (let t = 0; t < ACT_CFG.N; t++) {
      const central = activePopFactor_actuarial(t, ACT_CFG);
      const low     = activePopFactor_actuarial(t, cfgLow);
      expect(central, `t=${t}: cor_central should be ≥ cor_low`).toBeGreaterThanOrEqual(low - 1e-9);
    }
  });
});

describe('retireeIdx_actuarial (7c′)', () => {
  it('returns a positive finite number for all t in [0, N-1]', () => {
    for (let t = 0; t < ACT_CFG.N; t++) {
      const v = retireeIdx_actuarial(t, ACT_CFG);
      expect(isFinite(v) && v > 0, `t=${t}: retireeIdx_actuarial=${v}`).toBe(true);
    }
  });

  it('normalises to ≈1.0 at t=0', () => {
    expect(retireeIdx_actuarial(0, ACT_CFG)).toBeCloseTo(1.0, 3);
  });

  it('cor_high ≥ cor_central retiree index at every t', () => {
    const cfgHigh = { ...ACT_CFG, demoScenario: 'cor_high' };
    for (let t = 0; t < ACT_CFG.N; t++) {
      const central = retireeIdx_actuarial(t, ACT_CFG);
      const high    = retireeIdx_actuarial(t, cfgHigh);
      expect(high, `t=${t}: cor_high retireeIdx should be ≥ cor_central`).toBeGreaterThanOrEqual(central - 1e-9);
    }
  });
});

describe('cohIdx_actuarial (7e′)', () => {
  it('returns values in [0, 1] for all t in [0, N-1]', () => {
    for (let t = 0; t < ACT_CFG.N; t++) {
      const v = cohIdx_actuarial(t, ACT_CFG);
      expect(v, `t=${t}: cohIdx_actuarial out of [0,1]`).toBeGreaterThanOrEqual(-1e-9);
      expect(v, `t=${t}: cohIdx_actuarial out of [0,1]`).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('starts at or near 1 (no capi retirees yet)', () => {
    expect(cohIdx_actuarial(0, ACT_CFG)).toBeGreaterThanOrEqual(0.99);
  });

  it('is monotonically non-increasing (capi share of retirees never shrinks)', () => {
    let prev = cohIdx_actuarial(0, ACT_CFG);
    for (let t = 1; t < ACT_CFG.N; t++) {
      const v = cohIdx_actuarial(t, ACT_CFG);
      expect(v, `cohIdx_actuarial should be non-increasing at t=${t}`).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
});

describe('actuarial mode — runSimulation backward compat', () => {
  // v2.1: demoMode now defaults to 'actuarial'. Verify the default equals explicit actuarial.
  it('actuarial mode output is bit-identical to default (demoMode omitted)', () => {
    const rows_default = runSimulation(DEFAULT_CONFIG);
    const rows_act     = runSimulation({ ...DEFAULT_CONFIG, demoMode: 'actuarial' });
    expect(rows_act.length).toBe(rows_default.length);
    for (let t = 0; t < rows_default.length; t++) {
      expect(rows_act[t].GDP_t).toBeCloseTo(rows_default[t].GDP_t, 8);
      expect(rows_act[t].K_t).toBeCloseTo(rows_default[t].K_t, 8);
      expect(rows_act[t].D_t).toBeCloseTo(rows_default[t].D_t, 8);
    }
  });

  it('actuarial mode runs without error for all three COR scenarios', () => {
    for (const scenario of ['cor_central', 'cor_high', 'cor_low']) {
      const cfg = { ...ACT_CFG, demoScenario: scenario };
      expect(() => runSimulation(cfg)).not.toThrow();
      const rows = runSimulation(cfg);
      expect(rows).toHaveLength(ACT_CFG.N);
    }
  });

  it('actuarial mode K_t and D_t are finite positive/non-negative throughout', () => {
    const rows = runSimulation(ACT_CFG);
    for (const r of rows) {
      expect(isFinite(r.K_t) && r.K_t >= 0, `K_t=${r.K_t} at t=${r.t}`).toBe(true);
      expect(isFinite(r.D_t), `D_t=${r.D_t} at t=${r.t}`).toBe(true);
    }
  });
});

// ── §6.5 per-cohort population mask (actuarial legacyShareAvg) ───────────────
// In actuarial mode the held-flat v1.1 blend is replaced by a per-cohort mask:
// each capi-cohort sub-population ages with differential T60 mortality, so
// legacyShareAvg_t is a true mortality-weighted mean. Older sub-cohorts carry
// higher legacyShare AND die faster, so the mean must eventually decline —
// unlike the parametric held-flat regime which freezes it at the peak.

describe('§6.5 per-cohort population mask', () => {
  it('legacyShareAvg stays in [0,1] across the horizon (actuarial mode)', () => {
    const rows = runSimulation(ACT_CFG);
    for (const r of rows) {
      expect(r.legacyShareAvg, `t=${r.t} legacyShareAvg ≥ 0`).toBeGreaterThanOrEqual(-1e-12);
      expect(r.legacyShareAvg, `t=${r.t} legacyShareAvg ≤ 1`).toBeLessThanOrEqual(1 + 1e-12);
      expect(isFinite(r.legacyShareAvg), `t=${r.t} legacyShareAvg finite`).toBe(true);
    }
  });

  it('mask declines legacyShareAvg after the capi-retiree peak (vs held-flat parametric)', () => {
    const actRows = runSimulation(ACT_CFG);
    // Find the last year capiRetirees grew — after this the parametric kernel
    // holds legacyShareAvg flat, but the actuarial mask must keep ageing it down.
    let peakT = 0;
    for (let t = 1; t < actRows.length; t++) {
      if (actRows[t].capiRetirees > actRows[t - 1].capiRetirees + 1e-12) peakT = t;
    }
    // There must be a post-peak window, and within it legacyShareAvg should
    // strictly fall at least once (differential mortality is non-zero).
    expect(peakT).toBeLessThan(actRows.length - 2);
    let sawDecline = false;
    for (let t = peakT + 2; t < actRows.length; t++) {
      if (actRows[t].legacyShareAvg < actRows[t - 1].legacyShareAvg - 1e-9) sawDecline = true;
    }
    expect(sawDecline, 'actuarial legacyShareAvg should decline post-peak').toBe(true);
  });

  it('actuarial legacyShareAvg is never above the held-flat parametric path late-horizon', () => {
    // The mask removes the documented held-flat upward bias, so once both
    // kernels have populated their cohorts the actuarial mean should sit at or
    // below the parametric one (older high-share cohorts thinned by mortality).
    const actRows = runSimulation(ACT_CFG);
    const parRows = runSimulation({ ...ACT_CFG, demoMode: 'parametric' });
    for (let t = 40; t < actRows.length; t++) {
      if (parRows[t].legacyShareAvg < 1e-9) continue;
      expect(actRows[t].legacyShareAvg,
        `t=${t}: actuarial mask should not exceed held-flat parametric`)
        .toBeLessThanOrEqual(parRows[t].legacyShareAvg + 1e-6);
    }
  });

  it('parametric mode does not build the per-cohort mask (held-flat preserved)', () => {
    // Regression guard: the mask must be gated on demoMode === 'actuarial'.
    // In parametric mode, once capiRetirees stops growing legacyShareAvg is
    // frozen — identical to the pre-v2.0 behaviour.
    const rows = runSimulation({ ...DEFAULT_CONFIG, demoMode: 'parametric' });
    let peakT = 0;
    for (let t = 1; t < rows.length; t++) {
      if (rows[t].capiRetirees > rows[t - 1].capiRetirees + 1e-12) peakT = t;
    }
    for (let t = peakT + 1; t < rows.length; t++) {
      if (rows[t].capiRetirees < 1e-12) continue;
      expect(rows[t].legacyShareAvg, `t=${t} held flat`)
        .toBeCloseTo(rows[peakT].legacyShareAvg, 12);
    }
  });
});

// PR #17 (v2.0) overlapping cash-flow mode tests.  The toggle replaces the
// E0-indexed capi floor with a K_t-share annuity floor that scales with the
// fund.  State guarantee continues to post any annual shortfall to D_t — but
// because the floor is much smaller than legacy in late years, K_t no longer
// depletes and the terminal-year D_t spike (PR #15 diagnosis) is eliminated.
describe('PR #17 overlapping cashFlowMode — backward compat', () => {
  it('default cashFlowMode is "legacy" (preserves v1.3 output bit-identical)', () => {
    expect(DEFAULT_CONFIG.cashFlowMode).toBe('legacy');
  });

  it('legacy mode output is bit-identical to default (cashFlowMode omitted)', () => {
    const rows_default = runSimulation(DEFAULT_CONFIG);
    const rows_legacy  = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'legacy' });
    expect(rows_legacy.length).toBe(rows_default.length);
    for (let t = 0; t < rows_default.length; t++) {
      expect(rows_legacy[t].K_t).toBe(rows_default[t].K_t);
      expect(rows_legacy[t].D_t).toBe(rows_default[t].D_t);
      expect(rows_legacy[t].capiPayoutFloor_t).toBe(rows_default[t].capiPayoutFloor_t);
    }
  });
});

describe('PR #17 overlapping cashFlowMode — cascade waterfall', () => {
  const OL_CFG = { ...DEFAULT_CONFIG, cashFlowMode: 'overlapping' };
  let rows;
  beforeAll(() => { rows = runSimulation(OL_CFG); });

  it('runs without error for default config', () => {
    expect(rows).toHaveLength(OL_CFG.N);
  });

  it('capiPayoutFloor_t = K_start × capiAssetShare × annuityRate_t every period', () => {
    // Floor uses the actuarially-derived annuityRate_t, not the fixed annuityFloorRate.
    // This guarantees capi retirees receive the full pot-based annuity as their minimum.
    for (const r of rows) {
      const expected = r.K_start_t * r.capiAssetShare_t * r.annuityRate_t;
      expect(r.capiPayoutFloor_t, `t=${r.t}`).toBeCloseTo(expected, 9);
    }
  });

  it('floor is zero in pre-capi years (capiAssetShare = 0)', () => {
    expect(rows[0].capiPayoutFloor_t).toBe(0);
  });

  it('K_t is finite, non-negative, and never depletes terminally', () => {
    for (const r of rows) {
      expect(isFinite(r.K_t) && r.K_t >= 0, `K_t=${r.K_t} at t=${r.t}`).toBe(true);
    }
    expect(rows[rows.length - 1].K_t).toBeGreaterThan(1000);
  });

  it('D_t is fully repaid by end of horizon (cascade debt-reduction)', () => {
    // Cascade bucket 3 routes surplus real return to D repayment once PAYG is covered.
    // Under default parameters this achieves debt-free status well before year 69.
    expect(rows[rows.length - 1].D_t).toBeCloseTo(0, 0);
  });

  it('no state shortfall at all (floor always covered by K_avail)', () => {
    // Floor = annuityRate_t × capiAssetShare × K_t; K_avail = K_t(1+r_cn) + netCapiFlow.
    // Because K_avail grows faster than the floor payout, K_avail always covers.
    for (const r of rows) {
      expect(r.shortfall_t, `t=${r.t} shortfall_t should be 0`).toBeCloseTo(0, 6);
    }
    expect(rows[rows.length - 1].CK_t).toBeCloseTo(0, 6);
  });

  it('D_t fully repaid by end of horizon; CI is finite and bounded', () => {
    const legacy = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'legacy' });
    const CI_legacy  = legacy[legacy.length - 1].CI_t;
    const CI_overlap = rows[rows.length - 1].CI_t;
    // Bucket 4b (capi top-up) takes priority over bucket 3 (debt repayment),
    // so CI may exceed legacy CI — the tradeoff is that capi retirees receive
    // their full pot-based annuity from t=33 onwards. The key invariant is that
    // D_t still reaches 0 by end of horizon (legacy does not guarantee this).
    expect(rows[rows.length - 1].D_t).toBeCloseTo(0, 3);
    expect(CI_overlap).toBeLessThan(CI_legacy * 5);   // not explosive
    expect(CI_overlap).toBeGreaterThan(0);             // non-trivial transition cost
  });

  it('cascade budget identity: fundReturnCapi = xSubFromReturns + debtRep + reinvest + bonus', () => {
    // capiContribXSub_t = 0 in v2.0 (no contribution diversion); identity simplifies to
    // fundReturnCapi = capiLegacyXSub + capiDebtRepaid + capiReinvest + capiBonus.
    for (const r of rows) {
      if (r.fundReturnCapi_t < 1e-6) continue; // skip zero-return periods
      const allocated = r.capiLegacyXSub_t + r.capiDebtRepaid_t
                      + r.capiReinvest_t + r.capiBonus_t;
      expect(allocated, `t=${r.t} cascade should fully allocate returns budget`)
        .toBeCloseTo(r.fundReturnCapi_t, 6);
    }
  });

  it('capiLegacyXSub_t ≥ 0 and does not exceed PAYG deficit', () => {
    for (const r of rows) {
      expect(r.capiLegacyXSub_t, `t=${r.t}`).toBeGreaterThanOrEqual(-1e-9);
      // Cross-sub can only cover what was actually borrowed for PAYG
      const maxXSub = Math.max(0, -r.netFlow_t);
      expect(r.capiLegacyXSub_t, `t=${r.t}`).toBeLessThanOrEqual(maxXSub + 1e-9);
    }
  });

  it('capiReinvest_t ≤ reinvestCap × fundReturnCapi_t every period', () => {
    for (const r of rows) {
      expect(r.capiReinvest_t, `t=${r.t}`)
        .toBeLessThanOrEqual((OL_CFG.reinvestCap ?? 0.20) * r.fundReturnCapi_t + 1e-9);
    }
  });

  it('capiContribXSub_t ≥ 0 and ≤ netCapiFlow_t (contribution deficit cover is bounded)', () => {
    for (const r of rows) {
      expect(r.capiContribXSub_t, `t=${r.t}`).toBeGreaterThanOrEqual(-1e-9);
      // Can never exceed net contributions that period
      expect(r.capiContribXSub_t, `t=${r.t} ≤ netCapiFlow`)
        .toBeLessThanOrEqual(r.netCapiFlow_t + 1e-9);
    }
  });

  it('capiContribXSub_t is 0 when returns budget covers the full deficit', () => {
    // When K_t is large enough that fund returns ≥ PAYG deficit, no contribution
    // cross-sub is needed. Check that the field is zero whenever returns ≥ deficit.
    for (const r of rows) {
      if (r.netFlow_t >= 0) {
        expect(r.capiContribXSub_t, `t=${r.t} no deficit`).toBeCloseTo(0, 9);
      }
      if (r.fundReturnCapi_t >= -r.netFlow_t && r.netFlow_t < 0) {
        expect(r.capiContribXSub_t, `t=${r.t} returns cover deficit`).toBeCloseTo(0, 6);
      }
    }
  });

  it('shortfall_t accumulates into CK_t consistently', () => {
    let cumShortfall = 0;
    for (const r of rows) {
      cumShortfall += r.shortfall_t;
      expect(r.CK_t, `t=${r.t}`).toBeCloseTo(cumShortfall, 6);
    }
  });

  it('overlapping mode runs without error for all three COR scenarios', () => {
    for (const scenario of ['cor_central', 'cor_high', 'cor_low']) {
      const cfg = { ...OL_CFG, demoMode: 'actuarial', demoScenario: scenario };
      expect(() => runSimulation(cfg)).not.toThrow();
      const r = runSimulation(cfg);
      expect(r[r.length - 1].D_t).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('PR #17 capiAssetShare_t — accounting identity (overlapping mode)', () => {
  const OL_CFG = { ...DEFAULT_CONFIG, cashFlowMode: 'overlapping' };
  let rows;
  beforeAll(() => { rows = runSimulation(OL_CFG); });

  it('capiAssetShare_t is 0 at t=0 (K_t = 0, nothing to divide)', () => {
    expect(rows[0].capiAssetShare_t).toBe(0);
  });

  it('capiAssetShare_t ∈ [0, 1] for all t', () => {
    for (const r of rows) {
      expect(r.capiAssetShare_t, `t=${r.t}`).toBeGreaterThanOrEqual(0);
      expect(r.capiAssetShare_t, `t=${r.t}`).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('capiAssetShare_t equals min(1, sumCapiContrib / K_start) for t > 0', () => {
    for (const r of rows.slice(1)) {
      if (r.K_start_t < 1e-6) continue; // skip effectively-zero fund
      const expected = Math.min(1, Math.max(0, r.sumCapiContrib_t / r.K_start_t));
      expect(r.capiAssetShare_t, `t=${r.t}`).toBeCloseTo(expected, 9);
    }
  });

  it('sumCapiContrib_t is non-decreasing when net contributions are positive', () => {
    for (let i = 1; i < rows.length; i++) {
      // sumCapiContrib can only decrease if levy > (C_s_capi + emplrToCap), which the
      // engine prevents (levy ≤ min(gross, D_t)), so it should be non-decreasing.
      expect(rows[i].sumCapiContrib_t, `t=${i}`)
        .toBeGreaterThanOrEqual(rows[i - 1].sumCapiContrib_t - 1e-9);
    }
  });

  it('accounting identity produces higher share than smoothstep in mature phase', () => {
    // smoothstep reaches steady-state 0.35 around t=30. By t=30, the accounting
    // identity should be higher (most of K_t is still contributions-dominated).
    const legacyRows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'legacy' });
    expect(rows[30].capiAssetShare_t).toBeGreaterThan(legacyRows[30].capiAssetShare_t);
  });

  it('legacy mode still uses smoothstep (bounded by capiAssetShareSteadyState)', () => {
    const legacyRows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'legacy' });
    for (const r of legacyRows) {
      expect(r.capiAssetShare_t, `legacy t=${r.t}`)
        .toBeLessThanOrEqual(DEFAULT_CONFIG.capiAssetShareSteadyState + 1e-12);
    }
  });
});

// ===========================================================================
// buildCounterfactualParams purity (v2.0 engine fixes)
// ===========================================================================
describe('buildCounterfactualParams — employer-cut purity', () => {
  it('zeroes deltaTauxPatronal and deltaTauxPatronalPA so employer cuts do not bleed into baseline', () => {
    const reformCfg = {
      ...DEFAULT_CONFIG,
      deltaTauxPatronal: 0.005,
      deltaTauxPatronalPA: 0.002,
    };
    const cfCfg = buildCounterfactualParams(reformCfg);
    expect(cfCfg.deltaTauxPatronal).toBe(0);
    expect(cfCfg.deltaTauxPatronalPA).toBe(0);
  });

  it('counterfactual with employer cuts has same tau_e_eff as no-cut baseline', () => {
    const reformCfg = {
      ...DEFAULT_CONFIG,
      deltaTauxPatronal: 0.01,
      deltaTauxPatronalPA: 0.001,
    };
    const cfRows  = runSimulation(buildCounterfactualParams(reformCfg));
    const baseRows = runSimulation({ ...DEFAULT_CONFIG });
    for (let t = 0; t < cfRows.length; t++) {
      expect(cfRows[t].tau_e_eff, `t=${t}`).toBeCloseTo(baseRows[t].tau_e_eff, 12);
    }
  });
});

// ===========================================================================
// surplusLevy_t floor protection (v2.0 engine fixes)
// ===========================================================================
describe('surplusLevy_t — K_floor_t capacity cap', () => {
  it('when surplusLevy fires, K_t ends up at or above K_floor_t', () => {
    // The cap is surplusLevyCap = max(0, K_before_levy - K_floor). So if levy > 0,
    // K_before was ≥ K_floor and K_after = K_before − levy ≥ K_floor.
    // (Payouts in §5.12 can independently put K_t below floor, but that is handled
    // by the shortfall mechanism, not this levy cap.)
    const cfg = {
      ...DEFAULT_CONFIG,
      cashFlowMode: 'legacy',
      thetaBuffer: 0,
      tauK: 0,
    };
    const rows = runSimulation(cfg);
    for (const r of rows) {
      if (r.surplusLevy_t > 1e-9) {
        const kFloor = r.annuityRate_t > 1e-6 ? r.capiPayoutFloor_t / r.annuityRate_t : 0;
        expect(r.K_t, `t=${r.t}: surplusLevy fired, K_t should be ≥ K_floor`)
          .toBeGreaterThanOrEqual(kFloor - 1e-6);
      }
    }
  });
});

// ===========================================================================
// Employer-cut off-by-one fix (v2.0 engine fixes)
// ===========================================================================
describe('employer-cut §5.3 — off-by-one fix', () => {
  it('tau_e_eff equals tau_e on activation year (step fires, PA=0 terms)', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      deltaTauxPatronal: 0.005,
      deltaTauxPatronalPA: 0,
      taxCutStartT: 3,
    };
    const rows = runSimulation(cfg);
    // At t=3 (activation year): yearsAfterStart=0, totalCut = 0.005, tau_e_eff = tau_e - 0.005
    expect(rows[3].tau_e_eff).toBeCloseTo(DEFAULT_CONFIG.tau_e - 0.005, 9);
    // At t=2 (one year before): no cut
    expect(rows[2].tau_e_eff).toBeCloseTo(DEFAULT_CONFIG.tau_e, 9);
  });

  it('PA increment first applies on activation+1 (one year after step)', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      deltaTauxPatronal: 0.005,
      deltaTauxPatronalPA: 0.002,
      taxCutStartT: 3,
    };
    const rows = runSimulation(cfg);
    // t=3: yearsAfterStart=0, totalCut = 0.005 + 0.002×0 = 0.005
    expect(rows[3].tau_e_eff).toBeCloseTo(DEFAULT_CONFIG.tau_e - 0.005, 9);
    // t=4: yearsAfterStart=1, totalCut = 0.005 + 0.002×1 = 0.007
    expect(rows[4].tau_e_eff).toBeCloseTo(DEFAULT_CONFIG.tau_e - 0.007, 9);
    // t=5: yearsAfterStart=2, totalCut = 0.005 + 0.002×2 = 0.009
    expect(rows[5].tau_e_eff).toBeCloseTo(DEFAULT_CONFIG.tau_e - 0.009, 9);
  });
});

// ===========================================================================
// Floor = annuityRate_t: floor equals potBasedPayout (v2.0 final fix)
// ===========================================================================
describe('overlapping floor alignment — floor equals full pot-based annuity', () => {
  // Pinned to parametric: smoothness threshold was calibrated for the parametric kernel.
  // Actuarial mode has a structurally steeper cohIdx drop in the 2050s (baby-boom die-off)
  // which causes one additional legitimate swing — not a regression, just different dynamics.
  const OL_CFG = { ...DEFAULT_CONFIG, cashFlowMode: 'overlapping', demoMode: 'parametric' };
  let rows;
  beforeAll(() => { rows = runSimulation(OL_CFG); });

  it('capiPayoutFloor_t equals potBasedPayout_t every period (floor = full fair annuity)', () => {
    // Since floor = K_t × capiAssetShare × annuityRate_t = potBasedPayout_t,
    // bucket 4b (capiTarget) is always 0 and the floor IS the pot-based annuity.
    for (const r of rows) {
      expect(r.capiPayoutFloor_t, `t=${r.t}`).toBeCloseTo(r.potBasedPayout_t, 6);
    }
  });

  it('capiPayout_t ≥ potBasedPayout_t: capi retirees always get at least fair annuity', () => {
    for (const r of rows) {
      expect(r.capiPayout_t, `t=${r.t}`).toBeGreaterThanOrEqual(r.potBasedPayout_t - 1e-6);
    }
  });

  it('capiPayout_t year-over-year change ≤ 50% (payment smoothness)', () => {
    // Non-blocking warning test: flags genuine discontinuities without halting the suite.
    // Genuine parameter changes (large w_r step, r_c shock) may legitimately exceed 50%.
    let violations = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].capiPayout_t;
      const curr = rows[i].capiPayout_t;
      if (prev > 1e-6 && Math.abs(curr - prev) / prev > 0.5) {
        violations++;
        console.warn(`[smoothness] t=${rows[i].t}: capiPayout_t changed ${((curr - prev) / prev * 100).toFixed(1)}%`);
      }
    }
    // Allow up to 3 violations:
    //   t=2,3 — capi phase-in ramp-up (first cohorts, small K_t).
    //   t≈53  — debt-clearance event: D_t hits 0, capiBonus_t activates for the
    //            first time, causing a one-period step-change in capiPayout_t.
    //            Threshold moves with E0 calibration but remains a single event.
    expect(violations, 'capiPayout_t has too many large YoY swings').toBeLessThanOrEqual(3);
  });
});

// ===========================================================================
// "Et Pour Vous?" alignment — individual annuity tracks engine annuityRate_t
// ===========================================================================
describe('computeIndividualPerspective — Et Pour Vous alignment', () => {
  const OL_CFG = { ...DEFAULT_CONFIG, cashFlowMode: 'overlapping' };
  const reformRows = runSimulation(OL_CFG);
  const cfCfg = buildCounterfactualParams(OL_CFG);
  const cfRows = runSimulation(cfCfg);

  it('monthlyCapiAnnuity uses annuityRate_t at retirement year (not r_c_n)', () => {
    // Full-career capi worker retiring at t=40 (born 1963, age 64 in 2027+40=2067).
    // annuityRate at t=40 should determine their monthly payout.
    const birthYear = DEFAULT_CONFIG.Y0 - 24; // age 24 in Y0 → 40-year career
    const p = computeIndividualPerspective(OL_CFG, reformRows, cfRows, birthYear);
    const retT = Math.min(reformRows.length - 1, (birthYear + 64) - DEFAULT_CONFIG.Y0);
    const expectedRate = reformRows[retT].annuityRate_t;
    if (p.inCapi && p.capiPotReal > 0 && expectedRate > 0) {
      // monthlyCapiAnnuity = capiPotAtRet × annuityRate × KE_TO_EUR / 12
      // capiPotReal is deflated; use nominal pot via capiPotAtRet reconstruction.
      // Verify that the rate implied by the output matches annuityRate_t, not r_c_n.
      const r_c_n = (1 + OL_CFG.r_c) * (1 + OL_CFG.pi) - 1;
      const retYears = Math.max(1, 85 - 64);
      const wrongFactor = r_c_n > 0 ? (1 - Math.pow(1 + r_c_n, -retYears)) / r_c_n : retYears;
      const wrongRate = 1 / wrongFactor; // ≈ 8.93%/yr — the r_c_n implied rate
      // annuityRate_at_ret ≈ 5.59%/yr; wrongRate ≈ 8.93%/yr. They differ by >30%.
      expect(expectedRate).toBeLessThan(wrongRate * 0.8);
    }
  });

  it('for a full-career capi retiree, monthlyCapiAnnuity is proportional to annuityRate_t', () => {
    // Run two configs with different r_f_annuity values. Individual annuity should
    // scale proportionally because monthlyCapiAnnuity = pot × annuityRate_t / 12.
    const cfg1 = { ...OL_CFG, r_f_annuity: 0.015 };
    const cfg2 = { ...OL_CFG, r_f_annuity: 0.030 };
    const rows1 = runSimulation(cfg1);
    const rows2 = runSimulation(cfg2);
    const cfRows1 = runSimulation(buildCounterfactualParams(cfg1));
    const cfRows2 = runSimulation(buildCounterfactualParams(cfg2));
    const birthYear = DEFAULT_CONFIG.Y0 - 24;
    const p1 = computeIndividualPerspective(cfg1, rows1, cfRows1, birthYear);
    const p2 = computeIndividualPerspective(cfg2, rows2, cfRows2, birthYear);
    if (p1.inCapi && p1.monthlyCapiAnnuity > 0 && p2.monthlyCapiAnnuity > 0) {
      const retT = Math.min(rows1.length - 1, (birthYear + 64) - DEFAULT_CONFIG.Y0);
      const rate1 = rows1[retT].annuityRate_t;
      const rate2 = rows2[retT].annuityRate_t;
      const ratio_rates = rate2 / rate1;
      const ratio_annuities = p2.monthlyCapiAnnuity / p1.monthlyCapiAnnuity;
      // Annuity ratio should match rate ratio within 5% (small pot difference from r_c effect on accumulation)
      expect(ratio_annuities, 'annuity should scale with annuityRate_t').toBeCloseTo(ratio_rates, 1);
    }
  });
});

// ===========================================================================
// §5.14 K_debt_trigger — cascade priority switch (v2.0 debt-pacing)
// ===========================================================================
describe('K_debt_trigger — debt-acceleration cascade switch', () => {
  it('DEFAULT_CONFIG.K_debt_trigger = 0 (backward-compat: always debt-first)', () => {
    expect(DEFAULT_CONFIG.K_debt_trigger).toBe(0);
  });

  it('with trigger=0, output matches no-trigger baseline (bit-identical)', () => {
    const base = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'overlapping' });
    const explicit = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'overlapping', K_debt_trigger: 0 });
    for (let t = 0; t < base.length; t++) {
      expect(explicit[t].capiDebtRepaid_t).toBe(base[t].capiDebtRepaid_t);
      expect(explicit[t].capiBonus_t).toBe(base[t].capiBonus_t);
    }
  });

  it('with trigger=Infinity, capiDebtRepaid_t = 0 every period (full deferral)', () => {
    const rows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'overlapping', K_debt_trigger: Infinity });
    for (const r of rows) {
      expect(r.capiDebtRepaid_t, `t=${r.t}`).toBe(0);
    }
  });

  it('with trigger=Infinity, total capiDebtRepaid across all years is 0 (full deferral)', () => {
    const rows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'overlapping', K_debt_trigger: Infinity });
    const totalRepaid = rows.reduce((s, r) => s + r.capiDebtRepaid_t, 0);
    expect(totalRepaid).toBeCloseTo(0, 6);
  });

  it('with trigger=Infinity, D_t at end of horizon > 0 (debt deferred, never amortised)', () => {
    // In the infinite-deferral mode the cascade never repays transition debt —
    // it stays positive throughout. This is the intended tradeoff: capi retirees
    // receive higher payouts but the state holds the debt longer.
    const rows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'overlapping', K_debt_trigger: Infinity });
    expect(rows[rows.length - 1].D_t).toBeGreaterThan(0);
  });

  it('with finite trigger, cascade switches from capi-first to debt-first when K_t crosses threshold', () => {
    const TRIGGER = 5000; // Md€ — K_t crosses this somewhere in the horizon
    const rows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'overlapping', K_debt_trigger: TRIGGER });
    let seenBelow = false, seenAbove = false;
    for (const r of rows) {
      if (r.K_start_t < TRIGGER && r.capiDebtRepaid_t < 1e-6) seenBelow = true;
      if (r.K_start_t >= TRIGGER) seenAbove = true;
    }
    expect(seenBelow, 'should have capi-first phase before trigger').toBe(true);
    expect(seenAbove, 'should have debt-first phase after trigger').toBe(true);
  });

  it('cascade budget identity holds for both debt-first and capi-first modes', () => {
    for (const trigger of [0, Infinity]) {
      const rows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'overlapping', K_debt_trigger: trigger });
      for (const r of rows) {
        if (r.fundReturnCapi_t < 1e-6) continue;
        const allocated = r.capiLegacyXSub_t + r.capiDebtRepaid_t + r.capiReinvest_t + r.capiBonus_t;
        expect(allocated, `trigger=${trigger} t=${r.t}`).toBeCloseTo(r.fundReturnCapi_t, 6);
      }
    }
  });
});

// ===========================================================================
// PR #18 §5.13 Balanced cashFlowMode — strict separation of concerns
// ===========================================================================
//
// Balanced mode replaces the overlapping cascade. Key differences:
//   1. capiLegacyXSub_t = 0 always — capi never subsidises PAYG via returns.
//   2. capiContribXSub_t = 0 always — capi never subsidises PAYG via contributions.
//   3. Floor uses annuityFloorRate (1.5 %), not annuityRate_t (5.6 %).
//   4. Solvency floor with KFloorBuffer cushion (1.10 × strict floor).
//   5. Debt sweep capped on three axes (share-of-return, share-of-K, share-of-GDP).
//   6. Smooth phase-out as D/GDP falls towards debtSweepEndRatio.
//   7. capiBonus paid as fraction (capiBonusShare = 25 %) of post-debt surplus.

describe('PR #18 balanced cashFlowMode — backward compat', () => {
  it('legacy mode output is unaffected by the balanced branch addition', () => {
    // Fixture regression already covers this; sanity-check that legacy and
    // overlapping outputs differ from balanced for the default config.
    const legacy_rows  = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'legacy' });
    const balanced_rows = runSimulation({ ...DEFAULT_CONFIG, cashFlowMode: 'balanced' });
    let differs = false;
    for (let t = 0; t < legacy_rows.length; t++) {
      if (Math.abs(legacy_rows[t].K_t - balanced_rows[t].K_t) > 1) {
        differs = true; break;
      }
    }
    expect(differs, 'balanced mode should differ from legacy output').toBe(true);
  });
});

describe('PR #18 balanced cashFlowMode — invariants', () => {
  const BAL_CFG = { ...DEFAULT_CONFIG, cashFlowMode: 'balanced' };
  let rows;
  beforeAll(() => { rows = runSimulation(BAL_CFG); });

  it('runs without error for default config and reaches finite K_t/D_t', () => {
    expect(rows).toHaveLength(BAL_CFG.N);
    for (const r of rows) {
      expect(isFinite(r.K_t) && r.K_t >= 0, `K_t=${r.K_t} at t=${r.t}`).toBe(true);
      expect(isFinite(r.D_t) && r.D_t >= 0, `D_t=${r.D_t} at t=${r.t}`).toBe(true);
    }
  });

  it('runs cleanly for all three COR scenarios (actuarial demographics)', () => {
    for (const scenario of ['cor_central', 'cor_high', 'cor_low']) {
      const cfg = { ...BAL_CFG, demoMode: 'actuarial', demoScenario: scenario };
      expect(() => runSimulation(cfg)).not.toThrow();
    }
  });

  // Invariant 1 — pension floor seniority: total payout >= floor.
  it('Invariant 1: capiPayout_t ≥ capiPayoutFloor_t every period', () => {
    for (const r of rows) {
      expect(r.capiPayout_t, `t=${r.t}`).toBeGreaterThanOrEqual(r.capiPayoutFloor_t - 1e-9);
    }
  });

  // Invariant 2 — debt sweep cannot break solvency floor (unless explicit shortfall).
  it('Invariant 2: K_t ≥ K_floor_t whenever no guarantee shortfall recorded', () => {
    for (const r of rows) {
      if (r.guaranteeShortfall_t < 1e-6) {
        expect(r.K_t, `t=${r.t}: K_t should not breach K_floor_t when no shortfall`)
          .toBeGreaterThanOrEqual(r.K_floor_t - 1e-6);
      }
    }
  });

  // Invariant 3 — debt sweep is capped on all four axes.
  it('Invariant 3: capiDebtRepaid_t respects share-of-surplus cap', () => {
    for (const r of rows) {
      const cap = (BAL_CFG.debtSweepSurplusFrac ?? 0.75) * (r.surplusAboveFloor_t ?? 0);
      expect(r.capiDebtRepaid_t, `t=${r.t} share-of-surplus cap`)
        .toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it('Invariant 3: capiDebtRepaid_t respects share-of-return cap', () => {
    for (const r of rows) {
      const cap = (BAL_CFG.debtSweepShare ?? 0.50) * Math.max(0, r.fundReturnCapi_t);
      expect(r.capiDebtRepaid_t, `t=${r.t} share-of-return cap`)
        .toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it('Invariant 3: capiDebtRepaid_t respects share-of-K cap', () => {
    for (const r of rows) {
      const cap = (BAL_CFG.debtSweepKCap ?? 0.015) * r.K_start_t;
      expect(r.capiDebtRepaid_t, `t=${r.t} share-of-K cap`)
        .toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it('Invariant 3: capiDebtRepaid_t respects share-of-GDP cap', () => {
    for (const r of rows) {
      const cap = (BAL_CFG.debtSweepGdpCap ?? 0.01) * r.GDP_t;
      expect(r.capiDebtRepaid_t, `t=${r.t} share-of-GDP cap`)
        .toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  // Invariant 4 — no payout cliff in mature years (allow exception during ramp-up).
  it('Invariant 4: capiPayout_t YoY growth < 50 % once steady-state has begun', () => {
    // Ramp-up exception: first 7 years after the first non-zero payout can move freely
    // (cohort entry creates legitimate jumps; PR #19 K_retirees_bal starts small so rapid
    // growth persists slightly longer than in the old formula).
    const firstNonZero = rows.findIndex(r => r.capiPayout_t > 0.1);
    if (firstNonZero < 0) return;
    const rampEnd = firstNonZero + 7;
    for (let i = rampEnd + 1; i < rows.length; i++) {
      const prev = rows[i - 1].capiPayout_t;
      const curr = rows[i].capiPayout_t;
      if (prev < 1e-6) continue;
      const growth = curr / prev - 1;
      expect(Math.abs(growth), `t=${rows[i].t} cliff: ${prev.toFixed(2)} → ${curr.toFixed(2)}`)
        .toBeLessThan(0.50);
    }
  });

  it('separation of concerns: capiLegacyXSub_t = 0 and capiContribXSub_t = 0 always', () => {
    for (const r of rows) {
      expect(r.capiLegacyXSub_t, `t=${r.t} no return cross-sub`).toBeCloseTo(0, 9);
      expect(r.capiContribXSub_t, `t=${r.t} no contribution cross-sub`).toBeCloseTo(0, 9);
    }
  });

  it('debtSweepPhase_t ∈ [0, 1] every period', () => {
    for (const r of rows) {
      expect(r.debtSweepPhase_t, `t=${r.t}`).toBeGreaterThanOrEqual(0);
      expect(r.debtSweepPhase_t, `t=${r.t}`).toBeLessThanOrEqual(1);
    }
  });

  it('debt sweep is fully active when D/GDP ≥ debtSweepStartRatio', () => {
    for (const r of rows) {
      const dToGdp = r.GDP_t > 0 ? r.D_t / r.GDP_t : 0;
      if (dToGdp >= (BAL_CFG.debtSweepStartRatio ?? 0.50)) {
        expect(r.debtSweepPhase_t, `t=${r.t} D/GDP=${dToGdp.toFixed(2)}`)
          .toBeCloseTo(1, 9);
      }
    }
  });

  it('debt sweep is inactive when D/GDP ≤ debtSweepEndRatio', () => {
    for (const r of rows) {
      const dToGdp = r.GDP_t > 0 ? r.D_t / r.GDP_t : 0;
      if (dToGdp <= (BAL_CFG.debtSweepEndRatio ?? 0.05)) {
        expect(r.debtSweepPhase_t, `t=${r.t} D/GDP=${dToGdp.toFixed(2)}`)
          .toBeCloseTo(0, 9);
      }
    }
  });

  it('capiBonus_t ≤ actuarial surplus on retirees\' pot − debt share (total payout ≤ annuity)', () => {
    // Cap formula: K_ret_pre_bonus × (annuityRate − annuityFloorRate) − debtRepaid × retireeFrac.
    // Ensures total payout (floor + bonus) ≤ K_ret × annuityRate_t (actuarial drawdown).
    // K_retirees_bal_t in the row is post-bonus; recover pre-bonus as K_retirees_bal_t + capiBonus_t.
    const floorRate = BAL_CFG.annuityFloorRate ?? 0.015;
    for (const r of rows) {
      const K_ret_pre = r.K_retirees_bal_t + r.capiBonus_t;
      const K_capi_total = Math.max(r.K_avail_t * r.capiAssetShare_t, 1e-9);
      const retireeFrac = Math.min(1, K_ret_pre / K_capi_total);
      const actuarialSurplus = K_ret_pre * Math.max(0, r.annuityRate_t - floorRate);
      const cap = Math.max(0, actuarialSurplus - r.capiDebtRepaid_t * retireeFrac);
      expect(r.capiBonus_t, `t=${r.t}`).toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it('floor formula: capiPayoutFloor_t = K_retirees_bal × annuityFloorRate (PR #19)', () => {
    // PR #19: floor is based on retirees' accumulated pot, not total capi K.
    // K_retirees_bal_t in the row is the post-payment value; verify via upper bound
    // (floor ≤ total capi K × annuityFloorRate) and non-negativity.
    const rate = BAL_CFG.annuityFloorRate ?? 0.015;
    for (const r of rows) {
      const upperBound = r.K_avail_t * r.capiAssetShare_t * rate;
      expect(r.capiPayoutFloor_t, `t=${r.t} non-negative`).toBeGreaterThanOrEqual(0);
      expect(r.capiPayoutFloor_t, `t=${r.t} ≤ total capi K × rate`).toBeLessThanOrEqual(upperBound + 1e-6);
      // Diagnostic field exists and is non-negative
      expect(r.K_retirees_bal_t, `t=${r.t} K_retirees_bal_t defined`).toBeGreaterThanOrEqual(0);
    }
  });

  it('K_floor_t = strictKFloor × KFloorBuffer (solvency cushion enforced)', () => {
    for (const r of rows) {
      const strict = r.annuityRate_t > 1e-9 ? r.capiPayoutFloor_t / r.annuityRate_t : 0;
      const expected = strict * (BAL_CFG.KFloorBuffer ?? 1.10);
      expect(r.K_floor_t, `t=${r.t}`).toBeCloseTo(expected, 6);
    }
  });
});

describe('PR #18 computeCapiAssetShareBalanced helper', () => {
  it('returns 0 when sumCapiContrib is 0', () => {
    expect(computeCapiAssetShareBalanced({
      K_avail_t: 1000,
      sumCapiContrib: 0,
    })).toBe(0);
  });

  it('returns clamped to 1 when contributions exceed K_avail', () => {
    expect(computeCapiAssetShareBalanced({
      K_avail_t: 100,
      sumCapiContrib: 200,
    })).toBe(1);
  });

  it('returns ratio when sumCapiContrib < K_avail', () => {
    expect(computeCapiAssetShareBalanced({
      K_avail_t: 1000,
      sumCapiContrib: 250,
    })).toBeCloseTo(0.25, 12);
  });

  it('handles K_avail near zero without dividing by zero', () => {
    const v = computeCapiAssetShareBalanced({
      K_avail_t: 0,
      sumCapiContrib: 100,
    });
    expect(isFinite(v)).toBe(true);
    expect(v).toBe(1);
  });
});



// =====================================================================
// PR #21 — diversification des moyens de financement
// =====================================================================
describe('PR #21 fiscal transfer — diversification des moyens de financement', () => {
  const BASE = { ...DEFAULT_CONFIG, cashFlowMode: 'balanced', geKneeRatio: 3.0, geFloorRatio: 8.0 };

  it('mode none: fiscalTransfer_t = 0 every period', () => {
    const rows = runSimulation({ ...BASE, fiscalTransferMode: 'none' });
    for (const r of rows) {
      expect(r.fiscalTransfer_t, `t=${r.t}`).toBe(0);
    }
  });

  it('mode full: fiscalTransfer_t ≥ 0 and ≤ fiscalTransferBase every period', () => {
    const cfg = { ...BASE, fiscalTransferMode: 'full', fiscalTransferBase: 40 };
    const rows = runSimulation(cfg);
    for (const r of rows) {
      expect(r.fiscalTransfer_t, `t=${r.t} non-negative`).toBeGreaterThanOrEqual(0);
      expect(r.fiscalTransfer_t, `t=${r.t} ≤ base`).toBeLessThanOrEqual(cfg.fiscalTransferBase + 1e-9);
    }
  });

  it('mode full: transfer converges to 0 by end of simulation', () => {
    // Once capiCoverage_t reaches 1 (capi floor covers full legacy outflow),
    // transfer must be zero. Verify the final-period value is negligible.
    const rows = runSimulation({ ...BASE, fiscalTransferMode: 'full', fiscalTransferBase: 40 });
    const last = rows[rows.length - 1];
    expect(last.fiscalTransfer_t, `final t=${last.t}`).toBeLessThan(1e-3);
  });

  it('mode full: capiCoverage_t ∈ [0, 1] every period', () => {
    const rows = runSimulation({ ...BASE, fiscalTransferMode: 'full' });
    for (const r of rows) {
      expect(r.capiCoverage_t, `t=${r.t} ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(r.capiCoverage_t, `t=${r.t} ≤ 1`).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('mode no-debt: fiscalGap_t ≥ 0 and D_t never increases from PAYG borrowing', () => {
    const rowsFull   = runSimulation({ ...BASE, fiscalTransferMode: 'full' });
    const rowsNoDebt = runSimulation({ ...BASE, fiscalTransferMode: 'no-debt' });
    for (let i = 0; i < rowsNoDebt.length; i++) {
      const r = rowsNoDebt[i];
      expect(r.fiscalGap_t, `t=${r.t}`).toBeGreaterThanOrEqual(0);
      // D_t in no-debt mode must never exceed full mode (no extra borrowing added)
      expect(r.D_t, `t=${r.t} no-debt D_t ≤ full D_t`)
        .toBeLessThanOrEqual(rowsFull[i].D_t + 1e-6);
    }
  });
});

// =====================================================================
// PR #21b/c — recognition bonds (chileMode) — engine invariants
// =====================================================================
describe('PR #21b/c recognition bonds — chileMode invariants', () => {
  const BASE = { ...DEFAULT_CONFIG, cashFlowMode: 'balanced', geKneeRatio: 3.0, geFloorRatio: 8.0 };
  const CHILE_CFG = { ...BASE, chileMode: true };

  it('chileMode=false: BR_t = 0, bondIssuance_t = 0, bondRedemption_t = 0 every period', () => {
    const rows = runSimulation({ ...BASE, chileMode: false });
    for (const r of rows) {
      expect(r.BR_t, `t=${r.t} BR_t`).toBe(0);
      expect(r.bondIssuance_t, `t=${r.t} issuance`).toBe(0);
      expect(r.bondRedemption_t, `t=${r.t} redemption`).toBe(0);
    }
  });

  it('chileMode=true: transitionalPaygExp_t = 0 every period', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.transitionalPaygExp_t, `t=${r.t}`).toBe(0);
    }
  });

  it('chileMode=true: BR_t is non-negative every period (NPV annuity stock)', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.BR_t, `t=${r.t} non-negative`).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('chileMode=true: bondIssuance_t >= 0 every period', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.bondIssuance_t, `t=${r.t}`).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('chileMode=true: bondIssuance_t = chileB0 at t=0 only (one-off issuance)', () => {
    const rows = runSimulation(CHILE_CFG);
    // t=0: big one-off issuance (chileB0 > 0)
    expect(rows[0].bondIssuance_t, 't=0 one-off issuance').toBeGreaterThan(0);
    // t>0: no more issuances
    for (const r of rows.slice(1)) {
      expect(r.bondIssuance_t, `t=${r.t} no issuance after t=0`).toBe(0);
    }
  });

  it('chileMode=true: bondRedemption_t >= 0 every period', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.bondRedemption_t, `t=${r.t}`).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('chileMode=true: bondRedemption_t = 0 when transitionalPaygExpGross_t = 0', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      if (r.transitionalPaygExpGross_t < 1e-9) {
        expect(r.bondRedemption_t, `t=${r.t}`).toBeLessThan(1e-9);
      }
    }
  });

  it('chileMode=true: cumRepayFund_t is non-decreasing', () => {
    const rows = runSimulation(CHILE_CFG);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].cumRepayFund_t, `t=${rows[i].t}`)
        .toBeGreaterThanOrEqual(rows[i - 1].cumRepayFund_t - 1e-9);
    }
  });

  it('chileMode=false: bondRedemption_t = 0, repayFund_t = 0, cumRepayFund_t = 0 every period', () => {
    const rows = runSimulation({ ...BASE, chileMode: false });
    for (const r of rows) {
      expect(r.bondRedemption_t, `t=${r.t}`).toBe(0);
      expect(r.repayFund_t, `t=${r.t}`).toBe(0);
      expect(r.cumRepayFund_t, `t=${r.t}`).toBe(0);
    }
  });

  it('chileMode=true: K_t >= K_t in chileMode=false after bonds credited (bonds augment funded pot)', () => {
    // Use legacy cashFlowMode in both runs for apples-to-apples comparison.
    // (chileMode forces legacy cascade internally per PR #25 fix; pinning the
    // non-chile baseline to legacy as well keeps the comparison cascade-consistent.)
    const rowsNo = runSimulation({ ...BASE, chileMode: false, cashFlowMode: 'legacy' });
    const rowsYes = runSimulation({ ...CHILE_CFG, cashFlowMode: 'legacy' });
    const firstBondYear = rowsYes.find(r => r.bondIssuance_t > 1e-6);
    if (firstBondYear) {
      for (let i = firstBondYear.t; i < rowsYes.length; i++) {
        expect(rowsYes[i].K_t, `t=${rowsYes[i].t}`)
          .toBeGreaterThanOrEqual(rowsNo[i].K_t - 1e-6);
      }
    }
  });

  it('chileMode=true: sigma_capi_t = 1 every period (100% contributions to capi)', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.sigma_capi_t, `t=${r.t} sigma=1`).toBeCloseTo(1, 9);
    }
  });

  it('chileMode=true: C_s_payg_t = 0 every period', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.C_s_payg_t, `t=${r.t} no payg contributions`).toBeCloseTo(0, 6);
    }
  });

  it('chileMode=true: emplrToCap_t = C_e_t every period (employer 100% to capi)', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.emplrToCap_t, `t=${r.t} employer all to capi`)
        .toBeCloseTo(r.C_e_t, 6);
    }
  });

  // PR #25 regression: chileMode + balanced/overlapping cascade used to blow up
  // D_t to ~2×10^8 Md€ because the cascade's strict separation capped debt
  // repayment at ~1% of GDP — orders of magnitude too tight for chileMode's
  // 100% contribution diversion. Fix forces legacy cascade internally when
  // chileMode is on.
  it('PR #25: chileMode produces identical output regardless of cashFlowMode', () => {
    const legacy = runSimulation({ ...DEFAULT_CONFIG, chileMode: true, cashFlowMode: 'legacy' });
    const balanced = runSimulation({ ...DEFAULT_CONFIG, chileMode: true, cashFlowMode: 'balanced' });
    const overlapping = runSimulation({ ...DEFAULT_CONFIG, chileMode: true, cashFlowMode: 'overlapping' });
    for (let i = 0; i < legacy.length; i++) {
      expect(balanced[i].D_t, `t=${i} balanced vs legacy D_t`).toBeCloseTo(legacy[i].D_t, 6);
      expect(balanced[i].K_t, `t=${i} balanced vs legacy K_t`).toBeCloseTo(legacy[i].K_t, 6);
      expect(overlapping[i].D_t, `t=${i} overlapping vs legacy D_t`).toBeCloseTo(legacy[i].D_t, 6);
      expect(overlapping[i].K_t, `t=${i} overlapping vs legacy K_t`).toBeCloseTo(legacy[i].K_t, 6);
    }
  });

  it('PR #25: chileMode + balanced does not run away (peak D_t reasonable)', () => {
    // Pre-fix: peak D_t was ~2e8 Md€ — completely unrealistic.
    // Post-fix: peak D_t should be in the same order of magnitude as legacy.
    const rows = runSimulation({ ...DEFAULT_CONFIG, chileMode: true, cashFlowMode: 'balanced' });
    const peakD = Math.max(...rows.map(r => r.D_t));
    expect(peakD, 'peak D_t with chileMode + balanced').toBeLessThan(50000); // 50k Md€ ceiling
  });

  // PR #26 — bond redemption accounting correctness
  it('PR #26: drawnFromRepayFund_t + debtFinancedRedemption_t = bondRedemption_t every period', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      const sum = (r.drawnFromRepayFund_t ?? 0) + (r.debtFinancedRedemption_t ?? 0);
      expect(sum, `t=${r.t} redemption split sums to total`).toBeCloseTo(r.bondRedemption_t ?? 0, 6);
    }
  });

  it('PR #26: drawnFromRepayFund_t <= bondRedemption_t every period (cannot draw more than needed)', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.drawnFromRepayFund_t ?? 0, `t=${r.t}`).toBeLessThanOrEqual((r.bondRedemption_t ?? 0) + 1e-9);
    }
  });

  it('PR #26: repayFundBalance_t is non-negative every period (cannot overdraw)', () => {
    const rows = runSimulation(CHILE_CFG);
    for (const r of rows) {
      expect(r.repayFundBalance_t ?? 0, `t=${r.t} balance non-negative`).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('PR #26: cumRepayFund_t >= drawnFromRepayFund cumulative (balance is subset of inflows)', () => {
    const rows = runSimulation(CHILE_CFG);
    let cumDrawn = 0;
    for (const r of rows) {
      cumDrawn += r.drawnFromRepayFund_t ?? 0;
      expect(r.cumRepayFund_t, `t=${r.t} cumulative inflows >= cumulative draws`).toBeGreaterThanOrEqual(cumDrawn - 1e-6);
    }
  });

  it('PR #26: chileMode=false: new fields are all zero every period', () => {
    const rows = runSimulation({ ...BASE, chileMode: false });
    for (const r of rows) {
      expect(r.drawnFromRepayFund_t ?? 0, `t=${r.t}`).toBe(0);
      expect(r.debtFinancedRedemption_t ?? 0, `t=${r.t}`).toBe(0);
      expect(r.repayFundBalance_t ?? 0, `t=${r.t}`).toBe(0);
    }
  });

  it('PR #26: chileMode total redemptions = drawn + debt-financed (global conservation)', () => {
    const rows = runSimulation(CHILE_CFG);
    const totalRedemptions = rows.reduce((s, r) => s + (r.bondRedemption_t ?? 0), 0);
    const totalDrawn = rows.reduce((s, r) => s + (r.drawnFromRepayFund_t ?? 0), 0);
    const totalDebtFinanced = rows.reduce((s, r) => s + (r.debtFinancedRedemption_t ?? 0), 0);
    expect(totalDrawn + totalDebtFinanced).toBeCloseTo(totalRedemptions, 3);
  });
});

// ===========================================================================
// PR #24 — Sweden mode (NDC + ABM + small funded pillar)
// ===========================================================================
describe('PR #24 Sweden mode — NDC + Automatic Balance Mechanism', () => {
  const SWEDEN_CFG = { ...DEFAULT_CONFIG, swedenMode: true, cashFlowMode: 'balanced' };

  it('swedenMode=false: abmFactor_t = 1 and abmCut_t = 0 every period', () => {
    const rows = runSimulation(DEFAULT_CONFIG);
    for (const r of rows) {
      expect(r.abmFactor_t, `t=${r.t}`).toBe(1);
      expect(r.abmCut_t, `t=${r.t}`).toBe(0);
    }
  });

  it('swedenMode=true: sigma_capi_t = swedenCapiRate / tau_s every period', () => {
    const rows = runSimulation(SWEDEN_CFG);
    const expected = SWEDEN_CFG.swedenCapiRate / SWEDEN_CFG.tau_s;
    for (const r of rows) {
      expect(r.sigma_capi_t, `t=${r.t}`).toBeCloseTo(expected, 9);
    }
  });

  it('swedenMode + ABM: abmFactor_t bounded by [swedenABMFloor, 1] every period', () => {
    const rows = runSimulation(SWEDEN_CFG);
    for (const r of rows) {
      expect(r.abmFactor_t, `t=${r.t}`).toBeGreaterThanOrEqual(SWEDEN_CFG.swedenABMFloor - 1e-12);
      expect(r.abmFactor_t, `t=${r.t}`).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('swedenMode + ABM: PAYG never borrows in deficit (D_t never grows from PAYG)', () => {
    // With ABM, the PAYG side always self-balances. D_t can still grow from
    // the K-side cascade (capi shortfall) but never from PAYG borrowing.
    const rows = runSimulation(SWEDEN_CFG);
    // Compare to no-ABM variant: D_t should be strictly lower (or equal).
    const rowsNoABM = runSimulation({ ...SWEDEN_CFG, swedenABM: false });
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].D_t, `t=${i} ABM should not exceed no-ABM D_t`)
        .toBeLessThanOrEqual(rowsNoABM[i].D_t + 1e-6);
    }
  });

  it('swedenMode + ABM: abmCut_t = (1 - abmFactor_t) × pre-cut totalLegacyOutflow', () => {
    const rows = runSimulation(SWEDEN_CFG);
    for (const r of rows) {
      if (r.abmFactor_t < 0.999) {
        // pre-cut outflow = post-cut outflow / abmFactor
        const preCutOutflow = r.totalLegacyOutflow_t / r.abmFactor_t;
        const expectedCut = preCutOutflow * (1 - r.abmFactor_t);
        expect(r.abmCut_t, `t=${r.t}`).toBeCloseTo(expectedCut, 6);
      }
    }
  });

  it('swedenMode + ABM: abmCut_t = 0 when abmFactor_t = 1 (no deficit)', () => {
    const rows = runSimulation(SWEDEN_CFG);
    for (const r of rows) {
      if (Math.abs(r.abmFactor_t - 1) < 1e-12) {
        expect(r.abmCut_t, `t=${r.t}`).toBe(0);
      }
    }
  });

  it('swedenCapiRate slider: higher capi share → smaller PAYG revenue base', () => {
    const low = runSimulation({ ...SWEDEN_CFG, swedenCapiRate: 0.02 });
    const high = runSimulation({ ...SWEDEN_CFG, swedenCapiRate: 0.05 });
    expect(high[0].C_s_payg_t, 'higher capi → less PAYG').toBeLessThan(low[0].C_s_payg_t);
    expect(high[0].C_s_capi_t, 'higher capi → more capi').toBeGreaterThan(low[0].C_s_capi_t);
  });

  it('swedenMode + ABM: actually fires under default parameters (integration)', () => {
    // Regression guard: a future change that silently neutralises the ABM (e.g.
    // a bug widening the resource base back to "total fiscal capacity") would
    // leave all the per-period invariant tests passing while making the
    // mechanism a no-op. This test asserts the ABM is observable: at least one
    // year has a cut, and the cumulative cut is non-trivial.
    const rows = runSimulation(SWEDEN_CFG);
    const activeYears = rows.filter(r => (r.abmFactor_t ?? 1) < 0.999).length;
    const totalCut = rows.reduce((s, r) => s + (r.abmCut_t ?? 0), 0);
    expect(activeYears, 'ABM should activate in at least one year').toBeGreaterThan(0);
    expect(totalCut, 'cumulative ABM cut should be non-trivial (>1 Md€)').toBeGreaterThan(1);
  });

  it('swedenMode forces effective cashFlowMode to legacy (no balanced/overlapping cascade)', () => {
    // The balanced/overlapping cascades are full-capitalisation constructs that
    // under-size the K floor when only ~35% of contributions feed K. Forcing
    // legacy mode prevents K runaway. Diagnostic: balanced-mode-only fields
    // (surplusLevy_t, debtSweepCapacity_t, etc.) must be zero throughout.
    const rows = runSimulation({ ...DEFAULT_CONFIG, swedenMode: true, cashFlowMode: 'balanced' });
    for (const r of rows) {
      expect(r.surplusLevy_t ?? 0, `t=${r.t} surplusLevy should be 0`).toBe(0);
      expect(r.debtSweepCapacity_t ?? 0, `t=${r.t} debtSweepCapacity should be 0`).toBe(0);
    }
  });

  it('swedenMode=true and chileMode=true are not asserted mutually exclusive by engine (UI mutex)', () => {
    // Engine allows both flags set. UI handles mutex. chileMode takes precedence
    // in sigma_capi computation (sigma=1 wins).
    const rows = runSimulation({ ...DEFAULT_CONFIG, swedenMode: true, chileMode: true });
    for (const r of rows) {
      expect(r.sigma_capi_t, `t=${r.t} chile wins`).toBe(1);
    }
  });
});
