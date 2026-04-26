// v1.0a presets and KPI extractor.
// Lives outside the engine (src/simulation-engine-v1.js, immutable Task 1
// deliverable). Adding a new file rather than touching the engine.

import { DEFAULT_CONFIG } from './simulation-engine-v1.js';

/**
 * v1_default — all §3 defaults exactly as the spec specifies them.
 */
const v1_default = {
  label: 'Hypothèses de base (v1.0a)',
  description: 'Tous les paramètres aux valeurs par défaut du spec v1.0a §3.',
  params: { ...DEFAULT_CONFIG },
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
    ...DEFAULT_CONFIG,
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
    ...DEFAULT_CONFIG,
    r_c: 0.025,
    r_f_portfolio: 0.025,
    w_r: 0.001,
    r_d_base: 0.045,
    extraSpread: 0.005,
    demoProfile: 'realistic',
    equinoxePhasing: 'partial-50',
  },
};

// TODO: port the v0.11 paquet-partiel presets (equinoxeOnly, labourHousingOnly,
// equinoxeAndLabour) to v1.0a. Deferred per Task 3 brief because under v1.0a
// active-pop dynamics they may need recalibration. Out of scope for Task 3.

export const PRESETS = {
  v1_default,
  v1_optimiste,
  v1_stress,
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
  return {
    peakDebt, peakDebtYear, debtFreeYear, totalInterest,
    finalCapi, finalCapiReal, netPosition, minSpread, S0,
    pvLegacyTotal: last.pvLegacyCum_t,
    pvCapiPayoutTotal: last.pvCapiPayoutCum_t,
    totalCapiShortfall, peakCapiShortfall, firstShortfallYear,
  };
}
