# Operating Theory — CapiModel v2.1 Pension-Transition Simulator

**Live version:** v2.1 (balanced cascade waterfall, K_retirees_bal tracking, fiscal transfers, GE recalibration)
**Reference trace:** `tests/fixtures/v1.1-default-trace.json` (legacy-mode backward-compat contract; balanced-mode contract validated by 232-test invariant suite)
**Sections marked "planned"** refer to v2.2 / v3.0 features not in the live engine.

---

## Model boundary

CapiModel is not a projection of the French general government. It is a **pension-transition cash-flow and stock-flow simulator** with a simplified sovereign feedback loop. The accounting boundary is a synthetic public transition account that consolidates legally distinct entities.

**Included in the model:**
- Legacy PAYG pension outflows (existing retirees + transitional cohorts with accrued rights)
- Employee and employer contribution revenue
- Transition debt accumulation and repayment
- Capi pot accumulation, guaranteed floor payout, and cascade distribution
- Selected fiscal/housing reforms (Équinoxe, HLM cessions, employer cuts)
- Simplified background sovereign debt exposure

**Excluded from the model:**
- Full state budget (healthcare, education, unemployment, defence)
- Full tax system and behavioural macro feedbacks
- Legal compensation costs from asset nationalisation
- Wage, employment, savings, and housing-price general-equilibrium feedbacks (beyond the GE return-compression channel — see §GE below)
- Political-risk modelling
- Asset-liability duration matching and mark-to-market guarantee valuation

**Consolidation note:** The model includes CDC assets, FRR, Agirc-Arrco reserves, and HLM proceeds alongside state pension flows. These are legally distinct entities. Results should be read as a *feasibility analysis of a hypothetical consolidated public transition account*, not as the balance of any existing caisse. CSG/CRDS restoration is treated as pension-system revenue; in national-accounts terms it is general-government revenue — users should be aware of this boundary when comparing to COR pension-balance projections.

---

## Problem thesis

France devotes roughly **14 % of GDP** to pensions — among the highest in the OECD, at around €388 bn/yr (Cour des comptes 2025). The COR projects a persistent deterioration of the pension-system balance under central assumptions; the pressure comes from both demographics (falling support ratio) and the projected resource base, even though pension expenditure as a share of GDP remains broadly stable.

The support ratio deteriorates from about **2.6 working-age persons per older person** toward roughly **1.76 by 2070** — equivalently, the old-age dependency burden rises by around **48 %**. The political debate is stuck between parametric PAYG reforms (retirement age, contribution rates) that are incremental and unpopular, and a radical transition to capitalisation that mainstream economists consider economically impossible due to the standard **PAYG-to-funded double-payment problem** (Breyer 1989; Aaron 1966; Barr and Diamond 2006).

This simulator exists to **expand the Overton window** by making the transition's mechanics, costs, and risks transparent and explorable. It does not claim the transition is costless — it quantifies exactly how costly it is and under what conditions it becomes manageable.

---

## The double-payment identity — central framing

The model does not evade the double-payment identity. It makes the identity explicit.

During transition, society must simultaneously finance:

1. **Accrued PAYG rights** of existing retirees and near-retirees — the single largest and least negotiable obligation
2. **Funded accumulation** for younger cohorts entering capitalisation
3. **Interest on any debt** used to bridge the transition gap
4. **Contingent public guarantees** if funded returns or annuity pricing disappoint

CapiModel therefore treats the reform as a **liability-conversion problem**, not a free arbitrage. Implicit PAYG promises are progressively converted into explicit transition debt, explicit pension-asset balances, and contingent guarantee exposure. The key question is whether the resulting debt path, distributional burden, and political package are sustainable under specified demographic, return, and fiscal assumptions.

| Before reform | After reform |
|---|---|
| Implicit PAYG promise | Explicit transition debt |
| Current contributions fund current pensions | Contributions split between legacy and capi |
| Political indexation risk | Market-return and annuity risk |
| No individual asset stock | Individual/collective capi balances |
| Hidden intergenerational transfer | Visible debt and guarantee exposure |

---

## Five solvency dimensions

The model's "clean / manageable / catastrophic" classifications refer primarily to cash-flow and debt-stock solvency. A complete assessment requires five separate dimensions:

1. **Cash-flow solvency** — can annual inflows cover annual outflows without new sovereign borrowing?
2. **Debt-stock solvency** — does transition debt peak below a sustainable debt/GDP threshold and decline thereafter?
3. **Actuarial solvency** — are accrued and future pension promises fully recognised under cohort survival and annuity pricing? *(Partially covered in v2.0; improving in v2.1.)*
4. **Guarantee solvency** — can the state honour the capi floor guarantee under stress return paths? *(Realised shortfall tracked in `CK_t`; expected/P95 guarantee value is a v2.1 priority.)*
5. **Political/legal solvency** — are the required asset transfers, pension cuts, and levies legally and politically achievable? *(Not modelled; annotated in the assumptions tables.)*

---

## Operating theory

The model implements 60 numbered equations over a 70-year horizon (Y0 = 2027), tracking three coupled stocks: the legacy PAYG fund (`F_t`), sovereign transition debt (`D_t`), and capitalisation pot (`K_t`). A fourth tracker, `D^{ext}_t`, represents the pre-reform sovereign debt stock. It is **not a fiscal projection** — it grows proportionally with nominal GDP as a stylised background-debt-ratio convention, so that the endogenous borrowing rate responds to total sovereign leverage without requiring a full government-budget model. Reviewers should not interpret it as a forecast of actual French sovereign debt.

### Five core mechanisms

1. **Cohort-routing by `cutoffAge`** — Workers aged ≤ `cutoffAge` in 2027 migrate to capi; older workers retain 100 % of their PAYG rights. Workers below the cutoff retain a proportional legacy entitlement for contributions already made (eq 15a — the v1.1 accrued-rights correction; see below). The share of contributions routed to capitalisation, `σ_capi(t)`, grows linearly anchored to the baseline career length. At default `cutoffAge = 50`, the first capi cohort retires at year 14 (eq 14), and capi activation ramps over 28 years.

2. **Endogenous borrowing rate** — `r_d(t)` is a piecewise-linear premium over `r_d_base` (eq 34) kicking in at 150 % combined debt/GDP and steepening at 200 % and 300 %, capped at 20 %. The function is a **reduced-form stress heuristic for fiscal-risk pricing**, not a sovereign-debt model. Real sovereign crises are nonlinear; the smooth cap is an engineering bound. The premium responds to combined `D^{ext}_t + D_t` (not transition debt alone), a common implementation pitfall.

3. **v2.1 balanced cascade waterfall** — the current UI default (`cashFlowMode: 'balanced'`). Tracks a separate **K_retirees_bal** pot (retirees' accumulated stake) and distributes through seven ordered steps: (1) K_retirees_bal nominal return preservation → (2) new retiree transfer → (3) guaranteed annuity floor from K_retirees_bal → (4) solvency buffer top-up → (5) debt sweep, capped at 75 % of surplus above floor (`debtSweepSurplusFrac: 0.75`) → (6) actuarial bonus, bounded by `K_retirees_bal × (annuityRate_t − annuityFloorRate) − capiDebtRepaid_t × retireeFrac_t` → (7) K_close reinvestment. The transition levy (λ) and stock levy (τ_K) are no longer user-facing parameters; their effects are incorporated structurally into steps 5 and 7 respectively. The v2.0 overlapping cascade remains available as `cashFlowMode: 'overlapping'` for comparison; legacy mode is `cashFlowMode: 'legacy'`. See `CapiModel_overview.md` for the full step table.

4. **Active-population factor** — each demographic profile drives both the retiree headcount index and the active-population trajectory. The wage bill (`W_t`) and GDP (`GDP_t`) both scale by `activePopFactor(t)`. Without this, the model overstates labour-force capacity in pessimistic scenarios.

5. **Retirement-age trajectory** — `A_R(t)` is real-valued with two modes: `fixed` (constant at `retirementAgeBase = 64`) and `indexed` (rises by half the gain in life expectancy at 65, mirroring Swedish/Italian NDC indexation). Hard floor 60, ceiling 70. Existing 2027 retirees are immune.

### Accrued PAYG rights — the central actuarial issue (v1.1)

Accrued PAYG rights are not a v1.1 implementation detail — they are **the heart of the transition problem**. The double-payment burden exists precisely because workers cannot forfeit what they have already earned. v1.0a's binary cohort split treated all capi-cohort retirees as having zero PAYG entitlement, understating state-funded outflow by 50–150 Md€/yr at peak transition.

v1.1 introduces `legacyShareOfCohort(B)` as a closed-form per-cohort accrual share (eq 15a) and a population-weighted running average `legacyShareAvg_t` (eq 15b). The aggregate `transitionalPaygExp_t = R^capi_t × legacyShareAvg_t × E0_legacy_t × I_t` (eq 25b) feeds the waterfall via revised eq 39'. `legacyExp_t` is preserved separately.

In **parametric mode** `legacyShareAvg_t` carries a **held-flat mortality assumption** once the capi-retiree pool plateaus — a linear-in-age proxy giving a ~1.7 % peak-debt bias under the default preset (conservative in direction). In **actuarial mode** this is corrected by the **§6.5 per-cohort population mask**: each capi-cohort sub-population is aged with differential INSEE T60 mortality, so `legacyShareAvg_t` becomes a true mortality-weighted mean — older high-legacy-share cohorts thin out faster and the mean declines at the correct actuarial pace instead of freezing at the peak.

### The spread — a diagnostic, not a solvency theorem

Two surplus concepts determine system behaviour:
- `pre_employer_surplus_t` — triggers the employer-contribution waterfall
- `netFlow_t` — determines whether the system borrows or repays in any given year

The spread `σ_t = r_f_portfolio − (r_d(t) − π)` (eq 58) is a useful **reduced-form carry diagnostic** that summarises whether the legacy fund's expected real return exceeds the real cost of sovereign debt. It is **not a solvency condition**. A positive spread does not guarantee viability because:

- portfolio returns are risky; debt service is contractual
- bad return sequences early in the transition can be irreversible (sequence risk)
- the state guarantee creates asymmetric downside
- taxation of K_t and political risk can reduce expected returns or raise debt spreads
- the transition requires legally transferable assets, not just accounting surpluses

The spread should be read as a necessary-but-not-sufficient diagnostic.

---

## Return and rate assumptions — epistemic status

| Rate | Symbol | Default | Epistemic status |
|---|---|---|---|
| Legacy Fund portfolio return | `r_f_portfolio` | 4.5 % real | **Risky expected return.** OECD historical 60/40 median. Not a guarantee. Stress-tested in `v1_stress` (2.5 %) and `v1_optimiste` (5 %). |
| Capi pot return | `r_c` | 4.5 % real | Same. Subject to GE penalty above `geKneeRatio`. |
| Annuity discount rate | `r_f_annuity` | 1.5 % real | **Liability discount rate.** OATi-equivalent inflation-linked sovereign hedge rate. Used to price the guaranteed annuity floor — this is the rate at which the state can lock in real pension obligations, not an expected investment return. Setting it equal to `r_f_portfolio` reproduces a carry-trade mispricing from v1.0. |
| Sovereign borrowing rate | `r_d(t)` | 3.5 % base (nominal) | Endogenous reduced-form heuristic. |

A 4.5 % real expected return is defensible as a long-horizon diversified-equity-heavy projection but is sensitive to return sequencing. Stochastic return analysis — sequence risk, early equity crash, Japan-style secular stagnation, stagflation — is a v2.1 priority.

---

## General-equilibrium coverage

The model's GE coverage is deliberately asymmetric. This must be stated explicitly to avoid overclaiming.

| Channel | Coverage |
|---|---|
| Capi return compression at macroeconomic scale | **Covered** — GE penalty zeroes `r_c_eff` between `geKneeRatio` (3× GDP in UI; 2× in legacy test DEFAULT_CONFIG) and `geFloorRatio` (8× GDP in UI; 4× in legacy test DEFAULT_CONFIG). Recalibrated in v2.1 per Norway SWF precedent (~6 %/yr at 340 % GDP). |
| Active-population / GDP linkage | **Partially covered** — `activePopFactor(t)` scales W_t and GDP_t |
| Labour supply response to retirement age | **Not covered** |
| Wage response to employer contribution cuts | **Not covered** |
| Consumption response to pension cuts | **Not covered** |
| Savings displacement / private pension crowd-out | **Not covered** |
| Housing-market response to HLM sales | **Not covered** |
| Investment response to large pension-fund accumulation | **Not covered** |
| Migration response to fiscal stress or labour shortages | **Not covered** |
| Political-risk premium on sovereign debt | **Not covered** |

The COR's 2025 framework identifies four broad levers — pension moderation, employee contributions, employer contributions, and retirement age — and notes that they have different macroeconomic effects. The model captures the direct fiscal channels of each but not the second-order economic responses.

---

## capiAssetShare — bridge approximation, not an actuarial model

In v2.0 overlapping mode, `capiAssetShare_t` is an **accounting identity**: `min(1, cumulative net capi contributions / K_t)`. This eliminates the free parameter (`capiAssetShareSteadyState = 0.35`) that was calibrated to Australia/Chile DC precedents in v1.0a.

The accounting identity is a meaningful improvement — it derives the retiree-entitled fraction of K_t from actual contribution history rather than imposing a smoothstep ramp. However, it is still a **conservative aggregate bridge**, not a full DC payout model. A real capitalisation system requires:
- cohort-level account balances and contribution histories
- individual annuitisation with survival-weighted payouts
- retirement-age-specific annuity factors
- investment-return attribution by contribution year

These are v2.1 / v3.0 priorities. The accounting-identity rule should not be interpreted as an actuarial model of individual DC pensions.

In legacy mode, the parametric smoothstep ramp (`capiAssetShareSteadyState = 0.35`) is preserved for bit-identical backward compatibility.

---

## HLM cessions — fiscal mechanic and housing-policy shock

The model correctly implements mass conservation: `ΔU_t = U_t × ρ` (geometric decay), implying cumulative disposals of approximately **64 % of the original 5.3 M units over 20 years** at ρ = 5 %/yr. The v1.0 bug (`ΔU_0 = ΔU_1` double-counting) is fixed.

However, the fiscal mechanics do not model the housing-policy consequences. France had approximately **5.4 million social rental dwellings at 1 January 2025**, with around **10,900 sold during 2024**. The model's ρ = 5 %/yr default implies approximately **265,000 sales per year** — roughly **24× recent observed flow**. This is a deliberately aggressive political scenario used to explore the financing ceiling. **Housing-service conservation — the social cost of reduced social rental availability — is not modelled.** A full policy analysis would need to account for displaced tenants, substitution markets, and political durability of the programme at that scale.

---

## Implicit-to-explicit liability conversion

The state guarantee on capi pensions (`CK_t`) is treated in the model as a realised annual shortfall — the state borrows when K_avail cannot cover the guaranteed floor. This is mechanically correct but incomplete from a public-finance perspective.

The guarantee is equivalent to **writing a put option on pension outcomes**. Its fair value — the expected present value of future guarantee calls — may be low under the default path but high under stress scenarios. In overlapping mode, `CK_t = 0` under all three baseline presets because the floor (≈ 1.5 % × capiAssetShare × K_t) is structurally covered by nominal K_avail. But under adverse return sequences or early equity crashes, guarantee activation becomes likely.

**KPIs not yet computed, priority for v2.1:**
- Expected present value of guarantee calls (requires stochastic return paths)
- P95 annual maximum guarantee call
- Probability of guarantee activation under stress scenarios
- Total public pension exposure (transition debt + guarantee fair value + accrued PAYG PV)

---

## Political and legal feasibility

Financial solvency and political feasibility are separate dimensions. The model is transparent that several financing levers require decisions that go well beyond ordinary fiscal policy:

**Agirc-Arrco reserves (~86 Md€ at end-2024):** The Agirc-Arrco management explicitly frames its reserves as the patrimony of the private-sector supplementary pension scheme, governed by social partners under paritarisme. Inclusion in F0 assumes a decision to effectively nationalise these reserves — a constitutional, social-contract, and political-economy shock, not a neutral asset transfer.

**CDC balance-sheet transfer (~220 Md€):** A balance sheet is not a pile of free equity. CDC assets are encumbered by regulated-savings obligations (Livret A guarantees), long-term infrastructure commitments, and public-mission constraints. Only the net transferable surplus — after liabilities, guarantees, and encumbrances — is genuinely available. The model uses a gross estimate.

**τ_K (stock levy on K_t):** Now removed from the user-facing UI (incorporated into cascade bucket 3). When active in earlier versions, it created a theoretical tension: capitalisation is sold to workers as creating protected personal pension wealth, but a 3 % annual levy on that wealth while transition debt remains is a state raid on the capi pot — exactly the credibility problem capitalisation is supposed to avoid. If a future version reintroduces it, it should be framed explicitly as a **temporary transition solidarity levy**, not a portfolio-management mechanism.

**Credibility of non-raiding:** The model includes Agirc-Arrco nationalisation, CDC mobilisation, HLM cessions, and (historically) a capi stock levy. Together these raise a legitimate political-economy question: why would workers believe the new capi pot will not be subject to future raids? This credibility problem is not modelled and is a binding constraint in real-world transition design.

---

## Demographic kernel

### Current — parametric smoothstep (v2.0 default)

The retiree-headcount kernel (eqs 7a–7c) is **parametric**, not actuarial. `T_extinct = 45` years aligns with COR June 2025 central-scenario mortality tables (youngest 2027 retiree at 60 exits by ~2072). Three profiles capture the scenario space:

| Profile | Character |
|---|---|
| `cor_central` | COR central scenario — moderate TFR recovery + sustained migration |
| `realistic` | Pessimistic — lower TFR, lower migration, higher longevity pressure |
| `reformed` | Optimistic — demographic reform package assumed (immigration, TFR) |

### Implemented — actuarial table-driven kernel (v2.0, opt-in)

`demoMode: 'actuarial'` replaces the three parametric kernel functions with table-driven equivalents (`activePopFactor_actuarial` 7d′, `retireeIdx_actuarial` 7c′, `cohIdx_actuarial` 7e′) sourced from COR June 2025 and INSEE T60 2023, plus the §6.5 per-cohort population mask for `legacyShareAvg_t`. All replacements produce normalised indices (ratio to t=0) so downstream equations are structurally unchanged. Selected via the **Démographie & travail** panel (mode radio + COR scenario dropdown + Tier-B female-mortality-mix slider). Full specification: `DemographicKernel_plan.md`.

The most important improvement is `cohIdx_actuarial`: the parametric `1 − smoothstep(t, 0, 45)` is symmetric around t=22, overstating late-horizon `transitionalPaygExp_t` by accumulating ~45 % bias relative to peak debt by t=69 (conservative direction). Real T60 mortality is concave — most 2027 retirees survive to 80 but few reach 90+. The T60-based replacement corrects this without any downstream equation change. Male and female `qx` are blended at the **survival-curve level** (not at `qx`), so the increasingly-female surviving cohort is represented correctly.

**Data status:** the arrays in `src/demographic-tables.js` are currently synthetic placeholders (Makeham mortality, Gaussian age pyramid) calibrated to the right qualitative shape. They must be replaced with primary-source COR juin 2025 / INSEE T60 transcriptions — a data-only change with no engine impact — before actuarial mode becomes the default.

Backward compatibility: `demoMode: 'parametric'` reproduces bit-identical v1.x output. The existing `v1.1-default-trace.json` fixture remains the parametric regression contract; `v2.0-actuarial-cor-central-trace.json` locks the actuarial engine path. Monte Carlo scenario alignment (§9.5 of the spec) is not applicable to the active root build, which has no Monte Carlo module.

---

## Engineering philosophy

- **Spec-driven implementation.** All semantics live in `cdc_legacy_fund_model.md`. Every non-trivial engine line carries a `// eq (N)` comment mapping to the spec. Implementers navigate the engine and spec together.
- **Test invariants enforce §6.** Five conservation/non-negativity/boundary invariants are asserted at every `t` for every canned scenario and over 1000 randomly-sampled configurations. A failed invariant fails the test run. Currently 239 tests, all passing.
- **Reference-trace regression.** The default-preset 70-year × every-field trace is captured to a JSON fixture as a contract. Engine changes that alter default output fail loudly and require explicit per-field fixture-update justification.
- **Public-facing-page data contract.** The Introduction page (`#/intro`, Direction-D landing) computes every KPI and chart value live from `runSimulation(PRESETS.v1_default.params)` rather than embedding pre-computed numbers, so the headline narrative drifts in lockstep with the engine. `tests/introPage-data.test.js` pins the displayed values (knobs, KPIs, counterfactual ratio) so prose-versus-numbers contradictions — e.g. a "3 % réel" risk panel against a 4.5 % engine default — are caught at test time instead of in production.
- **Dual-LLM review process.** Each task PR is reviewed by a separate independent LLM in addition to the human reviewer before merge.
- **One commit per logical unit.** Commit messages of the form `feat: <topic> — §X.Y eq (N–M)` give reviewers a per-equation entry point into the diff.

---

## Key discoveries by version

### v1.0a
- **Two-rate r_f split.** Pricing the capi annuity at the same rate as the Legacy Fund's portfolio yield (4.5 % real) created a structural carry-trade arbitrage — the state could borrow at `r_d` and earn `r_f` indefinitely. Separating `r_f_portfolio` (risky expected return) from `r_f_annuity` (liability discount rate, 1.5 %) closed this. This single change widened peak debt by ~470 Md€ and total interest by ~800 Md€.
- **capiAssetShare vs capiRetireeShare.** v1.0's headcount-scaling formula expropriated worker savings to inflate early-retiree annuities. The asset-share approach corrects this.
- **HLM mass conservation.** The v1.0 geometric formula had a double-counting bug at t=0; the uniform geometric form `ΔU_t = U_t × ρ` is what the algebra requires.
- **Équinoxe scope split.** Benefit-side reductions (legacy cohorts only) and tax-side revenue (all retirees) must be tracked separately.

### v1.1
- **Per-cohort accrued PAYG rights.** Fixed 50–150 Md€/yr understatement of state-funded outflow at peak transition. The most important actuarial correction in the model's history.

### v2.0
- **Overlapping cascade waterfall.** Replaced the legacy waterfall with a five-bucket cascade. Transition debt peaks at 0 Md€ under default parameters; total interest falls to 0 Md€. The structural contribution cross-subsidy (cascade bucket 4) covers the early-years PAYG deficit before D_t can compound.
- **Accounting-identity capiAssetShare.** Replaced the parametric 35 % smoothstep with `min(1, cumulative net contributions / K_t)` — no free parameter.
- **Six redundant levers removed from UI** (alpha, lambda, Tlambda, phiF, thetaBuffer, tauK): their effects are now structural in the cascade or hardcoded to their natural values.

### v2.1
- **Balanced cascade waterfall (§5.13).** The new UI default. Adds K_retirees_bal state variable tracking only retirees' accumulated stake; prevents cross-subsidisation between worker savings and pension payouts. Key invariant: capi payout is monotonically non-decreasing after capi cohort first retires.
- **Actuarial bonus cap.** Bonus bounded by `K_retirees_bal × (annuityRate_t − annuityFloorRate) − capiDebtRepaid_t × retireeFrac_t`. This was the root cause of the late-horizon capi payout decline observed in v2.0: without a cap tied to the annuity rate, the bonus could over-distribute from the real-return cascade, depleting K_retirees_bal.
- **75 % surplus sweep cap** (`debtSweepSurplusFrac`). Prevents debt repayment from crowding out the capi bonus when D_t > 0. The remaining 25 % of surplus above floor is preserved for capi retirees regardless of debt level.
- **GE recalibration.** UI_CONFIG uses geKneeRatio = 3.0 / geFloorRatio = 8.0 (Norway SWF precedent); DEFAULT_CONFIG unchanged (2.0/4.0) for test-fixture backward-compatibility. The v1.x 4× floor created an implausible scenario where a fund at K/GDP = 4 earned 0 % real return.
- **Fiscal transfers** (`fiscalTransfer_t`). ~40 Md€/yr CSG/FSV/État transfers taper to zero as `legacyFrac_t → 0`. Bug discovered and fixed: toggling transfers on with default GE params (2.0/4.0) caused the GE floor to trigger early, suppressing r_c_eff to near zero and depleting K_retirees_bal. Fix: initial App.jsx state now explicitly overrides to recalibrated GE params (3.0/8.0).
- **Canonical mode UI.** Three toggle groups (Diversification / Mode Chilien / Mode Suédois) in the Modes canoniques panel.
- **Recognition bonds** (`chileMode: true`, PR21b/c). Accrued PAYG rights of transitional workers converted to state-issued bonds indexed to French inflation (iota), zero redemption value. Bond sizing: `bondIssuance_t = transitionalPaygExpGross_t / annuityRate_t`; credited to K_t at retirement (D_t↑, K_t↑ by same); `transitionalPaygExp_t = 0` in chileMode. Annual coupon service: `bondCouponService_t = BR_t × iota` (debt-financed, appears in UI table, CSV, and debt chart). `BR_t` is a cumulative non-decreasing tracker. Key pedagogical question: does front-loading bond issuance combined with funded K_t growth produce a lower total long-term obligation than PAYG?
- **232 tests**, all passing.

---

## Demographic dominance — a preset-family result, not a general theorem

The v2.0 walkthrough demonstrates that under `realistic` demographics, Stages 1–4 (status quo through full fiscal and labour reform) all remain far from clean. Stage 5 (switching to `reformed` demographic profile) closes the system. This is a strong result — but it is a **model result under the current preset family**, not a general theorem.

Other calibrations could make different factors the binding constraint: return assumptions, interest rates, accrued-rights scope, HLM proceeds, retirement age, or Équinoxe depth. The conclusion should be stated as: "Under the current preset family, demographic assumptions dominate the solvency classification. This should be retested after stochastic return analysis and actuarial demographic replacement."

---

## Roadmap

### v2.2 — Swedish canonical mode + mode-specific UI (next)

- **Swedish NDC variant** (`swedenMode: true`): notional DC overlay — contribution credits accrue at shadow rate tied to GDP growth; payouts from notional account balance rather than real funded pot.
- **Mode-specific UI pages**: full chart and KPI restructuring per canonical mode (Chilean and Swedish, separate PR).

### v3.0 — Stochastic and actuarial

- Actuarial demographic kernel (COR + INSEE T60 tables)
- Per-cohort survival mask for `legacyShareAvg_t`
- Monte Carlo stochastic return paths; headline KPIs as P50/P90/P95 distributions
- Guarantee fair-value KPIs (expected PV, P95 annual maximum)

### v4.0 — Policy realism

- Legal-feasibility toggles per lever (Agirc-Arrco included/partial/excluded; CDC net equity / gross / none; HLM pace)
- Duration-matched asset-liability framework
- Contingent-liability balance sheet (explicit pension liability PV + guarantee fair value + transition debt)
- Labour-market behavioural responses (retirement-age employment elasticity, contribution-cut hiring response)
- GE completeness (wages, savings crowd-out, housing prices, tax-base feedback)
- Distributional outputs by cohort and income decile

---

## Open implementation questions (v2.1 candidates)

- **`r_c` exposure** — currently 4.5 % hardcoded; should be a sensitivity slider [0.025, 0.06] for stress-testing realised returns
- **`lifeExpAt65_per_decade` exposure** — currently 0.91 (COR central); expose as "avancées médicales" [0.5, 1.5]
- **`r_d_base` exposure** — currently 0.035 hardcoded; expose for rate-environment stress
- **Survivors-only cohort split** — `R0` is direct-rights only (DREES scope) but `E0` is all-régime including survivors; split `legacyRetirees(t)` into direct-rights and survivors sub-cohorts
- **`E0` response to retirement age** — raising retirement age currently moves only timing, not benefit amount; real systems also adjust accrual
- **Cohort kernel coupling to `A_R(t)`** — currently independent; actuarial T60 tables would couple retiree-headcount parameters to retirement age
