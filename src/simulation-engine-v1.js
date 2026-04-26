// CapiModel v1.0a simulation engine.
// Spec source of truth: CapiModelSpec_v1_0a.md @ commit c466e6b
// (Patrick's brief referenced SHA 2ac4f4f8b3... which does not exist in the
//  repository; using c466e6b — current spec/v1.0a tip — as the authoritative pin.)
// This file implements §1–§9 of the spec. Every non-trivial line of the
// simulation loop carries a `// Spec §X.Y eq (N)` comment.
// Naming follows the Greek→Latin map in docs/superpowers/plans/2026-04-26-capimodel-v1-task1.md;
// do not rename.
//
// v1.0a deltas vs v1.0:
//  1. Two risk-free rates: r_f_portfolio (eq 36 / 58) vs r_f_annuity (eq 53).
//  2. HLM uniform geometric: ΔU_t = U0 × (1-ρ)^t × ρ for all t (eq 27).
//  3. Capi pot owned by retirees by ASSET share, not headcount share (eq 53, 53a).
//  4. Équinoxe split: benefit-side reductions vs tax-side CSG revenue (§5.5).

// ---- §8.1 DREES 2022 pension distribution (€/month bracket bounds) ----

export const DREES_DECILES = [
  { lo: 0,    hi: 770  },
  { lo: 770,  hi: 900  },
  { lo: 900,  hi: 1010 },
  { lo: 1010, hi: 1130 },
  { lo: 1130, hi: 1270 },
  { lo: 1270, hi: 1450 },
  { lo: 1450, hi: 1680 },
  { lo: 1680, hi: 2050 },
  { lo: 2050, hi: 2900 },
  { lo: 2900, hi: 6000 },
];

// §3.3 hardcoded constant — do NOT expose as parameter (v1.1 candidate per §10.13).
export const LIFE_EXP_INDEXATION_FRACTION = 0.5;

// §4 demographic profiles
export const DEMOGRAPHIC_PROFILES = {
  cor_central: {
    peakMult: 1.30, longRunMult: 1.25, peakT: 22,
    activePopAnchors: [[0, 1.00], [14, 1.00], [29, 0.96], [44, 0.90], [70, 0.86]],
  },
  realistic: {
    peakMult: 1.40, longRunMult: 1.35, peakT: 22,
    activePopAnchors: [[0, 1.00], [14, 0.97], [29, 0.90], [44, 0.81], [70, 0.75]],
  },
  reformed: {
    peakMult: 1.30, longRunMult: 1.25, peakT: 22,
    activePopAnchors: [[0, 1.00], [14, 1.02], [29, 1.05], [44, 1.06], [70, 1.04]],
  },
};

// §3 default parameters. Every default matches the spec exactly.
export const DEFAULT_CONFIG = {
  // §3.1 demographic & macroeconomic
  N: 70,
  Y0: 2027,
  pi: 0.02,
  w_r: 0.004,
  // §3.1 v1.0a: r_f split into two distinct rates.
  // r_f_portfolio (eq 36 fundReturn, eq 58 spread) — diversified Legacy Fund
  //   return; OECD 60/40 historical median.
  // r_f_annuity (eq 53 annuityRate) — inflation-linked sovereign hedge rate;
  //   French OATi 2024–2026.
  // Setting them equal reproduces the v1.0 carry-trade arbitrage. Don't.
  r_f_portfolio: 0.045,
  r_f_annuity: 0.015,
  r_c: 0.045,
  r_d_base: 0.035,
  extraSpread: 0,
  existingDebt: 3450,
  baseGDP: 3000,
  R0: 18.0,
  // §3.2 workforce & contributions
  W0: 1320,
  tau_s: 0.113,
  tau_e: 0.165,
  phiF: 0,
  employmentRate0: 0.69,
  employmentRateTarget: 0.76,
  employmentTransitionYears: 12,
  deltaTauxPatronal: 0,
  // §3.3 retirement age
  retirementAgeBase: 64,
  retirementAgeMode: 'fixed',
  retirementAgeFloor: 60,
  retirementAgeCeil: 70,
  lifeExpAt65_Y0: 21.82,
  lifeExpAt65_per_decade: 0.91,
  // §3.4 HLM & housing
  U0: 5.3,
  P0: 175,
  Pbook: 45,
  rho: 0.05,
  g_h: 0.015,
  T_hlm: 20,
  hlmDiscount: true,
  delta: 0.3,
  baselineTransactions: 850000,
  constructionMultiplier: 1.0,
  // §3.5 Équinoxe
  E0: 390,
  useEquinoxe: true,
  equinoxePhasing: 'immediate',
  S0_irDeduction: 5,
  S0_csg: 5,
  // §3.6 capitalisation routing
  enableCapi: true,
  cutoffAge: 50,
  alpha: 1.0,
  lambda: 0.30,
  Tlambda: 15,
  // §3.6 v1.0a: long-run share of aggregate K_t notionally owned by current
  // retirees (vs still-accumulating workers). Eq (53a) ramps the actual share
  // from 0 to this plateau via smoothstep over 30 years starting at
  // T_capi_start. Without this scaling the model expropriates worker savings
  // and masks the transition's fiscal cost (the v1.0 bug).
  capiAssetShareSteadyState: 0.35,
  // §3.7 endogenous rate premium
  rpThreshold1: 150,
  rpSlope1: 0.0002,
  rpThreshold2: 200,
  rpSlope2: 0.0004,
  rpThreshold3: 300,
  rpSlope3: 0.0010,
  r_d_cap: 0.20,
  // §3.8 GE penalty
  geKneeRatio: 2.0,
  geFloorRatio: 4.0,
  // §3.9 other
  F0: 340,
  A0: 7.0,
  demoProfile: 'cor_central',
};

// =================== Pure helpers ===================

// §0: clamp x to [lo, hi].
export function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

// §0: smoothstep S(x; a, b) = u² × (3 − 2u) where u = clamp((x − a) / (b − a), 0, 1).
// When a == b, S = 1 for x >= a else 0.
export function smoothstep(x, a, b) {
  if (a === b) return x >= a ? 1 : 0;
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
}

// §5.1 eq (1): Fisher exact composition r_n = real + infl + real × infl.
export function fisher(real, infl) {
  return real + infl + real * infl;
}

// §5.2 eq (7d): piecewise-linear interpolation across `anchors = [[t_i, v_i], ...]`
// (sorted ascending in t). Clamps to endpoints outside the range.
export function interpLinear(t, anchors) {
  if (t <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [t1, v1] = anchors[i];
    if (t <= t1) {
      const [t0, v0] = anchors[i - 1];
      const u = (t - t0) / (t1 - t0);
      return v0 + u * (v1 - v0);
    }
  }
  return last[1];
}

// §5.5 eq (18a): Equinoxe step-rate function r(p), p in €/month.
export function equinoxeRate(p) {
  if (p <= 1800) return 0;
  if (p <= 2000) return 0.001;
  if (p <= 2500) return 0.004;
  if (p <= 3000) return 0.041;
  if (p <= 4000) return 0.10;
  return 0.20; // hard cap
}

// §5.5 eq (18): DREES bracket integral.
// Numerical integration: 50-step midpoint Riemann per decile, uniform-density
// assumption within each decile (each decile holds R_t/10 retirees).
// R_t in millions of retirees; result in Md€/yr.
export function computeS0Brackets(R_t) {
  const STEPS = 50;
  let totalAvgRP = 0; // sum across deciles of [average of r(p) × p within the decile]
  for (const { lo, hi } of DREES_DECILES) {
    const width = hi - lo;
    const slice = width / STEPS;
    let dec = 0; // ∫ r(p) × p dp ≈ Σ r(mid) × mid × slice
    for (let i = 0; i < STEPS; i++) {
      const mid = lo + (i + 0.5) * slice;
      dec += equinoxeRate(mid) * mid * slice;
    }
    totalAvgRP += dec / width; // average r(p) × p within decile (units: €/mo)
  }
  // (R_t / 10) retirees per decile (millions) × avg €/mo × 12 months / 1e3 (€→Md€).
  return (R_t / 10) * totalAvgRP * 12 / 1000;
}

// §5.8 eq (34): endogenous nominal borrowing rate as piecewise-linear premium
// over `r_d_base`, plus `extraSpread`, capped at `r_d_cap = 0.20`.
// `debtRatioPct = (D_ext_t + D_t) / GDP_t × 100`  (eq 33).
export function computeRD(debtRatioPct, cfg) {
  const {
    rpThreshold1, rpSlope1,
    rpThreshold2, rpSlope2,
    rpThreshold3, rpSlope3,
    r_d_base, extraSpread, r_d_cap,
  } = cfg;
  let premium;
  if (debtRatioPct <= rpThreshold1) {
    premium = 0;
  } else if (debtRatioPct <= rpThreshold2) {
    premium = (debtRatioPct - rpThreshold1) * rpSlope1;
  } else if (debtRatioPct <= rpThreshold3) {
    premium = (rpThreshold2 - rpThreshold1) * rpSlope1
            + (debtRatioPct - rpThreshold2) * rpSlope2;
  } else {
    premium = (rpThreshold2 - rpThreshold1) * rpSlope1
            + (rpThreshold3 - rpThreshold2) * rpSlope2
            + (debtRatioPct - rpThreshold3) * rpSlope3;
  }
  return Math.min(r_d_base + premium + extraSpread, r_d_cap);
}

// §5.12 eq (47): General-equilibrium return penalty.
// Below knee: 1 (no penalty). Above floor: 0 (full penalty).
// Linear taper between. Intentionally C⁰ (not C¹) at the knee/floor —
// per §6.6 and §10.10, do NOT smooth this kink.
export function computeGePenalty(capiToGdp, knee, floor) {
  if (capiToGdp <= knee) return 1;
  if (capiToGdp >= floor) return 0;
  return 1 - (capiToGdp - knee) / (floor - knee);
}

// §5.4 eq (12): retirement-age trajectory.
// fixed: A_R(t) = retirementAgeBase always.
// indexed: A_R(t) rises by half the gain in life expectancy at 65 since Y0.
// Then clamped to [retirementAgeFloor, retirementAgeCeil] (eq 12d).
// Note: A_R is real-valued — never round in the loop (§10.2).
export function retirementAge(t, cfg) {
  let A_R;
  if (cfg.retirementAgeMode === 'indexed') {
    const LE65_t = cfg.lifeExpAt65_Y0 + (t / 10) * cfg.lifeExpAt65_per_decade;     // (12a)
    const delta_LE_t = LE65_t - cfg.lifeExpAt65_Y0;                                // (12b)
    A_R = cfg.retirementAgeBase + delta_LE_t * LIFE_EXP_INDEXATION_FRACTION;       // (12c)
  } else {
    A_R = cfg.retirementAgeBase;
  }
  return clamp(A_R, cfg.retirementAgeFloor, cfg.retirementAgeCeil);                // (12d)
}

// §5.4 eq (13): baseline career length.
export function T_career_base_of(cfg) {
  return cfg.retirementAgeBase - 22;
}

// §5.4 eq (14): year the first capi cohort retires.
export function T_capi_start_of(cfg) {
  if (cfg.cutoffAge == null) return 0;
  return Math.max(0, cfg.retirementAgeBase - cfg.cutoffAge);
}

// §5.6: capiRampSpan — duration of the cohort-activation ramp.
export function capiRampSpan_of(cfg) {
  if (cfg.cutoffAge == null) return Math.max(5, cfg.retirementAgeBase - 22);
  return Math.max(5, cfg.cutoffAge - 22);
}

// §5.4 eq (15): worker-contribution share routed to capitalisation.
// Note: denominator is T_career_base (constant) per §10.3 — NOT A_R(t),
// which would make the routing non-monotone under indexed retirement age.
export function sigmaCapi(t, cfg) {
  if (!cfg.enableCapi) return 0;
  if (cfg.cutoffAge == null) return 1;
  const T_career_base = T_career_base_of(cfg);
  return clamp((cfg.cutoffAge - 22 + t) / T_career_base, 0, 1);
}

// §5.6: capiActivation(t) — fraction of post-2027 retirees in the capi system.
export function capiActivation(t, cfg) {
  if (!cfg.enableCapi) return 0;
  const start = T_capi_start_of(cfg);
  const span = capiRampSpan_of(cfg);
  return smoothstep(t, start, start + span);
}

// §5.2 eq (7a–c): retireeIdx via parametric smoothstep envelope
// (see §7 for kernel rationale; T_extinct = 70 in eq 7b is the extinction tail).
export function retireeIdx(t, profileName) {
  const p = DEMOGRAPHIC_PROFILES[profileName];
  const rampUp  = smoothstep(t, 0, p.peakT) * (p.peakMult - 1);                    // (7a)
  const decline = smoothstep(t, p.peakT, 70) * (p.peakMult - p.longRunMult);       // (7b)
  return 1 + rampUp - decline;                                                     // (7c)
}

// §5.2 eq (7d): activePopFactor — piecewise linear over the profile anchors.
export function activePopFactor(t, profileName) {
  return interpLinear(t, DEMOGRAPHIC_PROFILES[profileName].activePopAnchors);
}

// §5.2 eq (7e): cohIdx — legacy 2027-cohort survival share (T_extinct = 45 yr per §7).
export function cohIdx(t) {
  return 1 - smoothstep(t, 0, 45);
}

// =================== runSimulation ===================

// §5.5 phasing modes (UI exposure of equinoxePhasing is Task 3 scope; engine
// must implement all five modes per the spec).
function equinoxePhaseFactor(t, cfg) {
  switch (cfg.equinoxePhasing) {
    case 'immediate':  return 1;
    case 'phased-5y':  return smoothstep(t, 0, 5);
    case 'phased-10y': return smoothstep(t, 0, 10);
    case 'partial-50': return 0.5;
    case 'partial-75': return 0.75;
    // Unknown phasing string: treat as 'immediate' (defensive; never hit by tests).
    default:           return 1;
  }
}

// Deterministic 70-year simulation. Returns an array of yearly result rows.
// Spec evaluation order is preserved exactly (§5.1 → §5.14). Every non-trivial
// line carries the originating equation reference.
export function runSimulation(userConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...userConfig };
  const rows = [];

  // ---- State stocks (§2) ----
  let F_t = cfg.F0;
  let D_t = 0;
  let K_t = 0;
  let CI_t = 0;
  let CK_t = 0;
  // §5.14 cumDF convention: cumDF_(-1) = 1, so cumDF_0 = 1/(1+r_d(0)).
  let cumDF_prev = 1;
  let pvLegacyCum = 0;
  let pvCapiPayoutCum = 0;

  // ---- Constants per-config (no t dependence) ----
  const w_n   = fisher(cfg.w_r, cfg.pi);                       // §5.1 eq (1)
  const iota  = Math.min(w_n, cfg.pi);                         // §5.1 eq (2)
  // v1.0a: nominal conversion is on r_f_portfolio (Legacy-Fund return),
  // NOT r_f_annuity (which is used real in eq 53 for annuity pricing).
  const r_f_portfolio_n = fisher(cfg.r_f_portfolio, cfg.pi);   // §5.1 eq (3)
  const cm = cfg.constructionMultiplier;
  const g_h_eff = Math.max(0, cfg.g_h - 1.6 * (cm - 1) * 0.01);// §5.1 eq (6a)
  const delta_eff = cfg.delta * clamp(2 - cm, 0.3, 1.7);       // §5.1 eq (6b)
  const T_capi_start = T_capi_start_of(cfg);                   // §5.4 eq (14)
  const capiRampSpan = capiRampSpan_of(cfg);                   // §5.6
  const tau_e_eff = Math.max(0, cfg.tau_e - cfg.deltaTauxPatronal); // §5.3

  for (let t = 0; t < cfg.N; t++) {
    // ---------- §5.1 Growth factors ----------
    const Omega_t    = Math.pow(1 + w_n, t);                                    // (4)
    const I_factor_t = Math.pow(1 + iota, t);                                   // (5)
    const H_factor_t = Math.pow((1 + g_h_eff) * (1 + cfg.pi), t);               // (6)

    // ---------- §5.2 Demographic indices ----------
    const retireeIdx_t = retireeIdx(t, cfg.demoProfile);                        // (7c)
    const activePop_t  = activePopFactor(t, cfg.demoProfile);                   // (7d)
    const cohIdx_t     = cohIdx(t);                                             // (7e)
    const dependencyRatio_t = retireeIdx_t / activePop_t;                       // §5.2 diagnostic

    // ---------- §5.3 Wage bill & contributions ----------
    const empRateNow = cfg.employmentRate0
      + smoothstep(t, 0, cfg.employmentTransitionYears)
      * (cfg.employmentRateTarget - cfg.employmentRate0);                       // (8a)
    const empFactor = empRateNow / cfg.employmentRate0;                         // (8b)
    const W_t = cfg.W0 * Omega_t * empFactor * activePop_t;                     // (9)
    const C_s_t = W_t * cfg.tau_s;                                              // (10)
    const C_e_t = W_t * tau_e_eff;                                              // (11)

    // ---------- §5.4 Retirement age & cohort routing ----------
    const A_R_t = retirementAge(t, cfg);                                        // (12)
    const sigma_capi_t = sigmaCapi(t, cfg);                                     // (15)
    const C_s_capi_t = C_s_t * sigma_capi_t;                                    // (16)
    const C_s_payg_t = C_s_t * (1 - sigma_capi_t);                              // (17)

    // ---------- §5.5 Équinoxe ----------
    const R_t_millions = cfg.R0 * retireeIdx_t;
    const S0_brackets = cfg.useEquinoxe ? computeS0Brackets(R_t_millions) : 0;  // (18)
    const S0_total    = cfg.useEquinoxe
      ? S0_brackets + cfg.S0_irDeduction + cfg.S0_csg : 0;                      // (19)
    const phaseFactor_t = cfg.useEquinoxe ? equinoxePhaseFactor(t, cfg) : 0;    // (20)
    const S0_t = S0_total * phaseFactor_t;                                      // (21)
    const E0_net_t = cfg.E0 - S0_t;                                             // (22)

    // ---------- §5.6 Retirees split ----------
    const capiAct_t        = capiActivation(t, cfg);
    const capiRetirees_t   = (1 - cohIdx_t) * retireeIdx_t * capiAct_t;         // (23)
    const legacyRetirees_t = retireeIdx_t - capiRetirees_t;                     // (24)
    const legacyExp_t      = Math.max(0, E0_net_t * legacyRetirees_t * I_factor_t); // (25)

    // ---------- §5.7 HLM proceeds ----------
    // v1.0a eq (27): uniform geometric form. ΔU_t = U_t × ρ where U_t = U0×(1-ρ)^t.
    // Mass conservation: U_{t+1} = U_t − ΔU_t exactly. (v1.0 had a piecewise form
    // ΔU_t = (t==0)?U0·ρ : U0·(1-ρ)^(t-1)·ρ which forced ΔU_0 = ΔU_1 and violated
    // mass conservation by an extra year-1 cession.)
    const U_t       = cfg.U0 * Math.pow(1 - cfg.rho, t);                        // (26)
    const delta_U_t = U_t * cfg.rho;                                            // (27)
    const units_sold = delta_U_t * 1e6;
    const priceDiscount_t = (cfg.hlmDiscount && delta_eff > 0)
      ? Math.min(0.30, delta_eff * units_sold / cfg.baselineTransactions)
      : 0;                                                                      // (28)
    const P_eff_t = cfg.P0 * H_factor_t * (1 - priceDiscount_t);                // (29)
    const gain_t  = Math.max(0, P_eff_t - cfg.Pbook);
    const hlmActive_t  = 1 - smoothstep(t, cfg.T_hlm - 5, cfg.T_hlm);
    const H_t_proceeds = delta_U_t * gain_t * 0.95 * hlmActive_t;               // (30)

    // ---------- §5.8 Endogenous borrowing rate ----------
    const GDP_t   = cfg.baseGDP * Omega_t * empFactor * activePop_t;            // (31)
    const D_ext_t = cfg.existingDebt * (GDP_t / cfg.baseGDP);                   // (32)
    const debtRatio_t = (D_ext_t + D_t) / GDP_t * 100;                          // (33)
    const r_d_t   = computeRD(debtRatio_t, cfg);                                // (34)
    const debtInterest_t = D_t * r_d_t;                                         // (35)

    // ---------- §5.9 Cash flow & employer waterfall ----------
    const fundReturn_t = F_t * r_f_portfolio_n;                                 // (36)
    const abatement_t  = cfg.A0 * Omega_t * empFactor * activePop_t;            // (37)
    const nonEmplrNet_t = fundReturn_t + H_t_proceeds + abatement_t
                        + C_s_payg_t - debtInterest_t;                          // (38)
    const deficit_t = legacyExp_t - nonEmplrNet_t;                              // (39)
    const emplrAvail_t = C_e_t * (1 - cfg.phiF);                                // (40)

    let emplrToLeg_t, emplrToCap_t;
    if (deficit_t <= 0) {
      emplrToLeg_t = 0;            emplrToCap_t = C_e_t;
    } else if (deficit_t <= emplrAvail_t) {
      emplrToLeg_t = deficit_t;    emplrToCap_t = C_e_t - deficit_t;
    } else {
      emplrToLeg_t = emplrAvail_t; emplrToCap_t = C_e_t * cfg.phiF;
    }
    const netFlow_t = nonEmplrNet_t + emplrToLeg_t - legacyExp_t;               // (41)

    // ---------- §5.10 Borrow / repay ----------
    // SPEC AMBIGUITY 5: borrowed_t initialised to deficit-branch borrowing,
    // then incremented by capi shortfall in §5.13.
    let borrowed_t = 0;
    if (netFlow_t < 0) {
      borrowed_t = -netFlow_t;
      D_t = D_t + borrowed_t;                                                   // (42)
    } else {
      const repaid_t = Math.min(cfg.alpha * netFlow_t, D_t);
      D_t = D_t - repaid_t;
      F_t = F_t + (netFlow_t - repaid_t);                                       // (43)
    }

    // ---------- §5.11 Transition levy (smoothed) ----------
    // SPEC AMBIGUITY 2: spec writes T_capi_start(t) suggesting time-variation,
    // but T_capi_start is a constant in v1.0 per eq (14). v1.1 / v1.2 plan to
    // expose T_capi_start (and cutoffAge) as user parameters that may vary
    // over the lifetime of the run; for v1.0 it is treated as a constant.
    // SPEC AMBIGUITY 4: D_t in levyPhaseOut is post-§5.10 value.
    const T_lambda_eff   = Math.max(cfg.Tlambda, T_capi_start);
    const levyActivation = smoothstep(t, T_lambda_eff - 1, T_lambda_eff + 1);
    const levyPhaseOut   = GDP_t > 0 ? smoothstep(D_t / GDP_t, 0, 0.05) : 0;
    const levyFactor     = levyActivation * levyPhaseOut;
    const grossLevy_t = levyFactor * cfg.lambda * (C_s_capi_t + emplrToCap_t);
    const levy_t = Math.min(grossLevy_t, D_t);
    D_t = Math.max(0, D_t - levy_t);                                            // (44)
    const netCapiFlow_t = C_s_capi_t + emplrToCap_t - levy_t;                   // (45)

    // ---------- §5.12 Capi accumulation & GE penalty ----------
    const capiToGdp_t = K_t / GDP_t;                                            // (46)
    const gePenalty_t = computeGePenalty(capiToGdp_t, cfg.geKneeRatio, cfg.geFloorRatio); // (47)
    const r_c_eff_t   = cfg.r_c * gePenalty_t;                                  // (48)
    const r_cn_eff_t  = fisher(r_c_eff_t, cfg.pi);                              // (49)
    const K_avail_t   = K_t * (1 + r_cn_eff_t) + netCapiFlow_t;                 // (50)

    // ---------- §5.13 Capi payouts & state guarantee ----------
    // DELIBERATE ASYMMETRY (not an ambiguity): floor uses E0, not E0_net_t.
    // Équinoxe is a reform of the legacy PAYG payout structure only — by design
    // it does not reduce capi pensions. Spec §5.13 eq (51) is correct as written;
    // do not "harmonise" by substituting E0_net_t.
    const capiPayoutFloor_t = cfg.E0 * capiRetirees_t * I_factor_t;             // (51)
    const LE_at_A_R_t = cfg.lifeExpAt65_Y0 + (65 - cfg.retirementAgeBase)
                      + (t / 10) * cfg.lifeExpAt65_per_decade
                      - (A_R_t - cfg.retirementAgeBase);                        // (52a)
    const T_ret_t = Math.max(15, LE_at_A_R_t);                                  // (52b)
    // v1.0a eq (53): annuity priced at r_f_annuity (inflation-linked sovereign
    // hedge rate, ~1.5% real), NOT the Legacy Fund's diversified portfolio yield.
    // The guarantor must price the annuity at the rate at which they can hedge.
    const annuityRate_t = cfg.r_f_annuity > 0.001
      ? cfg.r_f_annuity / (1 - Math.pow(1 + cfg.r_f_annuity, -T_ret_t))
      : 1 / T_ret_t;
    // v1.0a eq (53a): capi pot is owned by retirees BY ASSET SHARE, not by
    // headcount share. The v1.0 formula `K_t × annuityRate × headcount_share`
    // applied a per-individual annuity rate (~7%) to the entire aggregate pot
    // scaled by the retiree-vs-total head ratio. Retirees actually own only a
    // fraction of K_t — the rest belongs to still-accumulating workers. The
    // v1.0 expropriation masked the transition's fiscal cost (cumShortfall=0).
    // Asset-share ramps from 0 (no capi retirees yet) to capiAssetShareSteadyState
    // over 30y starting at T_capi_start, proxying the time for the system to reach
    // actuarial steady-state.
    const capiAssetShare_t = smoothstep(t, T_capi_start, T_capi_start + 30)
                           * cfg.capiAssetShareSteadyState;                     // (53a)
    // capiRetireeShare_t retained as a real demographic quantity (used in
    // diagnostics) but DOES NOT feed the payout formula in v1.0a.
    const capiRetireeShare_t = retireeIdx_t > 0 ? capiRetirees_t / retireeIdx_t : 0;
    const potBasedPayout_t   = K_t * annuityRate_t * capiAssetShare_t;          // (53)
    const capiPayoutDesired_t = Math.max(capiPayoutFloor_t, potBasedPayout_t);  // (54)
    const shortfall_t  = Math.max(0, capiPayoutDesired_t - K_avail_t);
    const capiPayout_t = capiPayoutDesired_t;
    if (shortfall_t > 0) {
      D_t = D_t + shortfall_t;                                                  // (55)
      borrowed_t = borrowed_t + shortfall_t;
    }
    CK_t = CK_t + shortfall_t;                                                  // (56)
    K_t  = Math.max(0, K_avail_t - capiPayout_t);                               // (57)

    // ---------- §5.14 Diagnostics ----------
    // v1.0a eq (58): spread measures Legacy-Fund yield vs real sovereign cost.
    const spread_t = cfg.r_f_portfolio - (r_d_t - cfg.pi);                      // (58)
    CI_t = CI_t + debtInterest_t;                                               // (59)
    const cumDF_t = cumDF_prev / (1 + r_d_t);
    const pvLegacyExp_t  = legacyExp_t  * cumDF_t;
    const pvCapiPayout_t = capiPayout_t * cumDF_t;
    pvLegacyCum     = pvLegacyCum     + pvLegacyExp_t;
    pvCapiPayoutCum = pvCapiPayoutCum + pvCapiPayout_t;                         // (60)
    cumDF_prev = cumDF_t;

    rows.push({
      // identification
      t, year: cfg.Y0 + t,
      // §5.1 growth factors
      w_n, iota, r_f_portfolio_n, g_h_eff, delta_eff,
      Omega_t, I_factor_t, H_factor_t,
      // §5.2 demography
      retireeIdx: retireeIdx_t,
      activePopFactor: activePop_t,
      cohIdx: cohIdx_t,
      dependencyRatio_t,
      // §5.3 wages / contributions
      empRateNow, empFactor, W_t, tau_e_eff, C_s_t, C_e_t,
      // §5.4 retirement & routing
      A_R_t, sigma_capi_t,
      capiActivation: capiAct_t,
      T_capi_start, capiRampSpan,
      C_s_capi_t, C_s_payg_t,
      // §5.5 Équinoxe
      S0_brackets, S0_total, phaseFactor_t, S0_t, E0_net_t,
      // §5.6 retirees split & legacy expenditure
      legacyRetirees: legacyRetirees_t,
      capiRetirees: capiRetirees_t,
      legacyExp_t,
      // §5.7 HLM
      U_t, delta_U_t, units_sold, priceDiscount_t, P_eff_t, gain_t, hlmActive_t,
      H_t_proceeds,
      // §5.8 borrowing rate
      GDP_t, D_ext_t, debtRatio_t, r_d_t, debtInterest_t,
      // §5.9 waterfall
      fundReturn_t, abatement_t, nonEmplrNet_t, deficit_t, emplrAvail_t,
      emplrToLeg_t, emplrToCap_t, netFlow_t,
      // §5.10 (post-update) borrow tracker
      borrowed_t,
      // §5.11 levy
      T_lambda_eff, levyActivation, levyPhaseOut, levyFactor,
      grossLevy_t, levy_t, netCapiFlow_t,
      // §5.12 capi accumulation
      capiToGdp_t, gePenalty_t, r_c_eff_t, r_cn_eff_t, K_avail_t,
      // §5.13 payouts
      capiPayoutFloor_t, LE_at_A_R_t, T_ret_t, annuityRate_t,
      capiRetireeShare_t, capiAssetShare_t,
      potBasedPayout_t, capiPayoutDesired_t,
      shortfall_t, capiPayout_t,
      // §2 stocks (post-update)
      F_t, D_t, K_t, CI_t, CK_t,
      // §5.14 diagnostics
      spread_t, cumDF_t,
      pvLegacyExp_t, pvCapiPayout_t,
      pvLegacyCum_t: pvLegacyCum,
      pvCapiPayoutCum_t: pvCapiPayoutCum,
    });
  }
  return rows;
}
