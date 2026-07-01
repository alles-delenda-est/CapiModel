/* ============================================================================
 * Demographic tables — v2.0 actuarial kernel
 * ============================================================================
 *
 * DATA STATUS (updated June 2026 — PR B):
 *
 *   PR B re-anchored these tables on the June-2026 vintage:
 *     P_act = INSEE-2026 central 15-64 working-age (was COR RA2025 "emploi total");
 *     P_ret = COR RA2026 retiree-growth (was RA2025); qx = INSEE-2026 2027 period
 *     (was INSEE 2021); cor_high/cor_low = INSEE "population haute/basse" demographic
 *     variants (were unemployment variants on central demographics).
 *   The per-series notes below describe the PRE-PR-B provenance, kept for history.
 *
 *   DATA STATUS (pre-PR-B, May 2026):
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
 *   ✅ COR_*.P_ret   — REAL DATA. Source: COR RA2025, Données complémentaires,
 *                      sheet "Cotisants_Retraités", row "Nombre de retraités
 *                      (tous retraités) en millions". 2024–2070 from source;
 *                      2071–2096 flat-extrapolated (= 2070 value).
 *                      Scenario mapping: P_ret is driven by demographics (life
 *                      expectancy), NOT by unemployment assumptions. All three
 *                      economic scenarios (Chô 5/7/10%) have nearly identical P_ret
 *                      (max deviation ~58k). Mapped as:
 *                        cor_central ← COR row "[1,0]" (central LE, ~7% unemployment)
 *                        cor_high    ← COR row "[0,7_C5]" (central LE, 5% unemployment)
 *                        cor_low     ← COR row "[0,7_C10]" (central LE, 10% unemployment)
 *
 *   ✅ INSEE_T60_QX_MALE / FEMALE — REAL DATA. Source: INSEE projections de
 *                      population 2021–2070, central scenario, single-age qx
 *                      table (00_central_QX.xlsx, sheets hyp_mortaliteH /
 *                      hyp_mortaliteF, "Quotients de mortalité par âge pour
 *                      100 000"). Extracted: the 2027 period column, INSEE
 *                      ages 61–106, divided by 100 000.
 *                      CONVENTION SHIFT: INSEE indexes qx by "âge atteint dans
 *                      l'année" — empirically S(x+1)/S(x) = 1 − qx_insee(x+1).
 *                      The engine needs qx[age−60] = P(die between exact age and
 *                      age+1) = qx_insee(age+1), so engine index i holds INSEE
 *                      qx for âge atteint 61+i. Verified: engine survival curve
 *                      reproduces INSEE's published "Survie par âge" to <2e-6.
 *                      INSEE LE(65) for 2027: male 20.127 yrs, female 23.663 yrs
 *                      — these match COR RA2025 Fig 1.3 exactly (Fig 1.3 is built
 *                      on this same INSEE central mortality projection).
 *                      Note: a single static 2027 period vector is used for the
 *                      whole horizon; it slightly overstates old-age mortality
 *                      for cohorts reaching advanced ages in later decades
 *                      (mortality keeps improving) — a known limitation of the
 *                      single-vector engine design, not of the source data.
 *
 *   ✅ RETIREE_AGE_WEIGHTS_2027 — CALIBRATED. Derived from:
 *                      (a) French birth cohorts 1942–1963 (INSEE vital statistics);
 *                      (b) Period survival rates to age X in 2027 (approximate);
 *                      (c) COR RA2025 Fig 4.6 "Taux de retraités par âge" for
 *                          ages 64–70 in 2023 (taux ≈ 1.0 for ages 70+).
 *                      Modal weight at age 68 (shifted left vs Gaussian placeholder
 *                      due to 2023 reform deferring retirements from 62→64 and
 *                      partially post-boom cohorts entering at 64–66).
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

// ---- COR / INSEE demographic projections (PR B — INSEE-2026 / COR RA2026) -
// Each scenario has P_act (active population, millions) and P_ret (retraités,
// millions). Indices align with COR_YEARS (2024-2096, 73 entries).
//
// P_act — REAL DATA: INSEE "Projections de population 2026", scénario central,
//   00_central.xlsx sheet "population", age band 15-64 (consistent with the
//   engine's employmentRate0 = 0.69, a 15-64 rate; empFactor carries the
//   employment-rate ramp, P_act the working-age demographics). 2024-2070 from
//   source; 2071-2096 flat (= 2070 value).
//
// P_ret — REAL DATA: COR RA2026, Données_RA2026_P2.xlsx "Tab 2.1" mean annual
//   retiree-growth rates (2025-2030 +0.530%/yr, 2030-2045 +0.809%, 2045-2070
//   +0.387%), applied from a ~17.4M (2024) anchor. The level is cosmetic — the
//   engine normalises to 2027 — only the growth shape matters. These RA2026
//   rates already embed the LFSS-2026 age-64 suspension.

// COR/INSEE central scenario.
export const COR_CENTRAL = {
  P_act: [42.27131,42.37482,42.51492,42.58448,42.62883,42.62421,42.60954,42.58853,42.55501,42.52734,42.49393,42.4526,42.37938,42.29833,42.19264,42.06273,41.95923,41.87983,41.81108,41.70306,41.57948,41.43841,41.24559,41.06847,40.89133,40.7556,40.60621,40.44407,40.27634,40.11138,39.94182,39.77776,39.60703,39.45228,39.29841,39.16842,39.03593,38.88274,38.72164,38.55942,38.37932,38.1949,37.97523,37.76853,37.57387,37.38437,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251,37.18251],
  P_ret: [17.41,17.50227,17.59504,17.68829,17.78204,17.87628,17.97103,18.11641,18.26297,18.41072,18.55966,18.70981,18.86117,19.01376,19.16758,19.32265,19.47897,19.63655,19.79541,19.95556,20.117,20.27974,20.35823,20.43701,20.5161,20.5955,20.67521,20.75522,20.83554,20.91618,20.99712,21.07838,21.15995,21.24184,21.32405,21.40657,21.48942,21.57258,21.65607,21.73987,21.82401,21.90847,21.99325,22.07837,22.16381,22.24958,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569,22.33569],
};

// COR/INSEE high scenario — INSEE-2026 "population haute" (fertility 1.70, migration
// +230k, high LE). 15-64 working-age from 21_population_haute.xlsx; P_ret = central
// retiree trajectory scaled by the INSEE 65+ haute/central ratio. More favourable
// old-age dependency (65+/15-64 ~0.54 in 2070 vs 0.57 central).
export const COR_HIGH = {
  P_act: [42.337,42.506,42.714,42.852,42.965,43.03,43.086,43.135,43.173,43.216,43.255,43.285,43.284,43.276,43.242,43.188,43.161,43.168,43.211,43.242,43.285,43.32,43.314,43.326,43.34,43.396,43.44,43.473,43.502,43.534,43.563,43.599,43.628,43.673,43.72,43.79,43.857,43.901,43.937,43.969,43.98,43.985,43.95,43.925,43.909,43.897,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872,43.872],
  P_ret: [17.41494,17.51156,17.61998,17.73259,17.84929,17.96885,18.09199,18.26926,18.44912,18.6343,18.82253,19.0145,19.21068,19.41011,19.61318,19.82134,20.0335,20.25115,20.4729,20.69736,20.92641,21.15754,21.29951,21.44236,21.58667,21.73324,21.87923,22.02631,22.17271,22.3216,22.4702,22.62086,22.7719,22.92531,23.07923,23.23727,23.39609,23.5551,23.71463,23.87654,24.04083,24.20799,24.37602,24.54983,24.72904,24.91345,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958,25.09958],
};

// COR/INSEE low scenario — INSEE-2026 "population basse" (fertility 1.20, migration
// +70k, low LE). Steeper working-age decline; P_ret scaled by the INSEE 65+
// basse/central ratio. Worse dependency (65+/15-64 ~0.61 in 2070).
export const COR_LOW = {
  P_act: [42.206,42.244,42.316,42.317,42.292,42.217,42.131,42.039,41.934,41.834,41.729,41.615,41.469,41.315,41.136,40.93,40.749,40.582,40.413,40.191,39.941,39.644,39.267,38.905,38.542,38.219,37.882,37.531,37.175,36.82,36.46,36.106,35.745,35.4,35.056,34.737,34.417,34.078,33.733,33.389,33.031,32.672,32.283,31.912,31.555,31.207,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849,30.849],
  P_ret: [17.40551,17.49296,17.56836,17.63975,17.70937,17.77868,17.84622,17.96257,18.07783,18.19312,18.30753,18.42189,18.53584,18.64845,18.76085,18.87203,18.98148,19.09,19.19764,19.30478,19.41176,19.51856,19.54488,19.5687,19.59312,19.61339,19.63346,19.65195,19.66965,19.68551,19.70091,19.71568,19.72878,19.74077,19.75295,19.76166,19.77093,19.78028,19.78896,19.79642,19.80284,19.80702,19.81055,19.80884,19.80334,19.79398,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242,19.78242],
};

// Scenario name → table lookup.
export const COR_SCENARIOS = {
  cor_central: COR_CENTRAL,
  cor_high:    COR_HIGH,
  cor_low:     COR_LOW,
};

// ---- INSEE T60 mortality (qx by single age) — REAL DATA ------------------
// 46 entries each. Engine convention: qx[i] = P(die between exact age 60+i and
// 61+i). Source: INSEE Projections de population 2026 central scenario, 2027 period
// column. INSEE's "âge atteint dans l'année" qx is shifted +1 age (see header),
// so engine index i holds INSEE qx for âge atteint 61+i.
//   • Male:   q[0]=q(60→61)=0.00801, q[4]=q(64→65)=0.01097, q[10]=q(70)=0.01777,
//             q[20]=q(80)=0.04228, q[30]=q(90)=0.15012. INSEE LE(65)=20.127 yrs.
//   • Female: q[0]=q(60→61)=0.00418, q[4]=q(64→65)=0.00543, q[10]=q(70)=0.00899,
//             q[20]=q(80)=0.02623, q[30]=q(90)=0.10585. INSEE LE(65)=23.663 yrs.

export const INSEE_T60_QX_MALE = [0.007905,0.008678,0.009419,0.010432,0.011225,0.012524,0.013204,0.014376,0.015497,0.016652,0.01837,0.020306,0.02147,0.023005,0.025406,0.027063,0.029124,0.032122,0.035244,0.039085,0.044327,0.047896,0.053641,0.061065,0.066915,0.077129,0.088547,0.097191,0.109049,0.126035,0.141835,0.16219,0.179337,0.192551,0.220948,0.248097,0.272562,0.304754,0.330608,0.363462,0.379331,0.395321,0.411531,0.427928,0.444477,0.461026];

export const INSEE_T60_QX_FEMALE = [0.004151,0.004493,0.005013,0.005558,0.006039,0.006635,0.00697,0.007333,0.008015,0.008734,0.009625,0.010584,0.011503,0.012439,0.013317,0.014656,0.016521,0.018105,0.021229,0.023195,0.026843,0.030706,0.034774,0.040222,0.046894,0.052497,0.060022,0.069543,0.078503,0.090676,0.104934,0.12056,0.13684,0.155521,0.180973,0.202691,0.221784,0.253962,0.272385,0.298061,0.318922,0.33892,0.358918,0.379116,0.39951,0.419903];

// ---- DREES 2027 retiree age pyramid weights (ages 64–85) — CALIBRATED ----
// 22 entries; index = age − 64. Sum ≈ 1.0 (normalised; engine clamps output).
// Derived from: (a) French birth cohorts 1942–1963 (INSEE vital statistics),
// (b) period survival rates to age X in 2027, (c) COR RA2025 Fig 4.6 "taux de
// retraités par âge en 2023" for ages 64–70 (taux ≈ 1.0 for ages 70+).
// Modal weight at age 68 (born 1959, peak baby-boom cohort + partial reform effect
// pushing age-64 entry rate below 1.0). Dip at age 83 (born 1944, WWII war year).
export const RETIREE_AGE_WEIGHTS_2027 = [0.04916,0.05065,0.05161,0.05503,0.05693,0.0552,0.05655,0.05439,0.05347,0.0531,0.05252,0.0525,0.05231,0.05226,0.04088,0.03833,0.03749,0.0342,0.03117,0.02285,0.02512,0.02428];

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
