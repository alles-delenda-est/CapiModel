// CapiModel simulation engine — current consolidated implementation.
// Legacy v1.0a/v1.1/v1.2/v1.3 branches are deprecated.
// This file implements the full current model, including:
//   - per-cohort PAYG accruals (eq 15a/15b/25b);
//   - tauK stock levy and surplus-growth levy (§5.10.1/§5.10.2, legacy mode);
//   - employer contribution-rate cut mechanics (§5.3);
//   - optional actuarial demographic kernel (demoMode='actuarial');
//   - overlapping cash-flow cascade (cashFlowMode='overlapping', v2.0 default).
// Spec source of truth: cdc_legacy_fund_model.md.
// Every non-trivial line of the simulation loop carries a `// eq (N)` comment.
//
// §4 (v2.0) actuarial demographic data — see DemographicKernel_plan.md.
// Used by activePopFactor_actuarial / retireeIdx_actuarial / cohIdx_actuarial.
import {
  COR_SCENARIOS,
  COR_YEARS,
  RETIREE_AGE_WEIGHTS_2027,
  S_mixed,
} from './demographic-tables.js';

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

// §3.3 indexation fraction: the share of the life-expectancy-at-65 gain by which
// the 'indexed' retirement-age mode raises the age each year. 0.92 makes the indexed
// path reach 67.6 by 2070 exactly, matching COR's balancing age (was 0.5, a gentler
// ½-LE rule). The user-facing tooltip rounds this to "90 %". Only used when
// retirementAgeMode === 'indexed'; the 'fixed' default (and the regression fixtures)
// are unaffected.
export const LIFE_EXP_INDEXATION_FRACTION = 0.92;

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
  // §4 (v2.0/v2.1) demographic kernel mode.
  //   'parametric' — smoothstep kernel (eqs 7a–e). Bit-identical to v1.x output.
  //   'actuarial'  — COR RA2025 + INSEE T60 2027 table-driven kernel (default v2.1+).
  // src/demographic-tables.js now holds primary-source data; 'actuarial' is the default.
  demoMode: 'actuarial',
  // §4 (v2.0) actuarial-mode scenario (ignored when demoMode === 'parametric').
  // 'cor_central' | 'cor_high' | 'cor_low'
  demoScenario: 'cor_central',
  // §4 (v2.0) female fraction in the 2027 retiree pool (T60 mortality blend).
  // COR retiree pool ≈ 48% male / 52% female. Affects cohIdx_actuarial only.
  mortalityFemaleFraction: 0.52,
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
  // §3.1 sovereign-debt base. Only the RATIO existingDebt/baseGDP enters the model
  // (eq 32: D_ext_t = existingDebt × GDP_t/baseGDP), i.e. the 2027 debt-to-GDP start.
  // 3570/3000 = 119% — the 2027 trajectory (INSEE: end-2025 = €3,460.5bn = 115.6% of
  // GDP, rising ~2pp/yr). Was 3450 (115%, ≈ the end-2025 level — stale for a 2027 base).
  existingDebt: 3570,
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
  // §5.3 (v1.3): employer contribution-rate cut, activated at t=taxCutStartT (year 2029).
  // deltaTauxPatronal: one-time step cut at taxCutStartT (absolute rate, e.g. 0.005 = 0.5 pp).
  // deltaTauxPatronalPA: additional annual increment applied each subsequent year
  //   (e.g. 0.005 = tau_e falls by another 0.5 pp every year after the initial step).
  //   With deltaTauxPatronalPA=0.005 tau_e reaches 0 after ~33 years (full employer relief by 2060).
  // Without tauK compensation any positive cut causes catastrophic debt growth.
  // Empirical optimum at step=0.5%, PA=0%: tauK=2.5% → total interest 3508 Md€ (−80%),
  //   terminal debt 17 Md€, initial relief ≈7 Md€/yr, eventual relief ≈630 Md€/yr (t=69).
  // Defaults 0: viable range is narrow; exposed only in expert Tier B (see App.jsx).
  deltaTauxPatronal: 0,
  deltaTauxPatronalPA: 0,
  // §5.3 (v1.3): year offset at which deltaTauxPatronal activates (default t=2 → 2029).
  taxCutStartT: 2,
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
  // E0: total pension expenditure (all régimes) at t=0 (2027), Md€.
  // Calibrated to COR juin 2025/2026 central scenario: all-in balance −0.2% GDP ≈ −6 Md€
  // in 2025-2027, with contributions 367 Md€ + FSV/État 40 Md€ = 407 Md€ revenue.
  // → E0 = 367 + 40 − (−6) = 413 Md€ ≈ 13.8% of 3 000 Md€ GDP (COR 2026: 13.9% in 2024 → 14.2% by 2070).
  // Previous value 390 understated 2027 expenditure by ~6% relative to COR data.
  E0: 413,
  useEquinoxe: true,
  equinoxePhasing: 'immediate',
  S0_irDeduction: 5,
  S0_csg: 5,
  // §3.6 capitalisation routing
  enableCapi: true,
  cutoffAge: 50,
  alpha: 1.0,
  // §5.10.1 (v1.2): annual levy rate on end-of-year K_t stock → transition-debt
  // repayment. Only fires while D_t > 0; capped by K_t solvency floor.
  // At deltaTauxPatronal=0%: optimum tauK=3.0% (total interest −88%, terminal debt 12 Md€).
  // At deltaTauxPatronal=0.5%: optimum tauK=2.5% (total interest −80%, terminal debt 17 Md€).
  // Default 0: expert-only parameter (see App.jsx Tier B). Set to 0.03 to activate.
  tauK: 0,
  // §5.10.2 (v1.3): surplus-growth levy — when K_t grows by more than thetaBuffer × K_t
  // in a given year, the excess growth is routed to transition-debt repayment.
  // "Growth" = net change in K_t after returns, contributions, payouts, and tauK levy.
  // Unlike tauK (stock levy), this cannot be blocked by the solvency floor because it
  // only fires when K_t is already growing — it never draws down principal.
  // At thetaBuffer=0.01 (1 %/yr): debt-free by ~2086 under default demographics.
  // At thetaBuffer=0 the full net growth goes to debt (aggressive); 0.02 is conservative.
  thetaBuffer: 0.01,
  lambda: 0.30,
  Tlambda: 15,
  // §3.6 v1.0a: long-run share of aggregate K_t notionally owned by current
  // retirees (vs still-accumulating workers). Eq (53a) ramps the actual share
  // from 0 to this plateau via smoothstep over 30 years starting at
  // T_capi_start. Without this scaling the model expropriates worker savings
  // and masks the transition's fiscal cost (the v1.0 bug).
  capiAssetShareSteadyState: 0.35,
  // §5.9/§5.13 (v2.0) cash-flow mode — see PR #17.
  //   'legacy'      — v1.3 waterfall: E0-indexed capi floor + terminal K_t draw.
  //   'overlapping' — K_t-share annuity floor (annuityFloorRate × capiAssetShare × K_t),
  //                   state guarantee posts ΔD_t annually rather than draining K_t.
  // 'legacy' is bit-identical to v1.3 output. 'overlapping' will become the
  // user-facing default once the fund-return cascade is calibrated; for now
  // the toggle is wired so v1.3 invariants/tests keep passing.
  cashFlowMode: 'legacy',
  // §5.13 (v2.0, balanced/overlapping mode) guaranteed annual payout rate on
  // K_t × capiAssetShare. Drawn from K_avail before any debt sweep.
  // 1.5% ≈ r_f_annuity, the actuarial floor below which there's no real return
  // guarantee. Bonus payments above floor come from capped surplus return.
  annuityFloorRate: 0.015,
  // §5.9 (v2.0, overlapping mode only) cap on fund return reinvested into K_t.
  // 20% is the design starting point pending calibration so K_t stabilises
  // over 2027–2096; tunable via expert UI once cascade is wired.
  reinvestCap: 0.20,
  // §5.14 (v2.0, overlapping mode only) debt-acceleration trigger.
  // When K_t ≥ K_debt_trigger (Md€), cascade routes surplus real return to
  // debt repayment (bucket 3) before the capi bonus (bucket 6). When K_t is
  // below the trigger, debt is deferred and the full surplus goes to capi.
  // 0 (default) = always accelerate debt, preserving v2.0a behavior.
  // Typical calibration: 10 000 Md€ → capi-first until the fund is mature,
  // then aggressive amortisation; Infinity = always defer debt (capi-first).
  K_debt_trigger: 0,
  // §5.13 (v2.0, balanced mode only — PR #18) — explicit cascade ordering
  // with strict separation of concerns: PAYG borrows for its own deficit,
  // K is preserved as a pension reserve, and only capped surplus return
  // (above a buffered solvency floor) is available to repay transition debt.
  // Capi contributions never cross-subsidise legacy PAYG (capiContribXSub=0).
  //
  // debtSweepShare      — share of real return available for debt repayment
  // debtSweepKCap       — max sweep as fraction of K_t (prevents draining)
  // debtSweepGdpCap     — max sweep as fraction of GDP_t (macro stability)
  // capiBonusShare      — share of post-debt surplus paid as bonus
  // KFloorBuffer        — solvency cushion above strict annuity reserve
  // debtSweepStartRatio — D/GDP at which sweep is fully active (smoothstep)
  // debtSweepEndRatio   — D/GDP at which sweep is fully inactive
  debtSweepShare: 0.50,
  debtSweepKCap: 0.010,
  debtSweepGdpCap: 0.008,
  capiBonusShare: 0.20,
  KFloorBuffer: 1.10,
  debtSweepStartRatio: 0.50,
  debtSweepEndRatio: 0.05,
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

  // §5.9a Diversification des moyens de financement (PR #21)
  // Fiscal transfers from CSG, FSV, État etc. that supplement payroll
  // contributions — modelled at the 2026 DREES ballpark (~40 Md€/yr).
  // Mode 'none'    : no transfer (engine default; preserves legacy test fixtures)
  // Mode 'full'    : transfer present + debt allowed (UI default)
  // Mode 'no-debt' : transfer present but new borrowing is blocked (insolvency
  //                  gap tracked separately as fiscalGap_t)
  // The transfer tapers to zero as K_retirees_bal's 1.5%-floor payout can
  // cover the full legacy outflow (i.e. the capi system is self-sustaining).
  fiscalTransferBase: 40,
  fiscalTransferMode: 'none',

  // §5.13a Canonical reform modes (PR #21 — engine flags; PR #24 — Sweden logic).
  chileMode: false,    // recognition bonds for pre-reform PAYG contributions (indexed to French inflation)
  swedenMode: false,   // NDC PAYG with Automatic Balance Mechanism + small funded pillar
  // §5.16 Swedish mode (PR #24) — calibrated against Inkomstpension + Premiepension.
  // Sweden splits 18.5% total contributions as 16% NDC + 2.5% PPM = 13.5% to funded.
  // For France's ~28% total rate, 4% wages ≈ 14% of contributions to capi.
  // swedenCapiRate: fraction of WAGES (not contributions) routed to capi pillar.
  // Slider range 0.01–0.06 in UI; >tau_s would draw from employer side (capped).
  swedenCapiRate: 0.04,
  // ABM: automatic indexation/benefit haircut when PAYG resources < outflows.
  // Floor caps the haircut so pensions never fall below `swedenABMFloor × pre-cut`.
  swedenABM: true,
  swedenABMFloor: 0.50,

  // §5.X Leveraged injection (PR pure-capi): state borrows this amount each year
  // and invests it directly in the capi fund. Adds symmetrically to D_t and K inflow.
  // Units: Md€/yr (nominal). Only meaningful with chileMode and tauK=0.
  leveragedInjection: 0,
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
// indexed: A_R(t) rises by 0.92 of the gain in life expectancy at 65 since Y0
//   (reaches 67.6 by 2070 exactly, matching COR's balancing age).
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

// §5.4 eq (15a) v1.1: per-cohort PAYG accrual share for a worker born in
// `birthYear`. Piecewise — implementations MUST NOT collapse this to a
// `min(ageInY0, cutoffAge)` clamp: the function is genuinely discontinuous
// at `cutoffAge` (cohorts above the boundary are full-PAYG retirees who
// jump to share = 1.0; cohorts AT or below the boundary are transitional).
//
// Spec form (CapiModelSpec_v1.1.md §5.6.1):
//   if ageInY0 > cutoffAge:        share = 1.0
//   elif 22 ≤ ageInY0 ≤ cutoffAge: share = (ageInY0 − 22) / (A_R(0) − 22)
//   else (ageInY0 < 22):           share = 0
//
// Boundary case: ageInY0 == cutoffAge → transitional, NOT 1.0. With defaults
// cutoffAge=50, A_R(0)=64 this is 28/42 ≈ 0.667. The cohort one year older
// (ageInY0 = cutoffAge + 1) jumps discontinuously to share = 1.0.
//
// Special cases:
//   * cfg.enableCapi === false → 1.0 for everyone (no transition).
//   * cfg.cutoffAge == null with enableCapi === true → all working-age
//     cohorts route to capi from t=0, so share = 0 (no transitional band).
export function legacyShareOfCohort(birthYear, cfg) {
  if (cfg.enableCapi === false) return 1.0;
  if (cfg.cutoffAge == null) return 0;
  const ageInY0 = cfg.Y0 - birthYear;
  const A_R0 = retirementAge(0, cfg);
  // (15a) explicit piecewise — DO NOT replace with a clamp.
  if (ageInY0 > cfg.cutoffAge) {
    return 1.0;                             // regime 1: full PAYG, never in capi
  } else if (ageInY0 >= 22) {
    return (ageInY0 - 22) / (A_R0 - 22);    // regime 2: transitional ramp
  } else {
    return 0;                               // regime 3: full capi
  }
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

// =================== §5.2 (v2.0) actuarial kernel ===================
//
// Three table-driven replacements for eqs 7c′, 7d′, 7e′.  All three return
// normalised indices (ratio to t=0 value) so downstream equations 9, 10, 11,
// 23, 24, 25, 25b, 31 are structurally unchanged.
//
// See DemographicKernel_plan.md §5.1–5.3 for the full design rationale.

/** Linear interpolation of `value` against a `years` array.
 *  Both arrays are aligned (same length, monotonically increasing years).
 *  Years outside the range clamp to the boundary value. */
function _interpYears(year, years, values) {
  if (year <= years[0]) return values[0];
  if (year >= years[years.length - 1]) return values[values.length - 1];
  // Binary search would be O(log n) but the array is small (73 entries) and
  // year always lands within ±1 of the integer index — direct lookup is fine.
  const idx = year - years[0];
  if (Number.isInteger(year) && idx >= 0 && idx < years.length) {
    return values[idx];
  }
  // Non-integer year: linear interpolation between floor and ceil.
  const lo = Math.floor(idx);
  const hi = lo + 1;
  const frac = idx - lo;
  return values[lo] + frac * (values[hi] - values[lo]);
}

/** §5.2 eq (7d′): activePopFactor_actuarial = P_act_t / P_act_0.
 *  cfg must define `demoScenario` (one of cor_central/cor_high/cor_low). */
export function activePopFactor_actuarial(t, cfg) {
  const scen = COR_SCENARIOS[cfg.demoScenario];
  if (!scen) throw new Error(`Unknown demoScenario: ${cfg.demoScenario}`);
  const Y0 = cfg.Y0 ?? 2027;
  const P_act_0 = _interpYears(Y0, COR_YEARS, scen.P_act);
  const P_act_t = _interpYears(Y0 + t, COR_YEARS, scen.P_act);
  return P_act_t / P_act_0;
}

/** §5.2 eq (7c′): retireeIdx_actuarial = P_ret_t / P_ret_0. */
export function retireeIdx_actuarial(t, cfg) {
  const scen = COR_SCENARIOS[cfg.demoScenario];
  if (!scen) throw new Error(`Unknown demoScenario: ${cfg.demoScenario}`);
  const Y0 = cfg.Y0 ?? 2027;
  const P_ret_0 = _interpYears(Y0, COR_YEARS, scen.P_ret);
  const P_ret_t = _interpYears(Y0 + t, COR_YEARS, scen.P_ret);
  return P_ret_t / P_ret_0;
}

/** §5.2 eq (7e′): cohIdx_actuarial — age-weighted T60 survival of the 2027
 *  retiree pool, with male/female blended at the SURVIVAL-CURVE level. */
export function cohIdx_actuarial(t, cfg) {
  const f = cfg.mortalityFemaleFraction ?? 0.52;
  let acc = 0;
  for (let aOffset = 0; aOffset < 22; aOffset++) {
    acc += RETIREE_AGE_WEIGHTS_2027[aOffset] * S_mixed(aOffset, t, f);
  }
  return clamp(acc, 0, 1); // weights sum to ≈1.0; clamp guards float rounding
}

// =================== runSimulation ===================

// §5.5 phasing modes (UI exposure of equinoxePhasing is Task 3 scope; engine
// must implement all five modes per the spec).
// §5.13 (v2.0, balanced mode — PR #18) capi asset share helper.
// Uses post-contribution numerator AND denominator to avoid the timing
// distortion of overlapping mode (which divides by K_open_t, the start-of-period
// stock, while the numerator already includes this period's contributions).
// Aligning both sides on K_avail_t (= K_open_t × (1+r_cn) + netCapiFlow_t)
// gives a consistent end-of-period share before any payout.
// `sumCapiContrib` is passed post-increment (i.e., already includes the current
// period's netCapiFlow_t per the engine loop's accumulation order).
export function computeCapiAssetShareBalanced({
  K_avail_t,
  sumCapiContrib,
}) {
  const numerator = Math.max(0, sumCapiContrib);
  const denominator = Math.max(K_avail_t, 1e-9);
  return clamp(numerator / denominator, 0, 1);
}

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
// Maps demoProfile values to actuarial demoScenario equivalents.
// Under parametric mode demoProfile is used directly; under actuarial mode
// demoProfile is a no-op unless we translate it here (PR #34 A.2).
const PROFILE_TO_SCENARIO = {
  realistic:   'cor_high',
  cor_central: 'cor_central',
  reformed:    'cor_low',
}

export function runSimulation(userConfig = {}) {
  let cfg = { ...DEFAULT_CONFIG, ...userConfig };

  // When in actuarial mode, translate demoProfile → demoScenario so that
  // rung overrides (e.g. demoProfile:'realistic') and the conditions-slider
  // stress override (demoProfile:'realistic') actually affect the simulation.
  if (cfg.demoMode === 'actuarial' && PROFILE_TO_SCENARIO[cfg.demoProfile]) {
    cfg = { ...cfg, demoScenario: PROFILE_TO_SCENARIO[cfg.demoProfile] }
  }

  const rows = [];

  // ---- State stocks (§2) ----
  // Legacy Fund is a reform instrument — zero it out in the no-capi counterfactual.
  let F_t = cfg.enableCapi ? cfg.F0 : 0;
  let D_t = 0;
  let K_t = 0;
  let CI_t = 0;
  let CK_t = 0;
  // §5.14 cumDF convention: cumDF_(-1) = 1, so cumDF_0 = 1/(1+r_d(0)).
  let cumDF_prev = 1;
  let pvLegacyCum = 0;
  let pvCapiPayoutCum = 0;
  // §5.6.1 v1.1 per-cohort PAYG accrual state:
  //   legacyShareAvg — population-weighted running average legacy share across
  //     capi-cohort retirees alive at year t (eq 15b).
  //   capiRetirees_prev — last-period capi retiree count for the running blend.
  let legacyShareAvg = 0;
  let capiRetirees_prev = 0;
  // §6.5 (v2.0) per-cohort population mask — actuarial mode only. Each entry:
  //   { entryYear, count, legacyShare, ageOffset }  (ageOffset = ageAtEntry − 64,
  //   clamped to [0,21] to index the T60 survival matrices).
  // Replaces the v1.1 held-flat blend with a true mortality-weighted mean:
  // older sub-cohorts (higher legacyShare) die faster, so legacyShareAvg_t
  // declines at the correct actuarial pace. Empty in parametric mode.
  const capiCohortHistory = [];
  // PR #17 accounting identity: cumulative net capi contributions (C_s_capi + employer − levy).
  // Used in overlapping mode to derive capiAssetShare_t without a free parameter.
  let sumCapiContrib = 0;
  // PR #19: retirees' accumulated pot in balanced mode — tracks only the K belonging to
  // retired cohorts, preventing early-year floor inflation from including workers' pot.
  let K_retirees_bal = 0;
  let K_retirees_bal_prev = 0;  // end-of-prior-period retirees' pot (for taper)
  // §5.15 Recognition bonds (PR #21b/c, PR #23). Zero-coupon CPI-linked bonds.
  // In chileMode: BR_t initialised to chileB0 (total NPV at t=0); 0 otherwise.
  // cumRepayFund: accumulated CDC returns + HLM proceeds + Équinoxe savings.

  // In chileMode: compute B_0 = total recognition bond NPV at t=0, discounted at iota.
  // Since transitionalPaygExpGross_t and annuityRate_t are independent of contribution
  // routing (D_t, K_t), a chileMode=false dry run gives exact values. No recursion
  // risk — the dry run has chileMode=false so skips this block.
  let chileB0 = 0;
  if (cfg.chileMode) {
    const dryRows = runSimulation({ ...cfg, chileMode: false });
    // iota = min(fisher(w_r, pi), pi) — same formula used inside the main loop.
    const iotaDry = Math.min(fisher(cfg.w_r, cfg.pi), cfg.pi);
    // B₀ = PV of all future transitional pension cash flows discounted at iota.
    // This is the implicit pension debt made explicit — not capital required to fund
    // a perpetuity (which would inflate by ~1/annuityRate ≈ 20×).
    chileB0 = dryRows.reduce((sum, r, i) => {
      const ai = r.transitionalPaygExpGross_t ?? 0;
      return ai > 0 ? sum + ai / Math.pow(1 + iotaDry, i) : sum;
    }, 0);
  }

  let BR_t = chileB0;
  let repayFundBalance = 0;  // spendable balance: inflows less amounts already spent on redemptions
  let cumRepayFund = 0;      // cumulative inflows to the repayment fund (diagnostic, never spent from)
  // §5.7 HLM stock tracker: recursive so hlmActive_t taper stops depleting U_state.
  let U_state = cfg.U0;

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

  // §5.13a chileMode incompatibility override (PR #25 fix).
  // Recognition bonds (chileMode) divert 100% of contributions to capi from
  // t=0, leaving PAYG with effectively no contribution revenue. The legacy
  // waterfall amortises this via the lambda transition levy and the
  // surplusLevy mechanism (both scale with capi inflow / K growth). The
  // balanced/overlapping cascades enforce strict K↔PAYG separation, capping
  // capiDebtRepaid at ~1 % of GDP — orders of magnitude too tight for a 100 %
  // diversion deficit. Result: D_t runs away exponentially against the r_d
  // cap. Force the legacy waterfall whenever chileMode is on; preserve the
  // user's cashFlowMode choice for non-chile runs.
  for (let t = 0; t < cfg.N; t++) {
    const K_start_t = K_t;                  // snapshot before any this-year mutations

    // swedenMode and chileMode both force the legacy waterfall. The balanced/overlapping
    // cascades are full-capitalisation constructs (K must cover ALL future pensions, so
    // the floor scales with capiPayout). In swedenMode only ~35% of contributions feed K;
    // in chileMode 100% of contributions divert to capi but the legacy deficit is fully
    // debt-financed — in both cases the cascade under-sizes the floor and K compounds
    // unchecked. Legacy mode keeps capi → debt repayment pathways open and avoids runaway.
    // (PR #25 fix for chileMode; extended to swedenMode in PR #30.)
    const effectiveCashFlowMode = (cfg.swedenMode || cfg.chileMode) ? 'legacy' : cfg.cashFlowMode;

    // ---------- §5.1 Growth factors ----------
    const Omega_t    = Math.pow(1 + w_n, t);                                    // (4)
    const I_factor_t = Math.pow(1 + iota, t);                                   // (5)
    const H_factor_t = Math.pow((1 + g_h_eff) * (1 + cfg.pi), t);               // (6)

    // ---------- §5.4 (pre-computed) Retirement age — needed for §5.2 retiree-stock scaling ----------
    // A_R_t is used in two places: (a) retireeAgeScale_t below, (b) §5.4 cohort routing.
    const A_R_t = retirementAge(t, cfg);                                        // (12)
    // Mechanical retiree-stock response to the retirement age. Both the COR P_ret
    // tables (actuarial mode) and the parametric retireeIdx are calibrated to an
    // effective retirement age of 64. Scale the retiree count by how far the ACTUAL
    // retirement age A_R(t) sits above/below 64 — each extra year of work removes
    // ~1/T_ret of the standing retiree stock (and vice-versa). This makes the base
    // age a genuine PAYG lever (raise it → fewer retirees → lower legacy cost) in
    // BOTH modes, and subsumes the previous indexed-only rise. At the default
    // (retirementAgeBase = 64, mode 'fixed') A_R = 64 → scale = 1, so the default
    // output is bit-identical to before (regression fixtures unaffected).
    const RETIREE_TABLE_BASE_AGE = 64;
    const T_ret_base_t = Math.max(15,
      cfg.lifeExpAt65_Y0 + (65 - cfg.retirementAgeBase)
      + (t / 10) * cfg.lifeExpAt65_per_decade);
    const deltaAR_t = A_R_t - RETIREE_TABLE_BASE_AGE;
    const retireeAgeScale_t = deltaAR_t !== 0
      ? clamp(1 - deltaAR_t / T_ret_base_t, 0.5, 1.5)
      : 1;

    // ---------- §5.2 Demographic indices — dispatched by demoMode ----------
    const retireeIdx_t = (cfg.demoMode === 'actuarial'                          // (7c / 7c′)
      ? retireeIdx_actuarial(t, cfg)
      : retireeIdx(t, cfg.demoProfile)) * retireeAgeScale_t;
    const activePop_t  = cfg.demoMode === 'actuarial'                           // (7d / 7d′)
      ? activePopFactor_actuarial(t, cfg)
      : activePopFactor(t, cfg.demoProfile);
    const cohIdx_t     = cfg.demoMode === 'actuarial'                           // (7e / 7e′)
      ? cohIdx_actuarial(t, cfg)
      : cohIdx(t);
    const dependencyRatio_t = retireeIdx_t / activePop_t;                       // §5.2 diagnostic

    // ---------- §5.3 Wage bill & contributions ----------
    const empRateNow = cfg.employmentRate0
      + smoothstep(t, 0, cfg.employmentTransitionYears)
      * (cfg.employmentRateTarget - cfg.employmentRate0);                       // (8a)
    const empFactor = empRateNow / cfg.employmentRate0;                         // (8b)
    const W_t = cfg.W0 * Omega_t * empFactor * activePop_t;                     // (9)
    const C_s_t = W_t * cfg.tau_s;                                              // (10)
    // v1.3: deltaTauxPatronal (step) + deltaTauxPatronalPA × years-since-start (annual glide).
    // Total cut is capped at tau_e (employer rate cannot go negative).
    // yearsAfterStart = 0 on activation year (step only), 1 on the following year (step + 1×PA), etc.
    const taxCutStartT = cfg.taxCutStartT ?? 2;
    const yearsAfterStart = t >= taxCutStartT ? (t - taxCutStartT) : 0;
    const totalCut_t = Math.min(cfg.tau_e, (cfg.deltaTauxPatronal ?? 0)
      + (cfg.deltaTauxPatronalPA ?? 0) * yearsAfterStart);
    const tau_e_eff = t >= taxCutStartT
      ? Math.max(0, cfg.tau_e - totalCut_t)
      : cfg.tau_e;                                                              // §5.3 (v1.3)
    const C_e_t = W_t * tau_e_eff;                                              // (11)

    // ---------- §5.4 Retirement age & cohort routing ----------
    // A_R_t pre-computed above (before §5.2) to enable retireeAgeScale_t.
    // In chileMode all worker contributions flow to capitalisation from t=0 (§5.15).
    // In swedenMode (§5.16) a fixed slice swedenCapiRate of W_t goes to the funded
    // pillar (Premiepension-style) — converted to a sigma_capi equivalent so the
    // rest of the engine is unchanged. Capped at 1 if swedenCapiRate > tau_s.
    //
    // Calibration note: with default swedenCapiRate=0.04 and tau_s≈0.1131, sigma_capi
    // ≈ 35% of employee contributions route to the funded pillar. Sweden's actual PPM
    // is ~13.5% (2.5/18.5). The higher French value reflects the smaller payroll base
    // (tau_s vs Sweden's 18.5%) and stronger funded-pillar ambition; users can lower
    // swedenCapiRate to mirror Sweden's split more closely.
    const sigma_capi_t = cfg.chileMode
      ? 1
      : cfg.swedenMode
        ? Math.min(1, (cfg.swedenCapiRate ?? 0) / Math.max(cfg.tau_s, 1e-9))
        : sigmaCapi(t, cfg);                                                      // (15)
    const C_s_capi_t = C_s_t * sigma_capi_t;                                    // (16)
    const C_s_payg_t = C_s_t * (1 - sigma_capi_t);                              // (17)

    // ---------- §5.6 Retirees split (eqs 23, 24) — eq 25 deferred ----------
    // v1.0a: §5.5 Équinoxe consumes legacyRetirees_t (forward reference in spec).
    // Compute the headcount split first so §5.5 can scope its components.
    const capiAct_t        = capiActivation(t, cfg);
    const capiRetirees_t   = (1 - cohIdx_t) * retireeIdx_t * capiAct_t;         // (23)
    const legacyRetirees_t = retireeIdx_t - capiRetirees_t;                     // (24)

    // ---------- §5.5 Équinoxe (REVISED v1.0a, scope-split) ----------
    // Components 1 & 2 (benefit-side, legacy retirees only):
    //   S0_brackets_t (18) and S0_irDeduction_t (18b) reduce per-retiree legacy benefit.
    // Component 3 (tax-side, ALL retirees):
    //   S0_csg_t (18c) becomes revenue S0_csg_revenue_t flowing into nonEmplrNet (eq 38).
    // Phasing applies uniformly to all three components per §10.11.
    const phaseFactor_t = cfg.useEquinoxe ? equinoxePhaseFactor(t, cfg) : 0;    // (20)

    // (18): bracket reduction now scaled by legacyRetirees(t) × R0 (millions of
    // legacy direct-rights retirees), not retireeIdx (which would over-reduce).
    const S0_brackets_t = cfg.useEquinoxe
      ? computeS0Brackets(legacyRetirees_t * cfg.R0)
      : 0;                                                                      // (18)
    const S0_irDeduction_t = cfg.useEquinoxe
      ? cfg.S0_irDeduction * legacyRetirees_t
      : 0;                                                                      // (18b)
    const S0_csg_t = cfg.useEquinoxe
      ? cfg.S0_csg * retireeIdx_t
      : 0;                                                                      // (18c)

    // Apply scope:
    // (21a): benefit-side total reduction (gets phased, divided by retirees).
    const S0_legacy_t = (S0_brackets_t + S0_irDeduction_t) * phaseFactor_t;     // (21a)
    // (21b): per-retiree-equivalent net legacy pension level. Guard against
    // legacyRetirees → 0 in the long tail.
    const E0_legacy_t = cfg.E0 - S0_legacy_t / Math.max(legacyRetirees_t, 1e-9); // (21b)
    // (22): tax-side CSG revenue (phased), added to revenue stream in eq (38).
    const S0_csg_revenue_t = S0_csg_t * phaseFactor_t;                          // (22)

    // Diagnostics retained for backwards-comparison with v1.0:
    const S0_total = S0_brackets_t + S0_irDeduction_t + S0_csg_t;

    // ---------- §5.6 (continued): legacyExp_t now uses E0_legacy_t ----------
    // ABM (Sweden mode §5.16) may mutate legacyExp_t / transitionalPaygExp_t /
    // totalLegacyOutflow_t below — hence `let` rather than `const`.
    let legacyExp_t = Math.max(0, E0_legacy_t * legacyRetirees_t * I_factor_t); // (25)

    // ---------- §5.6.1 / §6.5: per-cohort PAYG accrual ----------
    // `legacyShareAvg_t` is the population-weighted mean legacy-accrual share
    // across capi-cohort retirees alive at year `t` (eq 15b). Two kernels:
    //   • actuarial — §6.5 per-cohort population mask: each sub-cohort ages
    //     with differential T60 mortality, so high-legacyShare older cohorts
    //     thin out faster and the mean declines at the true actuarial pace.
    //   • parametric — v1.1 held-flat blend (backward compat; bit-identical
    //     to v1.x for the parametric-mode regression fixture).
    const newCohortBirthYear_t = cfg.Y0 + t - cfg.retirementAgeBase;             // §10.3: anchor on retirementAgeBase
    let legacyShareAvg_t;
    if (cfg.demoMode === 'actuarial') {
      // §6.5 step 1 — apply one year of differential mortality to existing
      // sub-cohorts (entries are added at the end of their own entry year, so
      // every cohort seen here has tenure ≥ 1: no mortality in the entry year).
      const fMort = cfg.mortalityFemaleFraction ?? 0.52;
      for (const C of capiCohortHistory) {
        const tenure = t - C.entryYear;
        const sPrev = S_mixed(C.ageOffset, tenure - 1, fMort);
        const sNow  = S_mixed(C.ageOffset, tenure, fMort);
        C.count *= sPrev > 1e-12 ? sNow / sPrev : 0;
      }
      // §6.5 step 2 — add new entrants (the model's authoritative capiRetirees_t
      // headcount net of the surviving sub-cohort total).
      const survivingTotal = capiCohortHistory.reduce((s, C) => s + C.count, 0);
      const newEntrants = capiRetirees_t - survivingTotal;
      if (newEntrants > 1e-15) {
        capiCohortHistory.push({
          entryYear: t,
          count: newEntrants,
          legacyShare: legacyShareOfCohort(newCohortBirthYear_t, cfg),
          // T60 matrices cover entry ages 64–85; clamp guards indexed A_R(t).
          ageOffset: clamp(Math.round(A_R_t) - 64, 0, 21),
        });
      }
      // §6.5 — prune negligible sub-cohorts (< 1000 people) to bound iteration.
      for (let i = capiCohortHistory.length - 1; i >= 0; i--) {
        if (capiCohortHistory[i].count < 1e-9) capiCohortHistory.splice(i, 1);
      }
      // §6.5 step 3 — population-weighted mean legacy share.
      const totalCount = capiCohortHistory.reduce((s, C) => s + C.count, 0);
      legacyShareAvg_t = totalCount > 1e-12
        ? capiCohortHistory.reduce((s, C) => s + C.count * C.legacyShare, 0) / totalCount
        : 0;
    } else {
      // v1.1 parametric blend: explicit conditional on whether the transitional
      // retiree population grew or shrank in year `t`. The else-branch holds the
      // running average flat (NOT the if-branch with ΔR=0, which would inflate
      // the average). See §5.6.1 "Mortality-bias caveat".
      if (capiRetirees_t > capiRetirees_prev + 1e-15) {
        // (15b) if-branch: population-weighted blend of incumbent retirees with
        // new entrants. Both `capiRetirees_t > 0` and `> capiRetirees_prev`,
        // so the division is safe.
        const deltaCapiRet_t = capiRetirees_t - capiRetirees_prev;
        const newShare_t = legacyShareOfCohort(newCohortBirthYear_t, cfg);
        legacyShareAvg = (legacyShareAvg * capiRetirees_prev
                          + newShare_t * deltaCapiRet_t)
                         / capiRetirees_t;
      } else if (capiRetirees_t > 1e-12) {
        // (15b) else-branch: held flat (no division — explicitly preserves
        // the previous average rather than recomputing on a smaller R^capi).
        // legacyShareAvg = legacyShareAvg;  // intentional no-op
      } else {
        // R^capi_t ≈ 0: no transitional retirees → average undefined; spec
        // convention is 0 (no division).
        legacyShareAvg = 0;
      }
      legacyShareAvg_t = legacyShareAvg;
    }
    // (25b) aggregate transitional PAYG expenditure on capi-cohort retirees'
    // accrued PAYG rights. Uses E0_legacy_t (post-Équinoxe) per §5.6.1
    // per-portion scoping rule.
    // In chileMode (§5.15) these obligations are converted to recognition bonds;
    // the gross amount is preserved for bond sizing while the PAYG outflow = 0.
    const transitionalPaygExpGross_t = Math.max(
      0,
      capiRetirees_t * legacyShareAvg_t * E0_legacy_t * I_factor_t,
    );
    let transitionalPaygExp_t = cfg.chileMode ? 0 : transitionalPaygExpGross_t;
    // (25c) total PAYG outflow funded by the legacy fund.
    let totalLegacyOutflow_t = legacyExp_t + transitionalPaygExp_t;
    // §5.16 NDC PAYG pension (swedenMode): reform-cohort retirees draw (1−sigma_capi)
    // of their pension from NDC notional accounts, funded by current PAYG contributions.
    // This is the Inkomstpension side (16/18.5 ≈ 86% of contributions notionally).
    // Without this term, the funded pillar (PPM, K_t) would appear to cover ALL reform
    // pensions — understating PAYG pressure and making ABM effectively invisible.
    //
    // Approximation: pureCapi_t uses (1 − legacyShareAvg_t) as a proxy for "share of
    // capi retirees with no legacy rights." legacyShareAvg_t is a survival-weighted
    // running average, not a strict reform-cohort flag, so during transition years
    // (when transitional and pure-reform cohorts co-exist) the term may slightly
    // overestimate pure-reform headcount. Acceptable for a proof-of-concept; a clean
    // fix would require tracking a separate pureReform_t cohort stock.
    let ndcPaygPension_t = 0;
    if (cfg.swedenMode) {
      const pureCapi_t = capiRetirees_t * (1 - legacyShareAvg_t);
      ndcPaygPension_t = (1 - sigma_capi_t) * pureCapi_t * cfg.E0 * I_factor_t;
      totalLegacyOutflow_t += ndcPaygPension_t;
    }
    // Snapshot the pre-update value for the balanced cascade (§5.13 balanced uses
    // the new-retiree delta, but capiRetirees_prev is updated before that block runs).
    const capiRetirees_prev_snap = capiRetirees_prev;
    // Persist the running-average state for the next iteration.
    capiRetirees_prev = capiRetirees_t;
    // K_retirees_bal_prev is set at end-of-loop (after cascade) so the fiscal
    // transfer taper in §5.9a can use last period's retirees' pot.
    // (Initialised above as 0; updated below after the cascade block.)

    // ---------- §5.7 HLM proceeds ----------
    // v2.0: recursive stock tracking. ΔU_t = U_t × ρ × hlmActive_t so the taper
    // reduces actual sales (and U_state stops declining) rather than just zeroing
    // proceeds while the stock silently empties. hlmActive_t is applied here, not
    // in H_t_proceeds, so both stock and revenue taper together.
    // Mass conservation: U_{t+1} = U_t − ΔU_t holds exactly for all t.
    const U_t          = U_state;                                                // (26) recursive
    const hlmActive_t  = 1 - smoothstep(t, cfg.T_hlm - 5, cfg.T_hlm);
    const delta_U_t    = U_t * cfg.rho * hlmActive_t;                           // (27) taper applied
    const units_sold   = delta_U_t * 1e6;
    const priceDiscount_t = (cfg.hlmDiscount && delta_eff > 0)
      ? Math.min(0.30, delta_eff * units_sold / cfg.baselineTransactions)
      : 0;                                                                      // (28)
    const P_eff_t = cfg.P0 * H_factor_t * (1 - priceDiscount_t);                // (29)
    const gain_t  = Math.max(0, P_eff_t - cfg.Pbook);
    const H_t_proceeds = delta_U_t * gain_t * 0.95;                             // (30)
    U_state = U_state - delta_U_t;                                               // stock update

    // ---------- §5.8 Endogenous borrowing rate ----------
    const GDP_t   = cfg.baseGDP * Omega_t * empFactor * activePop_t;            // (31)
    const D_ext_t = cfg.existingDebt * (GDP_t / cfg.baseGDP);                   // (32)
    const debtRatio_t = (D_ext_t + D_t) / GDP_t * 100;                          // (33)
    const r_d_t   = computeRD(debtRatio_t, cfg);                                // (34)
    const debtInterest_t = D_t * r_d_t;                                         // (35)

    // ---------- §5.9 Cash flow & employer waterfall ----------
    // v1.2 fix: use REAL rate so the inflation component πF_t stays in the fund.
    // r_f_portfolio_n retained in row output as a diagnostic field only.
    const fundReturn_t = F_t * cfg.r_f_portfolio;                               // (36) v1.2
    // The abatement revenue ("suppression de l'abattement fiscal") is a
    // tax-side measure within the Équinoxe package — gated on useEquinoxe and
    // phased like the §5.5 components (S0_brackets / S0_irDeduction / S0_csg).
    const abatement_t  = cfg.useEquinoxe
      ? cfg.A0 * Omega_t * empFactor * activePop_t * phaseFactor_t
      : 0;                                                                     // (37)
    // v1.0a eq (38): S0_csg_revenue_t added as a tax-side revenue stream that
    // applies to all retiree pension income (legacy + capi). Distinct from the
    // benefit-side reductions (eqs 21a/21b) which only affect legacy.
    // §5.9a Fiscal transfer (PR #21): CSG/FSV/État supplements that keep the
    // PAYG system solvent today.  Tapers proportionally to the fraction of
    // retirees still on legacy pensions — this is cleanly monotone, bounded
    // [0,1], and converges to zero as the final transitional cohort exits.
    // `capiCoverage_t` is exported as 1 − legacyFrac for UI display (it
    // represents the fraction of retirees now fully covered by capi).
    let fiscalTransfer_t = 0;
    let capiCoverage_t   = 0;
    if (cfg.fiscalTransferMode !== 'none') {
      const legacyFrac_t = retireeIdx_t > 1e-9
        ? Math.min(1, legacyRetirees_t / retireeIdx_t)
        : 0;
      capiCoverage_t   = 1 - legacyFrac_t;
      fiscalTransfer_t = (cfg.fiscalTransferBase ?? 40) * legacyFrac_t;
    }

    const nonEmplrNet_t = fundReturn_t + H_t_proceeds + abatement_t
                        + C_s_payg_t + S0_csg_revenue_t - debtInterest_t
                        + fiscalTransfer_t;                                      // (38′)
    // phiF (employer floor to capi) is only active in legacy mode.
    // In overlapping/balanced modes the cascade covers capi payout from K_t directly,
    // so all employer contributions flow to legacy first (phiF = 0 effective).
    const phiF_eff = (effectiveCashFlowMode === 'overlapping' || effectiveCashFlowMode === 'balanced')
      ? 0 : (cfg.phiF ?? 0);
    const emplrAvail_t = C_e_t * (1 - phiF_eff);                               // (40)

    // §5.9b §5.16 Automatic Balance Mechanism (Sweden NDC) — PR #24.
    // Inspired by the Inkomstpension "balansindex": if projected outflows exceed
    // available PAYG resources, indexation is haircut proportionally so the
    // system stays solvent without borrowing. Floor capped at swedenABMFloor
    // (default 0.5) to avoid degenerate near-zero pension outcomes.
    //
    // Resource base is STRICTLY PAYG contributions (employee PAYG + employer
    // available). Excludes fund return, HLM proceeds, abatement, CSG, and fiscal
    // transfers — those are discretionary fiscal levers, not contribution-based
    // flows, and folding them in would turn the automatic mechanism into a
    // discretionary backstop and silently absorb the shocks it is supposed to
    // expose. This is a deliberate departure from a permissive "total fiscal
    // capacity" reading toward the narrow balansindex definition.
    //
    // Cuts apply pro-rata to legacy + transitional PAYG + NDC PAYG buckets.
    // INVARIANT: pre-ABM totalLegacyOutflow_t MUST equal legacyExp_t +
    // transitionalPaygExp_t + ndcPaygPension_t. If a fourth PAYG expense type
    // is ever added to totalLegacyOutflow_t upstream, it must also be cut
    // here and included in the reconstruction below, otherwise abmCut_t and
    // the post-cut total will drift out of accounting consistency.
    let abmFactor_t = 1;
    let abmCut_t = 0;
    if (cfg.swedenMode && cfg.swedenABM && totalLegacyOutflow_t > 1e-9) {
      const paygResources_t = C_s_payg_t + emplrAvail_t;
      if (totalLegacyOutflow_t > paygResources_t) {
        const rawRatio = paygResources_t / totalLegacyOutflow_t;
        abmFactor_t = Math.max(cfg.swedenABMFloor ?? 0.5, rawRatio);
        abmCut_t = totalLegacyOutflow_t * (1 - abmFactor_t);
        legacyExp_t *= abmFactor_t;
        transitionalPaygExp_t *= abmFactor_t;
        ndcPaygPension_t *= abmFactor_t;
        totalLegacyOutflow_t = legacyExp_t + transitionalPaygExp_t + ndcPaygPension_t;
      }
    }

    // v1.1 eq (39'): deficit measured against TOTAL PAYG outflow
    // (legacy-cohort + transitional-cohort accrued rights), not legacy-cohort
    // alone. legacyExp_t is preserved as a separate diagnostic; the waterfall
    // consumes totalLegacyOutflow_t.
    const deficit_t = totalLegacyOutflow_t - nonEmplrNet_t;                     // (39')

    let emplrToLeg_t, emplrToCap_t;
    if (!cfg.enableCapi) {
      // No capitalisation pillar: all employer contributions fund legacy PAYG.
      // Without this guard the leftover-employer-to-capi buffer (deficit ≤ 0 and
      // deficit ≤ emplrAvail branches) would spuriously fund K_t and pin netFlow_t
      // to exactly 0, making the PAYG balance insensitive to Équinoxe.
      emplrToLeg_t = C_e_t;        emplrToCap_t = 0;
    } else if (cfg.chileMode) {
      // All employer contributions to capi — legacy deficit fully debt-financed (§5.15).
      emplrToLeg_t = 0;            emplrToCap_t = C_e_t;
    } else if (deficit_t <= 0) {
      emplrToLeg_t = 0;            emplrToCap_t = C_e_t;
    } else if (deficit_t <= emplrAvail_t) {
      emplrToLeg_t = deficit_t;    emplrToCap_t = C_e_t - deficit_t;
    } else {
      emplrToLeg_t = emplrAvail_t; emplrToCap_t = C_e_t * phiF_eff;
    }
    const netFlow_t = nonEmplrNet_t + emplrToLeg_t - totalLegacyOutflow_t;      // (41) v1.1
    // v1.3 diagnostics: employer tax-cut channels.
    // Initial cut: annual saving from the fixed year-2 rate reduction.
    // Eventual cut: freed employer legacy obligation flowing to capi — the
    //   amount that could alternatively be returned as ongoing tax relief.
    const employerCutInitial_t = W_t * totalCut_t;  // annual employer savings (current year)
    const employerCutEventual_t = emplrToCap_t;

    // ---------- §5.10 Borrow / repay ----------
    // SPEC AMBIGUITY 5: borrowed_t initialised to deficit-branch borrowing,
    // then incremented by capi shortfall in §5.13.
    let borrowed_t = 0;
    let fiscalGap_t = 0;   // shortfall blocked from becoming debt in 'no-debt' mode
    if (netFlow_t < 0) {
      borrowed_t = -netFlow_t;
      if (cfg.fiscalTransferMode === 'no-debt') {
        // No new sovereign borrowing: gap is tracked but D_t doesn't grow.
        fiscalGap_t = borrowed_t;
        borrowed_t  = 0;
      } else {
        D_t = D_t + borrowed_t;                                                 // (42)
      }
      F_t = F_t * (1 + cfg.pi);       // v1.2: compound at π (was: unchanged eq 26)
    } else {
      // alpha (PAYG-surplus-to-debt routing) is only active in legacy mode.
      // In overlapping/balanced modes the K-side cascade owns debt repayment.
      // Exception: when capi is off there is no cascade, so PAYG surpluses must
      // repay debt directly regardless of cashFlowMode.
      const alpha_eff = !cfg.enableCapi
        ? (cfg.alpha ?? 1)
        : (effectiveCashFlowMode === 'overlapping' || effectiveCashFlowMode === 'balanced')
          ? 0 : (cfg.alpha ?? 1);
      const repaid_t = Math.min(alpha_eff * netFlow_t, D_t);
      D_t = D_t - repaid_t;
      if (cfg.enableCapi) {
        F_t = F_t * (1 + cfg.pi) + (netFlow_t - repaid_t);                     // (43) v1.2
      }
      // else: no reform fund — PAYG surplus beyond debt repayment is a fiscal
      // improvement not tracked as a separate stock.
    }

    // ---------- §5.11 Transition levy (smoothed) ----------
    // lambda levy is only active in legacy mode. In overlapping mode, cascade
    // bucket 4 incorporates its effect. In balanced mode (PR #18) lambda is
    // disabled — capi contributions never cross-subsidise legacy PAYG.
    // SPEC AMBIGUITY 2: spec writes T_capi_start(t) suggesting time-variation,
    // but T_capi_start is a constant in v1.0 per eq (14).
    // SPEC AMBIGUITY 4: D_t in levyPhaseOut is post-§5.10 value.
    const isCascadeMode  = (effectiveCashFlowMode === 'overlapping' || effectiveCashFlowMode === 'balanced');
    const T_lambda_eff   = Math.max(cfg.Tlambda ?? 15, T_capi_start);
    const levyActivation = isCascadeMode ? 0
      : smoothstep(t, T_lambda_eff - 1, T_lambda_eff + 1);
    const levyPhaseOut   = isCascadeMode ? 0
      : (GDP_t > 0 ? smoothstep(D_t / GDP_t, 0, 0.05) : 0);
    const levyFactor     = levyActivation * levyPhaseOut;
    const grossLevy_t    = levyFactor * (cfg.lambda ?? 0) * (C_s_capi_t + emplrToCap_t);
    const levy_t = Math.min(grossLevy_t, D_t);
    if (levy_t > 0) D_t = Math.max(0, D_t - levy_t);                           // (44)
    const netCapiFlow_t = C_s_capi_t + emplrToCap_t - levy_t;                   // (45)

    // §5.X Leveraged injection: borrowed capital invested directly in capi fund.
    // Adds to D_t (new borrowing) and to K inflow symmetrically.
    const leveragedInjection_t = cfg.leveragedInjection ?? 0
    D_t += leveragedInjection_t
    const netCapiFlowFull_t = netCapiFlow_t + leveragedInjection_t

    // ---------- §5.12 Capi accumulation & GE penalty ----------
    // GE feedback (v1.2): tauK lowers K_t/GDP_t → lower gePenalty_t → higher r_c_eff_t.
    // This first-order offset is automatically captured here since capiToGdp uses
    // the pre-tauK K_t (this year's stock before levy); the levy fires in §5.10.1
    // after §5.13, so next year's K_t (post-levy) feeds next year's capiToGdp.
    const capiToGdp_t = K_t / GDP_t;                                            // (46)
    const gePenalty_t = computeGePenalty(capiToGdp_t, cfg.geKneeRatio, cfg.geFloorRatio); // (47)
    const r_c_eff_t   = cfg.r_c * gePenalty_t;                                  // (48)
    const r_cn_eff_t  = fisher(r_c_eff_t, cfg.pi);                              // (49)

    // ---- §5.12 / §5.13 dispatch on cashFlowMode ----
    // Declared here so §5.14 and rows.push can consume them regardless of branch.
    let K_avail_t, capiPayoutFloor_t, annuityRate_t, T_ret_t, LE_at_A_R_t;
    let capiAssetShare_t, capiRetireeShare_t, potBasedPayout_t;
    let capiPayoutDesired_t, shortfall_t, capiPayout_t;
    let K_floor_t, tauKLevy_t, K_growth_t, surplusAboveBuffer_t, surplusPhaseIn_t, surplusLevy_t;
    // Overlapping-only diagnostics (zero in legacy mode for row schema consistency)
    let fundReturnCapi_t = 0, capiLegacyXSub_t = 0, capiContribXSub_t = 0;
    let capiDebtRepaid_t = 0, capiReinvest_t = 0, capiBonus_t = 0;
    // Balanced-mode (PR #18) diagnostics (zero in other modes)
    let surplusAboveFloor_t = 0, debtSweepPhase_t = 0, debtSweepCapacity_t = 0;
    let guaranteeShortfall_t = 0;

    // Annuity rate (used in both branches)
    LE_at_A_R_t = cfg.lifeExpAt65_Y0 + (65 - cfg.retirementAgeBase)
                + (t / 10) * cfg.lifeExpAt65_per_decade
                - (A_R_t - cfg.retirementAgeBase);                              // (52a)
    T_ret_t = Math.max(15, LE_at_A_R_t);                                        // (52b)
    annuityRate_t = cfg.r_f_annuity > 0.001
      ? cfg.r_f_annuity / (1 - Math.pow(1 + cfg.r_f_annuity, -T_ret_t))
      : 1 / T_ret_t;                                                            // (53)

    // ---------- §5.15 Recognition bonds (PR #21b/c, PR #23) ----------
    // Zero-coupon principal-inflation-linked bonds (Chilean DL 3500 structure):
    //   - One-time issuance at t=0: D_t ↑ by chileB0 (total NPV of all transitional
    //     workers' accrued pension rights). BR_t initialised to chileB0.
    //   - Principal grows at iota (CPI-indexed) until each cohort's retirement.
    //   - At retirement: bond REDEEMS → K_t credited with NPV of that cohort's pension.
    //     Pension is then paid from K_t via the normal capi cascade (self-funded).
    //   - No annual coupon during working life (zero-coupon structure).
    //
    // Repayment fund: accumulates CDC returns + HLM proceeds + Équinoxe savings.
    //   Outstanding net obligation at t = BR_t − cumRepayFund_t.
    //
    // All contributions route to capi from t=0 (§5.4/§5.9 above); legacy pensions
    // for PAYG-only workers are debt-financed, repaid over time by the repayment fund.

    // Bond issuance at t=0: recorded in BR_t (off-balance-sheet obligation), NOT D_t.
    // The bonds are a contingent liability (implicit pension debt made explicit) —
    // not cash borrowed upfront. D_t only reflects actual PAYG financing gaps.
    const bondIssuance_t = (cfg.chileMode && t === 0 && chileB0 > 0) ? chileB0 : 0;

    // Bond redemption: cohort's bond matures at retirement. The face value equals the
    // annual pension cash flow for that cohort (consistent with B₀ = Σ ai/(1+iota)^t).
    // Credited to K_t so the capi pot covers the transitional pension from here on.
    //
    // PR #26 accounting fix: redemptions must be funded from the repayment fund balance.
    // Any shortfall is debt-financed (D_t ↑), so the net position is correctly stated.
    let bondRedemption_t = 0;
    let drawnFromRepayFund_t = 0;
    let debtFinancedRedemption_t = 0;
    if (cfg.chileMode && transitionalPaygExpGross_t > 0) {
      bondRedemption_t = transitionalPaygExpGross_t;
      // First: draw from accumulated repay-fund balance (CDC returns, HLM, Équinoxe).
      drawnFromRepayFund_t = Math.min(bondRedemption_t, repayFundBalance);
      repayFundBalance -= drawnFromRepayFund_t;
      // Remainder: state borrows to cover the unfunded portion.
      debtFinancedRedemption_t = bondRedemption_t - drawnFromRepayFund_t;
      if (debtFinancedRedemption_t > 0) D_t += debtFinancedRedemption_t;        // (§5.15-d)
      K_t += bondRedemption_t;                                                   // (§5.15-b)
      sumCapiContrib += bondRedemption_t;
    }

    // Bond stock: starts at chileB0, grows at iota (CPI), shrinks at each redemption.
    if (cfg.chileMode) {
      BR_t = Math.max(0, BR_t * (1 + iota) - bondRedemption_t);
    }

    // Repayment fund: CDC returns + HLM proceeds + Équinoxe savings.
    // Inflows are added to the spendable balance first; draws happen at redemption above.
    const equinoxeSavings_t = cfg.chileMode
      ? S0_legacy_t * Math.max(legacyRetirees_t, 0) + S0_csg_revenue_t
      : 0;
    const repayFund_t = cfg.chileMode
      ? Math.max(0, fundReturn_t + H_t_proceeds + equinoxeSavings_t)
      : 0;
    if (cfg.chileMode) {
      repayFundBalance += repayFund_t;
      cumRepayFund += repayFund_t;
    }

    // Accumulate net capi contributions for the accounting-identity asset share.
    // Must happen before §5.12 uses capiAssetShare_t so the running sum reflects
    // contributions that entered K_t this period (netCapiFlow_t was already added
    // to K_t implicitly via K_avail_t below).
    sumCapiContrib += netCapiFlowFull_t;

    // capiAssetShare_t (53a):
    //   overlapping — accounting identity: cumulative net capi contributions / K_open_t.
    //   balanced    — same numerator but K_avail_t denominator (post-contribution),
    //                 avoiding the start-of-period timing distortion.
    //   legacy      — parametric smoothstep ramp (backward-compat, bit-identical).
    if (effectiveCashFlowMode === 'balanced') {
      // K_avail must be computed early in balanced mode so the share denominator
      // is internally consistent. Compute it here; the cascade reuses it.
      K_avail_t = K_t * (1 + r_cn_eff_t) + netCapiFlowFull_t;                        // (50″)
      capiAssetShare_t = computeCapiAssetShareBalanced({
        K_avail_t,
        sumCapiContrib,
      });                                                                        // (53a″)
    } else if (effectiveCashFlowMode === 'overlapping') {
      capiAssetShare_t = K_t > 0 ? Math.min(1, Math.max(0, sumCapiContrib / K_t)) : 0; // (53a′)
    } else {
      capiAssetShare_t = smoothstep(t, T_capi_start, T_capi_start + 30)
                       * cfg.capiAssetShareSteadyState;                         // (53a)
    }
    capiRetireeShare_t = retireeIdx_t > 0 ? capiRetirees_t / retireeIdx_t : 0;
    potBasedPayout_t   = K_t * annuityRate_t * capiAssetShare_t;               // (53) diagnostic

    if (effectiveCashFlowMode === 'overlapping') {
      // ======== §5.13 OVERLAPPING CASCADE (PR #17) ========
      //
      // K_t × r_c (real capi-fund return) is the cascade budget, distributed
      // through 5 active buckets. The floor guaranteed pension is paid directly
      // from K_avail (full nominal return + contributions) so it is immune to
      // the GE penalty that can suppress r_c_eff in late years. Only the
      // EXCESS real return feeds the cascade for debt service and bonus.
      //
      // State posts as annual ΔD_t only when K_avail itself cannot cover the
      // floor (i.e., K_t is genuinely insolvent). Because the floor is only
      // 1.5% × share × K_t ≈ 0.5% of K_t per year, true insolvency is very
      // rare. Bucket 4 (legacy cross-subsidy) and bucket 3 (debt reduction)
      // retroactively reduce §5.10 borrowing. tauK and thetaBuffer are
      // disabled — cascade owns all debt-reduction mechanics.

      // K_avail: full nominal return (real + inflation) + new contributions.
      // Unlike Stage 1, floor is paid from here so GE-penalty years are safe.
      K_avail_t = K_t * (1 + r_cn_eff_t) + netCapiFlowFull_t;                      // (50′)

      // Floor: full pot-based annuity drawn from K_avail (not from cascade budget).
      // annuityRate_t ≈ 5.59%/yr ensures every capi retiree receives their actuarially
      // fair share; bucket 4b (capiTarget) is structurally 0 but kept for robustness.
      capiPayoutFloor_t = K_t * capiAssetShare_t * annuityRate_t;                  // (51′)
      shortfall_t = Math.max(0, capiPayoutFloor_t - K_avail_t);   // state tops up
      D_t        += shortfall_t;
      borrowed_t += shortfall_t;
      CK_t       += shortfall_t;                                                // (56)
      // K_t after floor payment (before cascade).  K_avail always covers the
      // floor because K_t itself is still large; shortfall is structurally ~0.
      let K_after_floor = K_avail_t - capiPayoutFloor_t;

      // Cascade budget = real return on start-of-period K_t.
      fundReturnCapi_t = K_t * r_c_eff_t;
      let budget = fundReturnCapi_t;

      // Bucket 4: Legacy cross-subsidy — funded from returns budget only.
      // Contributions always flow to K_t; D_t accumulates in early years (when
      // returns are small) and is repaid by bucket 3 as K_t matures.
      // capiContribXSub_t is retained in the row schema but is structurally 0
      // in overlapping mode (no contribution diversion).
      if (netFlow_t < 0) {
        const deficit = -netFlow_t;
        const xsubFromReturns = Math.min(budget, deficit);
        capiLegacyXSub_t  = xsubFromReturns;
        capiContribXSub_t = 0;
        D_t        = Math.max(0, D_t - xsubFromReturns);
        borrowed_t = Math.max(0, borrowed_t - xsubFromReturns);
        budget    -= xsubFromReturns;
      }

      // §5.14 Debt-acceleration trigger: when K_t ≥ K_debt_trigger, route surplus
      // real return to debt repayment (bucket 3) before the capi bonus (bucket 6).
      // Below the trigger, debt is deferred and the surplus flows to capi retirees.
      // K_debt_trigger = 0 (default) → K_t ≥ 0 always → debt-first (v2.0a compat).
      // Identity: capiLegacyXSub_t + capiDebtRepaid_t + capiReinvest_t + capiBonus_t = fundReturnCapi_t.
      const accelDebt = K_t >= (cfg.K_debt_trigger ?? 0);
      if (accelDebt) {
        // Bucket 3: Debt principal reduction (surplus real returns, debt-first mode).
        capiDebtRepaid_t = Math.min(budget, D_t);
        budget          -= capiDebtRepaid_t;
        D_t             -= capiDebtRepaid_t;
      }

      // Bucket 5: Reinvestment cap (stays in K_t; ≤ reinvestCap × fundReturn).
      capiReinvest_t = Math.min(budget, (cfg.reinvestCap ?? 0.20) * fundReturnCapi_t);
      budget -= capiReinvest_t;

      // Bucket 6: Residual bonus (capiDebtRepaid_t = 0 when below trigger).
      // Identity: capiLegacyXSub_t + capiDebtRepaid_t + capiReinvest_t + capiBonus_t = fundReturnCapi_t.
      capiBonus_t = budget;

      capiPayout_t = capiPayoutFloor_t + capiBonus_t;                          // (54′)
      capiPayoutDesired_t = capiPayout_t;                                       // alias

      // K_t post-cascade: floor came from K_avail, real return was distributed,
      // only the reinvested portion stays. Net: K_after_floor + reinvest - bonus - cross_sub_and_debt.
      // K_after_floor already excludes floor. Cascade distributed fundReturnCapi:
      //   cross_sub + debt_repaid + bonus already left K_t (via cascade budget which
      //   started as real return that was IN K_avail). Only reinvest stays.
      K_t = Math.max(0, K_after_floor - (fundReturnCapi_t - capiReinvest_t));  // (57′)

      // §5.10.1 tauK and §5.10.2 thetaBuffer disabled in overlapping mode
      K_floor_t          = annuityRate_t > 1e-6 ? capiPayoutFloor_t / annuityRate_t : 0;
      tauKLevy_t         = 0;
      K_growth_t         = K_t - K_start_t;
      surplusAboveBuffer_t = 0;
      surplusPhaseIn_t   = 0;
      surplusLevy_t      = 0;
      // ======== END OVERLAPPING CASCADE ========

    } else if (effectiveCashFlowMode === 'balanced') {
      // ======== §5.13 BALANCED CASCADE (PR #18) ========
      //
      // Strict separation of concerns:
      //   1. PAYG side has already updated F_t/D_t against its own deficit
      //      (§5.10 above). alpha_eff = 0 in balanced mode, so no capi side
      //      contribution to PAYG debt repayment via the legacy waterfall.
      //   2. K accumulates returns and contributions; pays the floor first.
      //   3. Solvency floor is enforced with a buffer (KFloorBuffer × strict).
      //   4. Only capped surplus return above the buffered solvency floor is
      //      available to repay transition debt (debt sweep), with caps on
      //      share-of-return, share-of-K, and share-of-GDP.
      //   5. After debt sweep, a fraction (capiBonusShare) of any remaining
      //      surplus is paid as capi bonus; the rest stays in K (reinvested).
      //   6. capiLegacyXSub_t = capiContribXSub_t = 0 — capi never subsidises
      //      PAYG via contribution diversion. Eliminates the "early cohorts
      //      pay twice" pathology.

      const K_open_t = K_t;
      const realReturn_t = K_open_t * r_c_eff_t;
      // K_avail_t was computed above for capiAssetShare; reused here unchanged.

      // 3. Track retirees' accumulated pot separately from workers'.
      //    Scale by same proportional return as the whole fund, then transfer
      //    new retirees' per-worker share from the workers' pot into K_retirees_bal.
      // Scale retirees' pot by the fund's nominal return only (NOT by K_avail/K_open,
      // which would include workers' fresh contributions — those belong to workers).
      K_retirees_bal *= (1 + r_cn_eff_t);
      const deltaCapiRetM_t = Math.max(0, capiRetirees_t - capiRetirees_prev_snap) * cfg.R0;
      if (deltaCapiRetM_t > 1e-6) {
        const K_capi_avail = K_avail_t * capiAssetShare_t;
        const K_capi_workers = Math.max(0, K_capi_avail - K_retirees_bal);
        const capiWorkersM = Math.max(1e-6, sigma_capi_t * activePop_t * empFactor * cfg.R0);
        const K_xfer = Math.min(deltaCapiRetM_t * (K_capi_workers / capiWorkersM), K_capi_workers);
        K_retirees_bal += K_xfer;
      }
      K_retirees_bal = Math.min(K_retirees_bal, K_avail_t * capiAssetShare_t);

      // Guaranteed capi pension floor — based on retirees' pot only (not whole capi K).
      capiPayoutFloor_t = K_retirees_bal * (cfg.annuityFloorRate ?? 0.015);

      // 4. State guarantee only fires if K_avail itself cannot cover the floor.
      guaranteeShortfall_t = Math.max(0, capiPayoutFloor_t - K_avail_t);
      shortfall_t = guaranteeShortfall_t;
      if (guaranteeShortfall_t > 0) {
        D_t        += guaranteeShortfall_t;
        borrowed_t += guaranteeShortfall_t;
        CK_t       += guaranteeShortfall_t;
      }

      // 5. Pay floor from K; deduct from retirees' pot.
      let K_after_floor = Math.max(0, K_avail_t - capiPayoutFloor_t);
      K_retirees_bal = Math.max(0, K_retirees_bal - capiPayoutFloor_t);

      // 6. Solvency floor with KFloorBuffer cushion. strictKFloor is the
      //    reserve required to keep paying the floor at the actuarial annuityRate.
      const strictKFloor_t = annuityRate_t > 1e-9
        ? capiPayoutFloor_t / annuityRate_t
        : 0;
      K_floor_t = strictKFloor_t * (cfg.KFloorBuffer ?? 1.10);

      // 7. Surplus above buffered floor.
      surplusAboveFloor_t = Math.max(0, K_after_floor - K_floor_t);

      // 8. Debt-sweep phase-out: linearly clamped between end and start ratios.
      const D_to_GDP_t = GDP_t > 0 ? D_t / GDP_t : 0;
      const sweepStart = cfg.debtSweepStartRatio ?? 0.50;
      const sweepEnd   = cfg.debtSweepEndRatio ?? 0.05;
      debtSweepPhase_t = sweepStart > sweepEnd
        ? clamp((D_to_GDP_t - sweepEnd) / (sweepStart - sweepEnd), 0, 1)
        : (D_to_GDP_t >= sweepStart ? 1 : 0);

      // 9. Debt sweep capacity: min of all caps and remaining D.
      const surplusSweepCap_t = (cfg.debtSweepSurplusFrac ?? 0.75) * surplusAboveFloor_t;
      const returnSweepCap_t = (cfg.debtSweepShare  ?? 0.50) * Math.max(0, realReturn_t);
      const kSweepCap_t      = (cfg.debtSweepKCap   ?? 0.015) * K_open_t;
      const gdpSweepCap_t    = (cfg.debtSweepGdpCap ?? 0.01)  * GDP_t;
      debtSweepCapacity_t = Math.min(
        surplusSweepCap_t,
        returnSweepCap_t,
        kSweepCap_t,
        gdpSweepCap_t,
        D_t,
      );
      capiDebtRepaid_t = debtSweepPhase_t * debtSweepCapacity_t;
      D_t -= capiDebtRepaid_t;
      K_after_floor -= capiDebtRepaid_t;
      // Reduce retirees' pot proportionally by the debt sweep drawn from K.
      if (capiDebtRepaid_t > 1e-9) {
        const K_postFloor = K_avail_t - capiPayoutFloor_t + capiDebtRepaid_t; // K_after_floor before sweep
        K_retirees_bal = Math.max(0, K_retirees_bal * (1 - capiDebtRepaid_t / Math.max(K_postFloor, 1e-9)));
      }

      // 10. Bonus from remaining surplus, capped so total payout ≤ actuarial annuity
      //     on retirees' pot.  The actuarial annuity rate (annuityRate_t ≈ 5.6 %)
      //     is the correct ceiling: a funded pension SHOULD draw principal, so the
      //     cap must reflect what the accumulated pot can sustainably pay out over
      //     the retirees' remaining life expectancy — not just the GE-compressed
      //     nominal return (which would artificially depress pensions as K/GDP rises).
      const surplusAfterDebt_t = Math.max(0, K_after_floor - K_floor_t);
      capiBonus_t = (cfg.capiBonusShare ?? 0.25) * surplusAfterDebt_t;
      const K_capi_total_t = Math.max(K_avail_t * capiAssetShare_t, 1e-9);
      const retireeFrac_t  = Math.min(1, K_retirees_bal / K_capi_total_t);
      const maxBonus_t = Math.max(0,
        K_retirees_bal * (annuityRate_t - (cfg.annuityFloorRate ?? 0.015))
        - capiDebtRepaid_t * retireeFrac_t);
      capiBonus_t = Math.min(capiBonus_t, maxBonus_t);

      K_t = Math.max(0, K_after_floor - capiBonus_t);
      K_retirees_bal = Math.max(0, K_retirees_bal - capiBonus_t);

      capiPayout_t        = capiPayoutFloor_t + capiBonus_t;
      capiPayoutDesired_t = capiPayout_t;

      // Diagnostics — balanced mode does NOT use the cross-subsidy / reinvest
      // / tauK / surplusLevy mechanisms; clear them and report capiReinvest as
      // the implied K growth above contributions.
      tauKLevy_t           = 0;
      K_growth_t           = K_t - K_start_t;
      surplusAboveBuffer_t = 0;
      surplusPhaseIn_t     = 0;
      surplusLevy_t        = 0;
      fundReturnCapi_t     = realReturn_t;
      capiLegacyXSub_t     = 0;
      capiContribXSub_t    = 0;
      capiReinvest_t       = Math.max(0, K_t - K_open_t - netCapiFlowFull_t);
      // ======== END BALANCED CASCADE ========

    } else {
      // ======== §5.12 / §5.13 LEGACY WATERFALL (v1.3) ========
      K_avail_t = K_t * (1 + r_cn_eff_t) + netCapiFlowFull_t;                      // (50)

      // In swedenMode the funded pillar (PPM) only covers sigma_capi_t of each
      // reform-cohort retiree's pension; the NDC PAYG side (ndcPaygPension_t,
      // above) covers (1 − sigma_capi_t) for pure-reform retirees. Without this
      // scaling, K is asked to pay the full E0 per retiree while ndcPaygPension
      // independently covers (1−sigma) of the same obligation → K depletes in
      // ~5 years and the debt explodes. Legacy floor: E0-indexed (can deplete K_t in late years)
      const pillarSigma = cfg.swedenMode ? sigma_capi_t : 1;
      capiPayoutFloor_t = pillarSigma * cfg.E0 * capiRetirees_t * I_factor_t;  // (51)
      capiPayoutDesired_t = Math.max(capiPayoutFloor_t, potBasedPayout_t);      // (54)
      shortfall_t  = Math.max(0, capiPayoutDesired_t - K_avail_t);
      capiPayout_t = capiPayoutDesired_t;
      if (shortfall_t > 0) {
        D_t = D_t + shortfall_t;                                                // (55)
        borrowed_t = borrowed_t + shortfall_t;
      }
      CK_t = CK_t + shortfall_t;                                                // (56)
      K_t  = Math.max(0, K_avail_t - capiPayout_t);                            // (57)

      // §5.10.1 tauK (solvency-floor-protected stock levy → debt)
      K_floor_t  = annuityRate_t > 1e-6 ? capiPayoutFloor_t / annuityRate_t : 0;
      const tauKRaw_t = D_t > 0 ? (cfg.tauK ?? 0) * K_t : 0;
      tauKLevy_t = Math.min(tauKRaw_t, Math.max(0, K_t - K_floor_t), D_t);
      K_t  = Math.max(0, K_t - tauKLevy_t);
      D_t  = D_t - tauKLevy_t;

      // §5.10.2 thetaBuffer surplus-growth levy
      K_growth_t           = K_t - K_start_t;
      surplusAboveBuffer_t = Math.max(0, K_growth_t - (cfg.thetaBuffer ?? 0.01) * K_start_t);
      surplusPhaseIn_t     = GDP_t > 0 ? smoothstep(D_t / GDP_t, 0.10, 0.50) : 0;
      const surplusLevyCap = Math.max(0, K_t - K_floor_t);
      surplusLevy_t        = D_t > 0
        ? Math.min(surplusPhaseIn_t * surplusAboveBuffer_t, D_t, surplusLevyCap)
        : 0;
      K_t = Math.max(0, K_t - surplusLevy_t);
      D_t = Math.max(0, D_t - surplusLevy_t);
      // ======== END LEGACY WATERFALL ========
    }

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
      // §5.5 Équinoxe (v1.0a: scope-split)
      S0_brackets_t, S0_irDeduction_t, S0_csg_t, S0_total,
      phaseFactor_t, S0_legacy_t, S0_csg_revenue_t, E0_legacy_t,
      // §5.6 retirees split & legacy expenditure
      legacyRetirees: legacyRetirees_t,
      capiRetirees: capiRetirees_t,
      legacyExp_t,
      // §5.6.1 v1.1 per-cohort PAYG accrual additions
      legacyShareAvg: legacyShareAvg_t,
      transitionalPaygExp_t,
      totalLegacyOutflow_t,
      // §5.16 Swedish ABM diagnostics (0/1 when disabled, signed when active)
      abmFactor_t, abmCut_t, ndcPaygPension_t,
      // §5.7 HLM
      U_t, delta_U_t, units_sold, priceDiscount_t, P_eff_t, gain_t, hlmActive_t,
      H_t_proceeds,
      // §5.8 borrowing rate
      GDP_t, D_ext_t, debtRatio_t, D_t_to_gdp_pct: GDP_t > 0 ? D_t / GDP_t * 100 : 0, r_d_t, debtInterest_t,
      // §5.9 waterfall
      fundReturn_t, abatement_t, nonEmplrNet_t, deficit_t, emplrAvail_t,
      emplrToLeg_t, emplrToCap_t, netFlow_t,
      // v1.3 employer tax-cut diagnostics
      employerCutInitial_t, employerCutEventual_t,
      // §5.10 (post-update) borrow tracker
      borrowed_t,
      // §5.11 levy
      T_lambda_eff, levyActivation, levyPhaseOut, levyFactor,
      grossLevy_t, levy_t, netCapiFlow_t, leveragedInjection_t,
      // §5.12 capi accumulation
      capiToGdp_t, gePenalty_t, r_c_eff_t, r_cn_eff_t, K_avail_t,
      // §5.13 payouts
      capiPayoutFloor_t, LE_at_A_R_t, T_ret_t, annuityRate_t,
      capiRetireeShare_t, capiAssetShare_t, sumCapiContrib_t: sumCapiContrib,
      potBasedPayout_t, capiPayoutDesired_t,
      shortfall_t, capiPayout_t,
      // §5.13 overlapping cascade buckets (zero in legacy mode)
      fundReturnCapi_t, capiLegacyXSub_t, capiContribXSub_t,
      capiDebtRepaid_t, capiReinvest_t, capiBonus_t,
      // §5.13 balanced cascade diagnostics (PR #18; zero in non-balanced modes)
      surplusAboveFloor_t, debtSweepPhase_t, debtSweepCapacity_t,
      guaranteeShortfall_t,
      // PR #19: retirees' accumulated pot tracker (balanced mode only; 0 in other modes)
      K_retirees_bal_t: K_retirees_bal,
      // PR #21: fiscal transfer diagnostics
      fiscalTransfer_t, capiCoverage_t, fiscalGap_t,
      // PR #21b/c/PR#23: recognition bond diagnostics (zero when chileMode=false)
      // BR_t = bond stock (starts at chileB0, grows at iota, redeems at each cohort retirement).
      BR_t, bondIssuance_t, bondRedemption_t,
      repayFund_t, cumRepayFund_t: cumRepayFund,
      // PR #26: bond redemption funding split (zero when chileMode=false)
      drawnFromRepayFund_t, debtFinancedRedemption_t, repayFundBalance_t: repayFundBalance,
      transitionalPaygExpGross_t,
      // §5.10.1 (v1.2) tauK debt-reduction channel
      K_floor_t, tauKLevy_t,
      // §5.10.2 (v1.3) surplus-growth levy
      K_start_t, K_growth_t, surplusAboveBuffer_t, surplusPhaseIn_t, surplusLevy_t,
      // §2 stocks (post-update)
      F_t, D_t, K_t, CI_t, CK_t,
      // §5.14 diagnostics
      spread_t, cumDF_t,
      pvLegacyExp_t, pvCapiPayout_t,
      pvLegacyCum_t: pvLegacyCum,
      pvCapiPayoutCum_t: pvCapiPayoutCum,
    });

    // Update K_retirees_bal_prev for next iteration's fiscal transfer taper.
    K_retirees_bal_prev = K_retirees_bal;
  }
  return rows;
}

// =====================================================================
// Counterfactual + individual perspective helpers (pedagogical layer)
//
// These do not change any §1–§9 spec equations; they translate engine
// outputs into per-individual euro amounts a non-specialist reader can
// interpret. v1.1: now reads engine output directly via
// legacyShareOfCohort + E0_legacy_t × I_factor_t / R0, replacing the
// pre-PR-#7 local dual-rights heuristic so the panel's sum across
// transitional cohorts is structurally identical to the engine's
// transitionalPaygExp_t (eq 25b). See CapiModelSpec_v1.1.md §5.6.1.
// =====================================================================

/**
 * Build a "no reform" parameter set from a reform parameter set.
 *
 * Disables Équinoxe, capitalisation, HLM cessions, and labour reform
 * (employment target reverts to baseline). Preserves macroeconomic
 * inputs (rates, demographics, calibration constants) so the
 * comparison isolates reform impact, not world-state divergence.
 */
export function buildCounterfactualParams(reformParams) {
  return {
    ...reformParams,
    useEquinoxe: false,
    enableCapi: false,
    hlmDiscount: false,
    delta: 0,
    rho: 0,
    lambda: 0,
    deltaTauxPatronal: 0,
    deltaTauxPatronalPA: 0,
    employmentRateTarget: reformParams.employmentRate0,
  };
}

/**
 * Median worker pedagogical projection (v1.1).
 *
 * Returns per-individual monthly euro amounts at retirement for one
 * hypothetical worker born in `birthYear`, comparing reform vs CF.
 * The legacy (PAYG) pension is computed via the engine's per-cohort
 * accrual share (legacyShareOfCohort) and the engine's per-retiree
 * pension level (E0_legacy_t × I_factor_t / R0) read at the
 * cohort's retirement year.
 *
 * 1:1 alignment property (uniform-mortality reconciliation per spec
 * §5.6.1): under uniform_decayed_cohort_size(B, t) =
 * initial_cohort_size(B) × R^capi_t / R^capi_at_retirement_year(B), the
 * pop-weighted sum
 *   Σ_B uniform_decayed_cohort_size(B, t) × monthlyPensionLegacy(B)
 * over all transitional cohorts B retiring by year t equals the engine's
 * `transitionalPaygExp_t` at year t exactly (modulo floating-point ε —
 * see tests/engine.test.js for the reconciliation test).
 */
export function computeIndividualPerspective(cfg, reformRows, cfRows, birthYear) {
  // Round to integer: the panel operates on discrete year-steps so a fractional
  // retirementAgeBase (e.g. 64.5 from the 0.5-step UI slider) must be resolved
  // to a whole year before it is used as an array index or for age comparisons.
  const RETIREMENT_AGE = Math.round(cfg.retirementAgeBase ?? 64);
  const LIFE_EXPECTANCY = 85;
  const N_WORKERS_M = 30;        // active population (millions, indexed)
  const KE_TO_EUR = 1000;        // engine units are k€ per worker → €

  const Y0 = cfg.Y0 ?? 2027;
  const ageInY0 = Y0 - birthYear;
  // §5.6.1 v1.1: derive `inCapi` from the same boundary discipline used by
  // legacyShareOfCohort (eq 15a). A cohort that has any capi accrual at all
  // — i.e., legacyShare < 1.0 — should accumulate a capi pot. This puts the
  // boundary cohort (age = cutoffAge in Y0; legacyShare = 28/42 with
  // defaults) into the capi bucket, consistent with the engine's smooth
  // contribution-routing ramp (sigmaCapi(t) reaches 1.0 by T_capi_start).
  const legacyShare = legacyShareOfCohort(birthYear, cfg);
  const inCapi = legacyShare < 1.0;

  // In indexed mode, find the first simulation year where the worker's age
  // reaches the period-specific A_R_t (exported in each row). This gives
  // the correct accumulation window and pension read-out year.
  let effectiveRetirementAge = RETIREMENT_AGE;
  let retT;
  if (cfg.retirementAgeMode === 'indexed') {
    for (let t = 0; t < reformRows.length; t++) {
      const age = (Y0 + t) - birthYear;
      const A_R_at_t = Math.round(reformRows[t].A_R_t ?? RETIREMENT_AGE);
      if (age >= A_R_at_t) {
        effectiveRetirementAge = A_R_at_t;
        retT = t;
        break;
      }
    }
    if (retT === undefined) retT = reformRows.length - 1;
  } else {
    retT = Math.max(0, Math.min(reformRows.length - 1, birthYear + RETIREMENT_AGE - Y0));
  }
  const retirementYear = birthYear + effectiveRetirementAge;

  const w_n = cfg.pi + cfg.w_r + cfg.pi * cfg.w_r;

  // Walk the reform sim, accumulating personal capi pot. Only contributes
  // while the worker is in the [22, retirementAge) band, and only if they
  // are eligible (younger than cutoffAge in Y0). Pot grows at the engine's
  // effective nominal capi rate (r_cn_eff_t, already includes GE penalty).
  let capiPot = 0;
  let capiPotAtRet = 0;
  let lastWorkingContribK = 0;
  let yearsInCapi = 0;
  for (let t = 0; t < reformRows.length; t++) {
    const age = (Y0 + t) - birthYear;
    const r = reformRows[t];
    if (age >= 22 && age < effectiveRetirementAge) {
      const wFactor = Math.pow(1 + w_n, t);
      lastWorkingContribK = (cfg.W0 / N_WORKERS_M) * wFactor * cfg.tau_s;
      if (inCapi) {
        const totalCapiIn = (r.C_s_capi_t ?? 0) + (r.emplrToCap_t ?? 0);
        const effLevy = totalCapiIn > 0
          ? Math.min(1, (r.levy_t ?? 0) / totalCapiIn)
          : 0;
        const netContrib = lastWorkingContribK * (1 - effLevy);
        const r_cn = r.r_cn_eff_t ?? 0;
        capiPot = capiPot * (1 + r_cn) + netContrib;
        yearsInCapi++;
      }
    }
    if (age === effectiveRetirementAge) capiPotAtRet = capiPot;
  }

  // §5.6.1 v1.1: per-retiree annual legacy pension (k€/yr/retiree) at
  // retirement year, read directly from engine output. The cohort's
  // accrual share `legacyShare` was computed up-front (same engine helper
  // used by the simulation loop, eq 15a). Multiply by legacyShare →
  // individual's PAYG portion.
  const r = reformRows[retT];
  const perCapitaLegacyKE = (r.E0_legacy_t * r.I_factor_t) / cfg.R0;
  const monthlyPensionLegacy = perCapitaLegacyKE * legacyShare * KE_TO_EUR / 12;

  // CF: full PAYG career, no Équinoxe, enableCapi=false → legacyShareOfCohort
  // returns 1.0 by construction. Use cfRows directly.
  const cfR = cfRows[retT];
  const perCapitaLegacyKE_CF = (cfR.E0_legacy_t * cfR.I_factor_t) / cfg.R0;
  const monthlyPensionCF = perCapitaLegacyKE_CF * KE_TO_EUR / 12;

  // Capi annuity from personal pot. Use the engine's annuityRate_t at the
  // retirement year so individual payouts are consistent with the macro cascade.
  // annuityRate_t ≈ 5.59%/yr (r_f_annuity=1.5%, 21-yr life expectancy at 64).
  const annuityRate_at_ret = (retT < reformRows.length
    ? reformRows[retT]
    : reformRows[reformRows.length - 1]).annuityRate_t ?? 0;
  const monthlyCapiAnnuity = inCapi && capiPotAtRet > 0
    ? capiPotAtRet * annuityRate_at_ret * KE_TO_EUR / 12
    : 0;

  const monthlyPensionTotal = monthlyPensionLegacy + monthlyCapiAnnuity;
  const monthlyGain = monthlyPensionTotal - monthlyPensionCF;

  // Personal contributions at retirement year (real-€-of-Y0 frame).
  const monthlyContribS = lastWorkingContribK * KE_TO_EUR / 12;
  const wFactorRet = Math.pow(1 + w_n, retT);
  const monthlyContribE = (cfg.W0 / N_WORKERS_M) * wFactorRet
                          * cfg.tau_e * KE_TO_EUR / 12;

  // Personal capi pot in real Y0 € (deflate by inflation only).
  const capiPotReal = capiPotAtRet / Math.pow(1 + cfg.pi, retT) * KE_TO_EUR;

  // Diagnostic: yearsInPayg under §5.6.1 boundary discipline.
  const careerYears = Math.max(1, effectiveRetirementAge - 22);
  const yearsInPayg = legacyShare * careerYears;

  return {
    birthYear,
    ageInY0,
    retirementYear,
    inCapi,
    yearsInPayg,
    yearsInCapi,
    legacyShare,
    monthlyContribS: Math.round(monthlyContribS),
    monthlyContribE: Math.round(monthlyContribE),
    monthlyPensionLegacy: Math.round(monthlyPensionLegacy),
    monthlyCapiAnnuity: Math.round(monthlyCapiAnnuity),
    monthlyPensionTotal: Math.round(monthlyPensionTotal),
    monthlyPensionCF: Math.round(monthlyPensionCF),
    monthlyGain: Math.round(monthlyGain),
    capiPotReal: Math.round(capiPotReal),
  };
}
