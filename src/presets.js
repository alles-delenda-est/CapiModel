// v1.0a presets and KPI extractor.
// Lives outside the engine (src/simulation-engine.js, immutable Task 1
// deliverable post-Task-4 rename — was simulation-engine-v1.js before v0.11
// retirement). Adding a new file rather than touching the engine.

import { DEFAULT_CONFIG } from './simulation-engine.js';

// UI-facing base config: inherits engine defaults but uses the v2.0 overlapping
// waterfall. The engine DEFAULT_CONFIG keeps 'legacy' so existing tests stay
// bit-identical; all user-facing presets override here.
// PR #18: user-facing default is the BALANCED cascade (§5.13 v2.0). Strict
// separation of concerns — capi never cross-subsidises PAYG, K is preserved
// as a pension reserve, and only capped surplus return repays transition debt.
// The legacy and overlapping modes remain available for comparison.
//
// GE recalibration (PR #19 fix): DEFAULT_CONFIG's geKneeRatio=2.0 / geFloorRatio=4.0
// are too aggressive — a fund at K/GDP=4 earning 0% real return is inconsistent with
// empirical evidence (Norway's SWF earns ~6 %/yr at 340 % GDP). More realistic:
//   knee=3.0  → GE effects begin at 3× GDP (domestic investment partially saturated)
//   floor=8.0 → full penalty only at 8× GDP (implausibly large; provides an upper bound)
// This keeps r_cn_eff above annuityRate_t throughout the simulation horizon, preventing
// the retirees' pot from depleting and keeping total capi payout monotonically growing.
const UI_CONFIG = {
  ...DEFAULT_CONFIG,
  cashFlowMode: 'balanced',
  geKneeRatio: 3.0,
  geFloorRatio: 8.0,
};

/**
 * v1_default — all §3 defaults exactly as the spec specifies them.
 */
const v1_default = {
  label: 'Hypothèses de base (v1.0a)',
  description: 'Tous les paramètres aux valeurs par défaut du spec v1.0a §3.',
  params: { ...UI_CONFIG },
};

/**
 * v1_optimiste — favourable macro / demographic regime.
 *
 * Joint move of r_c and r_f_portfolio: under v1.0a these are correlated in
 * practice (a global equity-and-bond bull regime affects both the Legacy Fund's
 * 60/40 mandate and the capi pot's similar mandate). r_f_annuity is NOT
 * overridden: OATi yield is a separate market and not directly correlated
 * with diversified-portfolio return.
 */
const v1_optimiste = {
  label: 'Optimiste',
  description: 'Marchés porteurs, démographie réformée, plein-emploi.',
  params: {
    ...UI_CONFIG,
    r_c: 0.05,
    r_f_portfolio: 0.05,
    w_r: 0.008,
    employmentRateTarget: 0.80,
    demoProfile: 'reformed',
  },
};

/**
 * v1_stress — adverse macro / demographic regime.
 *
 * Same correlated-regime rationale as optimiste: r_c and r_f_portfolio move
 * together. r_f_annuity is held at default (separate market). Adds a half-
 * strength Équinoxe phasing to model partial political implementation.
 */
const v1_stress = {
  label: 'Stress',
  description: 'Marchés baissiers, démographie pessimiste, Équinoxe partielle.',
  params: {
    ...UI_CONFIG,
    r_c: 0.025,
    r_f_portfolio: 0.025,
    w_r: 0.001,
    r_d_base: 0.045,
    extraSpread: 0.005,
    demoProfile: 'realistic',
    equinoxePhasing: 'partial-50',
  },
};

// =====================================================================
// Paquet partiel presets (Task 4) — pedagogical scenarios showing that
// partial reform is insufficient under v1.0a's active-pop dynamics.
// Disposition documented per preset; verified against v1.0a engine.
// =====================================================================

/**
 * equinoxeOnly — DESIGNED CATASTROPHIC (under realistic demographics).
 * Pedagogical: shows that benefit-side reductions alone (Équinoxe) cannot
 * close the gap when demographic pressure is the binding constraint.
 *
 * v1.0a verified disposition: peak transition debt ≈ 1.5 M Md€,
 * peak total debt ≈ 2.9 M Md€, transition debt-free 2033 but pre-existing
 * debt + interest dominate. Catastrophic-by-design retained per Task 4
 * brief option (a).
 */
const equinoxeOnly = {
  label: 'Équinoxe seul',
  description: 'Réforme Équinoxe sans capi/HLM/travail. Démographie réaliste. Pédagogique : montre l\'insuffisance d\'une réforme côté prestations seule.',
  params: {
    ...UI_CONFIG,
    demoProfile: 'realistic',
    enableCapi: false,
    hlmDiscount: false,
    delta: 0,
    rho: 0,
    lambda: 0,
    employmentRate0: 0.69,
    employmentRateTarget: 0.69,
  },
};

/**
 * labourHousingOnly — DESIGNED CATASTROPHIC (under realistic demographics).
 * Pedagogical: shows that fiscal/labour packages alone (capi + HLM + labour
 * reform) cannot close the gap without Équinoxe AND demographic relief.
 *
 * v1.0a verified disposition: peak transition debt ≈ 10 M Md€, peak total
 * debt ≈ 20 M Md€, no debt-free year. Catastrophic-by-design retained per
 * Task 4 brief option (a).
 */
const labourHousingOnly = {
  label: 'Travail + Logement seul',
  description: 'Capi + HLM + réforme du travail sans Équinoxe. Démographie réaliste. Pédagogique : montre que la combinaison fiscale ne suffit pas seule.',
  params: {
    ...UI_CONFIG,
    demoProfile: 'realistic',
    useEquinoxe: false,
    employmentRateTarget: 0.759,
    employmentTransitionYears: 8,
    cutoffAge: 50,
    hlmDiscount: true,
    delta: 0.3,
    rho: 0.05,
    T_hlm: 20,
    lambda: 0.30,
  },
};

/**
 * equinoxeAndLabour — RECALIBRATED to cor_central demographics (option b).
 * Pedagogical: shows that the combination Équinoxe + labour reform IS
 * sufficient WHEN demographic projections match COR central scenario
 * (TFR ~1.7 + sustained migration). Falls into a credible regime rather
 * than a catastrophic one.
 *
 * v1.0a verified disposition under cor_central: peak transition debt
 * ≈ 3.2 k Md€, peak total ≈ 22 k Md€, transition debt-free 2033.
 * Recalibrated per Task 4 brief option (b) because the v0.11 form
 * (with realistic demographics) blew up to peak total 412 k Md€.
 */
const equinoxeAndLabour = {
  label: 'Équinoxe + Travail',
  description: 'Équinoxe + réforme du travail (sans capi/HLM). Démographie COR central (recalibrée v1.0a). Montre que cette combinaison soutient le système si les projections COR centrales se réalisent.',
  params: {
    ...UI_CONFIG,
    demoProfile: 'cor_central',
    enableCapi: false,
    hlmDiscount: false,
    delta: 0,
    rho: 0,
    lambda: 0,
    employmentRateTarget: 0.759,
    employmentTransitionYears: 8,
  },
};

export const PRESETS = {
  v1_default,
  v1_optimiste,
  v1_stress,
  equinoxeOnly,
  labourHousingOnly,
  equinoxeAndLabour,
};

/**
 * Extract headline KPIs from a v1.0a engine result array. Field names match
 * the v0.11 extractKPIs shape so the existing UI KPI cards can consume this
 * with minimal change.
 */
export function extractKPIs(rows) {
  const peakDebt = Math.max(...rows.map(r => r.D_t));
  const peakDebtYear = rows.find(r => r.D_t === peakDebt)?.year;
  // "debt-free": small absolute threshold (engine output may have float noise)
  const debtFreeYear = rows.find(r => r.D_t < 1 && r.t > 5)?.year ?? null;
  const last = rows[rows.length - 1];
  const totalInterest = last.CI_t;
  const finalCapi = last.K_t;
  // Real terms: deflate by cumulative inflation. PI is constant per spec §5.1.
  const realDeflator = Math.pow(1 + (rows[0].iota === undefined ? 0.02 : 0.02), last.t);
  const finalCapiReal = finalCapi / realDeflator;
  const finalDebt = last.D_t;
  const netPosition = finalCapi - finalDebt;
  const minSpread = Math.min(...rows.map(r => r.spread_t));
  const totalCapiShortfall = last.CK_t;
  const peakCapiShortfall = Math.max(...rows.map(r => r.shortfall_t));
  const firstShortfallYear = rows.find(r => r.shortfall_t > 0.1)?.year ?? null;
  // S0 at t=0: aggregate Équinoxe effect (benefit-side reduction + tax-side
  // revenue), pre-phasing. Useful for KPI display continuity with v0.11.
  const S0 = (rows[0]?.S0_total ?? 0);
  // v1.3 employer tax-cut KPIs.
  // Initial cut: annual employer savings from the fixed year-2 rate reduction.
  // Eventual cut: freed employer legacy obligation at end of horizon (t=69) —
  //   the annual amount that could be returned as structural ongoing tax relief.
  const employerCutInitialRow = rows.find(r => (r.employerCutInitial_t ?? 0) > 0);
  const employerTaxCutInitial = employerCutInitialRow?.employerCutInitial_t ?? 0;
  const employerTaxCutEventual = last.employerCutEventual_t ?? 0;
  return {
    peakDebt, peakDebtYear, debtFreeYear, totalInterest,
    finalCapi, finalCapiReal, netPosition, minSpread, S0,
    pvLegacyTotal: last.pvLegacyCum_t,
    pvCapiPayoutTotal: last.pvCapiPayoutCum_t,
    totalCapiShortfall, peakCapiShortfall, firstShortfallYear,
    employerTaxCutInitial, employerTaxCutEventual,
  };
}
