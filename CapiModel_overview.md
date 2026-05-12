# CapiModel v2.1 — Pension-Transition Simulator

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
- **Employer contributions** (`τ_e` = 16.5 %) cover legacy pension deficits first; any surplus flows to the capi pot. The balanced cascade (v2.1 UI default) enforces `phiF = 0`: all employer contributions flow to legacy first, and the seven-step waterfall handles capi-side distribution.
- **HLM cessions** — `ρ` = 5 %/yr applied to the *remaining* stock each year (geometric decay: `ΔU_t = U₀ × (1−ρ)^t × ρ`). This implies cumulative disposals of approximately **64 %** of the original 5.3 M units over 20 years — far above the ~10,900 units sold in 2024. This is a deliberately aggressive political scenario. 95 % of capital gains (net of book value, with optional volume-discount haircut) remit to the legacy fund.
- **Équinoxe pension reform** — three components (§5.5):
  1. *Brackets reduction* — progressive cut on pensions above 1 800 €/mo, capped at 20 % above 4 000 €/mo. ~17.7 Md€/yr at t = 0. Applied to legacy-cohort retirees only.
  2. *IR-deduction abolition* — 5 Md€/yr at t = 0, decays with cohort size.
  3. *CSG/CRDS restoration* — 5 Md€/yr at t = 0, grows with retiree index (all retirees including capi).
- **Retirement age** — two modes: `fixed` (default: 64) or `indexed` (rises by half the gain in life expectancy at 65, mirroring Swedish NDC). Hard floor 60, ceiling 70.
- **Residual deficits** are covered by sovereign borrowing at the endogenous rate `r_d(t)`, with a piecewise-linear premium above 150 % combined debt/GDP, capped at 20 %. This function is a **reduced-form heuristic** for fiscal-stress pricing, not a sovereign-debt model. Sovereign crises are nonlinear; the smooth cap is a conservative bound.

---

## v2.1 balanced cascade (current user-facing default)

The current UI default is the **§5.13 balanced cascade** (`cashFlowMode: 'balanced'`), which replaced the v2.0 overlapping cascade as the standard user-facing waterfall. Legacy mode and overlapping mode remain available for backward-compatibility and comparison.

### How the balanced cascade works

The cascade tracks a separate **retirees' pot** (`K_retirees_bal`) alongside the main fund (`K_t`). Each year the system distributes through seven ordered steps:

| Step | Action | Cap / constraint |
|---|---|---|
| 1 | K_retirees_bal grows by nominal floor return | `K_retirees_bal × annuityFloorRate` (preserves pension reserve) |
| 2 | New retiree transfer: incoming cohort funded from K_t | `K_t × σ_capi × retirementRate × capiAssetShare_t` |
| 3 | Floor payment: guaranteed annuity floor paid from K_retirees_bal | `K_retirees_bal × annuityFloorRate` |
| 4 | Solvency buffer: maintain K_retirees_bal ≥ floor × T_solvency | Top-up from K_t if needed |
| 5 | Debt sweep: excess surplus repays D_t | min(75 % of surplus, returnSweepCap, kSweepCap, gdpSweepCap, D_t) |
| 6 | Bonus: upside distributed to capi retirees | Bounded by actuarial surplus on K_retirees_bal |
| 7 | K_close: remaining surplus reinvested into K_t | — |

**K_retirees_bal separation:** Only retirees' accumulated pot serves pension payouts; worker savings accumulate separately. This prevents cross-subsidisation and preserves K_t as a long-term pension reserve.

**Actuarial bonus cap:** the capi bonus is bounded by `K_retirees_bal × (annuityRate_t − annuityFloorRate) − capiDebtRepaid_t × retireeFrac_t`. This cap allows principal drawdown as a properly funded pension (paying above floor from capital), while preventing over-distribution that would deplete the retirees' pot.

**75 % surplus sweep cap:** the debt repayment step (step 5) is limited to 75 % of surplus above floor (`debtSweepSurplusFrac: 0.75`). This preserves 25 % of surplus for capi bonus even when transition debt is outstanding, preventing the bonus from collapsing to zero.

**capiAssetShare_t:** accounting identity — `min(1, cumulative net capi contributions / K_t)` — not a free parameter. Starts at 0 (Y0), rises toward 1 in early accumulation years, then gradually declines as compounded reinvested returns grow faster than new contributions.

### Parameters removed from the UI

Six parameters that were redundant with the cascade are no longer exposed as user controls (they remain active in legacy mode for backward compatibility):

| Parameter | Role | Replacement in cascade |
|---|---|---|
| `alpha` | PAYG-surplus fraction → debt | Cascade step 5 |
| `lambda` | Transition levy on contributions | Cascade step 5 contribution top-up |
| `Tlambda` | Lambda activation year | — |
| `phiF` | Employer floor to capi | Hardcoded 0; cascade floor handles capi payout |
| `thetaBuffer` | Surplus-growth levy buffer | Cascade step 7 (K_close reinvest) |
| `tauK` | Annual stock levy on K_t | Cascade step 5 |

---

## Fiscal transfers (diversification des moyens de financement)

The current French pension system is partly sustained by earmarked fiscal transfers: CSG contributions, FSV (Fonds de Solidarité Vieillesse) transfers, and État contributions totalling ~40 Md€/yr at reform start. The model treats these as a tapering `fiscalTransfer_t` that supports the transition through the double-payment period and phases out as the capi system becomes self-sustaining.

**Transfer formula:** `fiscalTransfer_t = fiscalTransferBase × legacyFrac_t`, where `legacyFrac_t = min(1, legacyRetirees_t / retireeIdx_t)`. As the legacy transitional cohort dies off, `legacyFrac_t → 0` and transfers taper to zero. `fiscalTransferBase` defaults to 40 Md€/yr (approximate DREES combined CSG/FSV/État pension-system transfers, COR 2024).

**Three transfer modes** (`fiscalTransferMode`):
- `'full'` *(UI default)*: transfers included; residual deficits still covered by D_t borrowing
- `'no-debt'`: transfers included, but no new D_t borrowing; residual fiscal gap tracked as `fiscalGap_t` (off-balance-sheet)
- `'none'` *(engine DEFAULT_CONFIG)*: no transfers (kept for test-fixture backward-compatibility)

All six app-facing presets (`v1_default`, `v1_optimiste`, `v1_stress`, `equinoxeOnly`, `labourHousingOnly`, `equinoxeAndLabour`) use `fiscalTransferMode: 'full'`.

---

## Canonical mode switches

The Simulateur UI includes a **Modes canoniques** panel with three toggle groups:

| Toggle | Parameter | Options |
|---|---|---|
| Diversification | `fiscalTransferMode` | Avec dette (full) / Sans dette (no-debt) / Désactivée (none) |
| Mode Chilien | `chileMode` | On / Off |
| Mode Suédois | `swedenMode` | On / Off |

**Mode Chilien** (engine logic: PR21b/c) implements recognition bonds: accrued PAYG rights of transitional workers are converted to state-issued bonds credited directly to K_t at retirement, replacing the PAYG outflow with a funded mechanism. Bonds are indexed to French inflation (iota) with zero redemption value; each year the outstanding bond stock pays a coupon = BR_t × iota (new expense, debt-financed). Tracks `BR_t` (cumulative issuance), `bondIssuance_t` (annual issuance), and `bondCouponService_t` (annual coupon expense).

**Mode Suédois** (engine logic: planned) implements a Swedish-style notional defined-contribution overlay: contribution credits accrue at a shadow rate linked to GDP growth; payouts are from the notional account balance, not a real funded pot.

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
- **General-equilibrium return penalty** — capi return scales linearly to zero between `geKneeRatio` and `geFloorRatio`. UI_CONFIG uses recalibrated values (3× GDP knee, 8× GDP floor) to reflect empirical evidence (Norway's SWF earns ~6 %/yr at 340 % of GDP). DEFAULT_CONFIG keeps the original 2×/4× for test-fixture backward-compatibility. Only the return channel is modelled; GE effects on wages, employment, housing prices, savings displacement, and tax base are outside v2.1 scope.
- **State guarantee on capi pensions** — when K_avail cannot cover the guaranteed floor, the state borrows the shortfall, tracked in `CK_t`. In overlapping mode, this is structurally near zero because the floor (≈ 1.5 % × share × K_t ≈ 0.5–1.3 % of K_t) is always covered by nominal K_avail.
- **Active-population factor** — drives both the wage bill and GDP. Without this, the model overstates labour-force capacity in pessimistic demographic scenarios.
- **6 presets** — 3 baseline + 3 pedagogical partial-package scenarios (see below).
- **Fiscal transfers** (`fiscalTransfer_t`) — ~40 Md€/yr CSG/FSV/État transfers, tapering to zero as `legacyFrac_t → 0`; three modes: full, no-debt, none.
- **K_retirees_bal tracking** — separate retirees' accumulated pot inside the balanced cascade; prevents cross-subsidisation between worker savings and pension payouts.
- **Canonical mode switches** — Diversification / Mode Chilien / Mode Suédois toggles in the Modes canoniques UI panel.
- **Simplified view** (`#/simple`) — 3 scenarios, 5 sliders, narrative cards for lay audiences.
- **Hypotheses page** (`#/hypotheses`) — every §3 parameter with default, kind, and rationale.
- **232 tests** — unit invariants, fiscal-transfer invariants, recognition bond invariants (coupon service + issuance), reference-trace regression against `tests/fixtures/v1.1-default-trace.json`, and 1000-config property-based suite (all passing).

---

## Default scenario results (`v1_default` preset, v2.1 balanced cascade)

The balanced cascade with fiscal transfers maintains a clean trajectory under default parameters: the 75 % surplus sweep cap keeps debt repayment from crowding out the capi bonus, and the actuarial bonus cap prevents late-horizon payout decline after legacy-cohort phase-out. All values from the live engine at current HEAD.

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

## Preset summary (v2.1 balanced cascade, fiscalTransferMode: 'full')

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

Each stage builds on the previous against `realistic` demographics. All figures are from the v2.1 balanced cascade engine.

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
| v2.0 | Archived | Overlapping cascade, accounting-identity capiAssetShare_t, 6 dead levers removed | `v1.1-default-trace.json` (legacy-mode backward compat) |
| **v2.1** | **Live** | Balanced cascade (K_retirees_bal, actuarial bonus cap, 75 % sweep cap), GE recalibration (geKneeRatio 3×/8×), fiscal transfers (CSG/FSV/État ~40 Md€/yr), canonical mode switches, recognition bonds with inflation-indexed coupon service (PR21b/c) | `v1.1-default-trace.json` (legacy-mode backward compat unchanged) |

The `v1.1-default-trace.json` fixture governs the legacy-mode regression contract. The v2.1 balanced-cascade contract is validated by the 232-test invariant suite.

---

## Technical stack

React 19 + Vite 7 + Recharts. Single-page application, no backend. Auto-deployed to Vercel on push to `main`. Tests: Vitest, 232/232 passing (unit invariants, 70-year × 113-field reference-trace regression, 1000-config property-based suite).

---

## Roadmap

### v2.1 (live) — Balanced cascade + fiscal transfers

- **Balanced cascade** (`cashFlowMode: 'balanced'`) with seven ordered steps, K_retirees_bal state variable, actuarial bonus cap, and 75 % surplus sweep cap.
- **GE recalibration** — UI_CONFIG uses geKneeRatio = 3.0 / geFloorRatio = 8.0 (empirically calibrated to Norway SWF precedent); DEFAULT_CONFIG unchanged for test-fixture backward-compat.
- **Fiscal transfers** — `fiscalTransfer_t` tapers from ~40 Md€/yr as `legacyFrac_t → 0`; three modes (full / no-debt / none).
- **Canonical mode switches** — Diversification / Mode Chilien / Mode Suédois toggles in the Simulateur UI.
- **Recognition bonds** (`chileMode: true`, PR21b/c) — accrued PAYG rights of transitional workers converted to state-issued bonds indexed to French inflation (zero redemption). Bond sizing: `bondIssuance_t = transitionalPaygExpGross_t / annuityRate_t`; credited to K_t; annual coupon service = `BR_t × iota` (debt-financed). UI table, CSV, and debt chart show `bondCouponService_t` when chileMode is active.
- **232 tests**, all passing.

### v2.2 — Swedish canonical mode + mode-specific UI (next)

- **Swedish NDC variant** (`swedenMode: true`) — notional defined-contribution overlay: contribution credits accrue at a shadow rate linked to GDP growth; payouts from notional account balance.
- **Mode-specific UI pages** — full chart and KPI restructuring for each canonical mode (Chilean and Swedish).

### v3.0 — Actuarial + stochastic

- **Actuarial demographic kernel** — replace parametric smoothstep with COR June 2025 + INSEE T60 table-driven `retireeIdx`, `activePopFactor`, `cohIdx`. Per-cohort survival mask fixes `legacyShareAvg_t` held-flat bias.
- **Stochastic return module** — Monte Carlo over correlated `(r_c, r_f_portfolio)` shocks with sequence-risk analysis. Headline KPIs become P50 / P90 / P95 distributions.
- **Guarantee fair-value KPI** — expected present value of guarantee calls, P95 annual maximum.

### v4.0 — Policy realism

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
