# CapiModel Theoretical Review & Mathematical Analysis

## 1. Executive Summary

This report presents a comprehensive theoretical and mathematical review of the CDC Legacy Fund Pension Transition Simulator (CapiModel). The review evaluates the 34 coupled equations defining the model's mechanics and critically assesses the underlying economic assumptions.

While the model provides a robust and structurally coherent framework for exploring a PAYG-to-capitalization transition, several mathematical inconsistencies regarding dimensional scaling and state variable conservation were identified. Furthermore, as noted in the existing project critique, the foundational macroeconomic assumptions (returns, wage growth, and market absorption) are systematically optimistic, which compounds to dramatically understate the transition's risk.

---

## 2. Mathematical & Algebraic Validation

A step-by-step trace of the equations in `cdc_legacy_fund_model.md` reveals that the fundamental accounting identities (conservation of flows) generally hold. However, there are notable mathematical flaws in dimensional scaling and edge-case handling.

### 2.1 Dimensional Inconsistencies (Equations 8, 9, and 17)
The model document contains explicit scaling factors that contradict the defined units of the input variables.

- **Equations 8 and 9 (Pension Expenditure):**
  - $R$ is defined as "Number of retirees (millions)" (default: 17).
  - The equation divides by $10^9$: $E_0^{base} = R \cdot \bar{m} \cdot \frac{12}{10^9}$.
  - **Flaw:** If $R=17$, then $17 \cdot 1,509 \cdot 12 / 10^9 = 0.000307$ Md€. The formula assumes $R$ is the absolute number ($17,000,000$). For the formula to be algebraically correct as written, $R$ must be the absolute count, not millions.

- **Equation 17 (HLM Proceeds):**
  - $U_0$ is defined in millions (5.3) and $P^{mkt}_0$ in k€ (175).
  - The product of millions ($10^6$) and thousands ($10^3$) yields billions ($10^9$).
  - The equation explicitly divides by $10^9$: $H_t = \Delta U_t \cdot (P \dots) \cdot \frac{0.95}{10^9}$.
  - **Flaw:** Applying this formula with the documented input scales results in proceeds of $0.000000088$ Md€ instead of ~88 Md€. The division by $10^9$ double-discounts the units.

*Note: It is highly likely the JavaScript implementation correctly uses raw numbers, but the formal documentation contains these algebraic notation errors.*

### 2.2 Leakage of Funds in Transition Levy (Equations 30–32)
There is a critical failure in the conservation of capital in the final year of debt repayment.
- **Equation 30:** Defines the levy as $\mathcal{L}_t = \lambda \cdot (C^s_t + C^{e \to cap}_t)$.
- **Equation 31:** Applies the levy to the debt: $D_{t+1} = \max(0, D_{t+1}^{pre} - \mathcal{L}_t)$.
- **Equation 32:** Deducts the full levy from capitalization flows: $\tilde{C}_t = C^{cap}_t - \mathcal{L}_t$.

**Flaw:** If the remaining debt $D_{t+1}^{pre}$ is smaller than the levy $\mathcal{L}_t$ (which is highly likely in the final repayment year, e.g., 5 Md€ debt vs. 90 Md€ levy), the debt is set to zero, but the *entire* levy is still deducted from the capitalization flow. The excess ($\mathcal{L}_t - D_{t+1}^{pre}$) vanishes entirely from the model—it neither repays debt nor enters the capitalization account. 
**Correction:** Equation 32 should use the *effective* levy applied: $\tilde{C}_t = C^{cap}_t - \min(\mathcal{L}_t, D_{t+1}^{pre})$.

### 2.3 Linear Approximation of Real Borrowing Costs
- **Equation 3:** Defines the spread as $\sigma = r_f - (r_d - \pi)$. 
- **Observation:** This uses the linear approximation for the real borrowing rate ($r_d - \pi$) rather than the exact Fisher derivation $\frac{1+r_d}{1+\pi} - 1$. Over a 55-year horizon, compounding on trillions of euros, this approximation error (roughly 3 basis points under default parameters) accumulates into a material divergence in terminal debt projections.

---

## 3. Critical Review of Underlying Assumptions

The `critique.md` document correctly identifies several structural limits. This review expands on those points, emphasizing the compounding nature of these macroeconomic assumptions.

### 3.1 The Capitalization Return ($r_c = 4.5\%$ real) and Scale Constraints
The assumption of a 4.5% real return over 55 years for a fund that will eventually dwarf French GDP is economically unsustainable.
- As the fund scales beyond 1-2 Trillion euros, it encounters **General Equilibrium (GE) feedback**. Capital abundance suppresses the marginal product of capital, structurally compressing equity premia. 
- The model treats $r_c$ as an exogenous constant, immune to the size of the fund. At the projected terminal scale (~45-50 Tn€ real), the fund would constitute a significant fraction of global capital markets, making it a price-maker, not a price-taker. The 2.0% – 3.0% real scenario is the only mathematically defensible baseline for a sovereign wealth fund of this unprecedented magnitude.

### 3.2 Endogenous Debt and the Spread ($\sigma$)
The core viability of the transition relies entirely on $\sigma > 0$.
- The simulation currently allows the debt/GDP ratio to exceed 150-170% while seemingly maintaining an assumed base cost. Although v2 introduces an endogenous penalty via `existingDebtGrowth`, it remains highly constrained. 
- Sovereign debt markets do not price risk linearly. Historical eurozone crises indicate nonlinear yield gapping when sustainability thresholds are breached. If the risk premium causes $r_d$ to exceed $r_f + \pi$ (i.e., $\sigma \leq 0$), the model enters an inescapable debt spiral.

### 3.3 Uniformity of Wage Growth and Labor Supply
The model projects a steady real wage growth ($w_r = 1.5\%$), which aggressively outperforms France's historical ~0.5% average. 
- The model maintains the 16.5% employer contribution, effectively holding the cost of labor constant while modeling wage growth as if labor markets were highly dynamic. 
- It completely omits **cyclicality**. A standard 55-year economic horizon will include 4-7 recessions. A recession occurring during the peak deficit years (years 10-20) would simultaneously collapse contribution revenues and HLM asset prices, requiring massive un-modeled deficit spending at exactly the point when debt/GDP is highest. 

### 3.4 The Cohort Indexing Approximation
The cohort index $\phi_t$ (Equation 10) relies on a parametric analytical curve (an initial linear step-up followed by exponential decay) rather than actuarial mortality tables (e.g., INSEE T60). While mathematically elegant, this creates an artificial smoothness in legacy obligations that masks the uneven demographic "bulge" of retiring generations. 

---

## 4. Reassessment of Findings against the `modern-luxury-redesign` Branch Implementation

A follow-up analysis mapping the theoretical points to the JavaScript engine (`src/simulation-engine.js`) in the `modern-luxury-redesign` branch reveals important distinctions between the documentation and the actual running code:

1. **Levy Leakage is Confirmed in Code:** 
   The mathematical leakage identified in Equations 30-32 is **still actively present** in the engine. In `simulation-engine.js` (lines 451-455), the code limits the debt reduction via `debt = Math.max(0, debt - levy)` but still blindly subtracts the full `levy` from `emplC_s_toCapi + emplrToCap`. This actively destroys capital in the final repayment year.
   
2. **Dimensional Scaling Errors are Documentation-Only:** 
   The scaling errors identified in equations 8, 9, and 17 do not exist in the JavaScript engine. The `equinoxeSavings` and `stepReductionSavings` functions properly adjust `millions * €/mo` to billions by dividing by `1e3`. Similarly, the HLM logic correctly computes `millions * k€` to yield `Md€` without an erroneous division by $10^9$. The simulation is computationally sound; the markdown notation is simply flawed.

3. **Correction to the Fisher Exact Critique:**
   The initial theoretical review stated that the linear approximation of the real borrowing cost (`r_d - pi`) creates compounding errors in terminal debt projections. **This was incorrect.** The JS engine compounds debt purely in nominal terms using `debt * r_d` directly, which uses the nominal input rate natively. The linear approximation is strictly used to display the `spread` metric for diagnostic purposes and has zero impact on the state variables. The debt projection is algebraically correct.

4. **Return Optimization is Still Uncapped:** 
   The engine does not include any General Equilibrium scaling penalties as the capitalization fund size approaches or exceeds the GDP, meaning the macroeconomic criticism regarding compounding over-optimism remains fully applicable to the codebase.

---

## 5. Conclusion & Recommendations

The CapiModel correctly captures the overarching algebraic tension of a PAYG transition: the race between compounding debt and compounding assets. However, the exact implementations contain specific mathematical leakages and the assumptions represent a "best-of-all-possible-worlds" macro-environment.

### Actionable Fixes:
1. **Fix the Levy Leakage:** Update Equation 32 and the underlying JavaScript engine to only deduct $\min(\mathcal{L}_t, D_{t+1}^{pre})$ from capitalization flows.
2. **Correct Notational Dimensions:** Revise Equations 8, 9, and 17 in the documentation to ensure dimensional consistency with the stated inputs.
3. **Implement Fisher Exact Real Cost:** Update the calculation of real debt service cost to use the exact formula to prevent compounding drift.
4. **Cap Returns at Scale:** Introduce a scaling penalty function in the engine where $r_{c,n}$ decays asymptotically toward the economic growth rate as the capitalization pot exceeds 100% of GDP.