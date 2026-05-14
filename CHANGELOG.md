# Changelog

All notable changes to CapiModel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to semantic versioning where appropriate.

## [v2.0] — Demographic kernel

Opt-in actuarial demographic kernel (`demoMode: 'actuarial'`), per
`DemographicKernel_plan.md`. Replaces the parametric smoothstep kernel
(eqs 7c/7d/7e) with table-driven equivalents sourced from COR June 2025
and INSEE T60 2023.

- **Actuarial kernel functions** — `activePopFactor_actuarial` (7d′),
  `retireeIdx_actuarial` (7c′), `cohIdx_actuarial` (7e′). All produce
  normalised indices (ratio to t=0), so downstream equations are
  structurally unchanged. Dispatched in the §5.2 loop block by `demoMode`.
- **§6.5 per-cohort population mask** — in actuarial mode, `legacyShareAvg_t`
  is now a true mortality-weighted mean across capi-cohort sub-populations,
  each aged with differential T60 survival. Replaces the v1.1 held-flat
  blend (which froze the average at the capi-retiree peak and carried a
  ~1.7 % conservative peak-debt bias). Parametric mode keeps the held-flat
  blend unchanged.
- **Démographie UI** — mode radio (paramétrique / actuariel), COR scenario
  dropdown (haute / centrale / basse), and a Tier-B female-mortality-mix
  slider.
- **Config** — `demoMode` (default `'parametric'`), `demoScenario`
  (default `'cor_central'`), `mortalityFemaleFraction` (default `0.52`).
- **Tests & fixtures** — structural + per-cohort-mask coverage; new
  `tests/fixtures/v2.0-actuarial-cor-central-trace.json` locks the
  actuarial engine path. The `v1.1-default-trace.json` parametric fixture
  is unchanged — parametric output is bit-identical to v1.x.

**Data status:** the arrays in `src/demographic-tables.js` are synthetic
placeholders (Makeham mortality, Gaussian age pyramid) calibrated to the
correct qualitative shape. They must be replaced with primary-source COR
juin 2025 / INSEE T60 transcriptions — a data-only change with no engine
impact — before actuarial mode becomes the default.

**Out of scope:** Monte Carlo scenario alignment (spec §9.5) — the active
root build has no Monte Carlo module.

## [v1.1]

Per-cohort PAYG accrual added to the v1.0a engine. Resolves the binary
cohort-routing understatement: v1.0a's eq 23/24 split treated every
capi-cohort retiree as having zero PAYG entitlement, ignoring the years
they had contributed before transitioning. v1.1's eq 25b adds back
`E^trans_t = R^capi_t × legacyShareAvg_t × E0_legacy_t × I_t` on top of
`legacyExp_t` (= E_t), restoring those accrued rights.

Default-preset deltas vs the v1.0a fixture (substantially larger than the
original 5–15% peak-debt estimate in the spec — at the spec stage we did
not have the additive E^trans channel in front of us, so the 5–15% guess
was a lower-bound projection on the headline KPI):

- peak `r_d(t)`: 4.45% (2057) → 5.50% (2065)  — +24% relative
- peak debt: 5 470 Md€ (2059) → 8 594 Md€ (2068) — +57% relative
- total interest paid: 5 948 Md€ → 15 473 Md€ — +160% relative
- debt-free year (default): 2082 → never reached within the 70-yr horizon

The v1.0a tag is preserved at `spec-v1.0a-final`; any v1.0a-anchored
published numbers must be restated under v1.1.

- **Per-cohort accrual share** (eq 15a) — closed-form piecewise-linear
  share `legacyShare(B)` by birth year `B`, parameter-free at the cohort
  level beyond `cutoffAge` / `retirementAgeBase` / `Y0`. Boundary
  discipline: cohort with age = `cutoffAge` in Y0 is transitional
  (28/42 ≈ 0.667 with defaults), NOT full-PAYG.
- **Population-weighted running average** (eq 15b) — `legacyShareAvg_t`
  maintained as a single state scalar, blended each year from new
  capi-cohort entrants. Held flat when `capiRetirees_t` declines
  (mortality > new entries — late-horizon plateau).
- **Aggregate transitional PAYG expenditure** (eq 25b) —
  `E^trans_t = R^capi_t × legacyShareAvg_t × E0_legacy_t × I_t`. Uses the
  same post-Équinoxe `E0_legacy_t` as full-legacy retirees per §5.6.1
  per-portion scoping.
- **Total PAYG outflow** (eq 25c) — `E^total_t = E_t + E^trans_t`, fed
  into the §5.9 waterfall via revised eq 39'
  (`deficit_t = E^total_t − nonEmplrNet_t`). `legacyExp_t` is preserved
  unchanged in semantics and value.
- **Panel realignment** — `IndividualPerspectivePanel` now reads engine
  output directly (`legacyShareOfCohort` + `E0_legacy_t × I_factor_t / R0`),
  so the per-individual sum across transitional cohorts coincides by
  construction with the engine's `transitionalPaygExp_t`. Resolves the
  PR #6/#7 dual-rights divergence.
- **Diagnostics** — three new row-level fields: `legacyShareAvg`,
  `transitionalPaygExp_t`, `totalLegacyOutflow_t`.
- **Mortality bias** (held-flat assumption) — measured 1.7% on peak debt
  under a linear-in-age mortality proxy, well below the 2% threshold.
  Held-flat retained for v1.1; v1.2 actuarial work flagged in §5.6.1.

Reference fixtures: `tests/fixtures/v1.0a-default-trace.json` is preserved
unchanged (archival); `tests/fixtures/v1.1-default-trace.json` is the new
regression target. See spec §5.6.1, §10.14 (status update), §12 (fixture note).

## [v1.0a]

Four model corrections versus v1.0:

- **Risk-free rate split** — `r_f_portfolio` (legacy fund return, Tier A) and
  `r_f_annuity` (annuity-hedging cost, Tier B) are now distinct parameters,
  resolving a carry-trade arbitrage in capi annuity pricing.
- **Uniform HLM unit decay** (eq 27) — `ΔU_t = U₀ × (1−ρ)^t × ρ` for all *t*,
  restoring mass conservation across the 20-year HLM transition.
- **Capi pensions paid by actuarial share** of fund assets
  (`capiAssetShare_t`, eq 53), not per capita. The v1.0 per-capita formula
  silently expropriated accumulating workers' savings to early retirees,
  masking the real actuarial gap.
- **Équinoxe split by perimeter** — benefit-side reduction applies to legacy
  retirees only (eqs 18b–18c); CSG/CRDS restoration applies to all retirees,
  legacy and capi (eqs 21a/21b/22).

See spec §5.5, §5.7, §5.13 for the full derivations.
