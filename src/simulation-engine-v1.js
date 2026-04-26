// CapiModel v1.0 simulation engine.
// Spec source of truth: CapiModelSpec_v1.0.md @ commit 58ed874db93f0ffa95421a3cf2f3707608203498
// This file implements §1–§9 of the spec. Every non-trivial line of the
// simulation loop carries a `// Spec §X.Y eq (N)` comment.
// Naming follows the Greek→Latin map in docs/superpowers/plans/2026-04-26-capimodel-v1-task1.md;
// do not rename.

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
  r_f: 0.045,
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

// =================== runSimulation ===================
// (Filled in by Task 9.)

export function runSimulation(_config = {}) {
  throw new Error('runSimulation: not yet implemented');
}
