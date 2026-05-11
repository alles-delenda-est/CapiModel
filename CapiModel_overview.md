# CapiModel v2.0 — Pension-Transition Simulator

**Live demo:** https://capi-model.vercel.app

---

## Unit and accounting conventions

All stock and flow values are **nominal** (current euros) unless explicitly stated otherwise. Real values are noted as "real (2027 €)" and are obtained by deflating by cumulative CPI at π = 2 %/yr. No nominal and real flows are ever added directly within the engine.

| Convention | Treatment |
|---|---|
| Stocks (`D_t`, `K_t`, `F_t`) | Nominal Md€ |
| GDP, wages, contributions | Nominal Md€ / Md€/yr |
| Interest rates (`r_d_t`) | Nominal |
| Portfolio return (`r_f_portfolio`) | Real; converted to nominal by Fisher: `(1+r)(1+π)−1` |
| Annuity discount rate (`r_f_annuity`) | Real; converted to nominal for annuity pricing |
| Capi return (`r_c`) | Real; Fisher-converted before K_t update |
| Pension benefits | Price-indexed (implicit via `I_factor_t = (1+π)^t`) |
| Displayed real values | 2027 euros, deflated by `(1+π)^t` |

---

## What it models

An interactive browser-based simulator modelling France's transition from pay-as-you-go (PAYG / répartition) pensions to full capitalisation. The model implements **60 numbered equations** over a 70-year horizon (Y0 = 2027, runs to 2096) tracking three coupled stocks:

- **`F_t`** — legacy pension fund (CDC-managed reserve)
- **`D_t`** — sovereign transition debt accumulated during the PAYG wind-down
- **`K_t`** — capitalisation pot (individual capi accounts, modelled in aggregate)

plus a background tracker **`D^{ext}_t`** (pre-reform sovereign debt, grown proportionally with nominal GDP as a stylised accounting convention — not a fiscal projection).

The model boundary is the **pension-system cash balance**: it covers pension expenditure, contribution revenue, investment income, and sovereign borrowing. CSG/CRDS restoration is treated as pension-system revenue. General-government primary balance, tax base, and consumption effects are outside the scope of v2.0.

---

## Financing levers and political-feasibility context

| Lever | Default value | Technical feasibility | Legal / political friction |
|---|---|---|---|
| CDC balance-sheet transfer (~220 Md€) | F0 ≈ 340 Md€ (combined) | Uncertain — CDC assets are encumbered by regulated-savings guarantees and long-term mission obligations. Only *net transferable surplus* should be counted. | Very high |
| FRR transfer (~21 Md€ at end-2024) | Included in F0 | High — FRR was already earmarked for PAYG relief until 2020 | Medium |
| Agirc-Arrco reserves (~86 Md€ at end-2024) | Included in F0 | Medium — these are assets of a private *paritaire* scheme, not state property | Very high — requires political decision to nationalise |
| HLM cessions | ρ = 5 %/yr of remaining stock | Medium — stock exists; logistics are feasible | Very high — 5 %/yr is ~50× recent observed annual sales |
| Employee contribution diversion to capi | τ_s = 11.3 % redirected for under-50s | High mechanically | High — social-contract impact |
| Employer contribution waterfall | τ_e = 16.5 %, legacy-first | High | Medium |

**Note on F0:** The 340 Md€ Day-1 transfer aggregates gross book values of CDC assets, FRR, and Agirc-Arrco reserves. A conservative reading — netting CDC liabilities, regulated-savings obligations, and legal encumbrances, and treating Agirc-Arrco as a political scenario rather than a neutral transfer — would substantially reduce this figure. The model is transparent about this; users should regard F0 as an upper-bound political scenario.

---

## Reform mechanism

- **Initial reserves** (`F0` = 340 Md€) — Day-1 transfer to the legacy fund (see table above).
- **Employee contributions** (`τ_s` = 11.3 % of gross wages) flow to individual capitalisation for workers below `cutoffAge` in 2027 (default: 50). Workers above the cutoff keep 100 % PAYG rights; those below retain a proportional legacy share (per-cohort accrual, §5.6.1).
- **Employer contributions** (`τ_e` = 16.5 %) cover legacy pension deficits first; any surplus flows to the capi pot. In overlapping mode (v2.0 default) phiF = 0 is enforced: all employer contributions flow to legacy first, and the cascade handles capi-side balancing.
- **HLM cessions** — `ρ` = 5 %/yr applied to the *remaining* stock each year (geometric decay: `ΔU_t = U₀ × (1−ρ)^t × ρ`). This implies cumulative disposals of approximately **64 %** of the original 5.3 M units over 20 years — far above the ~10,900 units sold in 2024. This is a deliberately aggressive political scenario. 95 % of capital gains (net of book value, with optional volume-discount haircut) remit to the legacy fund.
- **Équinoxe pension reform** — three components (§5.5):
  1. *Brackets reduction* — progressive cut on pensions above 1 800 €/mo, capped at 20 % above 4 000 €/mo. ~17.7 Md€/yr at t = 0. Applied to legacy-cohort retirees only.
  2. *IR-deduction abolition* — 5 Md€/yr at t = 0, decays with cohort size.
  3. *CSG/CRDS restoration* — 5 Md€/yr at t = 0, grows with retiree index (all retirees including capi).
- **Retirement age** — two modes: `fixed` (default: 64) or `indexed` (rises by half the gain in life expectancy at 65, mirroring Swedish NDC). Hard floor 60, ceiling 70.
- **Residual deficits** are covered by sovereign borrowing at the endogenous rate `r_d(t)`, with a piecewise-linear premium above 150 % combined debt/GDP, capped at 20 %. This function is a **reduced-form heuristic** for fiscal-stress pricing, not a sovereign-debt model. Sovereign crises are nonlinear; the smooth cap is a conservative bound.

---

## v2.0 cascade waterfall (overlapping mode — current user-facing default)

The principal innovation of v2.0 is the **overlapping cash-flow cascade**, replacing the legacy v1.3 waterfall. All user-facing presets and the UI default use `cashFlowMode: 'overlapping'`.

### How the cascade works

Each period the real return on K_t (`fundReturnCapi_t = K_t × r_c_eff`) is distributed through five ordered buckets:

| Bucket | Recipient | Cap |
|---|---|---|
| 0 (floor) | Guaranteed capi annuity floor, paid from full nominal K_avail | `K_t × capiAssetShare_t × annuityFloorRate (1.5 %)` |
| 4 | Legacy cross-subsidy — returns first, then contributions top-up | Up to full PAYG deficit |
| 3 | Accumulated transition-debt (`D_t`) principal reduction | Remaining budget |
| 5 | Reinvestment into K_t | ≤ 20 % of `fundReturnCapi_t` |
| 6 | Capi bonus (upside to capi retirees) | Residual |

**Lambda incorporation:** the previous v1.x transition levy (λ = 30 % of contributions routed to D_t) is removed as a free parameter. Instead, cascade bucket 4 first draws on fund returns; if returns are insufficient to cover the PAYG deficit, net capi contributions top up the remainder (`capiContribXSub_t`). This is structurally identical to λ = 100 % in early years when returns are near zero, declining naturally as the fund matures.

**Floor accounting:** the annuity floor is paid from `K_avail = K_t × (1 + r_cn_eff) + netCapiFlow_t` (full nominal), not from the real-return cascade budget. This makes the floor immune to the GE return penalty that can suppress `r_c_eff` in late years.

**capiAssetShare_t:** In overlapping mode, this is an **accounting identity** — `min(1, cumulative net capi contributions / K_t)` — rather than the parametric 35 % smoothstep ramp used in legacy mode. It starts at 0 (Y0, when K_t = 0), rises to ~1.0 in early years (all fund value is recent contributions), then gradually declines to ~0.78 at horizon end as compounded reinvested returns grow faster than new contributions. No free parameter.

### Parameters removed from the UI

Six parameters that were redundant with the cascade are no longer exposed as user controls (they remain active in legacy mode for backward compatibility):

| Parameter | Role | Replacement in cascade |
|---|---|---|
| `alpha` | PAYG-surplus fraction → debt | Cascade bucket 3 |
| `lambda` | Transition levy on contributions | Cascade bucket 4 contribution top-up |
| `Tlambda` | Lambda activation year | — |
| `phiF` | Employer floor to capi | Hardcoded 0; cascade floor handles capi payout |
| `thetaBuffer` | Surplus-growth levy buffer | Cascade bucket 5 (reinvest cap) |
| `tauK` | Annual stock levy on K_t | Cascade bucket 3 |

---

## Return and rate assumptions

| Rate | Symbol | Default | Description |
|---|---|---|---|
| Legacy Fund portfolio return | `r_f_portfolio` | 4.5 % **real** | Diversified 60/40 expected return (OECD historical median). This is a **risky expected return**, not a guaranteed rate. It should be stress-tested heavily; see presets. |
| Capi pot return | `r_c` | 4.5 % real | Capi fund return (similar 60/40 mandate). Subject to GE penalty above `geKneeRatio`. |
| Annuity discount rate | `r_f_annuity` | 1.5 % real | French OATi-equivalent inflation-linked sovereign rate, used to price the guaranteed annuity floor. This is a **liability discount rate**, not an expected return. |
| Sovereign borrowing rate | `r_d(t)` | 3.5 % base (nominal) | Endogenous; rises with combined debt/GDP. |
| Inflation | `π` | 2 % | Used for Fisher conversions and benefit indexation. |
| Wage growth | `w_r` | 0.4 % **real** | Real wage growth; converted to nominal for contributions. |

A 4.5 % real expected return on a long-horizon public fund is defensible as a diversified-equity-heavy projection but is sensitive to return sequencing. Two scenarios with the same 70-year average return can have very different solvency outcomes if poor returns occur early in the transition (sequence risk). Stochastic return analysis is a v2.1 priority (see roadmap).

---

## Key features

- **Tier A simulator UI** — 18 user-facing sliders / selectors covering macroeconomic, workforce, retirement-age, capi-routing, HLM, and Équinoxe parameters.
- **Tier B expert menu** — annuity floor rate, endogenous-rate premium tuning, GE-penalty boundaries, employer contribution cut (v1.3).
- **Two distinct return/discount rates** — `r_f_portfolio` (risky expected return) vs `r_f_annuity` (liability discount rate). Setting them equal reproduces a carry-trade mispricing from v1.0.
- **Per-cohort accrued PAYG rights** (v1.1) — workers transitioning to capi retain proportional legacy entitlements via `legacyShareOfCohort(B)` (eq 15a), aggregated as `transitionalPaygExp_t` (eq 25b). The v1.0 binary-cohort split that understated state-funded outflow by 50–150 Md€/yr at peak no longer applies.
- **Endogenous borrowing rate** — sovereign risk premium rises with combined `D^{ext}_t + D_t` debt/GDP via piecewise-linear thresholds (150 / 200 / 300 %), capped at 20 %. Presented as a reduced-form stress heuristic.
- **General-equilibrium return penalty** — capi return scales linearly to zero between `geKneeRatio` (2× GDP) and `geFloorRatio` (4× GDP). Only the return channel is modelled; GE effects on wages, employment, housing prices, savings displacement, and tax base are outside v2.0 scope.
- **State guarantee on capi pensions** — when K_avail cannot cover the guaranteed floor, the state borrows the shortfall, tracked in `CK_t`. In overlapping mode, this is structurally near zero because the floor (≈ 1.5 % × share × K_t ≈ 0.5–1.3 % of K_t) is always covered by nominal K_avail.
- **Active-population factor** — drives both the wage bill and GDP. Without this, the model overstates labour-force capacity in pessimistic demographic scenarios.
- **6 presets** — 3 baseline + 3 pedagogical partial-package scenarios (see below).
- **Simplified view** (`#/simple`) — 3 scenarios, 5 sliders, narrative cards for lay audiences.
- **Hypotheses page** (`#/hypotheses`) — every §3 parameter with default, kind, and rationale.
- **179 tests** — unit invariants, reference-trace regression against `tests/fixtures/v1.1-default-trace.json`, and 1000-config property-based suite (all passing).

---

## Default scenario results (`v1_default` preset, v2.0 overlapping mode)

The overlapping cascade eliminates transition debt accumulation under default parameters: bucket-4 contribution cross-subsidy covers the early-years PAYG deficit before D_t can compound, and the cascade debt-repayment bucket clears any residual. All values from the live engine at current HEAD.

| KPI | Value | Notes |
|---|---|---|
| Peak sovereign transition debt | **0 Md€** | Deficit covered structurally by cascade |
| Debt-free year (transition) | **2033** | Transition debt never materially accumulates |
| Cumulative interest cost (70 yr) | **0 Md€** | No debt → no interest |
| Capitalisation pot, real (2027 €), Y69 | **~12 600 Md€** | `K_t[69] / (1+π)^69` |
| Capitalisation pot, nominal, Y69 | **49 420 Md€** | `K_t[69]` |
| Final legacy fund balance | **1 360 Md€** | `F_t[69]` |
| Cumulative capi state guarantee calls | **0 Md€** | `CK_t[69]` |
| Sovereign rate range | **3.50 %** (flat) | No debt → no spread premium |
| Équinoxe brackets effect at t=0 | **17.68 Md€/yr** | Pre-phasing |
| CSG/CRDS restoration at t=0 | **5.00 Md€/yr** | Pre-phasing |
| Peak combined debt `D_ext + D` | **16 908 Md€** (2096) | Background sovereign debt dominates |
| `capiAssetShare_t` at Y69 | **0.875** | Accounting identity (contributions/K_t) |

*`D^{ext}_t` grows with GDP throughout — the peak combined-debt figure reflects background sovereign debt growth, not transition failure.*

---

## Preset summary (v2.0 overlapping mode)

| Preset | Peak D_t | Debt-free | CI total | K_t Y69 | Disposition |
|---|---|---|---|---|---|
| `v1_default` | 0 Md€ | 2033 | 0 Md€ | 49 420 Md€ | Clean |
| `v1_optimiste` | 0 Md€ | 2033 | 0 Md€ | 90 037 Md€ | Clean |
| `v1_stress` | 3 002 Md€ | 2033 | 4 717 Md€ | 20 025 Md€ | Manageable |
| `equinoxeOnly` | 1 199 210 Md€ | 2033¹ | 1 184 078 Md€ | 275 Md€ | Catastrophic (pedagogical) |
| `labourHousingOnly` | 1 549 Md€ | 2033 | 1 122 Md€ | 33 983 Md€ | Manageable |
| `equinoxeAndLabour` | 0 Md€ | 2033 | 0 Md€ | 2 993 Md€ | Clean |

¹ Transition debt clears in 2033 because Équinoxe savings rapidly close the PAYG gap, but without the capi pot to provide a cross-subsidy buffer, accumulated interest dominates.

---

## Walkthrough — 5-stage transition narrative (`#/walkthrough`)

Each stage builds on the previous against `realistic` demographics. All figures are from the v2.0 overlapping engine.

| # | Stage | Peak transition D_t | Peak total debt¹ | Transition debt-free | K_t Y69 | Disposition |
|---|---|---|---|---|---|---|
| 1 | Status quo (no reform) | 4 499 301 Md€ (2096) | 4 512 706 Md€ | never | 0 | Catastrophic |
| 2 | + Équinoxe (3 components) | 1 199 210 Md€ (2096) | 1 212 615 Md€ | 2033² | 275 Md€ | Catastrophic |
| 3 | + Capi + HLM cessions | 1 576 Md€ (2056) | 13 405 Md€ | 2033 | 30 186 Md€ | Borderline |
| 4 | + Labour reform (+7 pp employment over 8 yr) | 196 Md€ (2051) | 14 745 Md€ | 2033 | 38 141 Md€ | Borderline |
| 5 | + Demographic reform (`reformed` profile) | **0 Md€** | **20 399 Md€** | **2033** | **61 959 Md€** | **Clean** |

¹ Peak total debt = max(`D_ext_t + D_t`). Cumulative interest `CI_t` is reported separately and is **not** added to the debt stock (to avoid double-counting: `D_t` already compounds with interest via the endogenous rate). The pre-v2.0 overview's "peak total debt = `D_ext + D + CI`" formulation was misleading.

² Transition debt clears in 2033 because Équinoxe rapidly closes the PAYG cash gap. Total debt remains catastrophic because `D^{ext}_t` continues to grow with GDP and early-years CI_t accumulates.

**On demographic dominance:** Under the current preset family, demographic assumptions dominate the solvency result — Stages 1–4 all remain far from clean. However, this conclusion is model-dependent. Other potential binding constraints under alternative calibrations include return assumptions, interest rates, accrued-rights treatment, and HLM proceeds. This should be retested after the actuarial v2.1 kernel and stochastic return module are complete.

---

## Key assumptions and limitations

**Model-boundary assumptions:**
- The model is a **pension-system cash-balance model**, not a general-government model. Tax-base feedback, consumption effects, and housing-price impacts from HLM sales are not modelled.
- CSG/CRDS restoration is treated as pension-system revenue. In national-accounts terms it is general-government revenue — the distinction matters for how the COR frames sustainability.

**Demographic kernel (v2.0 parametric):**
- Current default uses a parametric smoothstep envelope (eqs 7a–e, `T_extinct = 45`). Three profiles (`realistic`, `cor_central`, `reformed`) capture COR June 2025 scenario families.
- The actuarial kernel (v2.1, table-driven from COR + INSEE T60 data) is implemented but requires primary-source table transcription before it becomes the default.

**Return assumptions:**
- 4.5 % real expected return on a public 60/40 fund is a central projection, not a guaranteed outcome. Stochastic return analysis — sequence risk, early equity crash, Japan-style 30-year low-return scenario, stagflation — is a v2.1 priority.
- The GE return penalty models equity-premium compression at macroeconomic scale (one channel only). Wage, employment, savings-displacement, and housing-price GE effects are absent.

**Accrued rights:**
- Per-cohort PAYG accrual is implemented (v1.1, eq 15a). `legacyShareAvg_t` is held flat once the capi-retiree pool plateaus — this introduces a small conservative bias (~1.7 % of peak debt under default preset) because older high-legacy-share cohorts die first. The actuarial survival mask that corrects this is a v2.1 item.

**Asset-liability matching:**
- The model does not perform duration matching or mark-to-market guarantee valuation. The state guarantee creates a contingent liability (visible as `CK_t`); its fair value — expected present value of guarantee calls — is not computed. This is a priority for v3.0.

**Political/legal feasibility:**
- Agirc-Arrco nationalisation, CDC balance-sheet transfer, and HLM cessions at the modelled scale are political-economy shocks, not ordinary fiscal levers. The model is transparent that these are assumed; it does not price the social or legal costs of those decisions.

**No behavioural responses:**
- Labour-supply elasticity, retirement-timing optimisation, precautionary savings crowding-out, and employer hiring responses are all outside scope.

---

## Versioning — live engine vs archived results

| Version | Status | Key addition | Reference fixture |
|---|---|---|---|
| v1.0 | Archived | Initial 34-equation model | — |
| v1.0a | Archived | Two-rate r_f split, retirement-age modes, asset-share capi payout, 60 equations | `v1.0a-default-trace.json` (archived) |
| v1.1 | Archived | Per-cohort accrued PAYG rights; fixed 50–150 Md€/yr understatement | — |
| v1.2 | Archived | τ_K stock levy, GE penalty, endogenous spread | — |
| v1.3 | Archived | Δτ_e employer cut, surplus-growth buffer θ | — |
| **v2.0** | **Live** | Overlapping cascade, accounting-identity capiAssetShare_t, 6 dead levers removed | `v1.1-default-trace.json` (legacy-mode backward compat) |

The `v1.1-default-trace.json` fixture governs the legacy-mode regression contract. The v2.0 overlapping-mode contract is validated by the cascade waterfall invariant tests (179 tests total).

---

## Technical stack

React 19 + Vite 7 + Recharts. Single-page application, no backend. Auto-deployed to Vercel on push to `main`. Tests: Vitest, 179/179 passing (unit invariants, 70-year × 113-field reference-trace regression, 1000-config property-based suite).

---

## Roadmap

### v2.1 — Actuarial + stochastic (next)

- **Actuarial demographic kernel** — replace parametric smoothstep with COR June 2025 + INSEE T60 table-driven `retireeIdx`, `activePopFactor`, `cohIdx`. Per-cohort survival mask fixes `legacyShareAvg_t` held-flat bias.
- **Stochastic return module** — Monte Carlo over correlated `(r_c, r_f_portfolio)` shocks with sequence-risk analysis. Headline KPIs become P50 / P90 / P95 distributions.
- **Guarantee fair-value KPI** — expected present value of guarantee calls, P95 annual maximum.

### v3.0 — Policy realism

- **Asset-liability management** — duration matching, mark-to-market guarantee, contingent-liability balance sheet.
- **Legal-feasibility toggles** — Agirc-Arrco included/partial/excluded; CDC transfer gross/equity/surplus/none; HLM sale speed.
- **Labour-market behavioural responses** — retirement-age employment elasticities, employer-contribution-cut hiring response.
- **GE completeness** — wages, savings displacement, housing prices from HLM sales, tax-base feedback.

---

## Source documents

- `cdc_legacy_fund_model.md` — Full model specification (60 equations, invariants, calibration sources)
- `THEORY.md` — Operating theory and engineering philosophy
- `DemographicKernel_plan.md` — v2.1 actuarial kernel specification
- `tests/fixtures/v1.1-default-trace.json` — 70-year × 113-field legacy-mode reference trace (§11.3 regression contract)
- `critique.md` — Structured critique
- `CHANGELOG.md` — Version history
