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
 *                      INSEE LE(65) for 2027: male 20.199 yrs, female 23.868 yrs
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
// P_ret: COR RA2025 "Nombre de retraités (tous retraités)" row "[1,0]", 2024–2070; flat 2071–2096.
export const COR_CENTRAL = {
  P_act: [30.597,30.5787,30.7254,30.9344,31.1664,31.3378,31.4099,31.4915,31.5734,31.5924,31.6208,31.6524,31.6619,31.6524,31.6556,31.6651,31.6556,31.6271,31.5923,31.5481,31.5039,31.4566,31.3811,31.309,31.2432,31.1932,31.1308,31.0686,31.0158,30.9692,30.9321,30.9073,30.8733,30.8486,30.8301,30.8178,30.8024,30.7839,30.7654,30.75,30.7285,30.6916,30.6425,30.5966,30.5507,30.5018,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408,30.4408],
  P_ret: [17.2138,17.3629,17.4948,17.6583,17.7839,17.9149,18.0809,18.2315,18.4221,18.6359,18.8343,19.0201,19.1827,19.3509,19.4811,19.6201,19.75,19.8593,19.9748,20.0849,20.2016,20.3065,20.4099,20.51,20.5973,20.69,20.7698,20.8529,20.917,20.9817,21.0427,21.0853,21.1184,21.1608,21.1963,21.2218,21.242,21.2429,21.2684,21.2831,21.2909,21.2952,21.3205,21.3991,21.4388,21.4872,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345,21.5345],
};

// COR high: Chô_5% unemployment scenario (5% LT unemployment → higher employment).
// P_ret: COR RA2025 row "[0,7_C5]" (nearly identical to central; unemployment doesn't drive P_ret).
export const COR_HIGH = {
  P_act: [30.597,30.5787,30.7254,30.9344,31.1664,31.3378,31.4694,31.6142,31.7564,31.839,31.9281,32.0207,32.0912,32.1457,32.21,32.2809,32.3325,32.3034,32.2679,32.2227,32.1776,32.1294,32.0522,31.9785,31.9114,31.8603,31.7966,31.733,31.6791,31.6315,31.5936,31.5683,31.5336,31.5083,31.4894,31.4768,31.4611,31.4422,31.4234,31.4077,31.3857,31.348,31.2979,31.2509,31.204,31.1541,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918,31.0918],
  P_ret: [17.2138,17.3629,17.4948,17.6583,17.7839,17.9149,18.0809,18.2315,18.4221,18.6359,18.8343,19.0201,19.1827,19.3509,19.4811,19.6201,19.75,19.8593,19.9748,20.0849,20.2016,20.3065,20.4099,20.51,20.5973,20.69,20.7698,20.8529,20.917,20.9817,21.0427,21.0853,21.1184,21.1608,21.1963,21.2218,21.242,21.2429,21.2684,21.2831,21.2909,21.2952,21.3205,21.3991,21.4674,21.5285,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923,21.5923],
};

// COR low: Chô_10% unemployment scenario (10% LT unemployment → lower employment).
// P_ret: COR RA2025 row "[0,7_C10]" (nearly identical to central; unemployment doesn't drive P_ret).
export const COR_LOW = {
  P_act: [30.597,30.5787,30.7254,30.9344,31.1664,31.3378,31.3159,31.3065,31.2939,31.222,31.1564,31.0941,31.0101,30.9078,30.8182,30.735,30.6335,30.606,30.5723,30.5295,30.4867,30.441,30.368,30.2981,30.2345,30.1861,30.1257,30.0655,30.0144,29.9694,29.9334,29.9094,29.8765,29.8526,29.8347,29.8228,29.8079,29.79,29.7721,29.7572,29.7364,29.7007,29.6532,29.6087,29.5643,29.517,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458,29.458],
  P_ret: [17.2138,17.3629,17.4948,17.6583,17.7839,17.9149,18.0809,18.2315,18.4221,18.6359,18.8343,19.0201,19.1827,19.3509,19.4811,19.6201,19.75,19.8593,19.9748,20.0849,20.2016,20.3065,20.4099,20.51,20.5973,20.69,20.7698,20.8529,20.917,20.9817,21.0427,21.0853,21.1184,21.1608,21.1963,21.2218,21.242,21.2429,21.2684,21.2831,21.2909,21.2952,21.3205,21.3827,21.4224,21.4709,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182,21.5182],
};

// Scenario name → table lookup.
export const COR_SCENARIOS = {
  cor_central: COR_CENTRAL,
  cor_high:    COR_HIGH,
  cor_low:     COR_LOW,
};

// ---- INSEE T60 mortality (qx by single age) — REAL DATA ------------------
// 46 entries each. Engine convention: qx[i] = P(die between exact age 60+i and
// 61+i). Source: INSEE projections 2021–2070 central scenario, 2027 period
// column. INSEE's "âge atteint dans l'année" qx is shifted +1 age (see header),
// so engine index i holds INSEE qx for âge atteint 61+i.
//   • Male:   q[0]=q(60→61)=0.00801, q[4]=q(64→65)=0.01097, q[10]=q(70)=0.01777,
//             q[20]=q(80)=0.04228, q[30]=q(90)=0.15012. INSEE LE(65)=20.199 yrs.
//   • Female: q[0]=q(60→61)=0.00418, q[4]=q(64→65)=0.00543, q[10]=q(70)=0.00899,
//             q[20]=q(80)=0.02623, q[30]=q(90)=0.10585. INSEE LE(65)=23.868 yrs.

export const INSEE_T60_QX_MALE = [0.008007,0.008756,0.009511,0.010226,0.010966,0.011675,0.012895,0.013896,0.015051,0.016427,0.017768,0.019223,0.020644,0.022453,0.024375,0.026634,0.029298,0.032229,0.035655,0.039572,0.042278,0.046764,0.051939,0.058661,0.066558,0.076,0.087345,0.099939,0.114255,0.13188,0.150118,0.170077,0.188841,0.206431,0.225296,0.247575,0.272339,0.294706,0.313765,0.327886,0.342149,0.356681,0.371457,0.386452,0.401636,0.416982];

export const INSEE_T60_QX_FEMALE = [0.004176,0.004418,0.004707,0.005038,0.005425,0.005747,0.006345,0.006956,0.007543,0.00819,0.008993,0.009997,0.010997,0.012134,0.013494,0.014735,0.016319,0.018253,0.020739,0.02374,0.02623,0.029445,0.033301,0.037882,0.043264,0.049615,0.057924,0.067769,0.078837,0.091607,0.105854,0.122045,0.139841,0.158442,0.17832,0.197311,0.216962,0.237674,0.259199,0.282995,0.303666,0.317202,0.328312,0.334718,0.345911,0.357263];

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
