# Plan: v1.1 — Per-cohort PAYG accrual + 1:1 "Et pour vous ?" alignment

## Context

The v1.0a engine uses a binary cohort split (eqs 23/24): retirees are either fully PAYG (`legacyRetirees_t`) or fully capi (`capiRetirees_t`). A worker who switches to capi at age 50 in 2027 is treated as having zero PAYG entitlement, even though they accrued 28 years of PAYG contributions before the switch. Real legal frameworks honour these accruals proportionally.

This understatement is **~50–150 Md€/yr at peak transition** (2050–2070), making the engine's debt KPIs ~5–15 % optimistic in peak years. PR #6's "Et pour vous ?" panel papered over this with a per-individual prorated dual-rights heuristic computed locally — but its sum across cohorts disagreed with the engine's `legacyExp_t`. PR #7 reverted that panel pending engine support; this plan provides that support.

**Goal:** make the engine track per-cohort PAYG accruals natively, fold them into the §5.9 waterfall, and reintroduce the panel reading engine output (1:1 alignment, no local re-derivation). Preserve every existing field name and downstream behaviour where possible; add new fields for the new aggregates.

This work targets a **v1.1 release** (decided — not v1.0b). Behaviour change is large enough (5–15 % peak debt rise) to warrant the minor-version label and to require restating any v1.0a-anchored published numbers.

**Sequencing (decided):**

1. **Spec-only PR first** against `spec/v1.1` (new branch off `spec/v1.0a`) — renames the file to `CapiModelSpec_v1.1.md`, adds §5.6.1 with eqs 15a / 15b / 25b / 25c / 39'. The full §5.6.1 draft text is provided at the end of this plan; CC pastes it verbatim. After merge, tag the prior `spec/v1.0a` HEAD as `spec-v1.0a-final` and retire the branch.
2. **Single combined engine PR** against `main` (PR #7 is already merged, so the engine PR stacks directly on `main`) — engine + tests + panel reintroduction + docs in one coherent unit.

---

## Engine refactor (`src/simulation-engine.js`)

### 1. New helper: per-cohort legacy share (closed-form)

```js
// §5.4 eq (15a) v1.1: PAYG accrual share for a worker born in `birthYear`.
// Piecewise linear in birthYear, parameter-free at the cohort level.
//   * Cohort age >  cutoffAge in Y0  → share = 1   (full PAYG career, retired pre-cutoff)
//   * Cohort age ∈ [22, cutoffAge]   → share = (ageInY0 − 22) / (retirementAge − 22)
//   * Cohort age <  22 in Y0         → share = 0   (entered workforce post-cutoff)
export function legacyShareOfCohort(birthYear, cfg) { … }
```

Pure function, unit-testable, reused by both the engine loop and the panel. Reuses `cfg.cutoffAge`, `cfg.retirementAgeBase`, `cfg.Y0`. Returns 1.0 when `cfg.enableCapi === false` (no transition → everyone is full legacy).

**Boundary discipline (important — the spec text and the test cases must agree):**

- Cohort with age **exactly equal to** `cutoffAge` in Y0 (born `Y0 − cutoffAge`) is a transitional cohort, not a full-PAYG cohort. Their share is `(cutoffAge − 22) / (A_R(0) − 22)`, NOT 1.0.
- The "share = 1.0" branch fires only for cohorts strictly *older* than `cutoffAge` in Y0 (born before `Y0 − cutoffAge`).
- This matters: with `cutoffAge = 50`, `retirementAgeBase = 64`, the cohort born 1977 (age 50 in 2027) has share 28/42 ≈ 0.667. The cohort born 1976 (age 51) has share 1.0. Off-by-one would either expand the transition window into pre-cutoff cohorts (overstating `transitionalPaygExp_t`) or eliminate the cutoff cohort entirely (understating it).

### 2. New running aggregate: `legacyShareAvg_t`

Population-weighted average legacy share across capi-cohort retirees alive at year *t*. Computed inside the simulation loop as a running average:

```js
// At year t, identify the "newly retiring" capi cohort:
//   delta_capiRet = max(0, capiRetirees_t − capiRetirees_{t-1})
// Their birth year is Y0 + t − retirementAgeBase, share fixed by §5.4 eq (15a).
// Update the running avg via population-weighted blend:
//   legacyShareAvg_t = (legacyShareAvg_{t-1} × capiRetirees_{t-1}
//                       + newShare × delta_capiRet) / capiRetirees_t
```

State carried across iterations as a single scalar `legacyShareAvg`. Initialised to 0; first non-zero value at `t = T_capi_start`. When `capiRetirees_t === 0`, `legacyShareAvg_t = 0` (no division). When `capiRetirees_t` decreases (mortality > new entries — happens late in the horizon as the demographic envelope plateaus), the average is held flat.

**Mortality bias note (decided: held flat, sensitivity check during engine work, no spec change):**

The held-flat assumption is a *conservative simplification*. Older transitional cohorts (born early in the transition window) have higher legacy share than younger ones; under realistic age-correlated mortality they die first, so the surviving population's true average legacy share *falls* over time. Holding flat therefore *overstates* `transitionalPaygExp_t` in late-horizon years — the engine errs on the fiscally pessimistic side, which is the right direction for a public policy tool but should be quantified.

**Required during engine work (Verification step 7, below):** run the engine with two assumptions for `legacyShareAvg_t` evolution: (a) held flat (current implementation) and (b) "older-cohorts-die-first" — re-derive `legacyShareAvg_t` each year from a per-cohort survival mask using a simple linear-with-age mortality proxy. Report the delta on peak debt, debt-free year, and total interest in the engine PR description. If the bias is < 2 % on peak debt, leave held-flat in place. If > 5 %, revisit the assumption (likely defer to v1.2 actuarial work but flag in spec §5.6.1 text). The 2–5 % band is a judgement call.

### 3. New per-year aggregate: `transitionalPaygExp_t` (eq 25b)

```js
// §5.6 eq (25b) v1.1: PAYG expenditure on transitional cohorts' accrued rights.
// Capi-cohort retirees collect a pension proportional to their PAYG career fraction.
const transitionalPaygExp_t =
  Math.max(0, capiRetirees_t * legacyShareAvg_t * E0_legacy_t * I_factor_t);
```

Uses the same `E0_legacy_t` (post-Équinoxe per-retiree pension level) as full-legacy retirees — Équinoxe applies to the PAYG portion of every transitional retiree's pension, mirroring v1.0a §5.5 component scoping (brackets + IR deduction on benefit-side, legacy-PAYG-only; CSG on tax-side, all retirees regardless of pension type). The transitional retiree's *capi* portion is subject to CSG only, exactly as full-capi retirees are. See spec §5.5 + new §5.6.1.

### 4. Total legacy outflow feeds waterfall (eq 25c, eq 39 modified)

```js
// §5.6 eq (25c): combined PAYG obligation on the legacy fund.
const totalLegacyOutflow_t = legacyExp_t + transitionalPaygExp_t;

// §5.9 eq (39') REVISED v1.1: deficit measured against TOTAL PAYG outflow,
// not legacy-cohort-only outflow.
const deficit_t = totalLegacyOutflow_t - nonEmplrNet_t;
```

Downstream waterfall (`emplrToLeg_t`, `emplrToCap_t`, `netFlow_t`, eq 41) uses `totalLegacyOutflow_t` in place of `legacyExp_t`. The expression for `netFlow_t` (eq 41) becomes `nonEmplrNet_t + emplrToLeg_t − totalLegacyOutflow_t`. No other waterfall lines change.

`legacyExp_t` itself is **preserved** — same value, same semantics ("legacy-cohort retirees only"). The new aggregate is additive.

### 5. Row schema additions

Add three fields to the `rows.push({…})` block (around line 581):

```js
// §5.6 v1.1 additions
legacyShareAvg: legacyShareAvg_t,
transitionalPaygExp_t,
totalLegacyOutflow_t,
```

All existing fields preserved at unchanged names.

### 6. `r_d_cap` regime verification

The new `transitionalPaygExp_t` adds to deficit, debt grows faster, and the §5.8 piecewise-linear premium thresholds (150 % / 200 % / 300 % debt/GDP) may be crossed earlier under v1.1 than v1.0a — particularly under stress preset and paquet-partiel presets. **Required during engine work:** for each preset (default, optimiste, stress, equinoxeOnly, labourHousingOnly, equinoxeAndLabour, plus the five walkthrough stages), record the year and value of `r_d(t)` peak, and confirm none hit `r_d_cap = 0.20` under v1.1 unless they already did under v1.0a. If a preset newly crosses the cap, that's a regime change requiring narrative update — flag in PR.

---

## Panel reintroduction — 1:1 alignment with engine

PR #7 reverted the panel commit (ac40e30). v1.1 reintroduces it, now reading engine output rather than re-deriving locally.

### 7. `computeIndividualPerspective` rewrite

Re-add this function to `src/simulation-engine.js` (lines 667–790 in the pre-PR-#7 state, deleted by PR #7). Drop the local dual-rights logic that caused the divergence; compute pension directly from engine-honoured per-cohort accrual.

```js
export function computeIndividualPerspective(cfg, reformRows, cfRows, birthYear) {
  // 1. Per-cohort fixed legacy share — same function the engine uses.
  const legacyShare = legacyShareOfCohort(birthYear, cfg);

  // 2. Personal capi pot accumulation: as in pre-PR-#7 implementation.
  //    Walks reformRows, contributes (W0 / N_WORKERS_M) × τ_s indexed each year
  //    while age ∈ [22, retirementAgeBase), grows at r.r_cn_eff_t, deducts
  //    transition levy via r.levy_t / (r.C_s_capi_t + r.emplrToCap_t).

  // 3. Per-capita legacy pension at retirement year, read DIRECTLY from
  //    the engine's per-retiree benefit level (no local averaging):
  //       perCapitaLegacy = E0_legacy_t × I_factor_t   (k€/yr/retiree)
  //    Multiply by legacyShare → individual's PAYG portion (post-Équinoxe).
  const r = reformRows[retT];
  const monthlyPensionLegacy =
    r.E0_legacy_t * r.I_factor_t * legacyShare * KE_TO_EUR / 12;

  // 4. CF identical, but using cfRows' E0_legacy_t (no Équinoxe, full PAYG career).
  const monthlyPensionCF =
    cfRows[retT].E0_legacy_t * cfRows[retT].I_factor_t * KE_TO_EUR / 12;

  // 5. Capi annuity: personal pot / annuity factor (same as pre-PR-#7).
  //    Capi portion is subject to CSG only at the macro level, not modelled
  //    per-individual here (CSG is a flow, not a benefit-level adjustment).
  // 6. Total = legacy + capi, gain = total − CF.
}
```

**1:1 alignment property:** the panel's `monthlyPensionLegacy × cohort_size_at_retT` summed over all transitional cohorts retiring at *t* equals the engine's `transitionalPaygExp_t`. The engine and the panel now describe the same underlying numbers — proof in tests, step 11.

### 8. Panel UI (`src/components/IndividualPerspectivePanel.jsx`)

PR #7 removed this file (it was added by ac40e30 then reverted). Re-add with the same JSX/CSS structure as PR #6 had, with these adjustments:

- `data.yearsInPayg` and `data.legacyShare` continue to render in the context line.
- Remove the disclaimer paragraph about engine-vs-panel discrepancy ("Projection pédagogique d'un salarié médian … La trajectoire « sans réforme » suppose que l'État peut servir les pensions dues …"). Replace with a shorter line clarifying that the projection uses the engine's PAYG accrual model directly.
- The "Cohorte de transition" explanatory paragraph stays — it now describes engine-modelled behaviour, not a per-individual heuristic.

---

## Spec update (separate PR against new `spec/v1.1` branch)

**File rename:** `CapiModelSpec_v1.0a.md` → `CapiModelSpec_v1.1.md`. After spec PR merges, tag prior `spec/v1.0a` HEAD as `spec-v1.0a-final` and retire that branch. Future spec changes go on `spec/v1.1`.

**Header line update:** the spec file's introductory `**Status:**` line changes from "Specification (not yet implemented)" to "Specification — v1.1 supersedes v1.0a; per-cohort PAYG accrual added in §5.6.1."

### New §5.6.1 to insert immediately after §5.6 (full draft below — paste verbatim)

```
### 5.6.1 Transitional cohort accrued rights (v1.1)

Workers transitioning to capi at Y0 retain proportional PAYG entitlements for the
years contributed before the transition. v1.0a's binary split (eqs 23/24) treated
all capi-cohort retirees as having zero PAYG entitlement, understating
state-funded PAYG outflow by an estimated 50–150 Md€/yr at peak transition
(2050–2070). v1.1 corrects this with a per-cohort accrual share fed into the §5.9
waterfall.

**Per-cohort accrual share.** A worker born in year `B` has PAYG accrual share:

    legacyShare(B) = clamp((Y0 − B − 22) / (A_R(0) − 22), 0, 1)         (15a)

with three regimes:

  - Born before `Y0 − cutoffAge` (age strictly greater than cutoffAge in Y0):
    share = 1.0 (full PAYG career, retired or retiring under pre-reform rules).
  - Born in [`Y0 − cutoffAge`, `Y0 − 22`] (age in [22, cutoffAge] in Y0):
    share = (ageInY0 − 22) / (A_R(0) − 22), the closed form above.
  - Born after `Y0 − 22` (age strictly less than 22 in Y0):
    share = 0 (entered workforce post-cutoff, full capi career).

The cohort with age **exactly equal** to cutoffAge in Y0 is a transitional cohort,
not a full-PAYG cohort: their share is `(cutoffAge − 22) / (A_R(0) − 22)`. With
defaults `cutoffAge = 50`, `A_R(0) = 64`, this is 28/42 ≈ 0.667.

When `enableCapi === false`, `legacyShare(B) = 1` for all `B` (no transition).

**Population-weighted running average.** Maintain `legacyShareAvg_t` as a state
scalar updated each year from the new capi-cohort entrants:

    ΔR^capi_t        = max(0, R^capi_t − R^capi_{t-1})
    newShare_t       = legacyShare(Y0 + t − A_R(0))
    legacyShareAvg_t = (legacyShareAvg_{t-1} × R^capi_{t-1}
                        + newShare_t × ΔR^capi_t) / R^capi_t            (15b)

Initial value `legacyShareAvg_0 = 0`; first non-zero at `t = T_capi_start`. When
`R^capi_t = 0`, `legacyShareAvg_t = 0` (no division). When `R^capi_t` decreases
(mortality exceeds new entries — late-horizon plateau), `legacyShareAvg_t` is
held flat. This held-flat rule is a parametric simplification consistent with
the rest of the engine, which does not track cohort-specific mortality (§7).
A v1.2 upgrade with INSEE T60 actuarial tables would refine this; the bias is
quantified per-release in the engine PR description and is conservative
(slightly overstates `transitionalPaygExp_t`).

**Aggregate transitional PAYG expenditure:**

    E^trans_t = R^capi_t × legacyShareAvg_t × E0_legacy_t × I_t         (25b)

Uses the same `E0_legacy_t` (post-Équinoxe per-retiree benefit level) as
full-legacy retirees. **Équinoxe component scoping for transitional retirees
follows §5.5 v1.0a applied to each pension portion separately:**

  - The PAYG portion (proportional to `legacyShare`) is subject to all three
    Équinoxe components — bracket reduction (§5.5 component 1), IR deduction
    abolition (§5.5 component 2), and CSG/CRDS restoration (§5.5 component 3).
    This is captured by using `E0_legacy_t` in eq (25b) since `E0_legacy_t`
    already incorporates the benefit-side reductions per §5.5 eq (21b).
  - The capi portion (proportional to `1 − legacyShare`) is subject to CSG
    only, exactly as full-capi retirees' pensions are. This is already
    captured at the aggregate level via `S0_csg_revenue_t` (§5.5 eq 22)
    which scales with `retireeIdx(t)` — i.e. all retirees including
    transitional.

This per-portion scoping mirrors how French tax practice would treat dual-
source retirement income. An alternative *aggregated* scoping — applying all
three Équinoxe components to combined PAYG + capi income as if it were a
single pension — would be fiscally more aggressive (high-income retirees
pushed into higher brackets across both streams). It is a substantive policy
choice, not a model simplification, and is documented as a possible v1.2 lever
in `CapiModel_overview.md`.

**Total PAYG outflow funded by the legacy fund:**

    E^total_t = E_t + E^trans_t                                          (25c)

**Waterfall update (§5.9):** eq (39) is replaced by:

    deficit_t = E^total_t − nonEmplrNet_t                                (39')

All other waterfall equations (38, 40, 41, 42–43) are unchanged in form;
they consume the new `deficit_t` and produce updated `netFlow_t`. The
expression for `netFlow_t` becomes:

    netFlow_t = nonEmplrNet_t + emplrToLeg_t − E^total_t

`legacyExp_t` (= E_t in the spec's notation) is preserved unchanged in
semantics and value: it remains the legacy-cohort-only outflow per eq (25).
The new aggregates `E^trans_t` and `E^total_t` are additive.

**Diagnostic exposure.** Three new row-level fields are added to engine output:
`legacyShareAvg`, `transitionalPaygExp_t`, `totalLegacyOutflow_t`. These are
diagnostic; downstream consumers (UI, fixtures, panel) read them directly.
```

### Updates to existing spec sections

- **§10.14**: Append a paragraph at the end:

  ```
  **Status update (v1.1):** the binary cohort split that this section
  flagged as a v1.0 limitation is partially resolved by §5.6.1. The
  per-cohort PAYG accrual model now correctly attributes prorated
  PAYG entitlements to transitional cohorts. The survivors-only
  cohort kernel split (the other v1.0 limitation in this section)
  remains unresolved and is deferred to v1.2.
  ```

- **§9 (Out of scope)**: no change. Per-cohort accrual is now in scope (in §5.6.1); the existing entry "Pension benefit accrual based on contribution history (uses flat E0 per retiree). **Implication: raising retirement age moves only timing, not amount.**" remains accurate — v1.1 prorates the existing flat E0, it does not introduce contribution-history-based accrual.

- **§11 (Regression test harness)**: no normative change, but note that the §11.3 reference fixture must be regenerated under v1.1 and the prior v1.0a fixture archived.

- **§12 (Reference output)**: append: "The v1.0a default-preset KPI snapshot is preserved at `tests/fixtures/v1.0a-default-trace.json` (frozen, do not regenerate). The v1.1 default-preset snapshot lives at `tests/fixtures/v1.1-default-trace.json` and is regenerated when the spec or engine changes."

---

## Test refresh

### 9. New unit tests (`tests/engine.test.js`)

```js
describe('legacyShareOfCohort §5.4 eq (15a)', () => {
  // cutoffAge=50, retirementAgeBase=64, Y0=2027
  // careerYears = 42, transition cohort: birth year 1977..2005

  // Boundary at the cutoff age
  it('returns 28/42 ≈ 0.667 for cohort age 50 in Y0',  …) // born 1977, EXACTLY cutoffAge
  it('returns 1.0 for cohort age 51 in Y0',            …) // born 1976, > cutoffAge

  // Boundary at workforce entry
  it('returns 0 for cohort age 22 in Y0',              …) // born 2005
  it('returns 0 for cohort age 21 in Y0',              …) // born 2006

  // Mid-range
  it('returns 14/42 = 0.333 for cohort age 36 in Y0',  …) // born 1991

  // Non-default config behaviour
  it('returns 1.0 when cfg.enableCapi === false',      …)
  it('respects custom cutoffAge and retirementAgeBase', …)
});
```

Both age-50 (= cutoffAge, share 0.667) and age-51 (> cutoffAge, share 1.0) cases are mandatory — they catch the off-by-one between formula and prose flagged in §5.6.1 boundary discipline.

### 10. New invariants in property-based suite

Add to the existing §6 invariant block:

```js
it('transitionalPaygExp_t ≥ 0 and ≤ totalLegacyOutflow_t', () => { … })
it('totalLegacyOutflow_t ≥ legacyExp_t', () => { … })
it('legacyShareAvg_t ∈ [0, 1] always', () => { … })
it('legacyShareAvg_t monotonically non-decreasing while capiRetirees_t grows monotonically', () => { … })
```

### 11. Engine-panel reconciliation test (new)

```js
it('panel monthlyPensionLegacy × cohort size sums to engine transitionalPaygExp_t', () => {
  // For default preset, for each year t where legacyShareAvg_t > 0:
  //   Sum over transitional birth years B of:
  //     computeIndividualPerspective(cfg, rows, cfRows, B).monthlyPensionLegacy
  //       × 12 / KE_TO_EUR
  //       × cohort_population_at_t(B)
  //   should equal rows[t].transitionalPaygExp_t × 1e3 (Md€ → €) within ε.
});
```

This is the 1:1 alignment proof. Without it, the panel and engine could drift again silently.

### 12. Reference-trace fixture refresh

Two fixtures, not one:

- **Preserve** `tests/fixtures/v1.0a-default-trace.json` unchanged (archival).
- **Create** `tests/fixtures/v1.1-default-trace.json` from the refactored engine.
- Update `tests/engine-reference.test.js` to assert against `v1.1-default-trace.json`.

```bash
node -e "import('./src/simulation-engine.js').then(({ runSimulation, DEFAULT_CONFIG }) => { \
  const rows = runSimulation(DEFAULT_CONFIG); \
  require('fs').writeFileSync('tests/fixtures/v1.1-default-trace.json', JSON.stringify(rows, null, 2)); \
})"
```

The regression test will fail until the new fixture is committed. PR description must call this out — the failure is the *expected* result, not a bug.

### 13. Update `scripts/smoke-individual.mjs`

The smoke script's expected output changes (panel and engine now agree, where before they diverged by the dual-rights heuristic). Run it after the refactor and update the embedded comments noting the new agreement.

### 14. Add `scripts/diff-trace.mjs` (new utility)

A 30-line helper for fixture-diff review, useful here and for future spec/engine changes:

```js
// Usage: node scripts/diff-trace.mjs path/to/old.json path/to/new.json
// For each row × field, compute (new - old) / old; sort by |delta|; print top 20.
// Concentrates reviewer attention on the actual signal.
```

Commit this in the same PR; it pays for itself on the first fixture review.

---

## Documentation refresh

- **`CHANGELOG.md`** — new entry `## [v1.1]` with the four bullets (per-cohort accrual via eq 15a/b, transitional PAYG aggregate via eq 25b, total outflow via eq 25c, waterfall update via eq 39'). Spec § references at the bottom. Note v1.0a tag preserved as `spec-v1.0a-final`.

- **`THEORY.md`** — the "Engine vs panel: per-individual dual-rights pedagogy" section is now historical. Rewrite to "Per-cohort PAYG accruals (v1.1)" describing the resolved approach. Move the engine-vs-panel discrepancy paragraph to "Key discoveries" with past tense, citing PRs #6/#7/#8 as the resolution arc.

- **`CapiModel_overview.md`** — three updates:

  1. The "Per-cohort accrued PAYG rights are not tracked in the engine" limitation moves out of "Key assumptions and limitations" into a one-line "Resolved in v1.1" note.

  2. Walkthrough table peak-debt values need refresh (use `scripts/verify-truncation-threshold.mjs` to regenerate; expect 5–15 % worse on stages with active transition).

  3. **New paragraph in "Future levers" or equivalent forward-looking section:**

     ```
     ### Aggregated Équinoxe scoping (potential v1.2 lever)

     v1.1 applies Équinoxe components to each pension portion of a transitional
     retiree separately: brackets and IR deduction on the PAYG portion, CSG on
     both. This mirrors how French tax practice handles dual-source retirement
     income.

     A more aggressive alternative — proposed during v1.1 design — would
     aggregate combined PAYG + capi income before applying the progressive
     bracket cut. High-income retirees with substantial capi pots would then
     give up a larger share of their PAYG benefit because their combined income
     pushes them into higher Équinoxe brackets. This is a substantive policy
     choice (effectively taxing capi pensions at PAYG progressivity), not a
     model simplification, and would require a political decision before
     implementation. Estimated additional `S0_brackets` revenue: TBD pending
     pilot run; likely concentrated on the top decile of transitional cohorts.

     If future fiscal pressure requires more economies than v1.1 produces,
     this lever is available without further engine changes — it would be a
     §5.5 / §5.6.1 modification scoping the bracket integral over combined
     income for transitional retirees.
     ```

- **`src/simulation-engine.js` header comment** — append v1.1 deltas: "5. Per-cohort PAYG accruals: transitional cohorts now collect prorated PAYG pension via eq 25b, fed into the §5.9 waterfall via eq 25c."

---

## Files to be modified

| File | Change |
|------|--------|
| `src/simulation-engine.js` | New `legacyShareOfCohort`; loop additions for `legacyShareAvg_t`, `transitionalPaygExp_t`, `totalLegacyOutflow_t`; eq (39) update; row-schema additions; reintroduce `computeIndividualPerspective`. |
| `src/components/IndividualPerspectivePanel.jsx` | Re-add (PR #7 deleted). Same UI as pre-PR-#7 with disclaimer paragraph replaced. |
| `src/pages/SimplifiedView.jsx` | Re-inject `IndividualPerspectivePanel` (PR #7 removed the injection along with the panel). |
| `tests/engine.test.js` | New `legacyShareOfCohort` describe block; new §6 invariants; engine-panel reconciliation test. |
| `tests/fixtures/v1.0a-default-trace.json` | **Preserved unchanged** (archival). |
| `tests/fixtures/v1.1-default-trace.json` | **New** from refactored engine. |
| `tests/engine-reference.test.js` | Update assertion target to v1.1 fixture. |
| `scripts/smoke-individual.mjs` | Re-run, update comments noting panel/engine agreement. |
| `scripts/diff-trace.mjs` | **New** fixture-diff helper. |
| `CapiModelSpec_v1.0a.md` → `CapiModelSpec_v1.1.md` | **Rename** + insert §5.6.1 + update §10.14, §12 + header line. |
| `CHANGELOG.md` | New `## [v1.1]` entry. |
| `THEORY.md` | Rewrite "Engine vs panel" section. |
| `CapiModel_overview.md` | Mark per-cohort limitation resolved; refresh walkthrough peak-debt numbers; add aggregated-Équinoxe future-lever paragraph. |

---

## Verification

1. **Unit tests** — `npm test` passes including new `legacyShareOfCohort` and new §6 invariants. Reference-trace test will FAIL until step 12 fixture regen; commit regen in the same PR.

2. **Engine-panel reconciliation** — the new test (step 11) passes for all transitional birth years across all years where `legacyShareAvg_t > 0`. Tolerance: ε = 0.01 Md€ (rounding noise from floating-point summation of per-individual k€ values).

3. **Smoke script** — run `node scripts/smoke-individual.mjs`; the per-cohort numbers should now match the engine's per-cohort PAYG.

4. **Truncation threshold check** — re-run `scripts/verify-truncation-threshold.mjs`; stage 4 peak debt ratio (currently 272 %) likely rises but probably stays below 500 %. If it crosses 500 %, the walkthrough's stage-4 narrative needs adjustment (truncation will appear where today there is none — pedagogical change worth flagging in the PR).

5. **Mortality bias sensitivity (per §2 above)** — run engine with held-flat (default) and "older-cohorts-die-first" assumptions; report delta on peak debt, debt-free year, total interest. If < 2 % on peak debt: hold flat is fine, no spec change. If > 5 %: defer to v1.2 actuarial work, flag in spec §5.6.1 with the measured bias number.

6. **`r_d_cap` regime check (per §6 above)** — for each preset (default, optimiste, stress, three paquet partiel, five walkthrough stages), record peak `r_d(t)` year and value under v1.1 vs v1.0a. Flag any preset that newly crosses the cap.

7. **Dev server visual check** — `localhost:5173`:
   - Simulator: peak-debt KPI should rise vs. v1.0a; debt-free year may push later.
   - "Et pour vous ?" panel: numbers should be very close to PR #6's panel for transitional cohorts (the local heuristic was a good approximation), but with an exact engine match.
   - Walkthrough stages 3/4: subtle changes in chart 2 (legacy expenditure area is taller during transition years).

8. **Build** — `npx vite build` clean.

9. **Spec PR independence** — engine PR does not push commits to `spec/v1.1`. Spec PR is reviewed and merged first.

---

## Risks and mitigations

- **Spec-PR review latency**: the spec PR must merge before engine work starts. If review is slow, engine PR is blocked. Mitigation: open the spec PR with the §5.6.1 prose draft above (paste-ready); engine prototyping happens locally on a feature branch in parallel but is not pushed until spec is merged.

- **Fixture-diff review burden**: the v1.1 trace JSON is large. The new `scripts/diff-trace.mjs` helper concentrates reviewer attention on the top-20 deltas. Reviewers should focus on the *new* fields and on any UNEXPECTED changes outside the §5.6/§5.9 surfaces.

- **Mortality bias direction**: the held-flat assumption *overstates* `transitionalPaygExp_t` (older transitional cohorts have higher legacy share and die first under realistic mortality, so survivors skew lower-share over time — the opposite of what the original plan implied). Documented in §5.6.1 as conservative bias. If the sensitivity check (verification step 5) shows the bias is > 5 %, hold the merge and revisit.

- **Boundary off-by-one (§5.6.1 boundary discipline)**: the cohort age = cutoffAge case is fragile — formula and prose must agree. Both unit-test cases (born 1977 = age 50 → 0.667; born 1976 = age 51 → 1.0) are mandatory. Without the age-51 test, an implementation that hard-coded `share = 1.0 if age >= cutoffAge` would pass.

- **Aggregated-Équinoxe scoping decision**: v1.1 applies Équinoxe per-portion (decided: option α). The aggregated alternative is preserved as a documented v1.2 lever in `CapiModel_overview.md` for future fiscal pressure scenarios, not a v1.1 deliverable.

- **PR title and branch naming**: spec PR is `v1.1/Spec — per-cohort PAYG accrual` on branch `v1.1/spec-per-cohort-accrual` (base: new `spec/v1.1` branch off `spec/v1.0a`). Engine PR is `v1.1/Engine — per-cohort PAYG accrual + panel` on branch `v1.1/engine-per-cohort-accrual` (base: `main`). Don't repeat the PR #4 / PR #5 cosmetic branch-prefix inconsistency.
