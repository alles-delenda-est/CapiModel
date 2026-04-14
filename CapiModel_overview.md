# CDC Pension Transition Simulator

**Live demo:** https://capi-model.vercel.app

## What it does

An interactive browser-based simulator modelling France's transition from pay-as-you-go (PAYG / répartition) pensions to full capitalisation, financed by CDC assets, HLM social housing sales, and employer contributions. The model implements 34+ coupled equations over a 70-year horizon (2026–2096), tracking the legacy fund balance, the sovereign debt trajectory, and individual capitalisation pot accumulation.

## Reform mechanism

- **Employee contributions** (11.3 % of gross wages) flow to individual capitalisation accounts, but **only for workers below a configurable age cutoff in 2026** (default: 50). Older cohorts keep 100 % of their PAYG rights. The capi share of the salaried contribution ramps up linearly each year as older cohorts retire.
- **Employer contributions** (16.5 %) cover legacy pension deficits first; any surplus flows to capitalisation.
- **CDC assets** (€220 bn, excluding Livret A) seed the legacy fund.
- **HLM housing sales** (~5 %/year of ~5.3 M units) generate capital gains for the legacy fund, with a volume-dependent price discount to model market absorption.
- **Pension reductions** via the Equinoxe progressive curve cut legacy expenditure by ~26 Md€/year.
- **Transition levy** (30 % of capitalisation inflows) accelerates debt repayment, activating only once the first capi-eligible cohorts begin contributing (year 16 with the 50-year cutoff).
- **Residual annual deficits** are covered by sovereign borrowing (OAT issuance).

## Transition rule (v2 additions)

The v1 document assumed every worker instantly switched to capitalisation in 2026 and that the pre-reform French sovereign debt (≈3,200 Md€) was frozen for 70 years. Both are now configurable:

| Parameter | Meaning | Default | Effect |
|---|---|---:|---|
| `cutoffAge` | Age in 2026 above which workers stay 100 % PAYG | 50 | Reduces peak transition debt by ~32–38 % and cumulative interest by ~47 % vs. the universal immediate switch |
| `existingDebtGrowth` | Nominal growth rate of pre-reform French debt | 2.7 % | Keeps the pre-reform debt/GDP ratio roughly constant at ~114 %. At 3.5 % (stress preset) the ratio crosses 150 % → 200 % and the endogenous risk premium activates on *all* sovereign debt |

Setting `cutoffAge = null` and `existingDebtGrowth = 0` reproduces the v1 document bit-exactly (the `Original v5` preset).

## Key features

- **4 preset scenarios**: Hypothèses de base, Original v5, Optimiste, Stress Test
- **~27 adjustable parameters** with tooltip explanations, grouped into collapsible sections with criticality levels (critical / normal / advanced)
- **Endogenous borrowing rate**: sovereign risk premium rises with the combined (existing + transition) debt/GDP ratio via a piecewise-linear model (thresholds at 150 %, 200 %, 300 %, calibrated to France/US/Italy precedent)
- **HLM volume-dependent price discount**: accounts for market absorption constraints
- **Equinoxe progressive pension reductions**: continuous curve above €1,800/month, replacing the original step-function design
- **Monte Carlo simulation** (100–1,000 runs): correlated stochastic shocks to returns, inflation, wages, and borrowing rates via Web Worker, producing fan charts with confidence intervals
- **7+ charts**: legacy fund balance, pension split (PAYG vs capi), sovereign debt trajectory + endogenous rate, capitalisation pot, spread σ, contribution flows (now split into salarié→capi / salarié→PAYG / employer→capi / employer→PAYG), cumulative NPV
- **Full data table** with CSV export
- **URL parameter sharing**: all settings encoded in the URL for reproducibility (with dedicated handling for `null` values)

## Default scenario results (Hypothèses de base, v2)

| KPI | Value |
|---|---|
| Peak sovereign debt (transition) | ~1,229 Md€ (2041) |
| Debt-free year | ~2055 |
| Cumulative interest cost | ~664 Md€ |
| Capitalisation pot (real 2026€, Year 70) | ~32 Tn€ |
| Spread σ minimum | +1.50 % (healthy) |
| Pension savings (Equinoxe) | ~26 Md€/year |

*The cutoff-at-50 transition rule is the dominant driver of the peak-debt reduction vs. v1 (~1,900 Md€ previously).*

## Technical stack

React 19 + Vite 7 + Recharts. Single-page application, no backend. The `dist/` folder is fully self-contained and can be served from any static host or opened directly from the filesystem. Auto-deployed to Vercel (`capi-model.vercel.app`) on every push to `main`.

## Key assumptions and limitations

- **Cohort index is parametric, not actuarial** — smoothstep ramp to a 1.18× boomer peak at Year 8, then 18-year half-life exponential decay with a smooth envelope to extinction at Year 70, rather than INSEE mortality tables
- **Retiree count is COR-calibrated but parametric** — `retireeIdx` follows a smoothstep curve to a 1.30× peak at Year 34 (~2060, aligned with the COR central scenario) then plateaus at 1.25× long-run, floored by `cohIdx`. A full COR lookup table (or INSEE mortality tables) remains an option to implement for higher fidelity.
- **Capitalisation payouts use a linked kernel** — `capiPayout = E0 × max(0, retireeIdx − cohIdx) × idxFact`, capped at the available pot; any unmet desired payout is surfaced as a cumulative shortfall KPI
- **No behavioural responses** — retirement timing, labour supply, and precautionary savings effects are excluded
- **Wage bill grows uniformly** — no cyclical or unemployment shocks in the deterministic run (Monte Carlo has year-persistent regime shifts)
- **Single national HLM price** — no Île-de-France vs province differentiation
- **`existingDebtGrowth` is a policy assumption, not a shock** — it reflects the state's capacity to stabilise its pre-reform debt trajectory, not a random draw

## Source documents

- `cdc_legacy_fund_model.md` — Full model specification (34 equations + v2 annexe)
- `critique.md` — Structured critique identifying weaknesses and recommended fixes, all implemented
- `CLAUDE.md` — Repo/build/deploy reference for automated tooling
