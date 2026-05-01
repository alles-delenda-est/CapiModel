import { describe, it, expect } from 'vitest';
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
  runSimulation,
  legacyShareOfCohort,
  buildCounterfactualParams,
  computeIndividualPerspective,
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

  it('exports LIFE_EXP_INDEXATION_FRACTION = 0.5', () => {
    expect(LIFE_EXP_INDEXATION_FRACTION).toBe(0.5);
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
  it('indexed mode: A_R(t=10) = base + 10/10 × 0.91 × 0.5 = 64.455', () => {
    const cfg = { ...DEFAULT_CONFIG, retirementAgeMode: 'indexed' };
    expect(retirementAge(10, cfg)).toBeCloseTo(64.455, 12);
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
    // (a) HLM mass conservation: U_t ≡ U0 × (1-ρ)^t exactly, ΔU_t ≡ U_t × ρ.
    const U_t_expected = cfg.U0 * Math.pow(1 - cfg.rho, r.t);
    expect(r.U_t, `${tag} U_t = U0×(1-ρ)^t`).toBeCloseTo(U_t_expected, 12);
    expect(r.delta_U_t, `${tag} ΔU_t = U_t×ρ`).toBeCloseTo(r.U_t * cfg.rho, 12);

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

// §5.10 Legacy Fund dynamics (eq 36 + eq 43):
// F_t only grows in surplus branch. Default preset runs deficit every year
// → F_t is constant at F0, so fundReturn_t is constant. This is per-spec
// (permanent endowment model); these tests document the known behavior and
// will alert if the spec changes.
describe('§5.10 Legacy Fund endowment behavior (default preset)', () => {
  const rows = runSimulation();
  it('F_t = F0 for every year (no surplus → eq 43 never fires)', () => {
    const F0 = DEFAULT_CONFIG.F0;
    for (let t = 0; t < rows.length; t++) {
      expect(rows[t].F_t, `F_t at t=${t}`).toBeCloseTo(F0, 9);
    }
  });
  it('fundReturn_t is constant across all years (= F0 × fisher(r_f_portfolio, pi))', () => {
    const expected = DEFAULT_CONFIG.F0 * fisher(DEFAULT_CONFIG.r_f_portfolio, DEFAULT_CONFIG.pi);
    for (let t = 0; t < rows.length; t++) {
      expect(rows[t].fundReturn_t, `fundReturn_t at t=${t}`).toBeCloseTo(expected, 6);
    }
  });
  it('r_d_t rises above r_d_base before peak-debt year (debtRatio crosses threshold1=150%)', () => {
    // Default: existingDebt/baseGDP = 115% at t=0 (below threshold1).
    // As D_t accumulates, debtRatio eventually crosses 150% and the premium activates.
    // This test confirms the premium mechanism is live in the default run.
    const r_d_base = DEFAULT_CONFIG.r_d_base;
    const someYearExceedsBase = rows.some(r => r.r_d_t > r_d_base + 1e-9);
    expect(someYearExceedsBase).toBe(true);
  });
  it('netFlow_t ≤ 0 every year in default preset (surplus branch adds zero at most)', () => {
    // Around t=49-51, netFlow_t ≈ 0 (± float noise ~1e-13). The F_t test above
    // confirms no meaningful fund growth occurs regardless.
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
    const cfg = { ...DEFAULT_CONFIG };
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
    const cfg = { ...DEFAULT_CONFIG };
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
    const cfg = { ...DEFAULT_CONFIG };
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
    const cfg = { ...DEFAULT_CONFIG };
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
  it('Test 11 — uniform-mortality reconciliation: cohort-aggregate sum = transitionalPaygExp_t at ε ≤ 0.01 Md€ across all years (default preset)', () => {
    const EPS_MD = 0.01;
    const cfg = { ...DEFAULT_CONFIG };
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

