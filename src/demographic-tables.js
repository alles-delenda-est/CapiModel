/* ============================================================================
 * Demographic tables — v2.0 actuarial kernel (PR #15 — implementation phase)
 * ============================================================================
 *
 * STATUS: PLACEHOLDER DATA — pending official transcription.
 *
 * The numeric arrays in this file are *illustrative placeholders* generated
 * from parametric forms calibrated to match the qualitative behaviour expected
 * from the COR juin 2025 central scenario and INSEE T60 2023 mortality tables.
 * They are NOT primary-source values. They produce reasonable simulation
 * behaviour for engine-testing purposes but must be replaced before v2.0
 * is released as the default `demoMode`.
 *
 * Replacement plan (separate small PR after engine merge):
 *   1. COR_*.P_act, COR_*.P_ret    ← COR juin 2025 rapport annexe statistique,
 *                                    Table S1 ("Population active et retraités",
 *                                    millions, 2024–2070, scénarios haute / centrale / basse).
 *                                    https://www.cor-retraites.fr/rapports
 *   2. INSEE_T60_QX_MALE / FEMALE  ← INSEE Tableaux de mortalité T60 (2023 ed.),
 *                                    qx by single age, ages 60–105.
 *                                    https://www.insee.fr/fr/statistiques/2533382
 *   3. RETIREE_AGE_WEIGHTS_2027    ← DREES Édition 2025 (Les retraités et les
 *                                    retraites), 2027 retiree age pyramid for
 *                                    ages 64–85, normalised to sum=1.
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
// Three scenarios. Each has P_act (population active, millions) and P_ret
// (retraités droits directs, millions). Indices align with COR_YEARS.
//
// Generation (placeholder):
//   • P_act: starts at 28.5M (~2024 baseline); declines smoothly to 26.0M
//     (central) / 24.0M (low) / 29.23M (high) by 2070; flat 2071–2096.
//   • P_ret: starts at 17.0M (~2024); rises to peak ~22.0M (central) around
//     2055, then plateaus at ~21.5M; flat 2071–2096.

export const COR_CENTRAL = {
  P_act: [28.5,28.497,28.486,28.469,28.447,28.418,28.383,28.344,28.299,28.25,28.197,28.139,28.078,28.014,27.946,27.876,27.803,27.728,27.651,27.573,27.493,27.413,27.331,27.25,27.169,27.087,27.007,26.927,26.849,26.772,26.697,26.624,26.554,26.486,26.422,26.361,26.303,26.25,26.201,26.156,26.117,26.082,26.053,26.031,26.014,26.003,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26],
  P_ret: [17,17.015,17.06,17.131,17.228,17.348,17.489,17.65,17.827,18.02,18.225,18.442,18.668,18.9,19.138,19.379,19.621,19.862,20.1,20.332,20.558,20.775,20.98,21.173,21.35,21.511,21.652,21.772,21.869,21.94,21.985,22,21.994,21.976,21.948,21.912,21.87,21.824,21.775,21.725,21.676,21.63,21.588,21.552,21.524,21.506,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5,21.5],
};

export const COR_HIGH = {
  P_act: [28.5,28.506,28.513,28.521,28.531,28.541,28.553,28.566,28.58,28.595,28.611,28.627,28.644,28.662,28.681,28.7,28.719,28.739,28.76,28.78,28.801,28.822,28.844,28.865,28.886,28.908,28.929,28.95,28.97,28.991,29.011,29.03,29.049,29.068,29.086,29.103,29.119,29.135,29.15,29.164,29.177,29.189,29.199,29.209,29.217,29.224,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23,29.23],
  P_ret: [17,17.016,17.063,17.139,17.242,17.369,17.519,17.689,17.877,18.081,18.299,18.528,18.768,19.014,19.267,19.522,19.778,20.033,20.286,20.532,20.772,21.001,21.219,21.423,21.611,21.781,21.931,22.058,22.161,22.237,22.284,22.3,22.294,22.276,22.248,22.212,22.17,22.124,22.075,22.025,21.976,21.93,21.888,21.852,21.824,21.806,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8,21.8],
};

export const COR_LOW = {
  P_act: [28.5,28.494,28.475,28.445,28.404,28.352,28.29,28.219,28.139,28.051,27.954,27.851,27.741,27.625,27.503,27.377,27.245,27.11,26.972,26.831,26.688,26.543,26.397,26.25,26.103,25.957,25.812,25.669,25.528,25.39,25.255,25.123,24.997,24.875,24.759,24.649,24.546,24.449,24.361,24.281,24.21,24.148,24.096,24.055,24.025,24.006,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24],
  P_ret: [17,17.013,17.051,17.113,17.196,17.3,17.421,17.559,17.711,17.877,18.054,18.24,18.434,18.634,18.839,19.046,19.254,19.461,19.666,19.866,20.06,20.246,20.423,20.589,20.741,20.879,21,21.104,21.187,21.249,21.287,21.3,21.294,21.276,21.248,21.212,21.17,21.124,21.075,21.025,20.976,20.93,20.888,20.852,20.824,20.806,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8,20.8],
};

// Scenario name → table lookup.
export const COR_SCENARIOS = {
  cor_central: COR_CENTRAL,
  cor_high:    COR_HIGH,
  cor_low:     COR_LOW,
};

// ---- INSEE T60 mortality (qx by single age) -------------------------------
// 46 entries each, indices map age − 60 (so qxArray[0] = q(age 60), [45] = q(105)).
// Generated from a Makeham form q(x) = a + b·c^(x−60) calibrated to:
//   • Male:   q(60)=0.007, q(70)=0.018, q(80)=0.049, q(90)=0.138, q(100)=0.391
//   • Female: q(60)=0.0035, q(70)=0.010, q(80)=0.029, q(90)=0.090, q(100)=0.280
// Females ~50–60 % of male mortality at every age, matching observed French data.

export const INSEE_T60_QX_MALE = [0.007,0.00766,0.00839,0.00921,0.01011,0.01111,0.01222,0.01346,0.01483,0.01635,0.01804,0.01991,0.02199,0.0243,0.02686,0.02971,0.03287,0.03637,0.04026,0.04458,0.04937,0.05469,0.0606,0.06716,0.07443,0.08251,0.09148,0.10143,0.11248,0.12474,0.13835,0.15346,0.17023,0.18885,0.20951,0.23245,0.25791,0.28617,0.31754,0.35236,0.39101,0.43391,0.48153,0.53438,0.59306,0.65818];

export const INSEE_T60_QX_FEMALE = [0.0035,0.00386,0.00426,0.00471,0.00522,0.00579,0.00642,0.00713,0.00793,0.00882,0.00982,0.01094,0.01219,0.01359,0.01516,0.01692,0.01889,0.0211,0.02357,0.02634,0.02944,0.03291,0.0368,0.04116,0.04604,0.0515,0.05762,0.06447,0.07215,0.08075,0.09038,0.10117,0.11325,0.12677,0.14193,0.1589,0.17791,0.1992,0.22304,0.24974,0.27965,0.31315,0.35067,0.39269,0.43975,0.49246];

// ---- DREES 2027 retiree age pyramid weights (ages 64–85) ------------------
// 22 entries; index = age − 64. Sum = 1.0 (renormalised within band).
// Approximate normal distribution centred at age 70 (boomer-cohort modal age),
// std ≈ 6, truncated to [64, 85].
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
