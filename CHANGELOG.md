# Changelog

All notable changes to CapiModel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to semantic versioning where appropriate.

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
