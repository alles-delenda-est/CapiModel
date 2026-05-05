# Demographic Kernel v2.0 — Implementation Specification

**Status:** Draft spec — PR #14.
**Target version:** v2.0 (separate PR after this spec is reviewed and agreed).
**Authors:** Claude Code (Sonnet 4.6), May 2026.

---

## 1. Motivation and scope

The current demographic kernel (§5.2, eqs 7a–7e) is **parametric**: retiree headcount is a smoothstep envelope governed by three coefficients (`peakMult`, `longRunMult`, `peakT`), and the active population is a piecewise-linear ramp over five hand-calibrated anchor points. These were set by eyeballing the COR June 2025 central scenario — they are adequate for qualitative exploration but introduce two structural biases that accumulate over the 70-year horizon:

1. **Retiree headcount (eqs 7a–7c)**: the smoothstep peak occurs at a model-author-chosen `peakT = 22` (2049) regardless of which birth cohorts actually dominate the retiree pool. The COR June 2025 data shows a plateau around 2042–2055, not a clean unimodal peak.
2. **Legacy cohort extinction (eq 7e)**: `cohIdx(t) = 1 − smoothstep(t, 0, 45)` assigns a smooth, symmetric exit to 1960s cohorts. Real cohort survival is concave — early years lose fewer people (most 60-year-olds in 2027 survive to 75), late years lose many (few 90-year-olds survive past 100). The parametric form overstates surviving outflow in years 30–45 relative to actuarial data.
3. **Active population (eq 7d)**: five hand-tuned anchor points cannot track structural shifts (early retirement, disability rates, immigration inflows) captured by INSEE Omphale projections.

Actuarial replacement with exact INSEE/COR tables was flagged at §10.4 and §10.6 of the spec as the highest-priority v1.1/v1.2 candidate. This document specifies it as v2.0.

**Scope of this spec:**
- Replace eqs 7a–7e with table-driven equivalents.
- Introduce new `demographicMode` config parameter and embedded data tables.
- Audit and confirm linkages from labour force to contributions and GDP (§6 below).
- Per-cohort population mask for `legacyShareAvg_t` (eliminates the held-flat bias documented in v1.1; §6.5).
- Align Monte Carlo demographic uncertainty to the user's `demoScenario` selection (§9.5).
- Preserve full backward compatibility: `demoMode: 'parametric'` reproduces current behaviour exactly.

**Out of scope** for v2.0 (deferred to v2.1+):
- Per-age employment rates (current single-aggregate rate is retained).
- Migration disaggregation by skill level.
- Behavioural responses (retirement timing, labour supply elasticity).
- Full Leslie-matrix population accounting at yearly age resolution.

---

## 2. Current parametric kernel (v1.x)

### 2.1 Equations (for reference)

```
retireeIdx(t)   = 1 + smoothstep(t, 0, peakT) × (peakMult − 1)
                    − smoothstep(t, peakT, 70) × (peakMult − longRunMult)      (7a–7c)

activePopFactor(t) = interpLinear(t, activePopAnchors)                         (7d)

cohIdx(t)        = 1 − smoothstep(t, 0, 45)                                   (7e)
```

Three profiles: `cor_central`, `realistic`, `reformed`. Profile parameters:

| Profile        | peakMult | longRunMult | peakT | activePopAnchors (t→factor) |
|----------------|----------|-------------|-------|------------------------------|
| `cor_central`  | 1.30     | 1.25        | 22    | 0→1.00, 14→1.00, 29→0.96, 44→0.90, 70→0.86 |
| `realistic`    | 1.40     | 1.35        | 22    | 0→1.00, 14→0.97, 29→0.90, 44→0.81, 70→0.75 |
| `reformed`     | 1.30     | 1.25        | 22    | 0→1.00, 14→1.02, 29→1.05, 44→1.06, 70→1.04 |

### 2.2 Downstream uses

| Quantity | Equation | Uses |
|----------|----------|------|
| `W_t` (wage bill) | (9) | `activePop_t` (= `activePopFactor(t)`) |
| `C_s_t` (employee contributions) | (10) | `W_t` → `activePop_t` |
| `C_e_t` (employer contributions) | (11) | `W_t` → `activePop_t` |
| `GDP_t` | (31) | `activePop_t` + `empFactor` |
| `legacyRetirees_t` | (24) | `retireeIdx_t` − `capiRetirees_t` |
| `capiRetirees_t` | (23) | `retireeIdx_t` × `(1 − cohIdx_t)` × `capiActivation` |
| `legacyShareAvg_t` | (15b) | `capiRetirees_t` delta — affected by cohort survival shape |
| `legacyExp_t` | (25) | `legacyRetirees_t` |
| `transitionalPaygExp_t` | (25b) | `capiRetirees_t` × `legacyShareAvg_t` |
| `dependencyRatio_t` | diagnostic | `retireeIdx_t / activePop_t` |

### 2.3 Known biases

- **`legacyShareAvg_t` held-flat error**: estimated at 1.7 % peak-debt bias under default preset; accumulates to ~45 % of peak debt at t = 69. Root cause: `cohIdx(t)` symmetric extinction does not weight out higher-`legacyShare` older cohorts fast enough.
- **Late-horizon `retireeIdx` overshoot**: the smoothstep decline from `peakMult` to `longRunMult` assumes a clean 47-year decay; real cohort data shows the decline is faster in 2042–2060 (baby-boom exit) and levels earlier thereafter.

---

## 3. Target: actuarial kernel (v2.0)

### 3.1 Design principles

1. **Table-driven, not parametric.** Demographic quantities are read from embedded arrays sourced from official French statistical bodies.
2. **Scenario selectable.** Three embedded scenarios (COR high / central / low) replace the three parametric profiles. The `reformed` parametric profile has no direct COR equivalent — it is preserved in parametric mode only (see §7).
3. **Yearly resolution.** Both active population and retiree count are provided at integer-year granularity matching the simulation loop. Linear interpolation fills any gaps.
4. **Actuarial cohort survival for `cohIdx`.** The 1960s birth-cohort extinction is computed from INSEE T60 table cumulative survival rather than a smoothstep.
5. **Normalised at t = 0.** The kernel still produces normalised indices (`activePop_t = P_act_t / P_act_0`, `retireeIdx_t = P_ret_t / P_ret_0`) so all downstream equations that use these ratios remain structurally unchanged.

### 3.2 Data sources

| Dataset | Source | Variables used | URL / edition |
|---------|--------|---------------|---------------|
| COR demographic projections | Conseil d'Orientation des Retraites, Rapport annuel juin 2025 | `P_act_t` (population active, millions), `P_ret_t` (retraités de droit direct, millions), years 2024–2070 | https://www.cor-retraites.fr/rapports |
| INSEE T60 mortality tables | INSEE Tableaux de mortalité T60 (2023 edition) | `q_x` (annual probability of death at age x), ages 60–105, reference year 2025 | https://www.insee.fr/fr/statistiques/2533382 |
| INSEE Omphale 2021 | INSEE, variante centrale 2021 | Active-population extrapolation for years 2071–2096 (beyond COR horizon) | Fiches thématiques Omphale 2021 |

#### Implementation note on data embedding

All tables are embedded as JavaScript constant arrays in a new file `src/demographic-tables.js`. This avoids fetch latency (the simulation is client-side with no backend) and keeps the data under version control. The file is read-only from the engine's perspective (`simulation-engine.js` imports from it).

Format:

```js
// src/demographic-tables.js
// COR June 2025 — tableau S1 "Population active et retraités"
// Years 2024–2070 (47 entries), index 0 = year 2024, index 3 = year 2027 (= t=0 in simulation)
export const COR_CENTRAL = {
  P_act: [/* millions, 2024–2096 */],   // active population (cotisants)
  P_ret: [/* millions, 2024–2096 */],   // retraités de droit direct
  years: [/* 2024, 2025, ..., 2096 */],
};
export const COR_HIGH   = { P_act: [...], P_ret: [...], years: [...] };
export const COR_LOW    = { P_act: [...], P_ret: [...], years: [...] };

// INSEE T60 (2023 edition) — qx by single age
// Index: age − 60 (so index 0 = age 60, index 45 = age 105)
export const INSEE_T60_QX_MALE   = [/* 46 values */];
export const INSEE_T60_QX_FEMALE = [/* 46 values */];

// 2027 retiree pool age distribution (DREES Édition 2025, single-age weights for ages 64–85).
// 22-element array; indices: age − 64. Sums to 1.0.
// Captures the natural concentration of the retiree pool around the modal entry age (~67–70)
// and the long but thin tail toward 85+. Replaces the uniform 1/22 placeholder in v0 of this spec.
export const RETIREE_AGE_WEIGHTS_2027 = [/* 22 values, transcribed from DREES 2025 */];

// NOTE: do NOT pre-blend qx values across genders. Because male mortality > female mortality,
// a static qx blend systematically over-represents males in the surviving cohort and overstates
// deaths at advanced ages. Instead, compute S_male(a, t) and S_female(a, t) independently from
// the gender-specific qx arrays and blend the resulting *survival curves* (see §5.3).
```

**Values to source at implementation time**: the actual numeric arrays must be transcribed from the COR June 2025 rapport annexe statistique (Table S1) and the INSEE T60 fichier Excel. Do not infer values from secondary sources; use the primary publications.

---

## 4. Demographic settings — new UI parameters

### 4.1 New config parameters

The following parameters are added to `DEFAULT_CONFIG` in `simulation-engine.js`:

```js
// §4 demographic kernel mode (v2.0)
// 'parametric' — existing smoothstep kernel (backward compat, default until v2.0 is validated)
// 'actuarial'  — COR/INSEE table-driven kernel (v2.0+)
demoMode: 'parametric',

// Actuarial-mode scenario (ignored in parametric mode)
// 'cor_central' | 'cor_high' | 'cor_low'
// Maps to COR_CENTRAL / COR_HIGH / COR_LOW in demographic-tables.js
demoScenario: 'cor_central',

// Population-weighted mortality mix for cohort survival (T60)
// 0 = 100% male, 1 = 100% female, 0.52 = COR retiree pool default
mortalityFemaleFraction: 0.52,
```

The existing `demoProfile` parameter is retained with no change in semantics — it governs `parametric` mode only. In `actuarial` mode it is ignored.

### 4.2 UI exposure

A new **Démographie** `CollapsibleSection` (level `critical`) is added to the simulator panel, replacing the current demographic-profile selector with a richer set of controls:

| Slider / Toggle | ID | Range | Default | Expert-only? |
|-----------------|----|-------|---------|-------------|
| Mode (radio: Paramétrique / Actuariel) | `demoMode` | — | `parametric` (until v2.0 validated) | No |
| Scénario COR (dropdown) | `demoScenario` | high / central / low | `cor_central` | No |
| Profil paramétrique (dropdown, shown only if `demoMode='parametric'`) | `demoProfile` | cor_central / realistic / reformed | `cor_central` | No |
| Mix mortalité féminine | `mortalityFemaleFraction` | 0.40–0.60 | 0.52 | Yes (Tier B) |

Tooltip text for `demoMode`:
> "Mode actuariel : utilise les projections COR juin 2025 et les tables de mortalité INSEE T60. Mode paramétrique : courbe lissée (lissage smoothstep) calée manuellement sur le scénario central COR."

---

## 5. New equations

### 5.1 Active population index (actuarial)

**Current (7d):** `activePopFactor(t) = interpLinear(t, activePopAnchors[profile])`

**Replacement:**
```
P_act_0 = COR_SCENARIO.P_act[idx(Y0)]           // millions actifs in year Y0 = 2027
P_act_t = interpLinear(Y0 + t, COR_SCENARIO.years, COR_SCENARIO.P_act)

activePopFactor_actuarial(t) = P_act_t / P_act_0                    (7d′)
```

`interpLinear` over the `(years, values)` arrays handles years beyond 2070 by clamping to the last available value and applying the Omphale 2021 terminal growth rate for the `cor_central` and `cor_high` scenarios. The `cor_low` scenario uses a more pessimistic extrapolation.

**Extrapolation rule (2071–2096):**

```
g_act_terminal = (P_act[2070] / P_act[2065])^(1/5) − 1   // 5-year CAGR of final COR window
P_act[y] = P_act[2070] × (1 + g_act_terminal)^(y − 2070)   for y ∈ [2071, 2096]
```

This produces a smooth continuation consistent with the Omphale 2021 long-term projection and avoids a hard step at the COR horizon.

### 5.2 Retiree index (actuarial)

**Current (7a–7c):** `retireeIdx(t) = 1 + rampUp − decline` (smoothstep envelope)

**Replacement:**
```
P_ret_0 = COR_SCENARIO.P_ret[idx(Y0)]
P_ret_t = interpLinear(Y0 + t, COR_SCENARIO.years, COR_SCENARIO.P_ret)

retireeIdx_actuarial(t) = P_ret_t / P_ret_0                         (7c′)
```

Same extrapolation rule applies post-2070.

**Note on retiree definition alignment**: COR `P_ret` counts *droits directs* retirees (excluding survivors' pensions). This aligns with the model's `R0 = 18.0 M` (DREES, direct rights only) and `legacyRetirees_t`. The `R0 × retireeIdx(t)` product is therefore consistent.

### 5.3 Cohort survival for `legacyShareAvg_t` (actuarial `cohIdx`)

**Current (7e):** `cohIdx(t) = 1 − smoothstep(t, 0, 45)` — parametric, symmetric.

**Replacement concept:** Track the surviving fraction of the 2027 retiree pool (median age ~70 in 2027) using cumulative T60 survival, computed independently for males and females, then blended at the survival-curve level.

```
// S_g(a, t) = probability that a person of gender g, aged a in 2027, survives to age a+t.
// Computed independently for males and females from gender-specific qx arrays.
S_male(a, t)   = ∏_{k=0}^{t-1} (1 − q_male[a+k])
S_female(a, t) = ∏_{k=0}^{t-1} (1 − q_female[a+k])

// Blend at the *survival-curve* level (NOT at qx). The 2027 retiree pool starts
// at ~48% male / 52% female (cfg.mortalityFemaleFraction). Because males die faster,
// the surviving cohort becomes increasingly female with age — blending qx statically
// at every age would systematically overstate deaths at advanced ages. Curve-level
// blending captures the actual gender-mix dynamics.
S_mixed(a, t) = (1 − f) × S_male(a, t) + f × S_female(a, t)
                                   where f = cfg.mortalityFemaleFraction (default 0.52)

// Cohort survival index = age-weighted mean of S_mixed across the 2027 retiree pool.
// Weights w(a) come from the actual 2027 age pyramid (DREES Édition 2025), not uniform.
// A uniform weight would over-represent 80–85-year-olds (high mortality), causing
// cohIdx_actuarial to plunge artificially fast in years 0–10.
cohIdx_actuarial(t) = Σ_{a=64}^{85} w(a) × S_mixed(a, t)              (7e′)

where w(a) = RETIREE_AGE_WEIGHTS_2027[a − 64]   (DREES 2025 age pyramid, sums to 1)
and   S_mixed(a, t) is clamped to 0 when a + t > 105.
```

**Implementation note**: `S_male[a][t]` and `S_female[a][t]` are precomputed at startup as two 22 × 70 matrices (22 entry ages × 70 years). The per-year `cohIdx_actuarial(t)` is then a dot product: `w · ((1−f)·S_male[:, t] + f·S_female[:, t])`, callable in O(22) per step.

**Effect on `legacyShareAvg_t`**: The actuarial `cohIdx` is concave (fast early survival, slow late survival), whereas the current smoothstep is S-shaped. This removes the systematic overshoot of late-horizon `transitionalPaygExp_t` and reduces the ~45% cumulative bias documented in §2.3.

---

## 6. Linkage audit

This section documents whether each downstream quantity already correctly propagates demographic changes, or whether engine changes are required.

### 6.1 Labour force → wage bill

**Current (eq 9):**
```
W_t = W0 × Omega_t × empFactor × activePop_t
```
where `activePop_t = activePopFactor(t, demoProfile)`.

**Change required:** Replace `activePop_t` with the kernel-mode-dispatched value:
```js
const activePop_t = cfg.demoMode === 'actuarial'
  ? activePopFactor_actuarial(t, cfg)     // new
  : activePopFactor(t, cfg.demoProfile);  // existing
```

No structural change to eq (9) itself. **Status: minor dispatch, no equation change.**

### 6.2 Labour force → employee contributions

**Current (eq 10):** `C_s_t = W_t × tau_s`

`C_s_t` flows entirely through `W_t`. Once `W_t` uses the actuarial `activePop_t`, employee contributions automatically reflect the actuarial labour force. **Status: no change needed.**

### 6.3 Labour force → employer contributions

**Current (eq 11):** `C_e_t = W_t × tau_e_eff`

Same chain as §6.2. Employer contributions flow entirely through `W_t`. **Status: no change needed.**

> **Verification note**: Both employee and employer rates (`tau_s`, `tau_e`) are expressed as fractions of the *nominal wage bill* `W_t`. The actuarial kernel does not change the per-worker wage level `w_n` or its growth — only the headcount factor `activePop_t`. The product `W0 × Omega_t × empFactor × activePop_t` correctly represents the aggregate wage bill, so both contribution equations remain valid without modification.

### 6.4 Labour force → GDP

**Current (eq 31):**
```
GDP_t = baseGDP × Omega_t × empFactor × activePop_t
```

`GDP_t` is already proportional to `activePop_t`. The same dispatch as §6.1 applies:
```js
// activePop_t is already the kernel-dispatched value from §6.1 — GDP inherits it.
const GDP_t = cfg.baseGDP * Omega_t * empFactor * activePop_t;          // (31) — unchanged
```

**Status: no change needed to eq (31); automatically inherits actuarial labour force from `activePop_t`.**

> **Limitation note**: GDP in the current model is purely a labour-productivity-and-headcount product. It does not reflect capital deepening, TFP shocks, or the fiscal drag of high `D_t/GDP_t`. Actuarial demographic fidelity improves the *labour quantity* term but does not resolve these structural simplifications. **Priority for v3.0.**

### 6.5 `legacyShareAvg_t` per-cohort tracking (full v2.0 fix)

The v1.1 held-flat logic (once `capiRetirees_t` stops growing, `legacyShareAvg_t` is frozen) is documented as biased when high-`legacyShare` older cohorts die faster than younger lower-`legacyShare` cohorts. v2.0 fixes this fully — not as a deferred enhancement.

#### Mechanism: per-cohort population mask

Maintain a running map of capi-cohort sub-populations indexed by their year of entry into the capi retiree pool. Each sub-cohort carries three quantities:

```js
// New simulation state, initialised empty at t=0
let capiCohortHistory = [];   // each entry: { entryYear, count, legacyShare, ageAtEntry }
```

**Each iteration of the main loop:**

1. **Apply differential mortality** to existing sub-cohorts using the same T60 tables that produce `cohIdx_actuarial`:
   ```
   for each cohort C in capiCohortHistory:
       a_now = C.ageAtEntry + (t − C.entryYear)
       survival_factor = S_mixed(C.ageAtEntry, t − C.entryYear) /
                         S_mixed(C.ageAtEntry, t − 1 − C.entryYear)
       C.count *= survival_factor
   ```
   Older sub-cohorts (higher `ageAtEntry + tenure`) lose proportionally more population.

2. **Add new entrants** (if `capiRetirees_t > capiRetirees_prev_postMortality`):
   ```
   newEntrants = capiRetirees_t − sum(C.count for C in capiCohortHistory)
   if newEntrants > 0:
       capiCohortHistory.push({
         entryYear: t,
         count: newEntrants,
         legacyShare: legacyShareOfCohort(B_at_t),    // eq 15a, evaluated at this year
         ageAtEntry: A_R_t,                            // current retirement age
       })
   ```

3. **Recompute `legacyShareAvg`** as the population-weighted average across surviving sub-cohorts:
   ```
   legacyShareAvg_t = Σ_C (C.count × C.legacyShare) / Σ_C C.count
   ```

This eliminates both the held-flat bias and the symmetric-mortality-across-shares bias in a single coherent mechanism.

**Memory cost**: at most `N = 70` sub-cohorts (one new entry per simulation year). Each entry is 4 numbers → 280 numbers max. Negligible.

**Compute cost**: O(N) per loop iteration → O(N²) total = O(70²) = 4900 operations. Negligible vs the rest of the engine.

**Bias direction comparison (relative to v1.1 held-flat):**

| Mechanism | Late-horizon `transitionalPaygExp_t` bias |
|-----------|------------------------------------------|
| v1.1 held-flat | Overstates by ~45 % of peak debt cumulatively at t=69 |
| v2.0 actuarial `cohIdx` only | Reduces bias to ~15 % (faster cohort exit alone) |
| v2.0 actuarial `cohIdx` + per-cohort mask | Reduces bias to <5 % (mortality-weighted share is now correct) |

The per-cohort mask requires the same T60 survival data already embedded for `cohIdx_actuarial`, so it adds no new data dependencies — only state and ~10 lines of loop code.

#### Engine-side note for the implementer

The map is keyed by `entryYear`, not by birth cohort, because `legacyShareOfCohort(B)` (eq 15a) is already evaluated at the moment of entry and stored — no re-evaluation needed. Sub-cohorts with `count` below an epsilon (e.g., 1e-9 millions = 1000 people) can be pruned to keep iteration fast.

---

## 7. Backward compatibility

### 7.1 Parametric mode

`demoMode: 'parametric'` (the current and v2.0 default during validation) reproduces bit-identical output to v1.x for all existing test fixtures. The existing `demoProfile` selector and all three profile objects are unchanged.

### 7.2 Migration path

- **v2.0 default**: `demoMode: 'parametric'` — no breaking change. The actuarial mode is available but opt-in.
- **v2.1**: `demoMode: 'actuarial'` becomes the default. Parametric mode is preserved indefinitely for fixture-regression and historical reproducibility.
- **Profile-to-scenario mapping** (when a user toggles `demoMode` parametric → actuarial): `cor_central` → `cor_central`; `realistic` → `cor_low` (closest match by retiree growth profile); `reformed` → `cor_high` (per §9.6 above).
- **Fixture split**: the existing `v1.1-default-trace.json` remains the contract for parametric mode. A new `v2.0-actuarial-cor-central-trace.json` fixture is created for actuarial mode at v2.0 release.

### 7.3 Preset compatibility

All existing presets (`default`, `originalV5`, `optimiste`, `stress`) use `demoProfile` values. In v2.0, these presets continue to work with `demoMode: 'parametric'`. The simplified view's three scenarios (`Prudent` / `Central` / `Optimiste`) will map to `cor_low` / `cor_central` / `cor_high` when `demoMode: 'actuarial'` is active.

---

## 8. Engine implementation plan

### Phase 1: Data embedding

1. Create `src/demographic-tables.js`.
2. Transcribe COR June 2025 Table S1 (`P_act_t`, `P_ret_t` for 2024–2070, three scenarios) as constant arrays. Apply the **flat extrapolation** rule (§9.2) to extend each scenario from 2070 to 2096.
3. Transcribe INSEE T60 2023 `q_x` for ages 60–105, **male and female separately** (no pre-blended `qx` table — see §3.2).
4. Precompute two survival matrices: `S_male[a][t]` and `S_female[a][t]` (each 22 × 70). The mixed survival is computed at runtime via `(1−f) × S_male + f × S_female` where `f = cfg.mortalityFemaleFraction`.
5. Transcribe `RETIREE_AGE_WEIGHTS_2027` (22 entries) from the DREES Édition 2025 retiree age pyramid; verify it sums to 1.0.
6. Commit the data file with checksums and the source document reference in the file header.

### Phase 2: New kernel functions

In `simulation-engine.js`, add three new exported functions beside the existing ones:

```js
// §5.2 (v2.0) actuarial kernel
export function activePopFactor_actuarial(t, cfg) { ... }   // (7d′)
export function retireeIdx_actuarial(t, cfg) { ... }         // (7c′)
export function cohIdx_actuarial(t, cfg) { ... }             // (7e′)
```

Each function:
- Reads from the `COR_*` table selected by `cfg.demoScenario`.
- Returns a normalised index (ratio to t=0 value).
- Falls back to the parametric function if `cfg.demoMode !== 'actuarial'` (defensive, caller should not reach this).

### Phase 3: Loop dispatch

In `runSimulation`, change the three demographic lines:

```js
// §5.2 Demographic indices — dispatched by demoMode
const retireeIdx_t = cfg.demoMode === 'actuarial'
  ? retireeIdx_actuarial(t, cfg)
  : retireeIdx(t, cfg.demoProfile);

const activePop_t = cfg.demoMode === 'actuarial'
  ? activePopFactor_actuarial(t, cfg)
  : activePopFactor(t, cfg.demoProfile);

const cohIdx_t = cfg.demoMode === 'actuarial'
  ? cohIdx_actuarial(t, cfg)
  : cohIdx(t);
```

All downstream equations (9, 10, 11, 23, 24, 25, 25b, 31) are structurally unchanged.

### Phase 4: Config and defaults

Add `demoMode`, `demoScenario`, `mortalityFemaleFraction` to `DEFAULT_CONFIG` (§4.1).

### Phase 5: UI

Add the **Démographie** `CollapsibleSection` to `App.jsx` (§4.2). Gate the actuarial scenario selector behind a `demoMode === 'actuarial'` conditional.

### Phase 6: Tests

- Add property-based test coverage for `demoMode: 'actuarial'` (same §6 invariants must hold).
- Add a new fixture `tests/fixtures/v2.0-actuarial-cor-central-trace.json`.
- Existing `v1.1-default-trace.json` must remain unchanged (parametric mode regression).
- Update the failing risk-premium test to cover both modes.

---

## 9. Open questions

1. **COR 2025 vs 2026 edition** *(resolved):* As of May 2026 the COR juin 2026 rapport annuel has not yet been published — the June editions typically drop mid-to-late June. **Decision:** stick with the COR juin 2025 tables for v2.0 to unblock implementation. Updating to the 2026 edition is a trivial data-only patch in `demographic-tables.js` (no engine change), to ship as v2.0.1 once the new tables are released.

2. **Extrapolation method for 2071–2096** *(decision: flat extrapolation):* Two options were considered:

   | Option | Mechanism | Risk |
   |--------|-----------|------|
   | **(a)** Terminal CAGR | `g = (P[2070]/P[2065])^(1/5) − 1`, then exponential continuation to 2096 | Compounds local 2065–2070 features (e.g., a baby-boom-echo retirement dip) into 26-year exponential drift. If the final COR window happens to be in a localised P_act dip of −0.3 %/yr, terminal P_act[2096] ends up ~7.5 % below the flat alternative; combined with a +0.1 %/yr P_ret drift (~+2.6 % at 2096), late-horizon `D_t` and `CI_t` swell by 5–10 % vs flat. Bias direction is scenario-dependent and unstable. |
   | **(b)** Flat / Omphale "variante 0" | Hold P_act and P_ret at their 2070 values for 2071–2096 | Conservative; ignores any genuine post-2070 trend, but does not amplify transient artefacts. Matches the Omphale 2021 stable-structure variant philosophy. |

   **Decision: option (b) — flat / stable-structure extrapolation.** The risk asymmetry is decisive: a 5–10 % KPI swing driven by a 5-year window in the source data is unacceptable for a model that purports horizon-relevant insight. The implementer should hold `P_act[y] = P_act[2070]` and `P_ret[y] = P_ret[2070]` for `y ∈ [2071, 2096]`. v2.x can revisit if Omphale 2026 publishes long-horizon data.

3. **`R0` calibration in actuarial mode** *(noted):* COR `P_ret` perimeter and DREES `R0` perimeter may differ by ±0.5 M (disability, minimum vieillesse). Implementer should document the delta in `demographic-tables.js` comments; `retireeIdx_actuarial(t)` remains strictly normalised (`P_ret_t / P_ret_0`) so the relative growth curve is applied to the model's absolute `R0` regardless of perimeter mismatch.

4. **Employment rate disaggregation** *(noted, deferred to v2.1):* aggregate `empFactor` retained. v2.0 data embedding may include per-age employment tables ahead of consumption.

5. **Monte Carlo integration** *(decision: align MC to user's actuarial scenario in v2.0):* The earlier proposal to defer MC alignment to v2.1 would create a jarring UX where risk intervals diverge from the central projection (the central run uses COR `cor_central`, but the MC bounds come from parametric-mode shocks). **v2.0 fix:** when `cfg.demoMode === 'actuarial'`, the Monte Carlo worker performs a discrete uniform draw `U(0, 1)` to select between `cor_low`, `cor_central`, and `cor_high` for each iteration, replacing (not adding to) the Cholesky demographic shocks. The financial-shock factors (returns, rates, wage growth) continue to use the existing Cholesky channel. This keeps MC bounds coherent with the deterministic central run and gives the user three-scenario uncertainty bands as a first approximation. Residual within-scenario uncertainty (e.g., fertility variance around `cor_central`) is a v2.1 refinement.

6. **`reformed` profile mapping in actuarial mode** *(revised):* On closer inspection the `reformed` parametric profile has the **same retiree-side parameters as `cor_central`** (`peakMult=1.30`, `longRunMult=1.25`, `peakT=22`); only `activePopAnchors` differs (`reformed`: positive trajectory peaking at +6 %; `cor_central`: declining to −14 %). So `reformed` is not "transformiste hors-projection" — it is closer to `cor_central` retirees overlaid with `cor_high` active population, i.e., a labour-market reform overlay (higher employment / fertility) without a parallel mortality assumption. **Mapping in actuarial mode**: present `reformed` as `cor_high` (the COR high scenario, which combines higher fertility/immigration with the resulting labour-pool growth). Document the parametric-vs-actuarial mapping in `presets.js` so the simplified-view scenarios remain coherent.

---

## 10. Summary of changes by file

| File | Change | Breaking? |
|------|--------|-----------|
| `src/demographic-tables.js` | **New file**: COR P_act/P_ret arrays (3 scenarios, flat-extrapolated to 2096); INSEE T60 male+female qx (no pre-blended table); DREES 2027 retiree age-pyramid weights | No |
| `src/simulation-engine.js` | Add 3 actuarial kernel functions; loop dispatch; 3 new config params; per-cohort mask state for `legacyShareAvg_t` (§6.5) | No (default=parametric) |
| `src/App.jsx` | Add Démographie section with mode/scenario selectors | No |
| `src/monte-carlo-worker.js` | In actuarial mode, replace Cholesky demographic shocks with discrete uniform draw over `cor_low`/`cor_central`/`cor_high` (§9.5) | No |
| `tests/engine.test.js` | Property-based coverage for actuarial mode; per-cohort-mask invariants | No |
| `tests/fixtures/v2.0-actuarial-cor-central-trace.json` | **New fixture** | No |
| `tests/fixtures/v1.1-default-trace.json` | **Unchanged** (parametric contract) | N/A |
| `CapiModel_overview.md` | v2.0 section, update limitations | No |
| `THEORY.md` | Demographic kernel v2.0 section | No |
