# Operating Theory — CapiModel v1.0a Pension-Transition Simulator

## Problem Thesis

France's pension system consumes ~13 % of GDP — among the highest in the OECD — with structural deficits projected to deepen as the dependency ratio deteriorates (COR central scenario: dependency ratio from 2.6 → 1.76 by 2070, ≈ +48 %). The political debate is stuck between parametric PAYG reforms (retirement age, contribution rates) that are incremental and unpopular, and a radical transition to capitalisation that mainstream economists consider economically impossible due to the Breyer (1989) "double-payment" identity.

This simulator exists to **expand the Overton window** by making the transition's mechanics, costs, and risks transparent and explorable. It does not claim the transition is easy or costless — it quantifies exactly how costly it is and under what conditions it could work.

## Operating Theory

The model implements 60 numbered equations over a 70-year horizon (Y0 = 2027), tracking three coupled stocks: the legacy PAYG fund (`F_t`), sovereign transition debt (`D_t`), and capitalisation pot (`K_t`), with a fourth tracker for pre-reform sovereign debt (`D^{ext}_t`) that grows pari-passu with GDP. The full equation set is in `CapiModelSpec_v1_0a.md` §5.

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
2. Provide a 5-stage walkthrough that builds the reform piece-by-piece against `realistic` demographics, demonstrating that no single reform package closes the gap without demographic relief. The walkthrough's stage 3 (capi + labour, no HLM funding) versus stage 4 (+ HLM cessions + transition levy) carries the central pedagogical point: HLM funding is what flips the trajectory from divergent to bounded.
3. Provide presets spanning baseline / optimiste / stress, plus three pedagogical *paquet partiel* presets (see `src/v1-presets.js`).
4. Provide a per-individual projection ("Et pour vous ?") so non-specialist readers can answer "what happens to me" rather than only "what happens to the aggregate". The panel takes a birth year (1965–2010), runs the engine plus a no-reform counterfactual, and reports monthly euro pension at retirement under both — using the prorated dual-rights model described below. Mounted on both the simplified view and (collapsibly) at the top of the simulator.
5. Document the model fully in `CapiModelSpec_v1_0a.md` (the durable spec) with regression-trace fixtures (`tests/fixtures/v1.0a-default-trace.json`) and property-based invariants (`tests/engine.test.js`).
6. Maintain an honest critique that steelmans the objections.

Current focus: v1.0a is the production state. v1.1 work follows the `spec/v1.1` cadence (see Open questions below).

## Engineering philosophy (added in v1.0a)

The v1.0a refactor cycle established the cadence we expect to maintain for future versions:

- **Spec-driven implementation.** All semantics live in `CapiModelSpec_v1_0a.md`. Every non-trivial line of the engine carries a `// Spec §X.Y eq (N)` comment that maps it back to the spec. Implementers reading the engine should be able to navigate to the spec equation in one keypress.
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
- **Walkthrough stage ordering matters pedagogically.** The original v1.0a walkthrough bundled HLM with capi enablement (stage 3 = capi + HLM, stage 4 = + labour). Restructuring to stage 3 = capi + labour and stage 4 = + HLM cessions + transition levy isolates HLM as the visible difference between "transition cost explodes" and "transition cost is bounded". Stage 3 peak debt ratio is ~99 600 % of GDP; stage 4 peak is 272 %. Chart x-axis truncation at 500 % debt ratio appears on stages 1–3 then disappears on stage 4 — the visual disappearance of the divergence annotation carries the argument better than any KPI delta could.

## Engine vs panel: per-individual dual-rights pedagogy

The engine's binary cohort split (eqs 23/24: `capiRetirees_t` and `legacyRetirees_t` are mutually exclusive) is computationally tractable but understates the realistic per-worker outcome for transitional cohorts. A worker aged 50 at Y0 with 28 years of PAYG accrual switches to capi for their remaining 14 years; in any defensible legal framework they retain partial PAYG entitlements proportional to the years contributed.

The "Et pour vous ?" panel implements this dual-rights view at the per-individual level, NOT at the engine aggregate level. `computeIndividualPerspective` (in `simulation-engine.js`) computes:

- `yearsInPayg = max(0, ageInY0 - 22)` for capi cohort, full career for non-capi
- `legacyShare = yearsInPayg / careerYears`
- `monthlyPensionLegacy = avgLegacyPension(reformRows, retT) × legacyShare`
- `monthlyCapiAnnuity` from the personal pot (year-by-year accumulation at `r_cn_eff_t`)

The result is a monotonically rising total pension by birth year (1965 → 2010), with transitional cohorts (1977–2005) receiving partial PAYG + partial capi. This matches political and legal expectations and produces a curve readers can interpret.

The discrepancy: if we summed the panel's `monthlyPensionLegacy × cohort_size` across all transitional cohorts retiring at year *t*, the total would be **higher** than the engine's `legacyExp_t` — because the engine treats capi cohort PAYG accruals as zero. At peak transition (2050–2070), the gap is order ~50–150 Md€/yr of additional PAYG obligations. Implication: engine debt KPIs ("Dette pic", "Année sans dette", "Intérêts cumulés") are mildly **optimistic** about reform feasibility — by perhaps 5–15 % in peak years.

This is a known limitation, flagged in `computeIndividualPerspective` source comments and in the panel disclaimer. The pedagogical fix is to track per-cohort accrued PAYG rights as a state vector inside `runSimulation` — see Open questions below.

## Open questions (v1.1 wishlist, spec §10.13–§10.14)

- **`r_c` exposure.** Currently 0.045 hardcoded; v1.1 should expose as a sensitivity slider [0.025, 0.06] for stress-testing realised returns.
- **`lifeExpAt65_per_decade` exposure.** Currently 0.91 (COR central); v1.1 should expose as "*Avancées de la science médicale*" [0.5, 1.5] to test demographic-improvement sensitivity.
- **`LIFE_EXP_INDEXATION_FRACTION` exposure.** Currently 0.5 hardcoded; v1.1 should expose [0, 1] to compare full-NDC indexation vs partial vs none.
- **`r_d_base` exposure.** Currently 0.035 hardcoded; v1.1 should expose for rate-environment stress.
- **Survivors-only cohort split (§10.14).** `R0` is direct-rights only (DREES Édition 2025 scope) but `E0` is all-régime including survivors. v1.1 should split `legacyRetirees(t)` into `_direct` and `_survivors` sub-cohorts, each with its own demographic kernel and pension level.
- **Per-cohort accrued PAYG rights as a state vector.** The engine's binary cohort split (capiRetirees vs legacyRetirees, eqs 23/24) understates transitional-cohort PAYG obligations by ~50–150 Md€/yr at peak transition. v1.1 candidate: maintain `paygRightsAccrued[birthYear]` (= `(cutoffAge − 22) / careerYears` for transitional cohorts, 1.0 for pre-cutoff, 0 for post-cutoff) and add `transitionalPaygExp_t = Σ cohortSize × accruedShare × E0_legacy_t × I_factor_t` to the legacy expenditure waterfall (§5.6, §5.9). Engine debt KPIs would worsen by 5–15 % in peak years; the "Et pour vous ?" panel could read engine output instead of reconstructing the dual-rights logic locally. Spec change is small (one new equation, modify §5.6); code change ~50 lines plus state vector and a property test. Hardest decision is whether to fund the new stream from the legacy fund (worsens transition debt — most realistic) or from a separate notional account (cleaner accounting).
- **Cohort kernel decoupled from `A_R(t)` (§10.6).** With INSEE T60 actuarial replacement, the retiree-headcount kernel parameters (`peakT`, `peakMult`) would couple to retirement age — currently they are independent.
- **`E0` doesn't respond to retirement age (§10.7).** Raising retirement age in v1.0a moves only timing, not benefit amount. Real systems also adjust accrual; v1.1 candidate.
- **General-equilibrium endogeneity beyond `r_c`.** GE penalty currently only applies to capi return; v1.x could endogenise the wage-bill response to demographics, the migration response to fiscal pressure, etc.
