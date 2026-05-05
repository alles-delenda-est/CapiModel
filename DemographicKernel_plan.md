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
// Population-weighted mix (COR uses ~48% male / 52% female in retiree pool)
export const INSEE_T60_QX_MIXED  = INSEE_T60_QX_MALE.map((q, i) =>
  0.48 * q + 0.52 * INSEE_T60_QX_FEMALE[i]);
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
> "Mode actuariel : utilise les projections COR juin 2025 et les tables de mortalité INSEE T60. Mode paramétrique : courbe lissée (lissage smoothstep) calée manuellement sur le scénario central COR — compatible avec toutes les versions précédentes."

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

**Replacement concept:** Track the surviving fraction of the 2027 retiree pool (median age ~70 in 2027) using cumulative T60 survival.

```
// S(a, t) = probability of surviving from age a to age a+t under T60 tables
S(a, t) = ∏_{k=0}^{t-1} (1 − q_{a+k})

// Weighted survival of the 2027 retiree pool:
//   median entry age A_R_0 ≈ 64; pool spans ~64–100 in 2027.
//   Weight by 2027 age distribution (uniform approximation over 64–85).
//   Upper bound: age 105 (q_x = 1 beyond).

cohIdx_actuarial(t) = Σ_{a=64}^{85} w(a) × S(a, t)                 (7e′)

where w(a) = 1/22   (uniform over entry ages 64–85 in 2027)
and  S(a, t) is clamped to 0 when a + t > 105.
```

**Implementation note**: `S(a, t)` can be precomputed at startup as a 22 × 70 matrix (22 entry ages × 70 years) using `INSEE_T60_QX_MIXED`. The per-year `cohIdx_actuarial(t)` is then a dot product: `w · S[:, t]`, callable in O(22) per step.

**Effect on `legacyShareAvg_t`**: The actuarial `cohIdx` is concave (fast early survival, slow late survival), whereas the current smoothstep is S-shaped. This removes the systematic overshoot of late-horizon `transitionalPaygExp_t` and reduces the ~45% cumulative bias documented in §2.3.

**Age-distribution sensitivity**: The uniform 64–85 weight is a first approximation. v2.1 can refine with the actual INSEE 2027 retiree age pyramid (available in DREES Édition 2025).

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

> **Limitation note**: GDP in the current model is purely a labour-productivity-and-headcount product. It does not reflect capital deepening, TFP shocks, or the fiscal drag of high `D_t/GDP_t`. Actuarial demographic fidelity improves the *labour quantity* term but does not resolve these structural simplifications. This is a documented v2.x out-of-scope item.

### 6.5 `legacyShareAvg_t` held-flat fix

The current held-flat logic (once `capiRetirees_t` stops growing, `legacyShareAvg_t` is frozen):

```js
if (capiRetirees_t > capiRetirees_prev + 1e-15) {
  // blend new entrants with incumbents (eq 15b)
  ...
} else {
  // held flat — biased when high-legacyShare cohorts are dying faster
  legacyShareAvg = legacyShareAvg;
}
```

**With actuarial `cohIdx`**: the `capiRetirees_t` calculation uses the actuarial survival curve, which declines more steeply after year 35 (vs the current flat-then-drop smoothstep). This means `capiRetirees_t` will naturally reflect faster cohort exit, producing more `delta > 0` windows for blend updates and reducing the held-flat duration.

**Additional fix (v2.0)**: introduce an explicit mortality-weighted `legacyShareAvg` decrement when `cohIdx_actuarial` declines:

```
// When cohort survival declines, older (higher-legacyShare) cohorts exit disproportionately.
// Apply a first-order correction using the change in cohIdx:
delta_cohIdx = cohIdx_actuarial(t-1) − cohIdx_actuarial(t)    // positive when cohort shrinks

// High-legacyShare cohorts (entered capi later) are younger → die slower.
// A simple model: legacy share of exiting cohort ≈ cohort-average legacyShareAvg × (1 + bias_factor)
// where bias_factor is estimated from the age-distribution of the cohort.
// Conservative first implementation: bias_factor = 0 (uniform mortality across share levels).
// This is the v2.0 baseline; v2.1 can improve with actual cohort-age distribution.
```

**Implementation decision**: the held-flat bias is documented and tolerated in v1.x. For v2.0, the actuarial `cohIdx` naturally reduces (but does not eliminate) the bias. A full mortality-weighted share correction is a v2.1 enhancement. **Status: partial fix in v2.0 via better `cohIdx`; full fix deferred.**

---

## 7. Backward compatibility

### 7.1 Parametric mode

`demoMode: 'parametric'` (the current and v2.0 default during validation) reproduces bit-identical output to v1.x for all existing test fixtures. The existing `demoProfile` selector and all three profile objects are unchanged.

### 7.2 Migration path

- **v2.0 default**: `demoMode: 'parametric'` — no breaking change. The actuarial mode is available but opt-in.
- **v2.1**: `demoMode: 'actuarial'` becomes the default for the `cor_central` and `cor_low` scenarios. The `realistic` and `reformed` parametric profiles remain in parametric mode only (no COR-table equivalent).
- **Fixture split**: the existing `v1.1-default-trace.json` remains the contract for parametric mode. A new `v2.0-actuarial-cor-central-trace.json` fixture is created for actuarial mode at v2.0 release.

### 7.3 Preset compatibility

All existing presets (`default`, `originalV5`, `optimiste`, `stress`) use `demoProfile` values. In v2.0, these presets continue to work with `demoMode: 'parametric'`. The simplified view's three scenarios (`Prudent` / `Central` / `Optimiste`) will map to `cor_low` / `cor_central` / `cor_high` when `demoMode: 'actuarial'` is active.

---

## 8. Engine implementation plan

### Phase 1: Data embedding

1. Create `src/demographic-tables.js`.
2. Transcribe COR June 2025 Table S1 (`P_act_t`, `P_ret_t` for 2024–2070, three scenarios) as constant arrays.
3. Transcribe INSEE T60 2023 `q_x` for ages 60–105, male and female.
4. Compute the mixed `q_x` array and the population-weighted mixed survival matrix `S[a][t]` (22 × 70).
5. Commit the data file with checksums and the source document reference in the file header.

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

1. **COR 2025 vs 2024 edition**: The June 2025 COR report is the most recent. If the June 2026 report is published before this PR merges, use the latest edition and update the source reference. The data format is stable across editions.

2. **Extrapolation method for 2071–2096**: The terminal CAGR approach (§5.1) is simple but produces linear long-run decline. Alternative: use the Omphale 2021 "variante 0" (stable-structure) as the flat extrapolation. Decision pending review.

3. **`R0` calibration in actuarial mode**: `R0 = 18.0 M` is calibrated to the 2027 retiree pool from DREES 2025. The COR table's `P_ret_t[idx(2027)]` may differ by ±0.5 M depending on the COR scope (some editions include disability pensioners). Implementer should verify `P_ret_0 ≈ 18.0` at t=0; if not, document the discrepancy and update `R0_actuarial` as a separate constant.

4. **Employment rate disaggregation**: The current `empFactor` ramp (69% → 76% over 12 years) is a single aggregate. COR reports employment rates by age cohort. A more precise treatment would compute `W_t` as `Σ_a N_a_t × empRate(a) × wage(a)`. This is v2.1 scope; flag it here so the v2.0 data embedding includes the per-age employment table even if it is unused.

5. **Monte Carlo integration**: `monte-carlo-worker.js` applies Cholesky-correlated demographic shocks to the parametric kernel. In actuarial mode, demographic uncertainty is already scenario-encoded (COR high/central/low). The Monte Carlo worker should either: (a) select a scenario per draw, or (b) apply residual uncertainty around the chosen scenario. This interaction is not resolved in v2.0 — the worker defaults to parametric-mode kernel regardless of `demoMode` until v2.1.

6. **`reformed` profile has no COR equivalent**: the `reformed` scenario posits a positive active-population trajectory (fertility rebound + sustained immigration) that exceeds even COR's optimistic scenario. It is retained as parametric-only and should be clearly labelled in the UI ("Scénario transformiste — hors projection COR").

---

## 10. Summary of changes by file

| File | Change | Breaking? |
|------|--------|-----------|
| `src/demographic-tables.js` | **New file**: COR and T60 data arrays | No |
| `src/simulation-engine.js` | Add 3 actuarial kernel functions; add kernel dispatch in loop; add 3 config params | No (default=parametric) |
| `src/App.jsx` | Add Démographie section with mode/scenario selectors | No |
| `tests/engine.test.js` | Property-based coverage for actuarial mode | No |
| `tests/fixtures/v2.0-actuarial-cor-central-trace.json` | **New fixture** | No |
| `tests/fixtures/v1.1-default-trace.json` | **Unchanged** (parametric contract) | N/A |
| `CapiModel_overview.md` | v2.0 section, update limitations | No |
| `THEORY.md` | Demographic kernel v2.0 section | No |
