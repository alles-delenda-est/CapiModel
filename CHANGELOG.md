# Changelog

All notable changes to CapiModel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to semantic versioning where appropriate.

## [v1.1]

Per-cohort PAYG accrual added to the v1.0a engine. Resolves the binary
cohort-routing understatement (~50–150 Md€/yr at peak transition,
2050–2070); peak debt under the default preset rises ~24% (4.45% → 5.50% in
peak `r_d(t)`). The v1.0a tag is preserved at `spec-v1.0a-final`; any
v1.0a-anchored published numbers must be restated under v1.1.

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
