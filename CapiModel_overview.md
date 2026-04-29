# CapiModel v1.0a — Pension-Transition Simulator

**Live demo:** https://capi-model.vercel.app

## What it does

An interactive browser-based simulator modelling France's transition from pay-as-you-go (PAYG / répartition) pensions to full capitalisation, financed by Caisse des Dépôts assets, FRR + Agirc-Arrco reserves, HLM social-housing cessions, and employer contributions. The model implements **60 numbered equations** over a 70-year horizon (Y0 = 2027, runs to 2096) per `CapiModelSpec_v1.0a.md`, tracking three coupled stocks (legacy fund `F_t`, sovereign transition debt `D_t`, capitalisation pot `K_t`) plus a fourth tracker for pre-reform sovereign debt (`D^{ext}_t`) that grows with GDP.

## Reform mechanism (v1.0a)

- **Initial reserves** (`F0` = **340** Md€) — Day-1 transfer to the legacy fund: CDC proprietary balance sheet (~220 Md€) + FRR + Agirc-Arrco reserves (~120 Md€). *Note: Agirc-Arrco reserves are technically the property of a private paritaire scheme; their inclusion assumes a political decision to nationalise them as part of the reform package (spec §1).*
- **Employee contributions** (`τ_s` = 11.3 % of gross wages) flow to individual capitalisation, **but only for workers below `cutoffAge` in 2027** (default 50). Older cohorts keep 100 % of their PAYG rights. The capi share of salaried contributions ramps up linearly anchored to the baseline career length (eq 15).
- **Employer contributions** (`τ_e` = 16.5 %) cover legacy pension deficits first via a waterfall (eqs 39–40); any surplus flows to capi.
- **HLM cessions** — `ρ` = 5 %/yr of the ~5.3 M HLM units over 20 years (smooth taper last 5), with a volume-dependent price discount (eq 28). 95 % of capital gains remitted to the legacy fund (eq 30). Uniform geometric form `ΔU_t = U₀ × (1−ρ)^t × ρ` for all `t` (mass-conservation invariant — fixed in v1.0a).
- **Équinoxe pension reform** has three components, applied by scope (spec §5.5, **revised in v1.0a**):
  1. *Brackets-side reduction* (eq 18, legacy retirees only) — progressive cut on pensions above 1 800 €/mo, capped at 20 % above 4 000 €/mo. ~17.7 Md€/yr at t=0.
  2. *IR-deduction abolition* (eq 18b, legacy only) — 5 Md€/yr at t=0, decays with cohort.
  3. *CSG/CRDS restoration* (eq 18c → 22, **all retirees** including capi) — 5 Md€/yr at t=0, grows with retireeIdx(t). Surfaces as `S0_csg_revenue_t` in eq 38.
- **Retirement age** (`A_R(t)`, **NEW in v1.0**, spec §5.4): two modes — `fixed` (constant at `retirementAgeBase` = 64) or `indexed` (rises by half the gain in life expectancy at 65, mirroring Swedish/Italian NDC). Hard floor 60, hard ceiling 70. Existing 2027 retirees are immune (§10.5).
- **Transition levy** (`λ` = 30 % of capi inflows) accelerates debt repayment, smoothly activated around year 15 (eq 44).
- **Residual annual deficits** are covered by sovereign borrowing at the **endogenous rate** `r_d(t)`, with a piecewise-linear premium kicking in at 150 % debt/GDP (eq 34, capped at 20 %).

## Key features (v1.0a)

- **Tier A simulator UI** — 24 user-facing sliders / selectors covering macroeconomic, workforce, retirement-age, capi-routing, HLM, and Équinoxe parameters per spec §3 (App.jsx).
- **Tier B expert menu** — annuity hedge rate (`r_f_annuity`), capi-actuarial-share plateau (`capiAssetShareSteadyState`), endogenous-rate premium tuning, GE-penalty boundaries, calibration constants.
- **Two distinct risk-free rates** — `r_f_portfolio` (4.5 % real, Legacy Fund's diversified 60/40 yield) used in eq 36/58; `r_f_annuity` (1.5 % real, OATi-equivalent hedging cost) used in eq 53. Resolves a v1.0 carry-trade pricing arbitrage.
- **Active-population factor** drives both the wage bill (eq 9) and GDP (eq 31) — without this, the model overstates labour-force capacity in pessimistic demographic scenarios.
- **Capi pension payouts by asset share, not headcount** (eq 53a, **NEW v1.0a**) — `capiAssetShare_t` ramps from 0 to `capiAssetShareSteadyState` (default 0.35) over 30 years, anchored to mature DC system precedents (Australia super, Chile AFP). Replaces the v1.0 expropriation bug.
- **Endogenous borrowing rate** — sovereign risk premium rises with combined `D^{ext}_t + D_t` debt/GDP via piecewise-linear thresholds (150 / 200 / 300 %), capped at 20 %.
- **General-equilibrium return penalty** — capi return scales linearly to zero between `geKneeRatio` (default 2× GDP) and `geFloorRatio` (4× GDP), modelling equity-premium compression at macroeconomic scale.
- **State guarantee on capi pensions** — when the pot can't cover the desired payout, the state borrows the shortfall (eq 55) and tracks it cumulatively in `CK_t`.
- **6 presets**: 3 baseline (`v1_default`, `v1_optimiste`, `v1_stress`) + 3 paquet partiel pedagogical scenarios (`equinoxeOnly`, `labourHousingOnly`, `equinoxeAndLabour`).
- **5-stage walkthrough** (`#/walkthrough`) — builds the reform piece by piece against `realistic` demographics. Stage 3 (capi + labour, no HLM) versus stage 4 (+ HLM cessions + transition levy) carries the central pedagogical point: HLM funding is what tips the trajectory from divergent to bounded. Charts truncate the x-axis at the first year debt/GDP exceeds 500 % with a "scénario impossible" annotation; the annotation appears on stages 1–3 and disappears on stages 4–5, making the divergence/convergence transition visually obvious without needing a log scale.
- **"Et pour vous ?" individual perspective panel** — present on the simplified view and (collapsibly) at the top of the simulator. Birth-year slider (1965–2010) drives a per-worker projection of monthly retirement income under reform vs. a no-reform counterfactual. Uses a **prorated dual-rights model**: transitional cohorts (born 1977–2005 at default `cutoffAge`) receive partial PAYG pension proportional to years accrued before the transition plus capi annuity from their personal pot. The result is a monotonically rising total pension by birth year, matching realistic legal expectations. *Note: this dual-rights view is per-individual pedagogy, not aggregate engine state — see "Key assumptions and limitations" below.*
- **Hypotheses page** (`#/hypotheses`) — every §3 parameter listed with default + kind (S/C/M) + rationale. The v1.0a corrections changelog moved to `CHANGELOG.md` at repo root; the §10.14 R0/E0 asymmetry note inlined as helper text under the R0/E0 inputs in the simulator's Tier B expert menu.
- **Reference-trace regression** (`tests/fixtures/v1.0a-default-trace.json`) — 70-year × every-field default-preset baseline. Engine changes that alter default output fail loudly (§11.3 contract).

## Default scenario results (`v1_default` preset, v1.0a)

All values are derived from `tests/fixtures/v1.0a-default-trace.json` (the §11.3 reference trace, captured in PR #4). If display ever diverges from this fixture, that's an engine regression — escalate rather than patching the doc.

| KPI | Value | Source field |
|---|---|---|
| Peak sovereign transition debt | **5 470 Md€** in **2059** | `D_t` max |
| Debt-free year (transition) | **2082** | first year `D_t < 1` after t > 5 |
| Cumulative interest cost (70 y) | **5 948 Md€** | `CI_t[69]` |
| Capitalisation pot, real (2027 €), Y69 | **12 944 Md€** | `K_t[69] / (1+π)^69` |
| Capitalisation pot, nominal, Y69 | **50 756 Md€** | `K_t[69]` |
| Final legacy fund balance | **1 709 Md€** | `F_t[69]` |
| Cumulative capi shortfall | **0 Md€** | `CK_t[69]` |
| `S0_brackets_t` at t=0 (pre-phasing) | **17.68 Md€/yr** | `S0_brackets_t[0]` |
| `S0_csg_revenue_t` at t=0 | **5.00 Md€/yr** | `S0_csg_revenue_t[0]` |
| `r_d(t)` minimum | **3.50 %** | `r_d_t` min |
| `r_d(t)` maximum | **4.45 %** | `r_d_t` max |

## Walkthrough — 5-stage transition narrative (`#/walkthrough`)

Each stage extends `v1_default` with stage-specific overrides, against `realistic` demographics. The walkthrough demonstrates that **demography is the binding constraint** — Stages 1–4 (status quo through full fiscal+labour reform without demographic reform) all stay in catastrophic-or-divergent regime; only Stage 5 (switching to `reformed`) closes the system fully. The stage 3→4 transition (HLM cessions + levy) tips the model from divergent (stage 3 peak debt ratio ~99 600 % of GDP) to bounded (stage 4 peak ~272 %).

| # | Stage | Peak D_t (Md€) | Peak total debt¹ | Peak debt/GDP | Debt-free year | Disposition |
|---|---|---|---|---|---|---|
| 1 | Statu quo (realistic demographics) | 4.4 M (2096) | 8.8 M (2096) | 37 700 % | never | catastrophic |
| 2 | + Équinoxe (3 components) | 1.5 M (2096) | 3.0 M (2096) | 12 800 % | 2033 (transition)² | catastrophic by total |
| 3 | + Capi + Labour reform (no HLM yet) | 12.8 M (2096) | 25.5 M (2096) | 99 600 % | never | catastrophic³ |
| 4 | + HLM cessions + transition levy | **12.2 k (2077)** | 52.6 k (2096) | **272 %** | never⁴ | clean (bounded) |
| 5 | + Demographic reform (`reformed` profile) | **4.4 k (2056)** | **24.4 k (2096)** | **180 %** | **2076** | **clean** |

¹ Peak total debt = max(`D_ext_t + D_t + CI_t`) — combined sovereign exposure including pre-reform debt and cumulative interest. The chart truncates the x-axis at the first year debt/GDP exceeds 500 % with a "scénario impossible — modèle non applicable" annotation; this replaces the v1.0 log-scale auto-switch and gives readers a clearer signal of model breakdown.

² Stage 2 hits transition debt-free in 2033 because Équinoxe savings rapidly close the legacy gap, but `D_ext_t` continues to grow with GDP and `CI_t` accumulates from the early years — so peak total debt remains catastrophic. This is informative about which metric to trust.

³ Stage 3 makes the transition cost visible by isolating capi enablement + labour reform without any transition financing. Without HLM proceeds or the levy, the period of double payment (legacy retirees + capi accumulation) explodes the debt. This is the intended pedagogical "before HLM" comparison — stage 4 then shows what HLM solves.

⁴ Stage 4 has bounded debt (peak 272 % of GDP, well below the 500 % truncation) but the engine never quite reaches `D_t < 1` within the 70-year horizon. Stage 5's demographic reform is what produces a clean debt-free trajectory.

## Technical stack

React 19 + Vite 7 + Recharts. Single-page application, no backend. Auto-deployed to Vercel on every push to `main`. Tests run via Vitest (`npm test`, currently 125/125 passing including 1000-config property-based suite).

## Key assumptions and limitations

- **Demographic kernel is parametric, 45-year extinction.** Smoothstep envelope (eqs 7a–c) with `T_extinct = 45` aligned to COR June 2025 central-scenario mortality tables. Actuarial replacement using exact INSEE/COR tables is a v1.1 candidate (§10.4).
- **No behavioural responses.** Retirement-timing decisions (beyond `retirementAge*`), labour-supply elasticity, precautionary savings — all out of scope.
- **`E0` doesn't respond to retirement age** (§10.7) — raising retirement age in v1.0a moves only timing, not benefit amount. Real systems also adjust accrual; v1.1 candidate.
- **Cohort kernel parameters decoupled from `A_R(t)`** (§10.6) — known limitation; with INSEE T60 actuarial replacement they would couple.
- **Survivors-only cohort implicit in `legacyRetirees(t)`** (§10.14) — `R0` is direct-rights only (DREES), `E0` is all-régime; the asymmetry is documented and intended. v1.1 fix would split `legacyRetirees(t)` into direct-rights and survivors-only sub-cohorts.
- **Per-cohort accrued PAYG rights are not tracked in the engine** — the engine's binary cohort split (`legacyRetirees_t` vs `capiRetirees_t`, eqs 23/24) treats capi-cohort PAYG accruals as zero. The "Et pour vous ?" panel implements a per-individual prorated dual-rights view (transitional cohorts get partial PAYG + capi), but this view is not summed back into the engine's `legacyExp_t`. Implication: engine debt KPIs ("Dette pic", "Année sans dette", "Intérêts cumulés") are mildly **optimistic** about reform feasibility — the missing transitional PAYG obligations are roughly 50–150 Md€/yr at peak transition, perhaps 5–15 % understatement of peak debt. v1.1 candidate: track `paygRightsAccrued[birthYear]` as a state vector inside `runSimulation`, add a new equation for `transitionalPaygExp_t`, and update §5.6/§5.9 waterfall accordingly. See `THEORY.md` for the full discussion.
- **No regional heterogeneity** — single national HLM price, single national labour market.
- **No demographic feedback loops** — TFR responding to economic conditions, mortality responding to retirement age — out of scope.

## v1.1 wishlist (spec §10.13)

Currently hardcoded; v1.1 candidates for user-tunable exposure:
- `r_c` (sensitivity slider, range [0.025, 0.06])
- `lifeExpAt65_per_decade` (« Avancées de la science médicale », range [0.5, 1.5])
- `LIFE_EXP_INDEXATION_FRACTION` (range [0, 1])
- `r_d_base` (rate-environment stress)

## Source documents

- `CapiModelSpec_v1.0a.md` — Full model specification (60 equations + invariants + calibration sources)
- `THEORY.md` — Operating theory and engineering philosophy
- `tests/fixtures/v1.0a-default-trace.json` — Canonical 70-year × every-field reference trace (§11.3 contract)
- `critique.md` — Structured critique
