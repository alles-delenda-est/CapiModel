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
} from '../src/simulation-engine-v1.js';

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
      'S0_brackets', 'S0_total', 'S0_t', 'phaseFactor_t', 'E0_net_t',
      'legacyExp_t', 'dependencyRatio_t',
      'cumDF_t', 'pvLegacyExp_t', 'pvCapiPayout_t',
      'pvLegacyCum_t', 'pvCapiPayoutCum_t',
      'Omega_t', 'I_factor_t', 'H_factor_t', 'iota', 'w_n', 'r_f_n',
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
  it('S0_brackets ≈ 17.7 Md€/yr at t=0 (pre-phasing)', () => {
    expect(rows[0].S0_brackets).toBeGreaterThan(17.0);
    expect(rows[0].S0_brackets).toBeLessThan(18.5);
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
    r_f:  u(0.01, 0.07),
    r_c:  u(0.01, 0.07),
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
