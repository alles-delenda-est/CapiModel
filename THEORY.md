# Operating Theory — CapiModel v1.0a Pension-Transition Simulator

## Problem Thesis

France's pension system consumes ~13 % of GDP — among the highest in the OECD — with structural deficits projected to deepen as the dependency ratio deteriorates (COR central scenario: dependency ratio from 2.6 → 1.76 by 2070, ≈ +48 %). The political debate is stuck between parametric PAYG reforms (retirement age, contribution rates) that are incremental and unpopular, and a radical transition to capitalisation that mainstream economists consider economically impossible due to the Breyer (1989) "double-payment" identity.

This simulator exists to **expand the Overton window** by making the transition's mechanics, costs, and risks transparent and explorable. It does not claim the transition is easy or costless — it quantifies exactly how costly it is and under what conditions it could work.

## Operating Theory

The model implements 60 numbered equations over a 70-year horizon (Y0 = 2027), tracking three coupled stocks: the legacy PAYG fund (`F_t`), sovereign transition debt (`D_t`), and capitalisation pot (`K_t`), with a fourth tracker for pre-reform sovereign debt (`D^{ext}_t`) that grows pari-passu with GDP. The full equation set is in `CapiModelSpec_v1.0a.md` §5.

### Five core mechanisms (v1.0a)

1. **Cohort-routing by `cutoffAge`** (spec §5.4) — Workers aged ≤ `cutoffAge` in 2027 migrate to capi; older workers stay in PAYG. The share of contributions routed to capitalisation, `σ_capi(t)` (eq 15), grows linearly anchored to the *baseline* career length (not the indexed retirement age — see §10.3 for the non-monotonicity rationale). At default `cutoffAge = 50`, the first capi cohort retires at year 14 (eq 14), and capi activation ramps over 28 years (eq 23/§5.6).

2. **Endogenous borrowing rate** (spec §5.8) — `r_d(t)` is a piecewise-linear premium over `r_d_base` (eq 34), kicking in at 150 % debt/GDP and steepening at 200 % and 300 %, with a hard cap at 20 % (model breaks down beyond — sovereign is market-locked-out). The premium responds to **combined** sovereign exposure `D^{ext}_t + D_t` (eq 33), not transition debt alone — a common implementation pitfall flagged in §10.12.

3. **Capi state guarantee** (spec §5.13) — When the pot's drawdown can't cover the desired payout floor (eq 51), the state borrows the shortfall (eq 55) and tracks it cumulatively in `CK_t`. v1.0a fixes a v1.0 bug where the per-individual annuity rate was applied to the entire aggregate pot scaled by retiree *headcount* share (`capiRetireeShare_t`), which expropriated still-accumulating worker savings and masked the transition's fiscal cost. v1.0a uses **asset-share scaling**: `capiAssetShare_t = smoothstep(t; T_capi_start, T_capi_start+30) × capiAssetShareSteadyState` (eq 53a), with default plateau 0.35 (anchored to mature DC system precedents — Australia super ~30 %, Chile AFP ~35–40 %).

4. **Active-population factor** (spec §4) — Each demographic profile (`cor_central`, `realistic`, `reformed`) drives both the retiree headcount index (smoothstep envelope, peak/long-run multipliers) and the active-population trajectory (piecewise linear over 5 anchor points). The wage bill (`W_t`, eq 9) and GDP (`GDP_t`, eq 31) both scale by `activePopFactor(t)` — without this, the model overstates labour-force capacity in pessimistic scenarios.

5. **Retirement-age trajectory** (spec §5.4, **NEW in v1.0**) — `A_R(t)` is real-valued (do not round in the loop, §10.2) with two modes: `fixed` (constant at `retirementAgeBase = 64`) and `indexed` (rises by half the gain in life expectancy at 65, mirroring Swedish/Italian NDC indexation logic — `LIFE_EXP_INDEXATION_FRACTION = 0.5` is a hardcoded constant per §3.3). Existing 2027 retirees are immune (§10.5) — they sit in `legacyRetirees(0)` and decay only via `cohIdx(t)`.

### Demographic kernel: parametric, 45-year extinction

The retiree-headcount kernel (eqs 7a–7c) is **parametric** (smoothstep envelope), not actuarial — flagged in §10.4 as the highest-priority limitation. The `T_extinct = 45` years (vs v0.11's 70 years) is hardcoded and aligns with the COR June 2025 central-scenario mortality tables: the survivor mass of 1960s birth cohorts approaches zero past age 105, so the youngest 2027 retiree (age 60) completely exits by year 45. This prevents legacy expenditures from artificially dragging on for biological impossibilities. Actuarial replacement using exact INSEE/COR mortality tables remains a follow-up (§10.4, v1.1 candidate).

### The core tension

Two distinct surplus concepts (spec §5.9):
- `pre_employer_surplus_t = -deficit_t = nonEmplrNet_t - legacyExp_t` — triggers the employer-contribution waterfall (positive: employer money flows entirely to capi; negative: employer fills the legacy gap).
- `post_everything_surplus_t = netFlow_t` — determines whether the system repays debt (positive) or borrows (negative) in any given year.

The model is a race between accumulation (`r_c`, `w_r`, capi ramp) and obligation (`r_d`, demographic pressure, pre-reform debt growth). The spread `σ_t = r_f_portfolio - (r_d(t) - π)` (eq 58) summarises this race in a single signed number. The Breyer critique is acknowledged — the model doesn't claim to evade the double-payment identity, but quantifies the conditions under which the explicit debt path is manageable.

## Strategy

The simulator's value is **pedagogical, not prescriptive**:

1. Make every parameter visible and adjustable in the Tier-A simulator UI; expose harder dials (annuity hedge rate, asset-share plateau, GE-penalty thresholds) in the Tier-B expert menu per spec §3.
2. Provide a 5-stage walkthrough that builds the reform piece-by-piece against `realistic` demographics, demonstrating that no single reform package closes the gap without demographic relief.
3. Provide presets spanning baseline / optimiste / stress, plus three pedagogical *paquet partiel* presets (see `src/v1-presets.js`).
4. Document the model fully in `CapiModelSpec_v1.0a.md` (the durable spec) with regression-trace fixtures (`tests/fixtures/v1.0a-default-trace.json`) and property-based invariants (`tests/engine.test.js`).
5. Maintain an honest critique that steelmans the objections.

Current focus: v1.0a is the production state. v1.1 work follows the `spec/v1.1` cadence (see Open questions below).

## Engineering philosophy (added in v1.0a)

The v1.0a refactor cycle established the cadence we expect to maintain for future versions:

- **Spec-driven implementation.** All semantics live in `CapiModelSpec_v1.0a.md`. Every non-trivial line of the engine carries a `// Spec §X.Y eq (N)` comment that maps it back to the spec. Implementers reading the engine should be able to navigate to the spec equation in one keypress.
- **Test invariants enforce §6.** Five conservation/non-negativity/boundary invariants are asserted at every `t` in test mode for every canned scenario, and over 1000 randomly-sampled configurations (property-based). A failed invariant fails the test run regardless of KPI matching.
- **Property-based validation.** §11.5 random-config tests cover bounded ranges per the brief — every §6 invariant must hold for every sample. Run-time budget: 60 s wall (currently ~15 s).
- **Reference-trace regression** (§11.3). The default-preset 70-year × every-field trace is captured to a JSON fixture as a contract. Engine changes that alter default output fail the regression test loudly and require explicit per-field fixture-update justification — not a silent diff.
- **Dual-LLM review process.** Each task PR is reviewed by a separate independent LLM in addition to the human reviewer, before merge. This caught several v1.0 bugs that the implementer (Claude Code) missed.
- **One commit per logical unit.** Commit messages of the form `eq (N–M): <one-line summary>` give reviewers a per-equation entry point into the diff.

This discipline is what carried v1.0a's four substantive corrections (rate split, HLM uniform, capi asset-share, Équinoxe scope split) through with zero engine-level rework after merge.

## Key discoveries (v1.0a cycle)

- **The v1.0 carry-trade arbitrage was masking real fiscal cost.** Pricing the capi annuity at the same rate as the Legacy Fund's diversified-portfolio yield (4.5 % real) created a structural arbitrage where the state could borrow at `r_d` and earn `r_f` indefinitely. v1.0a separates `r_f_portfolio` (4.5 %) from `r_f_annuity` (1.5 %, OATi-equivalent) — the realistic hedging cost. This single change widens peak debt by ~470 Md€ and total interest by ~800 Md€ in the default scenario.
- **The capi pot belongs proportionally to retirees, not by headcount.** v1.0's `capiRetireeShare_t` formula expropriated worker savings to inflate annuities for early retirees. v1.0a's `capiAssetShare_t` (steady-state 0.35, ramped over 30 y) reveals the genuine actuarial gap that v1.0 hid (cumulative shortfall = 0 under v1.0 default; non-zero under v1.0a stress conditions).
- **HLM mass conservation matters.** v1.0's `(t==0)?U0×ρ : U0×(1-ρ)^(t-1)×ρ` formulation forced `ΔU_0 = ΔU_1`, violating `U_{t+1} = U_t − ΔU_t`. v1.0a's uniform geometric form `ΔU_t = U_t × ρ` is what the algebra requires.
- **Équinoxe is two reforms in one.** v1.0 lumped progressive bracket reduction + IR-deduction abolition + CSG/CRDS restoration into a single `E0_net_t` term applied only to legacy retirees. v1.0a separates the benefit-side (legacy only, eqs 18b/c → 21a/b) from the tax-side (all retirees, eq 22 → eq 38), correctly attributing CSG revenue from capi pensioners.
- **Demography is the binding constraint.** Walkthrough Stages 1–4 (status quo through full fiscal+labour reform) all stay catastrophic under `realistic` demographics; only Stage 5 (switching to `reformed`) closes the system. No single fiscal lever — no matter how aggressive — substitutes for demographic relief.

## Per-cohort PAYG accruals (v1.1)

v1.0a's binary cohort split (eqs 23/24) treated all capi-cohort retirees as having zero PAYG entitlement — including workers who had already contributed for decades before the 2027 transition. PR #6 surfaced this as a dual-rights pedagogical view in the per-individual panel (`legacyShare = yearsInPayg / careerYears`), but the panel's per-individual sum across transitional cohorts disagreed with the engine's `legacyExp_t` because the engine still routed those cohorts as fully capi. PR #7 reverted the panel pending engine support; v1.1 (this work) provides that support.

§5.6.1 introduces `legacyShareOfCohort(B)` as a closed-form per-cohort accrual share (eq 15a) and a population-weighted running average `legacyShareAvg_t` (eq 15b). The aggregate `transitionalPaygExp_t = R^capi_t × legacyShareAvg_t × E0_legacy_t × I_t` (eq 25b) feeds the §5.9 waterfall via revised eq 39'. `legacyExp_t` is preserved unchanged in semantics and value — the new aggregate is additive. The panel's per-individual computation now reads engine output directly, so the cohort sum coincides by construction with the engine's transitional aggregate.

The largest ongoing simplification is the **held-flat mortality assumption** for `legacyShareAvg_t` once `R^capi_t` plateaus. A linear-in-age mortality proxy gives a 1.7% peak-debt bias under the default preset — below the 2% threshold for keeping held-flat in v1.1. Cumulative late-horizon bias is larger (~45% of peak debt by year 70) but matters less for headline KPIs (peak debt is reached at t=41 in 2068, before mortality dispersion has accumulated). v1.2 actuarial work with INSEE T60 tables would refine this; the bias direction is conservative (overstates late-horizon outflow).

The peak-debt impact of v1.1 vs v1.0a on the default preset is +24% in peak `r_d(t)` (4.45% → 5.50%) and a peak-debt year shift from 2057 to 2065. Three of the six presets — `v1_stress`, `equinoxeOnly`, `labourHousingOnly` — hit the 0.20 `r_d_cap` under v1.1; all three are designated "DESIGNED CATASTROPHIC" in `presets.js` and likely hit the cap under v1.0a too (v1.0a fixtures for non-default presets are not captured in the repo).

## τ_K: annual levy on the capitalisation stock (v1.2)

`tauK` is an annual levy on the end-of-year K_t stock routed to transition-debt repayment. It fires only while D_t > 0 and respects a solvency floor (`K_floor_t = annuity-reserve minimum`) to prevent K_t from falling below what is needed to serve guaranteed pensions.

The optimum is structurally determined by two opposing forces: higher τ_K accelerates D_t → 0, shrinking interest payments, but simultaneously erodes K_t, reducing the ongoing levy base and eventually triggering guaranteed-annuity exposure. The empirical optimum at default demographics is τ_K ≈ 3.0 % (peak debt −75 %, total interest −88 %, terminal debt 12 Md€). At 3.5 % K_t = 0 by t = 69 and terminal debt spikes due to State-guarantee activation.

GE feedback: τ_K reduces K_t/GDP_t, which lowers the general-equilibrium penalty `gePenalty_t` and therefore raises the effective capi return `r_c_eff_t` modestly. This makes the optimum slightly higher than a naive revenue-matching calculation would suggest.

## Δτ_e: employer contribution-rate cut and infeasibility analysis (v1.3) {#employer-cut}

The employer PAYG contribution rate `τ_e = 16.5 %` of the wage bill is the primary revenue source for the legacy-pension waterfall (eqs 39–40). v1.3 allows a permanent step reduction `deltaTauxPatronal` activated at t = `taxCutStartT` (default: t = 2, year 2029), plus an optional annual increment `deltaTauxPatronalPA` for phased relief.

### Why any annual increment is catastrophic

The net-flow identity at the transition period (while the capi levy τ_K compensates) is:

```
netFlow_t = nonEmplrNet_t + emplrRevenue_t − legacyExp_t − tauKLevy_t
```

When `deltaTauxPatronalPA > 0`, `emplrRevenue_t` falls by `W_t × PA` per year. At t = 2 (2029), K_t ≈ 2,800 Md€ while the levy base of a 0.5%/yr annual cut is ≈ 370 Md€/yr at year 1, growing every year. Because `tauKLevy_t = τ_K × K_t`, offsetting a 0.5%/yr cut requires τ_K ≈ 370/2800 ≈ 13 %/yr at inception — far beyond the 3.5 % safety ceiling. Total 70-year employer relief from a 0.5%/yr cut ≈ 33,380 Md€ >> 15,100 Md€ from optimal τ_K savings. Result: catastrophic debt spiral regardless of τ_K value.

### Viable regime for permanent step cuts

An exhaustive 2D sweep over (`deltaTauxPatronal ∈ [0, 1.0 %]`, `tauK ∈ [0, 5.0 %]`) confirmed:
- Any `deltaTauxPatronal > 0.5 %` causes terminal K_t depletion at all τ_K levels.
- Joint optimum: `deltaTauxPatronal = 0.5 %`, `tauK = 2.5 %` → total interest 3,508 Md€ (−80 % vs no cut), terminal debt 17 Md€, initial employer relief ≈ 7 Md€/yr (2029), eventual organic relief ≈ 630 Md€/yr by t = 69.

The "eventual" relief arises because as the legacy-pension obligation winds down (demographic extinction by ~2075), `emplrToLeg_t` falls to zero; the freed employer contributions that were flowing to `emplrToCap_t` then represent a structural ongoing payroll-tax reduction that can be permanently removed without fiscal cost.

### Default and UI exposure

Both `deltaTauxPatronal` and `deltaTauxPatronalPA` default to 0. The mechanic is pedagogically complex and the viable parameter range is narrow enough that accidental misconfiguration is highly likely. Both sliders are exposed only in the expert Tier B section ("Baisse des charges patronales v1.3") alongside τ_K. The two KPI cards (initial and eventual employer relief) are also gated behind `expertMode`.

## Demographic kernel v2.0 — actuarial replacement (planned)

The parametric kernel (§5.2, eqs 7a–7e) was flagged at §10.4 and §10.6 as the highest-priority structural limitation. `DemographicKernel_plan.md` specifies the full replacement. Summary of the design:

### What changes

Three kernel functions are replaced by table-driven equivalents:

| Current | Replacement | Source |
|---------|------------|--------|
| `retireeIdx(t)` — smoothstep envelope (peakMult, longRunMult, peakT) | `retireeIdx_actuarial(t)` — `P_ret_t / P_ret_0` from COR table | COR juin 2025, Table S1 |
| `activePopFactor(t)` — piecewise linear over 5 anchors | `activePopFactor_actuarial(t)` — `P_act_t / P_act_0` from COR table | COR juin 2025, Table S1 |
| `cohIdx(t)` — `1 − smoothstep(t, 0, 45)`, symmetric | `cohIdx_actuarial(t)` — cumulative T60 survival of 2027 retiree pool | INSEE T60 2023 |

All three replacements produce normalised indices (ratio to t=0) so downstream equations (9, 10, 11, 23, 24, 25, 25b, 31) are **structurally unchanged**.

### Why `cohIdx` matters most

The parametric `cohIdx(t) = 1 − smoothstep(t, 0, 45)` is symmetric around t=22 — it loses the 1960s cohort at a constant rate. Real T60 mortality is concave: the survivor mass drops slowly in years 0–20 (most 60-year-olds in 2027 reach 80) then steeply in years 25–45 (few 90-year-olds survive). The symmetric form overstates late-horizon `transitionalPaygExp_t`, accumulating a ~45% bias relative to peak debt by t=69. The T60-based `cohIdx_actuarial` corrects this without requiring any downstream equation change.

### Linkage audit result (see §6 of `DemographicKernel_plan.md`)

All downstream linkages are already correct:
- **`C_s_t`, `C_e_t`**: flow entirely through `W_t` which uses `activePop_t`. Actuarial mode improves `activePop_t`; no equation change needed.
- **`GDP_t`**: already `baseGDP × Omega_t × empFactor × activePop_t`. Inherits actuarial improvement automatically.
- **`legacyShareAvg_t` held-flat**: fully fixed in v2.0 via a per-cohort population mask. Each capi sub-cohort is tracked with its entry-year `legacyShare` and its T60 survival is applied yearly; `legacyShareAvg_t` is then a population-weighted average across surviving sub-cohorts, naturally capturing the higher mortality of older (higher-`legacyShare`) cohorts.

### Backward compatibility

`demoMode: 'parametric'` (default in v2.0 during validation period) reproduces bit-identical output to v1.x. The existing `v1.1-default-trace.json` fixture remains the parametric-mode regression contract. A new `v2.0-actuarial-cor-central-trace.json` fixture is created when actuarial mode is validated.

### New demographic settings

Three new config parameters: `demoMode` (`'parametric' | 'actuarial'`), `demoScenario` (`'cor_central' | 'cor_high' | 'cor_low'`), `mortalityFemaleFraction` (default 0.52). A new **Démographie** UI section exposes scenario selection (non-expert) and the mortality mix (Tier B expert). The `reformed` parametric profile has no COR-table equivalent and is preserved as parametric-only.

## Open questions (v1.1 wishlist, spec §10.13–§10.14)

- **`r_c` exposure.** Currently 0.045 hardcoded; v1.1 should expose as a sensitivity slider [0.025, 0.06] for stress-testing realised returns.
- **`lifeExpAt65_per_decade` exposure.** Currently 0.91 (COR central); v1.1 should expose as "*Avancées de la science médicale*" [0.5, 1.5] to test demographic-improvement sensitivity.
- **`LIFE_EXP_INDEXATION_FRACTION` exposure.** Currently 0.5 hardcoded; v1.1 should expose [0, 1] to compare full-NDC indexation vs partial vs none.
- **`r_d_base` exposure.** Currently 0.035 hardcoded; v1.1 should expose for rate-environment stress.
- **Survivors-only cohort split (§10.14).** `R0` is direct-rights only (DREES Édition 2025 scope) but `E0` is all-régime including survivors. v1.1 should split `legacyRetirees(t)` into `_direct` and `_survivors` sub-cohorts, each with its own demographic kernel and pension level.
- **Cohort kernel decoupled from `A_R(t)` (§10.6).** With INSEE T60 actuarial replacement, the retiree-headcount kernel parameters (`peakT`, `peakMult`) would couple to retirement age — currently they are independent.
- **`E0` doesn't respond to retirement age (§10.7).** Raising retirement age in v1.0a moves only timing, not benefit amount. Real systems also adjust accrual; v1.1 candidate.
- **General-equilibrium endogeneity beyond `r_c`.** GE penalty currently only applies to capi return; v1.x could endogenise the wage-bill response to demographics, the migration response to fiscal pressure, etc.
