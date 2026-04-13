# Operating Theory — CDC Legacy Fund Pension Transition Simulator

## Problem Thesis

France's pension system consumes ~14 % of GDP — 3rd highest in the OECD — with structural deficits projected to worsen as the dependency ratio deteriorates. The political debate is stuck between parametric PAYG reforms (retirement age, contribution rates) that are incremental and unpopular, and a radical transition to capitalisation that mainstream economists consider economically impossible due to the Breyer (1989) "double payment" identity.

This simulator exists to **expand the Overton window** by making the transition's mechanics, costs, and risks transparent and explorable. It does not claim the transition is easy or costless — it quantifies exactly how costly it is and under what conditions it could work.

## Operating Theory

The model implements 34+ coupled equations over a 70-year horizon, tracking three coupled systems: legacy PAYG obligations (declining), sovereign transition debt (rising then falling), and capitalisation pot accumulation (growing).

### Five Key Drivers

1. **Capitalisation return rate (r_c)** — Compounds over 43-year careers; dominant for whether the new system can replace PAYG pensions. 3 % real is defensible; 4.5 % is not at fund scales approaching GDP.

2. **Real wage growth (w_r)** — Drives contribution revenue, GDP growth, and the denominator of all debt ratios. Benefits both sides; net effect is positive for the transition.

3. **Sovereign borrowing rate / spread (σ = r_f − (r_d − π))** — The key solvency indicator. When σ > 0 the transition is self-financing; when σ < 0 a doom loop emerges. The endogenous risk premium (thresholds at 150 %, 200 %, 300 % debt/GDP) is the main source of tail risk.

4. **Legacy cohort extinction timeline (T_pk, T_hl)** — Determines peak debt and transition duration. Faster extinction (via Equinoxe reductions) dramatically reduces total borrowing.

5. **Transition rule (cutoffAge, existingDebtGrowth)** — *New in v2.* Who enrols in capi and how fast the pre-reform debt grows jointly determine the *shape* of the debt trajectory, not just its level. A 50-year cutoff reduces peak debt by ~32–38 % and cumulative interest by ~47 % vs. the universal-immediate switch, because a 16-year "pure-compounding" window lets capi pots grow before the levy takes effect.

### The Core Tension

The model is a race between accumulation (r_c, w_r, capi ramp-up) and obligation (r_d, cohort timeline, pre-reform debt growth). The spread σ summarises this race in a single number. The Breyer critique is acknowledged — the model doesn't claim to evade the double-payment identity, but quantifies the conditions under which the explicit debt path is manageable.

## Strategy

The simulator's value is **pedagogical, not prescriptive**:

1. Make every assumption visible and adjustable (27+ parameters, criticality-graded collapsible sections)
2. Include Monte Carlo stochastic analysis so users see uncertainty, not point estimates
3. Provide presets spanning optimistic to stress scenarios
4. Provide a simplified view (3 presets, 5 sliders, narrative) alongside the expert simulator
5. Document the model fully (`cdc_legacy_fund_model.md`) with bit-exact v1 rétro-compatibility
6. Maintain an honest critique (`critique.md`) that steelmans the objections

Current focus: exposing policy levers that were previously hardcoded (v2 transition rule) while preserving the `Original v5` preset as a bit-exact reproduction anchor. Deployed via Vercel (`capi-model.vercel.app`) from `main`.

## Key Discoveries

- **The spread σ is the single best summary indicator.** All the complexity of the 34 equations collapses to: is the fund earning more than the real cost of its debt?
- **Endogenous borrowing rates are essential.** The v1 fixed-rate model was the most important critique fix. At 170 %+ debt/GDP, Italian/Greek precedent suggests 5 %+ nominal rates are plausible.
- **The existing debt had to be un-frozen.** v1 kept the pre-reform 3,200 Md€ constant for 70 years, so the debt/GDP ratio mechanically collapsed and the endogenous rate never activated. Growing it at the nominal wage rate (or faster in stress) is what makes the risk premium meaningful.
- **Capitalisation return sensitivity is extreme.** Terminal pot at r_c = 2 % is ~40 % of the pot at r_c = 4.5 %. General-equilibrium feedback on r_c at GDP scale means optimistic returns are self-defeating.
- **The Equinoxe progressive reduction curve** generates ~26 Md€/year in savings vs. a step function — a meaningful lever for peak-debt reduction.
- **Cohort-phased transition dominates the peak-debt arithmetic.** Moving from "everyone switches Day 1" to "only <50-year-olds in 2026 switch, progressively" is a bigger lever than most parameter tweaks. The politics also improve: no one near retirement loses accrued rights.

## Open Questions

- **General equilibrium feedback on r_c:** As the capitalisation fund approaches GDP scale, how much would equilibrium returns compress? Dominant long-run uncertainty, not yet modelled.
- **Macro shock module:** A recession in years 5–10 (when debt is rising fastest) could be catastrophic. Add to Monte Carlo?
- **Actuarial vs parametric cohort model:** The current T_pk/T_hl exponential decay is simple and adjustable, but doesn't match INSEE mortality tables.
- **Political feasibility of the transition levy:** 30 % levy on capi inflows from year ~16 is a large implicit tax on the new system's beneficiaries. Less distortionary mechanism?
- **Calibration of Tpk/Thl conditional on cutoffAge:** The legacy extinction profile should in principle depend on how much of the workforce was enrolled in PAYG at each date — currently decoupled.
- **Stochastic `existingDebtGrowth`:** Currently a policy assumption; a Monte Carlo version could explore scenarios where markets push the pre-reform trajectory out of control independently of the transition.
