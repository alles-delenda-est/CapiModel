
# CapiModel — Technical Specification v1.0a

**Status:** Specification (not yet implemented). All implementation references describe the **target** state of the engine after the planned v1.0 rewrite.

**Purpose:** Single source of truth for the CapiModel pension-transition engine, enabling independent reimplementation, automated testing, and unambiguous parameter calibration. Self-contained: no external documents are required to implement.

---

## 0. Reading guide

This document describes a deterministic 70-year simulation of France's transition from PAYG pensions to capitalisation. Sections 1–4 define notation, conventions, and the parameter table. Section 5 lists the numbered equations in evaluation order. Section 6 captures invariants and edge cases. Section 7 documents the demographic kernels. Section 8 documents the calibration sources. Section 9 lists deliberate exclusions. Section 10 documents implementation pitfalls. Section 11 specifies the regression test harness. Section 12 reserves space for the post-implementation calibration anchor.

The spec is written so a careful implementer reading only this document can produce a working engine that matches reference outputs to within stated tolerances.

**Conventions:**
- All monetary stocks and flows are in **billions of nominal euros (Md€)** of year `Y0 + t`, unless explicitly labelled "real" or "k€".
- Year index `t` runs `0 .. N-1` with `t=0` corresponding to calendar year `Y0 = 2027`.
- All rates that the user supplies through the UI are quoted in their conventional public-data form: `r_f_portfolio`, `r_f_annuity`, and `r_c` are **real**, `r_d` is **nominal**, `π` is the **annual inflation rate**, all other growth rates are **real** unless suffixed `_n`. Internal Fisher conversions to nominal are applied transparently in §5.1; **the user never sees a Fisher conversion in the UI.**
- Smoothstep (Hermite cubic) is `S(x; a, b) = u² × (3 − 2u)` where `u = clamp((x − a) / (b − a), 0, 1)`. When `a = b`, `S = 1` for `x ≥ a` else `0`.

---

## 1. Reform architecture

The model represents a transition from pay-as-you-go (PAYG) pensions to capitalisation, financed by four channels:

1. **Initial Reserves** (`F0`, default 340 Md€) — Immediate liquidation of Caisse des Dépôts proprietary balance sheet (220 Md€) plus FRR and Agirc-Arrco existing reserves (~120 Md€), transferred Day 1 to the legacy fund. Note: Agirc-Arrco reserves are technically the property of a private paritaire scheme; their inclusion here assumes a political decision to nationalise them as part of the reform package.
2. **HLM social-housing liquidation** — annual cessions of `ρ` of remaining stock at market price (with volume-dependent discount), 95% of capital gains remitted to the legacy fund.
3. **Employer contributions** (`τ_e × W_t`) — routed first to cover legacy deficit (i.e. pay pensions); surplus flows to capitalisation.
4. **Transition levy** (`λ`) — optional levy on capi inflows, activated at year `T_λ`, used to repay sovereign transition debt. This levy is a political compromise balancing accumulation of the capitalisation pot with minimisation of debt.

Worker contributions (`τ_s × W_t`) are routed by **cohort transition rule**: the share `σ_capi(t)` flowing to capitalisation depends on `cutoffAge` (the maximum age in 2027 enrolled in the capi system) and `t`. Workers born too old to be enrolled keep contributing to PAYG (and therefore to paying legacy pensions).

Any residual annual deficit is covered by **sovereign borrowing**, modelled as new OAT issuance at the endogenous rate `r_d(t)`.

Three demographic profiles (`cor_central`, `realistic`, `reformed`) drive both the retiree headcount index and the active-population index. See §7.

---

## 2. State variables

The engine maintains four stocks year-on-year:

| Symbol | Description | Init | Unit |
|---|---|---|---|
| `F_t` | Legacy fund balance | `F0` | Md€ |
| `D_t` | Sovereign transition debt (created by reform) | 0 | Md€ |
| `K_t` | Capitalisation pot (aggregate) | 0 | Md€ |
| `D^{ext}_t` | Pre-reform French sovereign debt (background) | `existingDebt` | Md€ |

`D^{ext}_t` tracks GDP (i.e. holds its share of GDP constant absent reform); see §5.8 eq (32). This isolates the reform's marginal debt impact from background sovereign-debt dynamics. There is no feedback from primary deficit.

Two cumulative trackers:

| Symbol | Description | Init | Unit |
|---|---|---|---|
| `CI_t` | Cumulative debt interest paid | 0 | Md€ |
| `CK_t` | Cumulative capi pension shortfall (state-guaranteed) | 0 | Md€ |

---

## 3. Parameters

Parameters are grouped by **kind**: (S) sourced — defensible to a published source; (C) calibrated — fitted to a target; (M) modelling assumption — pure choice.

### 3.1 Demographic & macroeconomic

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `N` | 70 | M | Horizon. Sufficient to see legacy cohort extinction. |
| `Y0` | 2027 | M | Reform start year. |
| `π` | 0.02 | S | ECB inflation target. |
| `w_r` | 0.004 | S | Real wage-per-head growth (SMPT). Long-run anchor based on INSEE 2014–2024 average. The 2024–2026 spot rate has been higher (~0.5–0.7% real per-head) due to post-inflation catch-up, but the Banque de France April 2026 survey shows business leaders' median 2026 expectations settling at ~1.5% nominal (≈0.2% real with 1.3% inflation), reverting to the long-run trend. **Note:** this is wage-per-head, *not* wage-bill — the latter additionally reflects employment and active-pop growth, modelled separately via `employmentRate*` and `activePopFactor`. Conflating the two leads to systematic over-stating. |
| `r_f_portfolio` | 0.045 | S | Real return on the Legacy Fund's diversified 60/40 institutional portfolio. Used in eq (37) for `fundReturn_t`. Anchored to OECD historical median for similar mandates. **Renamed in v1.0a from `r_f` to disambiguate from the annuity-pricing rate below.** |
| `r_f_annuity` | 0.015 | S | Real return on inflation-linked sovereign debt (OATi-equivalent). Used in eq (53) to price the inflation-linked annuity. Anchored to French OATi yield range 2024–2026 (~0.5–1.5% real). **New in v1.0a.** Conceptually distinct from `r_f_portfolio`: the Legacy Fund earns its diversified portfolio yield, but a guarantor pricing an inflation-linked annuity must use the rate at which they can actually hedge the obligation, which is the inflation-linked sovereign rate. Setting these equal (as in v1.0) created a carry-trade arbitrage where the state could borrow at `r_d_base` and earn `r_f_portfolio` indefinitely on the fund. |
| `r_c` | 0.045 | S | Real return. Anchored to Norway GPFG 1998–2025 (6.64% nominal, ≈4.5% real) and Ontario Teachers' Pension Plan 7% nominal long-term target. Larger sovereign/pension funds with similar mandates have sustained these returns at scale; 4.5% real is empirically defensible rather than a hopeful projection. |
| `r_d_base` | 0.035 | S | Nominal. France OAT 10y is ~3.4–3.7% in early-to-mid 2026, near multi-year highs after a 37 bps rise in 2025; the 2015–2024 average of 1.5–2% is no longer a useful anchor for the post-2024 rate environment. However, market can be expected to respond _very_ positively to a serious plan to fix the pensions issue, let alone the optional labor market and demographic reform steps, therefore 3.5% appears a conservative projection for Y0=2027, notwithstanding the increase in total debt - absent a return to ZIRP. |
| `extraSpread` | 0 | M | Stress overlay on `r_d`. |
| `existingDebt` | 3450 | S | French sovereign debt at Y0 = 2027. INSEE 2024 = 3,200 Md€; projected forward at the historical 2.5%/yr nominal growth implied by 2024 trajectory and 2025 budget (which already showed slippage). Implementer should verify against INSEE data closer to deployment date. |
| `baseGDP` | 3000 | S | French nominal GDP at Y0 = 2027. INSEE 2024 = 2,850 Md€; projected forward at ~1.7%/yr nominal trend. |
| `R0` | 18.0 | S | Direct-right retiree count (millions) at Y0 = 2027. DREES Édition 2025 reports 17.2M direct rights at end-2023 (excluding survivors-only), growing at +1.2%/yr (~+200k/yr); projected to ~18.0M at end-2026. **Scope: direct-rights only.** Survivors-only retirees (~900k in 2023, projected ~960k at Y0) are *not* included here, but their pension cost *is* included in `E0`. The Équinoxe brackets calculation in §5.5 eq (18) operates on direct-rights only, so `R0` is used there; the legacyExp scaling in §5.6 eq (25) is on `legacyRetirees(t)` derived from `retireeIdx` which is itself anchored to `R0` — see §10.14 for the consistency note. |

### 3.2 Workforce & contributions

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `W0` | 1320 | S | Masse salariale brute privée at Y0 = 2027. INSEE 2024 = 1,250 Md€; projected forward at observed 2024–2025 nominal wage-bill growth ~1.85%/yr. |
| `τ_s` | 0.113 | S | Salarié contribution rate (CNAV+Agirc-Arrco). |
| `τ_e` | 0.165 | S | Employeur contribution rate (équivalent total). |
| `phiF` | 0 | M | Employer floor to capitalisation. 0 = full waterfall. |
| `employmentRate0` | 0.69 | S | INSEE 2024 taux d'emploi 15–64. |
| `employmentRateTarget` | 0.76 | C | OECD-median benchmark; UI-tunable for labour reform. |
| `employmentTransitionYears` | 12 | M | Smooth ramp duration. |
| `deltaTauxPatronal` | 0 | M | Optional employer-rate cut. |

### 3.3 Retirement age (NEW)

See §5.4 for full mechanics, §6.7 for invariants, §10.7 for implementation pitfalls.

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `retirementAgeBase` | 64 | S | Effective retirement age post 2023 reform. |
| `retirementAgeMode` | `'fixed'` | M | Either `'fixed'` or `'indexed'`. |
| `retirementAgeFloor` | 60 | M | Hard floor in 2027 enforced regardless of mode. |
| `retirementAgeCeil` | 70 | M | Hard ceiling in 2027 enforced regardless of mode. |
| `lifeExpAt65_Y0` | 21.82 | S | INSEE 2024 mean was (19.7 + 23.4) / 2 = 21.55; projected forward 3 years to Y0=2027 at the COR per-decade rate gives 21.55 + 0.3 × 0.91 ≈ 21.82. **Reference value for indexation. Not user-tunable.** Rename and recompute if Y0 changes. |
| `lifeExpAt65_per_decade` | 0.91 | S | COR June 2025, central scenario, gain at age 65 over 2024–2070 ≈ 4.2 years over 4.6 decades. |

Hardcoded constant (not a parameter): `LIFE_EXP_INDEXATION_FRACTION = 0.5`. Half of life-expectancy gains flow to retirement age, half to retirement duration. Modelled on Swedish/Italian NDC indexation logic. **Implementers: do not expose this as a parameter and do not change it.** (v1.1 candidate for exposure — see §10.13.) 

### 3.4 HLM & housing

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `U0` | 5.3 | S | Number of HLM units (millions), USH 2024. |
| `P0` | 175 | S | Average market price per unit (k€), DGALN 2024. |
| `Pbook` | 45 | S | Average book value per unit (k€), Caisse des Dépôts. |
| `ρ` | 0.05 | M | Annual liquidation rate (5%/yr); high but politically feasible. |
| `g_h` | 0.015 | S | Real house-price growth, 1995–2019 average. |
| `T_hlm` | 20 | M | Programme duration (smooth taper last 5 years). |
| `hlmDiscount` | true | M | Toggle volume-dependent price discount. |
| `δ` | 0.3 | C | Volume discount per unit-traded-baseline ratio. |
| `baselineTransactions` | 850000 | S | Annual French housing transactions, FNAIM 2024. |
| `constructionMultiplier` | 1.0 | M | Housing-supply liberalisation channel; >1 = liberalisation. |

### 3.5 Pension expenditure & Équinoxe

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `E0` | 390 | S | All-régime pension expenditure (Md€/yr) at Y0 = 2027. DREES Édition 2025 reports 13.1% of GDP in 2023 (~370 Md€). At Y0=2027 with `baseGDP = 3000` and pension expenditure share roughly stable at 13% pre-reform, gives ~390 Md€. **Scope: all retirees (direct-right + survivors-only)**, consistent with how DREES reports pension expenditure. The per-direct-retiree implied pension is `E0 × 0.89 / R0 / 12` ≈ 1,610 €/month, broadly aligning with the 2023 DREES average of 1,680 €/month after modest real change. |
| `useEquinoxe` | true | M | Master toggle for Équinoxe rebalancing. UI-visible. |
| `equinoxePhasing` | `'immediate'` | M | UI-hidden expert option. See §5.5 phasing modes. |
| `S0_irDeduction` | 5 | S | Abolition of 10% IR pension deduction (Contre-Budget 2026). |
| `S0_csg` | 5 | S | Restoration of full-rate CSG/CRDS on top brackets (Contre-Budget 2026). |

### 3.6 Capitalisation routing

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `enableCapi` | true | M | Master toggle for capitalisation channel. |
| `cutoffAge` | 50 | M | Maximum age in 2027 enrolled in capi system. `null` = universal. |
| `α` | 1.0 | M | Surplus fraction directed to debt repayment. |
| `λ` | 0.30 | M | Transition levy rate on capi inflows. |
| `Tlambda` | 15 | M | Year levy activates (smoothed). |
| `capiAssetShareSteadyState` | 0.35 | C | **New in v1.0a.** Long-run share of aggregate capi pot `K_t` notionally owned by current retirees rather than still-accumulating workers. Used in eq (53a) to scale the per-individual annuity rate when applied to the aggregate pot. The 0.35 anchor reflects the actuarial steady-state of a mature DC system (Australia super: ~30%; Chile AFP: ~35–40%; UK DC: ~30–35% at maturity) where active workers outnumber retirees roughly 2:1 and have higher average balances. The 30-year smoothstep ramp from 0 at `T_capi_start` reflects how long it takes the system to reach this steady state; before then, the ratio is mechanically smaller because accumulated worker balances dwarf small retiree balances. **Without this scaling, the model expropriates worker savings to inflate annuities for early retirees, masking the transition's fiscal cost entirely.** v1.1 should consider replacing this static-plus-ramp parameter with explicit retiree-vs-worker pot tracking (see §10.13). |

### 3.7 Endogenous rate premium

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `rpThreshold1` | 150 | C | First debt/GDP threshold (no premium below). |
| `rpSlope1` | 0.0002 | C | Slope 150–200% (2 bps/pp). |
| `rpThreshold2` | 200 | C | Second threshold. |
| `rpSlope2` | 0.0004 | C | Slope 200–300% (4 bps/pp). |
| `rpThreshold3` | 300 | C | Third threshold (crisis regime). |
| `rpSlope3` | 0.0010 | C | Slope >300% (10 bps/pp). |
| `r_d_cap` | 0.20 | M | Hard ceiling. Beyond this, sovereign is market-locked-out and model no longer applies. |

### 3.8 GE penalty

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `geKneeRatio` | 2.0 | M | Capi/GDP ratio at which penalty kicks in. Below this, no penalty (Norway GPFG precedent: sustains >2× GDP without obvious return compression). |
| `geFloorRatio` | 4.0 | M | Capi/GDP ratio at which `r_c → 0`. Linear scaling between knee and floor. |

### 3.9 Other

| Symbol | Default | Kind | Source / rationale |
|---|---|---|---|
| `F0` | 340 | C | Initial legacy fund balance: CDC proprietary (220) + FRR (~36) + Agirc-Arrco (~85) reserves. Md€. |
| `A0` | 7.0 | C | Fiscal abatement recovery (Md€/yr Year 0). |
| `demoProfile` | `'cor_central'` | M | One of the three profiles in §7. |

---

## 4. Demographic profiles

Each profile drives **two** index trajectories:

- `retireeIdx(t)`: total retiree headcount index, anchored at 1.0 in 2027, peaks at `peakMult` at year `peakT`, plateaus at `longRunMult`.
- `activePopFactor(t)`: working-age-and-active population index, linearly interpolated between anchor points `[t_i, factor_i]`.

| Profile | `peakMult` | `longRunMult` | `peakT` | `activePopAnchors` |
|---|---|---|---|---|
| `cor_central` | 1.30 | 1.25 | 22 | `[(0,1.00), (14,1.00), (29,0.96), (44,0.90), (70,0.86)]` |
| `realistic` | 1.40 | 1.35 | 22 | `[(0,1.00), (14,0.97), (29,0.90), (44,0.81), (70,0.75)]` |
| `reformed` | 1.30 | 1.25 | 22 | `[(0,1.00), (14,1.02), (29,1.05), (44,1.06), (70,1.04)]` |

Profile properties (informational, computed from the anchors above):

| Profile | Dep. ratio change 2027→2070 | Use |
|---|---|---|
| `cor_central` | +42% (vs COR central +48%) | Default; INSEE 2022 active-pop adjusted for post-2022 fertility undershoot |
| `realistic` | +70% | TFR ≤1.65 sustained, no counter-reform; pessimistic but plausible |
| `reformed` | +21% | TFR 1.9, migration +120k/yr, effective retirement → 67 |

The retiree-headcount kernel is **parametric** (smoothstep), not actuarial — flagged as the highest-priority limitation. See §7 and §10.4.

---

## 5. Yearly equations (numbered, in evaluation order)

Each year `t = 0..N-1`:

### 5.1 Growth factors

```
w_n = π + w_r + π × w_r            # Fisher exact            (1)
ι   = min(w_n, π)                  # pension index cap       (2)
r_{f,portfolio,n} = (1 + r_f_portfolio)(1 + π) - 1            (3)
Ω_t = (1 + w_n)^t                  # nominal wage factor     (4)
I_t = (1 + ι)^t                    # pension index factor    (5)
H_t = ((1 + g_h_eff)(1 + π))^t     # house price factor      (6)

g_h_eff = max(0, g_h - 1.6 × (cm - 1) × 0.01)               (6a)
δ_eff   = δ × clamp(2 - cm, 0.3, 1.7)                       (6b)
```

`cm` is `constructionMultiplier`. (6a) and (6b) couple housing-supply liberalisation to price growth and HLM volume discount.

### 5.2 Demographic indices

```
demo_rampUp(t)   = S(t; 0, peakT) × (peakMult - 1)          (7a)
demo_decline(t)  = S(t; peakT, 70) × (peakMult - longRunMult) (7b)
retireeIdx(t)    = 1 + demo_rampUp(t) - demo_decline(t)     (7c)
activePopFactor(t) = piecewise-linear interp(activePopAnchors, t) (7d)
cohIdx(t)        = 1 - S(t; 0, 45)   # legacy cohort survival share (7e)
```

### 5.3 Wage bill & contributions

```
empRateNow(t)     = empRate0 + S(t; 0, empTransYrs) × (empRateTarget - empRate0) (8a)
empFactor(t)      = empRateNow(t) / empRate0                                     (8b)
W_t               = W0 × Ω_t × empFactor(t) × activePopFactor(t)                (9)

τ_e_eff           = max(0, τ_e - deltaTauxPatronal)
C_s_t             = W_t × τ_s                                                   (10)
C_e_t             = W_t × τ_e_eff                                               (11)
```

### 5.4 Retirement age & cohort routing

This section formalises the retirement-age parameters. **Implementers: see §6.7 (invariants) and §10.7 (pitfalls) before coding.**

```
# Retirement-age trajectory at year t
if retirementAgeMode == 'fixed':
    A_R(t) = retirementAgeBase
elif retirementAgeMode == 'indexed':
    LE65_t = lifeExpAt65_Y0 + (t / 10) × lifeExpAt65_per_decade            (12a)
    ΔLE_t  = LE65_t - lifeExpAt65_Y0                                       (12b)
    A_R(t) = retirementAgeBase + ΔLE_t × LIFE_EXP_INDEXATION_FRACTION       (12c)

A_R(t) = clamp(A_R(t), retirementAgeFloor, retirementAgeCeil)               (12d)
```

Equation (12c) interpretation: the indexed retirement age rises by half the gain in life expectancy at 65, mirroring the Swedish/Italian NDC indexation logic. Half — not full — keeps the share of life spent in retirement increasing modestly. `LIFE_EXP_INDEXATION_FRACTION = 0.5` is hardcoded; see §3.3.

`A_R(t)` is **real-valued**, not integer. Round only for UI display.

```
# Routing is anchored to baseline expectations to preserve continuous boundaries
# and avoid time-dependent denominators that would warp the cohort split.
T_career_base     = retirementAgeBase - 22                                   (13)
T_capi_start      = (cutoffAge == null) ? 0 : max(0, retirementAgeBase - cutoffAge) (14)
```

Equation (14) interpretation: the first capi-routed cohort retires when their age in 2027 (= `cutoffAge`) plus elapsed years equals the **baseline** retirement age. So `t = retirementAgeBase - cutoffAge` is the year the first capi cohort retires. Indexation of retirement age (eq 12c) shifts when *all* cohorts retire but does not retroactively rewrite the cohort transition rule.

Worker share routing (`σ_capi(t)` = fraction of `C_s_t` flowing to capitalisation):

```
if not enableCapi:
    σ_capi(t) = 0
elif cutoffAge == null:
    σ_capi(t) = 1
else:
    σ_capi(t) = clamp((cutoffAge - 22 + t) / T_career_base, 0, 1)            (15)

C_s_capi_t = C_s_t × σ_capi(t)                                              (16)
C_s_payg_t = C_s_t × (1 - σ_capi(t))                                        (17)
```

### 5.5 Équinoxe pension reduction (REVISED v1.0a)

When `useEquinoxe = true`, three components apply jointly, all subject to the same time-phasing factor. **v1.0a separates the three components by application scope**, because they correspond to distinct policy mechanisms:

- **Components 1 & 2 — Benefit-side reductions** (`S0_brackets` from progressive bracket cut + `S0_irDeduction` from abolition of the 10% IR deduction): apply to the legacy pension benefit only. Capi pensions are excluded because they are a different pension product not subject to legacy-régime indexation, deduction, or progressive curve.
- **Component 3 — Tax-side restoration** (`S0_csg` from full-rate CSG/CRDS): applies to all pension income including capi. CSG is a tax on retirement income, not a benefit-side reduction.

In v1.0 all three components were lumped into a single `E0_net_t` applied to legacy retirees only, leaving capi retirees untaxed. This was directionally pessimistic for the legacy expenditure but understated total state revenue. v1.0a separates the scopes:

```
# Component 1: progressive bracket reduction (DREES integral)
# Scope: legacy retirees only (benefit-side reduction).
S0_brackets_t = ∑_d  (legacyRetirees(t) × R0 / 10) × (∫ r(p) × p dp / width_d) × 12 / 1e3   (18)
# where r(p) is the Équinoxe step-rate function in (18a),
# legacyRetirees(t) is the legacy-retiree headcount index from §5.6.

r(p) = 0       if p ≤ 1800 €/mo                                              (18a)
     = 0.001  if 1800 < p ≤ 2000
     = 0.004  if 2000 < p ≤ 2500
     = 0.041  if 2500 < p ≤ 3000
     = 0.10   if 3000 < p ≤ 4000
     = 0.20   if p > 4000 (hard cap)

# Component 2: scaled IR-deduction abolition.
# Scope: legacy retirees only (benefit-side, applied via the same integral).
S0_irDeduction_t = S0_irDeduction × legacyRetirees(t)                        (18b)

# Component 3: CSG/CRDS restoration.
# Scope: all retirees including capi (tax-side, applied via gross income).
S0_csg_t      = S0_csg × retireeIdx(t)                                       (18c)

# Phasing applies uniformly to all three components.
phaseFactor_t = depends on equinoxePhasing (modes below)                     (20)

# Apply by scope:
# - Benefit-side savings reduce per-retiree legacy expenditure
S0_legacy_t   = (S0_brackets_t + S0_irDeduction_t) × phaseFactor_t           (21a)
E0_legacy_t   = E0 - S0_legacy_t / max(legacyRetirees(t), 1e-9)              (21b)
# (E0_legacy_t is the per-retiree-equivalent net legacy pension level)

# - Tax-side savings flow into the legacy fund as additional revenue stream
S0_csg_revenue_t = S0_csg_t × phaseFactor_t                                  (22)
# This revenue is added to the non-employer-net flows in §5.9 eq (38).
```

Note: equation (24) for `legacyExp_t` in §5.6 must use `E0_legacy_t` (not the v1.0 `E0_net_t`). Equation (38) for `nonEmplrNet_t` must add `S0_csg_revenue_t`.

The DREES bracket integral in (18) is computed numerically with 50 integration steps per decile (uniform-density assumption within each decile). DREES 2022 decile bounds (€/month) in §8.

`equinoxePhasing` is **hidden in an expert menu**; non-expert users see only the `useEquinoxe` Y/N toggle, which when `Y` selects `phaseFactor_t = 1` (immediate full implementation of all three components — bracket reductions, IR-deduction abolition, CSG/CRDS restoration).

Phasing modes (expert menu only):
- `'immediate'`: `phaseFactor_t = 1` for all `t`.
- `'phased-5y'`: `phaseFactor_t = S(t; 0, 5)`.
- `'phased-10y'`: `phaseFactor_t = S(t; 0, 10)`.
- `'partial-50'`: `phaseFactor_t = 0.5`.
- `'partial-75'`: `phaseFactor_t = 0.75`.

### 5.6 Retirees split

```
capiRampSpan      = (cutoffAge == null) ? max(5, retirementAgeBase - 22) : max(5, cutoffAge - 22)
capiActivation(t) = enableCapi ? S(t; T_capi_start, T_capi_start + capiRampSpan) : 0
capiRetirees(t)   = (1 - cohIdx(t)) × retireeIdx(t) × capiActivation(t)     (23)
legacyRetirees(t) = retireeIdx(t) - capiRetirees(t)                         (24)
legacyExp_t       = max(0, E0_legacy_t × legacyRetirees(t) × I_t)            (25)
```

### 5.7 HLM proceeds

```
U_t           = U0 × (1 - ρ)^t            # remaining stock at start of year t (26)
ΔU_t          = U_t × ρ = U0 × (1 - ρ)^t × ρ                                 (27)
units_sold    = ΔU_t × 1e6                # actual count

# Conservation invariant: U_{t+1} = U_t - ΔU_t. Verify in tests.
# v1.0a fix: v1.0 had a piecewise definition `(t==0) ? U0×ρ : U0×(1-ρ)^(t-1)×ρ`
# which forced ΔU_1 to equal ΔU_0 (both = U0×ρ), violating mass conservation.
# The uniform geometric form is correct and obvious in retrospect.

priceDiscount_t = hlmDiscount AND δ_eff > 0
                  ? min(0.30, δ_eff × units_sold / baselineTransactions)
                  : 0                                                       (28)

P_eff_t       = P0 × H_t × (1 - priceDiscount_t)                            (29)
gain_t        = max(0, P_eff_t - Pbook)
hlmActive(t)  = 1 - S(t; T_hlm - 5, T_hlm)
H_t_proceeds  = ΔU_t × gain_t × 0.95 × hlmActive(t)                         (30)
```

### 5.8 Endogenous borrowing rate

```
GDP_t           = baseGDP × Ω_t × empFactor(t) × activePopFactor(t)         (31)
# Baseline debt tracks GDP growth to isolate the pure transition-debt effect:
# absent reform, the existing debt-to-GDP ratio is held constant.
D_ext_t         = existingDebt × (GDP_t / baseGDP)                          (32)
debtRatio_t     = (D_ext_t + D_t) / GDP_t × 100                             (33)
# Note: (33) reduces to (existingDebt/baseGDP + D_t/GDP_t) × 100, since the
# baseline debt-to-GDP component is by construction constant at the 2027 level
# (existingDebt/baseGDP × 100 ≈ 112%).

# Piecewise-linear premium
if debtRatio_t ≤ rpThreshold1: premium = 0
elif debtRatio_t ≤ rpThreshold2:
    premium = (debtRatio_t - rpThreshold1) × rpSlope1
elif debtRatio_t ≤ rpThreshold3:
    premium = (rpThreshold2 - rpThreshold1) × rpSlope1
            + (debtRatio_t - rpThreshold2) × rpSlope2
else:
    premium = (rpThreshold2 - rpThreshold1) × rpSlope1
            + (rpThreshold3 - rpThreshold2) × rpSlope2
            + (debtRatio_t - rpThreshold3) × rpSlope3

r_d(t)          = min(r_d_base + premium + extraSpread, r_d_cap)            (34)
debtInterest_t  = D_t × r_d(t)                                              (35)
```

### 5.9 Cash flow & employer waterfall

```
fundReturn_t    = F_t × r_{f,portfolio,n}                                    (36)
abatement_t     = A0 × Ω_t × empFactor(t) × activePopFactor(t)              (37)

nonEmplrNet_t   = fundReturn_t + H_t_proceeds + abatement_t
                  + C_s_payg_t + S0_csg_revenue_t - debtInterest_t           (38)
# v1.0a: S0_csg_revenue_t added — CSG/CRDS restoration is a tax-side revenue
# stream applied to ALL retiree pension income (legacy + capi), unlike the
# benefit-side reductions in (21a)/(21b) which apply only to legacy. See §5.5.
deficit_t       = legacyExp_t - nonEmplrNet_t                               (39)
emplrAvail_t    = C_e_t × (1 - phiF)                                        (40)

# Employer waterfall
if deficit_t ≤ 0:
    emplrToLeg_t = 0;          emplrToCap_t = C_e_t
elif deficit_t ≤ emplrAvail_t:
    emplrToLeg_t = deficit_t;  emplrToCap_t = C_e_t - deficit_t
else:
    emplrToLeg_t = emplrAvail_t; emplrToCap_t = C_e_t × phiF

netFlow_t       = nonEmplrNet_t + emplrToLeg_t - legacyExp_t                (41)
```

**On "surplus":** the model has two distinct surplus concepts. `pre_employer_surplus_t = -deficit_t = nonEmplrNet_t - legacyExp_t` determines whether the employer waterfall is triggered (positive: employer money flows entirely to capi; negative: employer fills the gap). `post_everything_surplus_t = netFlow_t` determines whether the system repays debt (positive) or borrows (negative). Both are signed quantities.

### 5.10 Borrow/repay

```
if netFlow_t < 0:
    borrowed_t = -netFlow_t
    D_t ← D_t + borrowed_t                                                  (42)
else:
    repaid_t = min(α × netFlow_t, D_t)
    D_t ← D_t - repaid_t
    F_t ← F_t + (netFlow_t - repaid_t)                                      (43)
```

### 5.11 Transition levy (smoothed)

```
T_λ_eff         = max(Tlambda, T_capi_start(t))
levyActivation  = S(t; T_λ_eff - 1, T_λ_eff + 1)
levyPhaseOut    = S(D_t / GDP_t; 0, 0.05)
levyFactor      = levyActivation × levyPhaseOut

grossLevy_t     = levyFactor × λ × (C_s_capi_t + emplrToCap_t)
levy_t          = min(grossLevy_t, D_t)
D_t ← max(0, D_t - levy_t)                                                  (44)
netCapiFlow_t   = C_s_capi_t + emplrToCap_t - levy_t                        (45)
```

### 5.12 Capitalisation accumulation & GE penalty

```
capiToGdp_t     = K_t / GDP_t                                               (46)

# GE penalty: kicks in only above geKneeRatio (default 2.0),
# scales linearly to zero at geFloorRatio (default 4.0).
if capiToGdp_t ≤ geKneeRatio:
    gePenalty_t = 1
elif capiToGdp_t ≥ geFloorRatio:
    gePenalty_t = 0
else:
    gePenalty_t = 1 - (capiToGdp_t - geKneeRatio)
                      / (geFloorRatio - geKneeRatio)                        (47)

r_c_eff_t       = r_c × gePenalty_t                                         (48)
r_{c,n}_eff_t   = (1 + r_c_eff_t)(1 + π) - 1                                (49)
K_avail_t       = K_t × (1 + r_{c,n}_eff_t) + netCapiFlow_t                 (50)
```

### 5.13 Capi pension payouts & state guarantee

```
# Floor: demographic replacement
capiPayoutFloor_t = E0 × capiRetirees(t) × I_t                              (51)

# Pot-based: annuity drawdown.
# T_ret(t) is the expected residency in retirement, depending on retirement age
# and life expectancy at that age in year (Y0 + t).
LE_at_A_R(t)    = lifeExpAt65_Y0 + (65 - retirementAgeBase)
                  + (t / 10) × lifeExpAt65_per_decade
                  - (A_R(t) - retirementAgeBase)                             (52a)
T_ret(t)        = max(15, LE_at_A_R(t))                                     (52b)

annuityRate_t   = r_f_annuity > 0.001
                  ? r_f_annuity / (1 - (1 + r_f_annuity)^(-T_ret(t)))
                  : 1 / T_ret(t)

# v1.0a fix: the v1.0 formula `K_t × annuityRate_t × capiRetireeShare_t` applied
# the per-individual annuity rate (~7%) to the entire aggregate pot, scaled by
# the *retiree headcount* share (capiRetirees / retireeIdx). This produced
# absurd payouts because retirees own only a fraction of the pot's total
# assets — the rest belongs to still-accumulating workers. The expropriation
# masked the transition's fiscal cost entirely (cumulative shortfall = 0
# under v1.0 default). The asset-share formulation below corrects this.
#
# capiAssetShare_t is the share of K_t notionally owned by current retirees,
# rather than the headcount share. It ramps from 0 (no retirees yet on capi
# at t=0) toward a steady-state plateau as the system matures. Smoothstep
# from T_capi_start to T_capi_start + 30 years to reach the plateau is a
# rough proxy for the time it takes for workers' accumulated balances to
# reach actuarial steady-state.
capiAssetShare_t  = smoothstep(t, T_capi_start, T_capi_start + 30)
                    × capiAssetShareSteadyState                               (53a)
potBasedPayout_t  = K_t × annuityRate_t × capiAssetShare_t                   (53)
capiPayoutDesired_t = max(capiPayoutFloor_t, potBasedPayout_t)              (54)

# State guarantee
shortfall_t      = max(0, capiPayoutDesired_t - K_avail_t)
capiPayout_t     = capiPayoutDesired_t

if shortfall_t > 0:
    D_t ← D_t + shortfall_t   # state borrows to cover                     (55)
    borrowed_t ← borrowed_t + shortfall_t

CK_t ← CK_t + shortfall_t                                                   (56)
K_t ← max(0, K_avail_t - capiPayout_t)                                      (57)
```

Equation (52a) interpretation: starting from `lifeExpAt65_Y0 = 21.82` years (LE at age 65 in Y0=2027, projected from INSEE 2024), shift the baseline to retirement age (`+ 65 - retirementAgeBase` = `+1` for default `retirementAgeBase = 64`, so baseline LE at age 64 at Y0 is 22.82 years), then add COR's projected gain at age 65 over elapsed time, and subtract the retirement-age rise from baseline. The latter assumes LE gains at any age 60–70 are roughly equal to LE gains at age 65 — approximately true under COR's central scenario, where most gains come from reduced old-age mortality distributed across the late-60s to 80s.

The 15-year floor in (52b) prevents annuity-rate explosion when retirement age approaches life expectancy. It also means the model becomes increasingly conservative if `retirementAgeMode = 'indexed'` is run for many decades — `T_ret(t)` saturates at 15 for very long horizons rather than tracking some exotic upward trajectory.

Pricing the annuity at `r_f_annuity` rather than `r_c_eff_t`: the capi pot invests at risky `r_c` during accumulation, but at retirement the retiree wants an inflation-linked annuity, which must be priced off the rate at which the guarantor can actually hedge. Using `r_f_annuity` (≈ OATi yield, 1.5% real) rather than the diversified-portfolio yield `r_f_portfolio` (4.5% real) reflects that an annuity is a duration-matched obligation, not a risky asset. v1.0a separates the two rates explicitly because v1.0 collapsed them under a single symbol `r_f`, which created a pricing arbitrage where the Legacy Fund's portfolio yield exceeded the cost of new sovereign debt indefinitely. Under the GE penalty regime (where `r_c_eff → 0`), the *pot accumulation* slows but the *annuity rate* stays stable — making payouts a direct function of pot size rather than amplifying pot stress through pricing.

> **v1.2 upgrade flag — annuity structure.** The current single-rate-priced annuity is the simplest defensible model but not the most realistic. A v1.2 upgrade should consider a "minimum guaranteed payout + participation" structure, where the retiree receives:
> 1. A minimum inflation-linked annuity priced at `r_f_annuity` (guaranteed by the state).
> 2. A participation bonus equal to a share of (`r_c` − `r_f_annuity`) × `K_t` paid annually when realised investment returns exceed the risk-free rate.
> This better reflects how real-world participating annuities (e.g., French *contrats euros* with PB participation; CDPQ Canadian retirement income product) work, makes the upside of risky investment visible to retirees rather than absorbed by the guarantor, and reduces the long-tail moral hazard of the state guarantee since shortfalls would only trigger if returns fall below `r_f_annuity`. Implementation requires distinguishing two state variables (guaranteed obligation vs participation reserve) and choosing a smoothing rule for the participation share.

### 5.14 Diagnostics

```
spread_t        = r_f_portfolio - (r_d(t) - π)                              (58)
CI_t ← CI_(t-1) + debtInterest_t                                            (59)

# NPV-of-flows tracking (time-varying discount)
cumDF_t ← cumDF_(t-1) / (1 + r_d(t))   # cumDF_(-1) = 1 by convention
pvLegacyExp_t  = legacyExp_t × cumDF_t
pvCapiPayout_t = capiPayout_t × cumDF_t
pvLegacyCum_t   ← pvLegacyCum_(t-1) + pvLegacyExp_t
pvCapiPayoutCum_t ← pvCapiPayoutCum_(t-1) + pvCapiPayout_t                 (60)
```

---

## 6. Invariants & edge cases

These conditions **must hold at every `t`**. Implementations should assert them in test mode.

### 6.1 Conservation
- `legacyRetirees(t) + capiRetirees(t) ≡ retireeIdx(t)` exactly.
- `C_s_capi_t + C_s_payg_t ≡ C_s_t` exactly.
- `emplrToLeg_t + emplrToCap_t ≡ C_e_t × (1 - phiF) + C_e_t × phiF = C_e_t` (when waterfall doesn't truncate due to `deficit_t > emplrAvail_t`).
- **HLM mass conservation:** `U_{t+1} ≡ U_t - ΔU_t` exactly. Equivalently, `U_t ≡ U0 × (1 - ρ)^t` and `ΔU_t ≡ U_t × ρ`. The remaining stock at any year equals the original stock minus all units sold to date, with no double-counting. **New v1.0a invariant** added because v1.0 had an off-by-one in eq (27) that violated this.

### 6.2 Non-negativity
- All stocks (`F_t`, `K_t`, `D_t`, `D^{ext}_t`) ≥ 0.
- All flows in §5 ≥ 0 except `netFlow_t`, `spread_t`, and the signed quantity `pre_employer_surplus_t = -deficit_t`.

### 6.3 Boundaries
- `0 ≤ σ_capi(t) ≤ 1`.
- `0 ≤ capiActivation(t) ≤ 1`.
- `r_d(t) ≤ r_d_cap = 0.20`.
- `gePenalty_t ∈ [0, 1]`.

### 6.4 Continuity
- All transitions involving smoothstep are C¹-continuous (slope and value match at boundaries).
- Phasing factor `phaseFactor_t` is C¹-continuous in `t` for `'phased-5y'` and `'phased-10y'`.

### 6.5 NPV consistency
- `cumDF_t` is monotonically non-increasing.
- `pvLegacyCum_t = pvLegacyCum_(t-1) + legacyExp_t × cumDF_t`.

### 6.6 GE penalty boundary
- `gePenalty_t` is exactly 1 at `capiToGdp_t = geKneeRatio`.
- `gePenalty_t` is exactly 0 at `capiToGdp_t = geFloorRatio`.
- `gePenalty_t` is C⁰ but not C¹ at the knee and floor (intentional — rationale is empirical clarity over mathematical elegance).

### 6.7 Retirement-age invariants
- For `mode='fixed'`: `A_R(t)` is constant; `T_career(t)` and `T_capi_start(t)` are constant.
- For `mode='indexed'`: `A_R(t)` is monotonically non-decreasing in `t` (life expectancy never decreases under COR central trajectory).
- `T_career(t) ≥ 38` (corresponds to floor `retirementAgeFloor = 60` minus 22) — implementers should add this assertion.
- `T_capi_start(t) ≥ 0` always.
- `T_ret(t) ≥ 15` — equation (52b) floor.
- Existing 2027 retirees are **never** affected by retirement-age changes: they appear in `legacyRetirees(0)` and decay via `cohIdx(t)` only.
- Cohort kernel parameters (`peakT`, `peakMult`) are **not** rescaled by retirement age in v1.0 (limitation noted in §10.4).

---

## 7. Demographic kernel notes

The retiree-headcount kernel (eq 7a–7c) is **parametric**. The smoothstep envelope was chosen for its C¹ continuity and exact `[0, 1]` bounds. The `T_extinct = 45` years is hardcoded; it implies the youngest 2027 retiree (age 60) completely exits the system by age 105. This aligns with the extinction tail of the COR (Conseil d'orientation des retraites) June 2025 central scenario mortality tables, where the survivor mass of 1960s birth cohorts approaches zero past age 105. This prevents legacy expenditures from artificially dragging on for biological impossibilities (e.g., age 130 in the prior 70-year formulation). Actuarial replacement using exact INSEE/COR mortality tables remains a follow-up (§10.4).

`activePopFactor` anchors are calibrated to:
- `cor_central`: COR 2025 central scenario, dependency ratio 2.6 → 1.76 (2024–2070). Yields ~+42% dependency increase (vs COR's +48%; small under-shoot acceptable given parametric retiree kernel).
- `realistic`: TFR ≤1.65 sustained, no further reform; ~+70% dependency increase.
- `reformed`: TFR 1.9, migration +120k/yr, effective retirement → 67; ~+21% dependency increase.

---

## 8. Calibration sources

### 8.1 DREES 2022 pension distribution

| Decile | `lo` (€/mo) | `hi` (€/mo) | `mid` (€/mo) |
|---|---|---|---|
| D1 | 0 | 770 | 520 |
| D2 | 770 | 900 | 833 |
| D3 | 900 | 1010 | 954 |
| D4 | 1010 | 1130 | 1069 |
| D5 | 1130 | 1270 | 1199 |
| D6 | 1270 | 1450 | 1358 |
| D7 | 1450 | 1680 | 1560 |
| D8 | 1680 | 2050 | 1852 |
| D9 | 2050 | 2900 | 2380 |
| D10 | 2900 | 6000 | 4120 |

Source: DREES *Les retraités et les retraites — édition 2023*, table sur la distribution des pensions de droit direct.

### 8.2 Other parameter sources

| Parameter | Source | Value used |
|---|---|---|
| `existingDebt`, `baseGDP`, `R0`, `W0`, `E0` | INSEE/DREES 2024 actuals projected forward to Y0=2027 (per-parameter rationale in §3) | as in §3 |
| `r_f_portfolio` (4.5% real) | OECD historical median for diversified institutional 60/40 mandates | 4.5% real |
| `r_f_annuity` (1.5% real) | French OATi yield range 2024–2026 per Banque de France | 1.5% real |
| `r_c` (4.5% real) | Norway GPFG 1998–2025 (6.64% nominal); Ontario Teachers' 7% nominal target | 4.5% real |
| `lifeExpAt65_Y0` | INSEE Bilan démographique 2024 + 3-year COR projection | 21.55 + 0.3 × 0.91 = 21.82 |
| `lifeExpAt65_per_decade` | COR Rapport juin 2025, central scenario | 0.91 |
| `employmentRate0` | INSEE taux d'emploi 15–64, 2024 | 0.689 → 0.69 |
| `S0_brackets` ≈ 17.7 | Computed from DREES 2022 deciles × R0=18.0M direct-right retirees via eq (18) | — |
| `S0_irDeduction` = 5 | Contre-Budget 2026, suppression abattement IR 10% | 5 |
| `S0_csg` = 5 | Contre-Budget 2026, taux plein CSG/CRDS | 5 |
| `g_h` = 0.015 | INSEE indices Notaires 1995–2019 | 0.015 |
| `r_d_base` = 0.0350 | OAT 10y ~3.4–3.7% in early 2026 per Banque de France / TradingEconomics | 0.035 |
| Construction multiplier coefficient 1.6 | Sénat report on RE2020 surcost | 1.6 |
| `geKneeRatio` = 2.0 | Norway GPFG sustained capi/GDP > 2× without obvious return compression | 2.0 |

### 8.3 Demographic profile calibration

Anchor values selected to match published projections:

- `cor_central`: dependency-ratio change anchored to COR 2025 central scenario (2.6 → 1.76, i.e., +48% increase by 2070). Active-pop anchors yield +42% dep-ratio change — small undershoot acceptable.
- `realistic`: TFR ≤1.65 (current 2024 value 1.62), no further reform on retirement age; rough extrapolation of INSEE low-fertility variant.
- `reformed`: TFR 1.9 recovery, net migration +120k/yr, effective retirement age rising toward 67; mildly positive trajectory accounting for ~25-year delay before fertility reforms flow through to active population.

---

## 9. Out of scope

The model **deliberately excludes**:

- Behavioural responses (retirement-timing decisions beyond `retirementAge*`, labour supply elasticity, precautionary savings).
- Intra-year timing (all flows are end-of-year).
- Regional heterogeneity (single national HLM price, single national labour market).
- Age-specific contribution profiles (treats `τ_s`, `τ_e` as wage-bill-flat).
- Formal vs informal sector.
- Equity-vs-bond return decomposition for `r_c` (treated as portfolio return).
- Pension benefit accrual based on contribution history (uses flat `E0` per retiree). **Implication: raising retirement age moves only timing, not amount. Real systems also adjust accrual; out of scope for v1.0.**
- Demographic feedback loops (TFR responding to economic conditions; mortality responding to retirement age).

§10 flags the most important of these as known v1.0 limitations.

---

## 10. Implementation pitfalls

The retirement-age parameter (§3.3, §5.4) is **the single most error-prone addition** because it couples into many other places. Implementers must verify:

### 10.1 `LIFE_EXP_INDEXATION_FRACTION` is hardcoded
The 0.5 in equation (12c) is not user-tunable in v1.0. If made tunable later, expose as a separate parameter, default 0.5.

### 10.2 `A_R(t)` is real-valued, not integer
Do not round to nearest integer at any point in the simulation loop; round only for UI display. Discretisation introduces artificial step changes in `T_career(t)` and `T_capi_start(t)`.

### 10.3 Cohort routing is anchored to `retirementAgeBase`, not `A_R(t)`
Equations (13)–(15) use `retirementAgeBase` and `T_career_base = retirementAgeBase - 22`, **not** the indexed `A_R(t)`. This is deliberate: making the routing denominator time-varying produced non-monotone `σ_capi(t)` under indexed mode (extending careers reduces the share crossing into capi at any given `t`, which is counterintuitive). Anchoring at the baseline preserves continuous boundaries: indexation shifts when individual cohorts retire (eq 12c) but not how the cohort split is computed.

### 10.4 `T_ret(t)` floor at 15 years
Without it, when retirement age approaches life expectancy at 65 (~86 in 2070), `T_ret → 0` and `annuityRate → ∞`, blowing up `potBasedPayout`.

### 10.5 Existing 2027 retirees are immune to retirement-age changes
They are inside `legacyRetirees(0)` and decay via `cohIdx(t)`. Do not re-route them when retirement age changes.

### 10.6 Cohort kernel (`peakT`, `peakMult`) is independent of `A_R(t)`
Known limitation. With INSEE T60 actuarial replacement, they would become coupled, and that follow-up will need to address how raising retirement age slows down legacy extinction.

### 10.7 Pension benefit level (`E0`) does not respond to retirement age
Intentional (see §9) but means raising retirement age in this model only moves timing, not amount. This is a v1.1 follow-up.

### 10.8 Indexation evaluation cadence: yearly
`A_R(t)` recomputes every year. Do not cache it across years.

### 10.9 Floor and ceiling are hard, not soft
Equation (12d) clamps. If `lifeExpAt65_per_decade` is overridden by a user to an extreme value, `A_R(t)` saturates at the boundary. Log a warning but do not throw.

### 10.10 GE penalty has zero gradient below the knee
By design (§3.8 rationale). Implementers must not "smooth" the knee with a sigmoid; the kink at `geKneeRatio` is intentional.

### 10.11 Equinoxe component sums interact via the phasing factor
`phaseFactor_t` applies to `S0_total = S0_brackets + S0_irDeduction + S0_csg`, not to each component individually. This means with `phaseFactor = 0.5`, all three components are simultaneously at half-strength, not (e.g.) brackets full + others zero.

### 10.12 `D^{ext}_t` and `D_t` enter `debtRatio_t` together
The endogenous rate premium responds to combined sovereign exposure, not to transition debt alone. Implementers passing only `D_t` to the rate calculation will produce far lower interest costs and break the model's main risk channel.

### 10.13 v1.1 parameter wishlist
The following parameters are hardcoded in v1.0 but should become user-tunable in v1.1:
- **`r_c`** — currently 0.045 hardcoded as a default. v1.1 should expose this as a sensitivity slider so users can stress-test against lower realised returns. Anchored ranges: 0.025 (pessimistic) to 0.06 (optimistic, Norway-equivalent).
- **`lifeExpAt65_per_decade`** — currently 0.91 (COR central). v1.1 should expose this as "*Avancées de la science médicale*" with anchored ranges: 0.5 (mortality-improvement deceleration) to 1.5 (significant biotech tailwind). The point is to let users see how robust the system is to demographic-improvement assumptions, not just to demographic-decline assumptions.
- **`LIFE_EXP_INDEXATION_FRACTION`** — currently 0.5 hardcoded. v1.1 should expose with range [0, 1] for users wanting to compare full-indexation (Sweden NDC) vs partial (current default) vs no indexation.
- **`r_d_base`** — currently 0.035 hardcoded. v1.1 should expose for stress-testing different rate environments.

§10.7 (`E0` doesn't respond to retirement age), §10.6 (cohort kernel decoupled from `A_R(t)`), and §10.14 (survivors-only cohort split) are also v1.1 follow-ups but require structural model changes, not just parameter exposure.

### 10.14 `R0` and `E0` are on different scopes (deliberate); survivors-only cohort is implicit
`R0 = 18.0` is **direct-right retirees only** (DREES Édition 2025 scope). `E0 = 390` is **all-régime pension expenditure** including survivors-only pensions (~11% of total per DREES). This asymmetry is deliberate but easy to get wrong:

- The Équinoxe progressive-bracket reduction (eq 18) operates on direct-rights retirees, which is the policy interpretation. Use `R0` directly.
- The legacy expenditure scaling (eq 25) is `E0_legacy_t × legacyRetirees(t) × I_t`, where `legacyRetirees(t)` is in the same units as `retireeIdx(t)` — both anchored to `R0` at t=0. `E0_legacy_t` is the legacy-cohort benefit base after benefit-side Équinoxe deduction (eqs 18b–18c). At t=0, before phasing activates, `E0_legacy_0 = E0 = 390 Md€` — the all-régime expenditure including survivors-only. Tax-side Équinoxe (CSG, eqs 21a/21b/22) does not flow through this term; it appears as revenue in eq 38 via `S0_csg_revenue_t`.

This means `legacyRetirees(t)` is technically a "direct-rights-equivalent" headcount index that *implicitly* includes survivors-only weighted by their pension share. The model treats them as a single block scaled with cohort dynamics. This is a known v1.0 simplification.

**Why it's a simplification.** Survivors-only retirees follow a measurably different demographic trajectory than direct-rights: they are predominantly women (~87% per DREES Édition 2025), entered the survivor-only state at older average ages, and have a different mortality profile than direct-rights retirees of the same age. Their stock evolves on a lag — driven by direct-right deaths, not by working-age cohorts retiring — so collapsing them into a single `legacyRetirees(t)` index produces a small but non-zero error in cohort dynamics, particularly during the demographic peak around 2050 when widow cohorts swell.

**v1.1 fix (flagged for the wishlist).** Split `legacyRetirees(t)` into two indices: `legacyRetirees_direct(t)` and `legacyRetirees_survivors(t)`, each with its own demographic kernel and pension level. Survivors-only kernel would lag the direct-rights kernel by ~10 years (typical age gap between deceased spouse and surviving spouse) and use a faster mortality decay. The Équinoxe brackets would only apply to the direct-rights cohort. Total expenditure = direct-rights × E_direct + survivors × E_survivors.

**Implementer warning:** if you "fix" R0 to be 19M total retirees (direct + survivors) without splitting the cohorts, you create a scope mismatch between the DREES decile bracket weights (which are direct-rights-only) and the retiree count being divided into deciles. This produces visibly wrong `S0_brackets` figures and is a common bug. Don't do it. The right fix is the v1.1 cohort split, not "harmonising" R0.

---

## 11. Regression test harness

The v1.0 implementation must be accompanied by an automated test suite. Minimum coverage:

### 11.1 Unit tests

For each pure function in §5, at least one test asserting the output for a hand-computed input. Specifically:
- Smoothstep `S(x; a, b)`: test `(x=a, S=0)`, `(x=b, S=1)`, `(x=(a+b)/2, S=0.5)`, `(x=a-1, S=0)`, `(x=b+1, S=1)`.
- Equinoxe bracket integral: against a hand-computed value for a single decile.
- Endogenous-rate piecewise function: at all four threshold values.
- Retirement-age indexation: assert `A_R(0) = retirementAgeBase` exactly under `mode='indexed'`.
- GE penalty: assert `gePenalty(geKneeRatio) = 1`, `gePenalty(geFloorRatio) = 0`, `gePenalty(geKneeRatio + ε) ∈ (0, 1)` for small `ε > 0`.

### 11.2 Invariant assertions

Every test run must verify §6 invariants at every `t`. A failed invariant fails the test run regardless of KPI assertions.

### 11.3 Reference-trace tests

The v1.0 implementation produces a canonical KPI table for the default preset (§12, populated post-implementation). The test harness asserts each field matches to within stated tolerance:
- Stocks (`F_t`, `K_t`, `D_t`): ±0.5 Md€ at every `t`.
- Rates (`r_d(t)`, `gePenalty_t`): ±1 bps at every `t`.
- KPIs (`peakDebt`, `totalInterest`, `finalCapiReal`, `debtFreeYear`): ±0.1% of reference value, except `debtFreeYear` which is exact.

Reference traces are produced by checking out a known-good v1.0 commit, running each preset, and committing the resulting CSV to `tests/fixtures/`. Subsequent code changes must either preserve these traces exactly or include a justified update to the fixtures.

### 11.4 Backward-compatibility tests
With the following "v0.11 reproduction" parameter set, the engine must produce outputs identical to the v0.11 reference within numerical precision:
- `retirementAgeMode = 'fixed'`, `retirementAgeBase = 64`
- `geKneeRatio = 0`, `geFloorRatio = 2`
- `S0_irDeduction = 0`, `S0_csg = 0`
- `D_ext_t = existingDebt × (1.027)^t` (override eq 32 to v0.11's exogenous-trajectory form)
- `r_f_portfolio = r_f_annuity = r_c = 0.030`, `F0 = 220`
- `Y0 = 2026`, `lifeExpAt65_Y0 = 21.55`
- Use the v0.11 stage parameter set (cohIdx with T_extinct = 70, not 45)

This guarantees the v1.0a engine is a strict superset of v0.11 behaviour. **Note:** several v1.0/v1.0a changes (45-year extinction, GDP-tracking baseline debt, F0 = 340, `r_f_portfolio = r_c = 0.045` with `r_f_annuity = 0.015`, ΔU geometric form, `capiAssetShare` scaling, Équinoxe component scope split) are intentional model corrections rather than bugs to preserve; the backward-compat test exists to confirm the engine *can* reproduce v0.11 when explicitly forced, not as a default mode.

### 11.5 Property-based tests

Five properties to verify by random parameter sampling (≥1000 draws each):
1. **Conservation:** `legacyRetirees + capiRetirees == retireeIdx` at all `t`.
2. **Boundary:** `r_d(t) ≤ r_d_cap` at all `t`.
3. **Monotonicity:** under `mode='indexed'`, `A_R(t)` non-decreasing.
4. **Backward propagation:** changing `retirementAgeBase` from 64 to 65 must increase `K_T` (terminal capi pot) by a non-negative amount under default macro params.
5. **Stress isolation:** changing `extraSpread` must not affect `gePenalty_t` directly.

### 11.6 Smoke test for built UI

The build pipeline must include a Puppeteer/Playwright check that:
- `#/simulateur` loads without console errors.
- Default preset produces non-zero `peakDebt`.
- All preset selectors switch the displayed KPIs without runtime errors.
- `#/walkthrough` loads all stages without runtime errors.

---

## 12. Reference output

Reserved for post-implementation calibration anchors. After v1.0 is built and the team has agreed the output is correct, populate this section with:

- Default preset KPI table (peak debt, debt-free year, total interest, final capi real, S0, year-by-year stocks at decade markers).
- Each preset's KPI summary.
- The CSV reference traces referenced by §11.3.

Three values that are **invariant under any v1.0 implementation** regardless of recalibration, and that implementations can self-check against immediately:

- `S0_brackets_t=0 ≈ 17.7` Md€/yr (before phasing; under v1.0a, the total Équinoxe effect is split into a time-varying benefit-side reduction `S0_brackets_t` per eqs 18b–18c and a time-varying CSG revenue `S0_csg_revenue_t` per eqs 21a/21b/22 — see §5.5). Year-0 bracket value scales linearly with `R0`; with `R0=18.0` (direct-rights only) vs the v0.11 R0=17.0, expect ~17.7 (= 16.7 × 18.0/17.0). Computed from DREES integral.
- `r_d(0) = r_d_base = 0.035`, because `debtRatio(0) = 3450/3000 × 100 = 115%`, below the 150% threshold (so no premium).
- `cohIdx(0) = 1.0` by construction.

---

**End of spec v1.0a.**