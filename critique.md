# Critique: CDC Legacy Entitlements Fund Model

## Context

This is a structured critique of the CDC Legacy Entitlements Fund model (`CapiModel/cdc_legacy_fund_model.md`), which simulates a transition from France's PAYG pension system to full capitalisation. The critique reviews each major assumption against academic literature and empirical data, adjusted for France's specific institutional context: the highest employer social charges in the OECD, chronic fiscal deficits, debt/GDP at 114%, and pension spending at ~14% of GDP (3rd highest OECD).

**Scope note**: This critique focuses on **economic, financial, and structural** weaknesses — not political feasibility. The model's purpose is to expand the Overton window, and political obstacles are assumed to be surmountable. Critiques are limited to "laws of physics" — market constraints, mathematical identities, empirical parameter calibration, and structural economic dynamics that cannot be legislated away.

Weaknesses are ranked into three tiers: **Fatal Flaws** (any one could invalidate the model's conclusions), **Severe Weaknesses** (materially distort outputs), and **Significant Concerns** (defensible individually, problematic in aggregate).

---

## TIER 1: FATAL FLAWS

### 1. The PAYG→Capitalisation Transition Confronts a Known Economic Identity

**Model's implicit claim**: The transition can be financed by sovereign borrowing and asset sales, with the capitalisation return exceeding the borrowing cost.

**Academic literature**: Breyer (1989) proved that a Pareto-improving PAYG→funded transition is **not generally possible**. The Aaron-Samuelson theorem establishes that the "windfall" given to the first PAYG generation creates an implicit debt that can only be shifted between generations, not eliminated. The model shifts it onto sovereign debt holders — this merely transforms an implicit intergenerational transfer into an explicit one, **with added interest costs** (~2.3 Tn€ cumulative).

**The "double payment" problem is an economic identity, not a political obstacle**: transition-generation workers must simultaneously finance current retirees AND accumulate personal capital. The total resource cost is the same regardless of the financing mechanism — it is simply spread over time with interest. IMF/World Bank research confirms that funded transitions don't reduce overall pension costs; they transform implicit liabilities into explicit debt with transaction costs.

**Scale comparison**: The model proposes redirecting **100% of employee contributions** to capitalisation from Day 1. Sweden — the most cited success — split only 13.5% into a funded pillar. Latvia: 30%. Poland: 37.4%. The model proposes a transition roughly **7x more radical** than the most aggressive real-world precedent, with no theoretical basis for why the economics work at this scale when they struggle at smaller ones.

**The model must demonstrate why its specific mechanism evades a well-established economic identity. It does not.** The viability of the transition depends entirely on the capitalisation return exceeding the borrowing cost by enough to offset the double-payment problem — which leads directly to the next two flaws.

Sources: Breyer (1989), Beetsma & Komada (IZA DP No. 14765), econstor.eu working paper on PAYG-to-funded transitions.

---

### 2. Sovereign Borrowing Rate Ignores Endogenous Credit Risk

**Model assumes**: France borrows at a fixed 3.5% nominal (1.5% real) while adding ~1.5 Tn€ peak new debt.

**Why this is structurally unsound**:
- France's existing debt: **~3.2 Tn€ (114.1% of GDP, Q1 2025)**, 3rd highest in eurozone.
- The model adds ~1.5 Tn€, bringing total toward **~4.7 Tn€ (~170% of GDP)** — this would make France the most indebted large eurozone economy by a wide margin.
- **Fitch has already downgraded France from AA- to A+**; KBRA also downgraded. IMF projects debt/GDP rising to ~130% by 2030 **even without** the model's additional borrowing.
- Debt servicing costs already surging: **€59.3bn in 2026**, up from €36.2bn in 2020.
- The model's viability depends on the spread σ = r_f − (r_d − π). At defaults: σ = 3% − 1.5% = +1.5%. If borrowing rises to 5% nominal (empirically plausible at 170% debt/GDP based on Italian/Greek precedent), **σ → 0 and the financial logic collapses**. At 6%, σ goes negative and debt becomes self-reinforcing.
- Empirical evidence from the eurozone debt crisis (2010–2012) shows that sovereign borrowing costs can gap upward nonlinearly once debt/GDP crosses perceived sustainability thresholds. France at 170% would be well beyond such thresholds.

**The borrowing rate is not a parameter — it is an endogenous variable that responds to the very policy the model proposes.** This is not a political problem; it is market pricing of credit risk that no legislation can override.

Sources: Trading Economics (OAT yields), Fitch/KBRA downgrade reports, IMF debt projections, Euronews (France 2026 outlook).

---

### 3. HLM Liquidation Rate Strains Market Absorption Capacity

**Model assumes (revised)**: 265,000 HLM units sold per year (5% × 5.3M), at €175k average.

**Market physics**:
- France's total annual property transactions: **~780,000–935,000** (2023–2024 data, notaires de France). At 5%/year, 265,000 HLM sales would represent **28–34% of all property transactions in France** — a significant but not catastrophic increase in market volume.
- With strong Île-de-France concentration (where roughly 25–30% of HLM stock is located and market depth is greatest), perhaps ~70–80k of the 265k annual sales would be in IDF, where the deep and liquid property market could plausibly absorb them. The remaining ~185–195k in province is more concerning, as provincial markets are shallower.
- **Price endogeneity remains a concern**: the model uses a fixed €175k starting price with 1.5% real appreciation. At 265k units/year, some price depression is likely, particularly in provincial markets where HLM is concentrated in less desirable locations. The model should incorporate a volume-dependent price discount, perhaps 5–15% below the no-supply-shock counterfactual.
- **Financing constraint**: 265,000 additional mortgage originations per year (at say €140k average mortgage = ~€37 Md in new mortgage lending annually) represents a ~17% increase in French mortgage origination volume. Significant but plausibly absorbable over time, particularly if mortgage rates decline.
- The model correctly applies geometric stock decline (eq. 15), but the **revenue per unit** should also decline with volume — the model holds price exogenous.

**Assessment**: At 5%/year (vs the original 10%), HLM liquidation moves from "physically impossible" to "aggressive but arguably feasible, with price discount". The main residual concern is that the model should apply a volume-dependent price haircut of perhaps 10% to reflect the supply shock, and should distinguish IDF (where prices hold) from province (where they may not). Total proceeds would likely be 15–25% below the model's projection after accounting for this discount.

Sources: [France property transaction volume 2024](https://www.proprietesdecharme.com/en/2024/12/23/volume-of-real-estate-transactions-in-france-2024/), notaires de France market reports, INSEE housing stock data.

---

## TIER 2: SEVERE WEAKNESSES

### 4. Capitalisation Return of 4.5% Real Is Overstated and Ignores Scale Effects

**Model assumes**: 4.5% real return on capitalised assets.

**Evidence**:
- **DMS/UBS Global Investment Returns Yearbook 2025**: Global equities 1900–2024 = 5.2% real, but **ex-US only 4.3%**. Since 2000, global equities real return = **only 3.5%**.
- A diversified 60/40 portfolio — what a prudently managed pension fund would hold — has historically returned **~3.5% real**, not 4.5%. To achieve 4.5%, the fund would need a much heavier equity allocation with correspondingly higher volatility, which creates sequencing risk for a fund that must make pension payments.
- The model itself acknowledges (§6.2) that at GDP-scale (~2.8 Tn€ after ~20 years), general equilibrium feedback would depress equity premia. **This is a critical concession that is then ignored in the base-case projections.**
- Norway's GPFG (~$1.7 Tn) is the world's largest SWF. A French fund approaching 2.8 Tn€ would be **unprecedented in human history**. The academic literature on GE effects at this scale is essentially nonexistent because no such fund has ever existed. The model is extrapolating historical returns calibrated to a world where no such fund existed into a world where it dominates global capital markets.
- The model acknowledges overestimating returns in years 1–5 by 20–30% due to CDC asset illiquidity. This front-loads return overestimation and compounds through reinvestment.

**Impact**: The model's own sensitivity analysis shows the 2% real scenario yields ~40% of the 4.5% pot. A more defensible 3–3.5% assumption would roughly halve the terminal capitalisation stock. Combined with the spread compression from Flaw #2, the transition's entire financial advantage over PAYG may disappear.

Sources: [UBS Global Investment Returns Yearbook 2025](https://www.ubs.com/global/en/investment-bank/insights-and-data/2025/global-investment-returns-yearbook-2025.html), [ECB working paper on SWF market impact](https://www.ecb.europa.eu/pub/pdf/scpops/ecbocp91.pdf), AQR "The Norway Model".

---

### 5. Real Wage Growth of 1.5% Is 2–3x Above Recent French Experience

**Model assumes**: 1.5% real wage growth, driving all contribution revenue projections.

**Evidence**:
- Recent French real wage growth: **~0.5–0.7%/year** ([OECD](https://www.oecd.org/en/publications/oecd-employment-outlook-2025-country-notes_f91531f7-en/france_32a23b25-en.html), [INSEE](https://www.insee.fr/en/statistiques/8628474)).
- Over the past decade, average net salary grew **~0.5%/year** in real terms.
- France's real wage growth is **well below the OECD average** of 2.5%.
- **Structural causes that legislation cannot simply override**: employer social charges at 25–45% of gross salary (highest in OECD at 26.7% of labour costs), France's position near the technological frontier limiting catch-up growth, an ageing workforce reducing average productivity gains, and SMIC indexation compressing the wage distribution.

**The model's own mechanism worsens this**: by maintaining employer contributions at 16.5% (directed first to legacy deficits), it preserves the very cost structure that has historically constrained French wage dynamics. The model assumes the output of a process (wage growth) while maintaining the inputs that have historically suppressed that output.

**Counter-argument the model could make**: if the transition eventually eliminates employer pension charges, this could boost wages long-term. But this relief only comes after the legacy fund is fully wound down (~2060–2065), meaning 35–40 years of suppressed wage growth before any benefit materialises. The model's 55-year horizon barely captures this upside.

**Impact**: If actual growth is 0.7% vs 1.5%, contribution revenues are **~50% lower in real terms** over the projection horizon. This compounds dramatically: over 40 years, cumulative contributions under 0.7% real growth would be roughly 30% lower than under 1.5%.

Sources: [INSEE wage statistics Q2 2025](https://www.insee.fr/en/statistiques/8628474), [OECD Employment Outlook 2025](https://www.oecd.org/en/publications/oecd-employment-outlook-2025-country-notes_f91531f7-en/france_32a23b25-en.html), [OECD Taxing Wages 2025](https://www.oecd.org/content/dam/oecd/en/topics/policy-issues/tax-policy/taxing-wages-brochure.pdf).

---

### 6. Pension Reduction — Equinoxe Progressive Proposal

**Revised model adopts** the Equinoxe progressive taper instead of the original step function:

| Pension bracket | Reduction | Savings (Md€/yr) |
|---|---|---|
| < 1,800€ | None | — |
| > 1,800€ | 0.1% | 0.1 |
| > 2,000€ | 0.4% | 1.1 |
| > 2,500€ | 4.1% | 3.75 |
| > 3,000€ | 10% | 5.75 |
| > 4,000€ | 20% | 9.8 |
| **Total** | | **~20.5** |

Combined with elimination of the 10% tax abatement on pension income (A₀ = 7.0 Md€, already in the model), total fiscal recovery = **~27.5 Md€/year**.

**Assessment**: This progressive design is a significant improvement over the original step function:
- **No notch discontinuity** — the graduated structure avoids the arbitrary cliff-edge at 1.5×SMIC that made the original design vulnerable to constitutional challenge under the principe d'égalité.
- **Higher total savings** — ~20.5 Md€ vs the original 13–16 Md€, because the progressive structure reaches higher cut rates (20%) at the top while protecting lower pensions.
- **More defensible incidence** — the burden falls disproportionately on the top decile (>3,000€/month), which is both economically efficient and distributionally progressive.

**Residual concerns**:
- The 20% cut above 4,000€/month is very aggressive. At this rate, a retiree on 5,000€/month loses 1,000€/month — a substantial nominal reduction. The Equinoxe framing may understate behavioural responses (e.g., early capital withdrawal from Agirc-Arrco supplementary regimes, increased fiscal optimisation).
- The savings estimates appear to be static (no behavioural response). Some erosion should be expected as high-pension retirees adjust.
- The model should clarify whether these cuts apply to gross or net pensions, and whether the brackets are cumulative (marginal rates on each tranche) or flat above each threshold. If flat, the >4,000€ bracket still creates a minor notch at the €4,000 boundary.
- S₀ fixed at Year 0 levels means these savings erode in real terms over time as pensions are indexed — the same issue as the original model.

---

## TIER 3: SIGNIFICANT CONCERNS

### 7. CDC €220 Md Asset Transfer Overstates Accessible Liquidity

- CDC manages >€300bn total, but major holdings (66% of La Poste, infrastructure stakes) are **illiquid strategic participations**.
- The model concedes 20–30% return overestimation in years 1–5 — a significant admission that compounds through reinvestment.
- Book value ≠ realisable value for illiquid participations. If the fund needs to generate cash returns from Day 1 (to help cover legacy expenditure), the illiquid portion generates no usable income despite appearing on the balance sheet.
- A realistic Day 1 "investable" balance may be closer to €150–170 Md€ (liquid/semi-liquid portion), with the remainder only realisable over 5–10 years as participations are wound down.

### 8. Fixed 2% Inflation With No Stochastic Element

- ECB target of 2% is defensible as a long-run central estimate.
- But the **absence of any variance** means the model cannot capture inflation–borrowing rate interactions. French inflation hit 5–6% in 2022–2023.
- Combined with fixed 3.5% nominal borrowing, this bakes in a **permanently stable 1.5% real cost of debt** — unrealistic over a 55-year horizon.
- A debt-financed structure is particularly vulnerable to inflation volatility: rate spikes dramatically increase debt service costs while fund returns may lag (especially on fixed-income holdings).
- This is a **methodological** weakness: the model should present stochastic scenarios or at minimum sensitivity across inflation paths, since the spread σ is directly affected.

### 9. Employer Contribution Structure Creates a Competitiveness Trap

- The model preserves the full 16.5% employer contribution rate, with legacy fund priority.
- This means **zero labour cost relief** during the transition's deficit phase (~20 years).
- In deficit years, **all** employer contributions go to the legacy fund, meaning employers fund pensions for current retirees with no improvement in outcomes for current workers — maintaining the exact incentive structure that makes France's labour costs the highest in the OECD.
- This creates a **feedback loop**: high employer charges → suppressed employment/wages → lower contribution base → larger deficit → more borrowing → higher debt service → more employer contributions needed for legacy. The model does not capture this endogeneity.

### 10. Base Expenditure Understates Actual Pension Costs by ~11%

- Model: E₀ = 307 Md€ vs official DREES total ~345 Md€ (gap: ~38 Md€).
- The gap reflects solidarity minimums, admin costs, and Agirc-Arrco supplementary regimes not captured by decile midpoints.
- An 11% understatement of the starting liability compounds over the full projection.
- France spends ~14% of GDP on pensions (vs OECD average ~9%). COR projects this rising to 14.2–14.3% by 2030. Court of Auditors estimates a €15bn deficit by 2035 and €30bn by 2037. The model's starting point understates a problem that is actively growing.

---

## ADDITIONAL STRUCTURAL WEAKNESSES

### A. Absence of Stochastic/Monte Carlo Analysis
The model presents a **single deterministic path** over 55 years. For a proposal of this magnitude, the absence of probability distributions around outcomes is a serious methodological weakness. Any credible actuarial or financial model would present at minimum base/optimistic/pessimistic scenarios, ideally with Monte Carlo simulation showing confidence intervals around key outputs (peak debt, debt-free year, terminal pot). The current deterministic presentation creates a false sense of precision.

### B. Demographic Assumptions Are Implicit
The model's cohort index (eq. 10) uses a parametric curve rather than actuarial tables. France's old-age dependency ratio is projected to rise from ~36% to >50% by 2060 (INSEE projections). This affects both the contribution base (fewer workers) and expenditure trajectory (more retirees living longer) in ways the parametric curve may not capture. The +18% peak amplitude and 28-year half-life are calibration choices, not empirical derivations.

### C. No Behavioural Response Modelling
The model excludes: retirement timing responses (Gruber-Wise effects), precautionary savings shifts, labour supply effects of maintained high charges, and capital market reactions to sovereign debt accumulation. Each individually could materially alter the trajectory. In particular, the Gruber-Wise literature shows that French workers are highly responsive to retirement incentives — a radical reform would likely shift retirement timing in ways that affect the contribution/expenditure balance.

### D. Governance and Agency Risk at Scale
A fund approaching GDP-scale (~2.8 Tn€) would face governance challenges that are structural, not merely political. Investment mandates at this scale affect asset prices, creating conflicts between the fund's fiduciary duty (maximise returns) and its macro-prudential impact (market distortion). The Norwegian GPFG addresses this through strict rules-based passive indexing and foreign-only investment; the model does not specify what governance framework would apply.

---

## COMPOUNDING INTERACTIONS

The weaknesses above are not independent — they compound:

| Interaction | Effect |
|---|---|
| Overstated returns (4.5% → 3.5%) + understated borrowing (3.5% → 5%+) | Net spread collapses from +3pp to near 0 |
| Overstated wage growth (1.5% → 0.7%) + maintained employer charges | Contribution revenue ~30–50% lower while labour market stagnates |
| HLM proceeds reduced (10%→2% liquidation rate) + higher borrowing needs | Non-contribution income falls by ~80%, requiring more sovereign debt |
| More debt → higher borrowing rates → more debt | Self-reinforcing debt spiral (σ < 0 regime) |
| Expenditure understated by ~11% | Legacy obligations higher than modelled from Day 1 |

**When multiple "moderate" deviations from model assumptions are combined, the model does not merely underperform — it enters a self-reinforcing failure mode where debt grows faster than the fund's ability to service it.**

**Note**: The adoption of the Equinoxe progressive pension cuts (~20.5 Md€ vs original 13–16 Md€) and the 10% abatement elimination (7.0 Md€) **materially strengthens** the model's expenditure side. Total fiscal recovery of ~27.5 Md€/year is a significant improvement. However, this improvement is concentrated on the expenditure side and does not address the revenue-side weaknesses (returns, wage growth, borrowing costs).

A "stress-test" scenario combining r_c = 3.5%, r_d = 4.5%, wage growth = 0.7%, and HLM price discount of 15% would likely show:
- Peak debt higher than 1.5 Tn€
- Debt repayment delayed by 10–15 years
- Terminal capitalisation pot 40–60% smaller than the base case
- But the improved pension cut structure partially offsets these, keeping the model in "delayed but eventual solvency" territory rather than "never repaid"

---

## OVERALL ASSESSMENT

The model is a technically competent simulation that serves its Overton-window purpose well: it demonstrates the **scale** of France's pension liability and the **magnitude** of transition finance required. The mathematical framework is sound and well-documented.

However, its parameter calibration is systematically optimistic relative to empirical data and contains at least three structural flaws (the Breyer impossibility identity, endogenous borrowing costs, and market absorption limits for HLM liquidation) that cannot be assumed away even with unlimited political will.

**The Equinoxe pension cuts and abatement elimination are meaningful improvements** — together recovering ~27.5 Md€/year with a progressive structure that is legally more robust than the original step function. The HLM liquidation at 5%/year moves from "impossible" to "aggressive but arguable" with appropriate price discounts.

**Remaining recommended improvements** to strengthen the model's analytical credibility:
1. **Add stochastic simulation** — Monte Carlo across key parameters (r_c, r_d, π, wage growth) with correlated shocks
2. **Endogenise the borrowing rate** — model r_d as a function of debt/GDP, e.g., r_d = r_d_base + β(D/GDP − threshold)
3. **Apply a volume-dependent price discount to HLM proceeds** — perhaps 10–15% below the no-supply-shock counterfactual, with IDF/province differentiation
4. **Calibrate wage growth to 0.7–1.0%** — consistent with recent French data; show 1.5% as optimistic scenario
5. **Present the capitalisation return at 3.0–3.5% as the base case** — with 4.5% as an optimistic scenario
6. **Clarify Equinoxe bracket mechanics** — confirm whether rates are marginal (on each tranche) or flat above each threshold; specify gross vs net pension basis

These changes would produce more modest but more defensible projections, which paradoxically would strengthen the model's policy argument by making it harder to dismiss.

---

## Key Sources

- [UBS Global Investment Returns Yearbook 2025](https://www.ubs.com/global/en/investment-bank/insights-and-data/2025/global-investment-returns-yearbook-2025.html)
- [OECD Employment Outlook 2025: France](https://www.oecd.org/en/publications/oecd-employment-outlook-2025-country-notes_f91531f7-en/france_32a23b25-en.html)
- [INSEE wage statistics Q2 2025](https://www.insee.fr/en/statistiques/8628474)
- [France 2026 debt outlook (Euronews)](https://www.euronews.com/business/2025/12/18/frances-economic-outlook-for-2026-how-heavy-is-the-debt-burden)
- [Fitch downgrade of France (Fair Observer)](https://www.fairobserver.com/economics/the-french-connection-fitch-downgrades-frances-credit-rating/)
- [DREES social protection expenditure](https://drees.solidarites-sante.gouv.fr/publications-en-anglais/share-gdp-devoted-social-protection-expenditure-rises-again-france-and)
- [ECB: Impact of SWFs on financial markets](https://www.ecb.europa.eu/pub/pdf/scpops/ecbocp91.pdf)
- [Housing Europe: France 2025](https://www.housingeurope.eu/wp-content/uploads/2025/10/france_the_state_of_housing_in_the_eu_2025_digital.pdf)
- [OECD Taxing Wages 2025](https://www.oecd.org/content/dam/oecd/en/topics/policy-issues/tax-policy/taxing-wages-brochure.pdf)
- [PAYG to funded transition working paper (econstor)](https://www.econstor.eu/bitstream/10419/68945/1/686762274.pdf)
- [France property transaction volume 2024](https://www.proprietesdecharme.com/en/2024/12/23/volume-of-real-estate-transactions-in-france-2024/)
- [Cambridge: Report on 125 years of stock returns](https://www.jbs.cam.ac.uk/2025/report-stocks-have-far-outperformed-over-the-past-125-years/)
