/* ============================================================================
 * Demographic tables — v2.0 actuarial kernel
 * ============================================================================
 *
 * DATA STATUS (updated May 2026):
 *
 *   ✅ COR_*.P_act   — REAL DATA. Source: COR hypothèses de cotisants, RA2025
 *                      (hypo_cotisants_chomage_2025.xlsx, "Emploi total",
 *                      thousands → millions, flat-extrapolated 2071–2096).
 *                      Scenario mapping:
 *                        cor_central ← Chô_7% (central 7% LT unemployment)
 *                        cor_high    ← Chô_5% (5% LT unemployment, higher employment)
 *                        cor_low     ← Chô_10% (10% LT unemployment, lower employment)
 *                      Note: all three use INSEE 2021 central demographic scenario;
 *                      the divergence from 2030 onward is driven by unemployment
 *                      assumptions, not fertility/migration. The true COR high/low
 *                      demographic scenarios would additionally vary fertility and
 *                      immigration — this is a close practical approximation.
 *
 *   ⚠️  COR_*.P_ret  — PLACEHOLDER. Synthetic curve (17.0M → ~21.5M → flat)
 *                      calibrated to DREES historical anchor (2023 observed:
 *                      17.198M, DREES EACR/EIR/ANCETRE, tous régimes droits
 *                      directs). Future path qualitatively COR-shaped but lacks
 *                      exact annual values and scenario differentiation.
 *                      To replace: extract from COR RA2025 download package,
 *                      file likely named hypo_retraites_2025.xlsx or equivalent
 *                      table of projected retraités headcounts by scenario.
 *
 *   ⚠️  INSEE_T60_QX_MALE / FEMALE — PLACEHOLDER. Makeham mortality calibrated
 *                      to reasonable milestone qx values (see array comments).
 *                      To replace: INSEE Tables de mortalité prospectives 2023
 *                      (série "TM"), qx by single age 60–105, male & female.
 *                      Direct download: https://www.insee.fr/fr/statistiques/2533382
 *                      (look for the Excel file containing qx columns by âge,
 *                      hommes and femmes, for the 2023 edition / TD 2023).
 *                      Note: the two files uploaded as "insee ones" were
 *                      ECRT2023E2.xlsx (population active projections) and
 *                      reveproteccotisantretraite.xlsx (DREES historical
 *                      cotisants/retraités 2004–2023) — neither contains qx.
 *
 *   ⚠️  RETIREE_AGE_WEIGHTS_2027 — PLACEHOLDER. Pending DREES Édition 2025
 *                      (Les retraités et les retraites), 2027 retiree age
 *                      pyramid for ages 64–85, normalised to sum=1.
 *
 * DESIGN NOTES (per DemographicKernel_plan.md §3.2, §5.3):
 *   - INSEE qx arrays are kept SEPARATE for male and female. Do NOT pre-blend
 *     qx values: because male mortality > female mortality, a static blend
 *     systematically under-counts females in the surviving cohort and overstates
 *     deaths at advanced ages. Blending must happen at the survival-curve level
 *     S_mixed = (1−f)·S_male + f·S_female, computed in simulation-engine.js.
 *   - Years 2071–2096 use FLAT extrapolation (P[y] = P[2070]) — the spec's
 *     decision against terminal CAGR (which would compound a 5-year window into
 *     26-year exponential drift; see DemographicKernel_plan.md §9.2).
 *   - RETIREE_AGE_WEIGHTS_2027 sums to 1.0 over ages 64–85. The 22-element
 *     array index maps as `weights[age − 64]`.
 * ========================================================================== */

// ---- Year array ------------------------------------------------------------
// 73 entries: 2024..2096 inclusive. COR data covers 2024–2070; 2071–2096 is
// flat-extrapolated (see §9.2 of the spec).
export const COR_YEARS = Array.from({ length: 73 }, (_, i) => 2024 + i);

/** Map a calendar year to the index in any COR_*.P_act / COR_*.P_ret array.
 *  Example: 2027 → 3, 2096 → 72. Values outside [2024, 2096] are clamped. */
export function corYearToIdx(year) {
  if (year <= 2024) return 0;
  if (year >= 2096) return 72;
  return year - 2024;
}

// ---- COR demographic projections ------------------------------------------
// Each scenario has P_act (population active, millions) and P_ret (retraités
// droits directs, millions). Indices align with COR_YEARS (2024–2096, 73 entries).
//
// P_act — REAL DATA: COR RA2025, hypo_cotisants_chomage_2025.xlsx, col "Emploi total"
//   (thousands → millions). 2024–2070 from source; 2071–2096 flat (= 2070 value).
//   All three scenarios are identical 2024–2029; diverge from 2030 (unemployment).
//
// P_ret — PLACEHOLDER: synthetic curve 17.0M → ~21.5M → flat (pending real data).

// COR central: Chô_7% unemployment scenario (central 7% long-run unemployment).
export const COR_CENTRAL = {
  P_act: [30.597,30.5787,30.7254,30.9344,31.1664,31.3378,31.4099,31.4915,31.5734,31.5924,31.6208,31.6524,31.6619,31.6524,31.6556,31.6651,31.6556,31.6271,31.5923,31.5481,31.5039,31.4566,31.3811,31.309,31.2432,31.1932,31.1308,31.0686,31.0158,30.9692,30.9321,30.9073,30.8733,30.8486,30.8301,30.8178,30.8024,30.7839,30.7654,30.75,30.7285,30.6916,30.6425,30.5966,30.5507,30.5018,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408],
  P_ret: [17,17.015,17.06,17.131,17.228,17.348,17.489,17.65,17.827,18.02,18.225,18.442,18.668,18.9,19.138,19.379,19.621,19.862,20.1,20.332,20.558,20.775,20.98,21.173,21.35,21.511,21.652,21.772,21.869,21.94,21.985,22,21.994,21.976,21.948,21.912,21.87,21.824,21.775,21.725,21.676,21.63,21.588,21.552,21.524,21.506,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5],
};

// COR high: Chô_5% unemployment scenario (5% LT unemployment → higher employment).
export const COR_HIGH = {
  P_act: [30.597,30.5787,30.7254,30.9344,31.1664,31.3378,31.4694,31.6142,31.7564,31.839,31.9281,32.0207,32.0912,32.1457,32.21,32.2809,32.3325,32.3034,32.2679,32.2227,32.1776,32.1294,32.0522,31.9785,31.9114,31.8603,31.7966,31.733,31.6791,31.6315,31.5936,31.5683,31.5336,31.5083,31.4894,31.4768,31.4611,31.4422,31.4234,31.4077,31.3857,31.348,31.2979,31.2509,31.204,31.1541,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918],
  P_ret: [17,17.016,17.063,17.139,17.242,17.369,17.519,17.689,17.877,18.081,18.299,18.528,18.768,19.014,19.267,19.522,19.778,20.033,20.286,20.532,20.772,21.001,21.219,21.423,21.611,21.781,21.931,22.058,22.161,22.237,22.284,22.3,22.294,22.276,22.248,22.212,22.17,22.124,22.075,22.025,21.976,21.93,21.888,21.852,21.824,21.806,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8],
};

// COR low: Chô_10% unemployment scenario (10% LT unemployment → lower employment).
export const COR_LOW = {
  P_act: [30.597,30.5787,30.7254,30.9344,31.1664,31.3378,31.3159,31.3065,31.2939,31.222,31.1564,31.0941,31.0101,30.9078,30.8182,30.735,30.6335,30.606,30.5723,30.5295,30.4867,30.441,30.368,30.2981,30.2345,30.1861,30.1257,30.0655,30.0144,29.9694,29.9334,29.9094,29.8765,29.8526,29.8347,29.8228,29.8079,29.79,29.7721,29.7572,29.7364,29.7007,29.6532,29.6087,29.5643,29.517,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458],
  P_ret: [17,17.013,17.051,17.113,17.196,17.3,17.421,17.559,17.711,17.877,18.054,18.24,18.434,18.634,18.839,19.046,19.254,19.461,19.666,19.866,20.06,20.246,20.423,20.589,20.741,20.879,21,21.104,21.187,21.249,21.287,21.3,21.294,21.276,21.248,21.212,21.17,21.124,21.075,21.025,20.976,20.93,20.888,20.852,20.824,20.806,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8],
};

// Scenario name → table lookup.
export const COR_SCENARIOS = {
  cor_central: COR_CENTRAL,
  cor_high:    COR_HIGH,
  cor_low:     COR_LOW,
};

// ---- INSEE T60 mortality (qx by single age) — PLACEHOLDER ----------------
// 46 entries each, indices map age − 60 (so qxArray[0] = q(age 60), [45] = q(105)).
// PLACEHOLDER: Generated from a Makeham form q(x) = a + b·c^(x−60) calibrated to:
//   • Male:   q(60)=0.007, q(70)=0.018, q(80)=0.049, q(90)=0.138, q(100)=0.391
//   • Female: q(60)=0.0035, q(70)=0.010, q(80)=0.029, q(90)=0.090, q(100)=0.280
// Replace with: INSEE Tableaux de mortalité T60 (2023 edition), qx by single age.
// Source: https://www.insee.fr/fr/statistiques/2533382

export const INSEE_T60_QX_MALE = [0.007,0.00766,0.00839,0.00921,0.01011,0.01111,0.01222,0.01346,0.01483,0.01635,0.01804,0.01991,0.02199,0.0243,0.02686,0.02971,0.03287,0.03637,0.04026,0.04458,0.04937,0.05469,0.0606,0.06716,0.07443,0.08251,0.09148,0.10143,0.11248,0.12474,0.13835,0.15346,0.17023,0.18885,0.20951,0.23245,0.25791,0.28617,0.31754,0.35236,0.39101,0.43391,0.48153,0.53438,0.59306,0.65818];

export const INSEE_T60_QX_FEMALE = [0.0035,0.00386,0.00426,0.00471,0.00522,0.00579,0.00642,0.00713,0.00793,0.00882,0.00982,0.01094,0.01219,0.01359,0.01516,0.01692,0.01889,0.0211,0.02357,0.02634,0.02944,0.03291,0.0368,0.04116,0.04604,0.0515,0.05762,0.06447,0.07215,0.08075,0.09038,0.10117,0.11325,0.12677,0.14193,0.1589,0.17791,0.1992,0.22304,0.24974,0.27965,0.31315,0.35067,0.39269,0.43975,0.49246];

// ---- DREES 2027 retiree age pyramid weights (ages 64–85) — PLACEHOLDER ----
// 22 entries; index = age − 64. Sum = 1.0 (renormalised within band).
// PLACEHOLDER: Approximate normal distribution centred at age 70 (boomer-cohort
// modal age), std ≈ 6, truncated to [64, 85].
// Replace with: DREES Édition 2025 "Les retraités et les retraites", 2027
// retiree age pyramid for ages 64–85, normalised to sum=1.
export const RETIREE_AGE_WEIGHTS_2027 = [0.04711,0.05488,0.06219,0.06854,0.07347,0.0766,0.07767,0.0766,0.07347,0.06854,0.06219,0.05488,0.04711,0.03933,0.03193,0.02521,0.01937,0.01447,0.01051,0.00743,0.0051,0.00341];

// ---- Survival-curve precomputation ----------------------------------------
//
// S_g(a, t) = ∏_{k=0..t-1} (1 − qx_g[a−60+k])  for gender g ∈ {male, female}
//
// We precompute survival as 22×N matrices (22 entry ages 64..85, N years), one
// per gender. Shape choice: outer index is entry-age offset (0..21 → 64..85),
// inner index is t (years since 2027). t=0 → S=1 (alive at start).
//
// Cache cleared lazily; the matrices depend only on the qx arrays which are
// constants. We compute once at module load.

const _N_YEARS_DEFAULT = 75;   // > simulation horizon (70) so we never index OOB

function buildSurvivalMatrix(qx, nYears = _N_YEARS_DEFAULT) {
  const M = [];
  for (let aOffset = 0; aOffset < 22; aOffset++) {
    const row = new Float64Array(nYears + 1);
    row[0] = 1;
    let s = 1;
    for (let t = 1; t <= nYears; t++) {
      const ageIdx = (64 - 60) + aOffset + (t - 1);  // current age − 60
      // Beyond age 105 (qx index 45) the cohort is fully extinct.
      const q = ageIdx >= 46 ? 1 : qx[ageIdx];
      s *= (1 - q);
      row[t] = s;
    }
    M.push(row);
  }
  return M;
}

export const S_MALE   = buildSurvivalMatrix(INSEE_T60_QX_MALE);
export const S_FEMALE = buildSurvivalMatrix(INSEE_T60_QX_FEMALE);

/** Mixed survival blended at curve level (NOT qx level — see header note).
 *  @param aOffset entry-age offset (age − 64), in [0, 21]
 *  @param t       years since entry
 *  @param f       female fraction in [0, 1] (0.52 = COR retiree pool default)
 */
export function S_mixed(aOffset, t, f) {
  if (t < 0) return 1;
  if (t >= S_MALE[0].length) return 0;
  return (1 - f) * S_MALE[aOffset][t] + f * S_FEMALE[aOffset][t];
}
