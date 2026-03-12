# CDC Legacy Entitlements Fund — Technical Model Documentation

**Version:** Simulator v5  
**Date:** March 2026  
**Purpose:** Technical reference for independent replication

---

## 1. Reform Architecture

The model simulates a transition from a pay-as-you-go (PAYG) pension system to full capitalisation, funded by three sources of transition finance:

1. **CDC seed capital** — the proprietary balance sheet of the Caisse des Dépôts et Consignations (excluding Livret A / Fonds d'Épargne) is transferred in full on Day 1 to a *legacy fund* that covers existing pension obligations.
2. **HLM social housing liquidation** — a legally mandated remittance of 95% of capital gains from annual sales of public housing stock (parc social) to the legacy fund.
3. **Employer contributions** — redirected in full to cover legacy fund deficits before any surplus flows to capitalisation accounts.

Employee contributions (11.3% of gross wages) flow 100% to individual capitalisation accounts from Day 1. A **transition levy** can optionally be applied to capitalisation flows to accelerate sovereign debt repayment.

Any residual annual deficit in the legacy fund is covered by **sovereign borrowing** (modelled as OAT issuance). The fund is therefore structurally solvent by construction; the key policy variable is the trajectory and ultimate repayment of that debt.

---

## 2. Notation

| Symbol | Description | Default |
|--------|-------------|---------|
| $t$ | Year index, $t = 0, \ldots, N-1$ | — |
| $N$ | Simulation horizon (years) | 55 |
| $Y_0$ | Reform start year | 2026 |
| $R$ | Number of retirees (millions) | 17 |
| $\pi$ | Annual inflation rate | 2.0% |
| $w_r$ | Real wage growth rate | 1.5% |
| $w_n$ | Nominal wage growth: $\pi + w_r$ | 3.5% |
| $\iota$ | Pension indexation rate: $\min(\pi, w_n)$ | 2.0% |
| $r_f$ | Legacy fund return (real) | 3.0% |
| $r_c$ | Capitalisation account return (real) | 4.5% |
| $r_d$ | Sovereign borrowing rate (nominal) | 3.5% |
| $W_0$ | Initial aggregate wage bill (Md€) | 1,250 |
| $\tau^s$ | Employee contribution rate | 11.3% |
| $\tau^e$ | Employer contribution rate | 16.5% |
| $\phi_f$ | Employer floor to capitalisation | 0% |
| $F_0$ | CDC assets transferred on Day 1 (Md€) | 220 |
| $U_0$ | HLM units (millions) | 5.3 |
| $P^{mkt}_0$ | Average market price per HLM unit (k€) | 175 |
| $P^{book}$ | Average book value per HLM unit (k€) | 45 |
| $\rho$ | Annual HLM liquidation rate | 10% |
| $g_h$ | Real house price growth | 1.5% |
| $A_0$ | Annual fiscal abatement recovery (Md€) | 7.0 |
| $\kappa$ | Pension cut rate above threshold | 10% |
| $\bar{p}$ | Pension cut threshold: $1.5 \times SMIC_{net}$ | 2,097 €/mo |
| $T_{pk}$ | Years to legacy expenditure peak | 8 |
| $T_{hl}$ | Half-life of legacy cohort decline (years) | 28 |
| $\alpha$ | Surplus fraction directed to debt repayment | 100% |
| $\lambda$ | Transition levy rate on capitalisation flows | 30% |
| $T_\lambda$ | Year levy activates | 15 |

---

## 3. Nominal/Real Accounting Framework

All stocks and flows are maintained in **current nominal euros** of year $Y_0 + t$. Input returns ($r_f$, $r_c$) are specified in real terms by the user and converted to nominal via the Fisher equation before application to stocks:

$$r_{f,n} = (1 + r_f)(1 + \pi) - 1 \tag{1}$$

$$r_{c,n} = (1 + r_c)(1 + \pi) - 1 \tag{2}$$

The sovereign borrowing rate $r_d$ is entered directly in nominal terms (consistent with OAT pricing). The real cost of debt is therefore $r_d - \pi$ (linear approximation) or $(1+r_d)/(1+\pi) - 1$ (exact).

The **spread** — the key solvency indicator — is:

$$\sigma = r_f - (r_d - \pi) \tag{3}$$

If $\sigma < 0$, the fund earns less in real terms than the real cost of servicing its debt: the transition is self-reinforcing on the downside.

---

## 4. Component Equations

### 4.1 Nominal Growth Factors

$$\Omega_t = (1 + w_n)^t \tag{4}$$

$$\mathcal{I}_t = (1 + \iota)^t \tag{5}$$

$$\mathcal{H}_t = (1 + g_h)^t \tag{6}$$

*Pseudo-code:*
```
wFactor[t] = (1 + wNom)^t
idxFact[t] = (1 + indexRate)^t
hpFact[t]  = (1 + hpGrow)^t
```

### 4.2 DREES Pension Distribution and Cut Savings

The DREES 2022 distribution provides ten deciles with bounds $[\ell_d, h_d]$ and midpoint $m_d$. For each decile $d$, the fraction of retirees above the cut threshold $\bar{p}$ is:

$$f_d = \begin{cases} 0 & h_d \leq \bar{p} \\ 1 & \ell_d \geq \bar{p} \\ \dfrac{h_d - \bar{p}}{h_d - \ell_d} & \text{otherwise} \end{cases} \tag{6}$$

The conditional mean pension above threshold is approximated as the midpoint of $[\bar{p}, h_d]$:

$$\bar{m}_d = \frac{\bar{p} + h_d}{2} \quad \text{if } \ell_d < \bar{p} < h_d \tag{7}$$

or $m_d$ if the entire decile is above threshold. Annual savings from the cut (Md€, Year 0):

$$S_0 = \sum_{d=1}^{10} \frac{R}{10} \cdot f_d \cdot \bar{m}_d \cdot \kappa \cdot \frac{12}{10^9} \tag{8}$$

*Pseudo-code:*
```
for each decile d:
    if hi[d] <= threshold:  fracAbove = 0
    elif lo[d] >= threshold: fracAbove = 1; avgAbove = mid[d]
    else:
        fracAbove = (hi[d] - threshold) / (hi[d] - lo[d])
        avgAbove  = (threshold + hi[d]) / 2
    annSav[d] = (RETIREES/10) * fracAbove * avgAbove * cutRate * 12 / 1e9
S0 = sum(annSav)
```

**Tabulated DREES data (2022):**

| Decile | $\ell_d$ (€/mo) | $h_d$ (€/mo) | $m_d$ (€/mo) | $f_d$ at $\bar{p}=2097$€ |
|--------|-----------------|--------------|--------------|--------------------------|
| D1 | 0 | 770 | 520 | 0% |
| D2 | 770 | 900 | 833 | 0% |
| D3 | 900 | 1,010 | 954 | 0% |
| D4 | 1,010 | 1,130 | 1,069 | 0% |
| D5 | 1,130 | 1,270 | 1,199 | 0% |
| D6 | 1,270 | 1,450 | 1,358 | 0% |
| D7 | 1,450 | 1,680 | 1,560 | 0% |
| D8 | 1,680 | 2,050 | 1,852 | 0% |
| D9 | 2,050 | 2,900 | 2,380 | ~28% partial |
| D10 | 2,900 | — | 4,120 | 100% |

Approximately 22% of retirees are above the threshold; estimated $S_0 \approx 13$–16 Md€/yr at $\kappa = 10\%$.

### 4.3 Base Legacy Expenditure

$$E_0^{base} = R \cdot \bar{m} \cdot \frac{12}{10^9} \quad \text{where } \bar{m} = \frac{1}{10}\sum_{d=1}^{10} m_d \approx 1{,}509 \text{ €/mo} \tag{9}$$

This yields $E_0^{base} \approx 307$ Md€. Note: the official DREES all-regime total is ~345 Md€; the gap (~38 Md€) reflects solidarity minimum pensions, administrative costs and Agirc-Arrco supplementary regimes not fully captured by the decile midpoints.

### 4.4 Cohort Index

The legacy cohort follows a three-phase profile. Phase 1 rises as workers with partially-accrued rights begin retiring; Phase 2 decays exponentially as mortality and full transition eliminate the legacy population.

$$\phi_t = \begin{cases} 1.0 & t = 0 \\ 1 + 0.18 \cdot \dfrac{t}{T_{pk}} & 0 < t \leq T_{pk} \\[8pt] 1.18 \cdot \exp\!\left(-\dfrac{\ln 2}{T_{hl}}(t - T_{pk})\right) & t > T_{pk} \end{cases} \tag{10}$$

The +18% peak amplitude is a parametric calibration, not derived from actuarial tables. It reflects the assumption that the transitioning cohort has accrued on average approximately half of full pension rights, producing a gradual step-up in legacy obligations before mortality-driven decay dominates.

*Pseudo-code:*
```
if t == 0:   cohIdx = 1.0
elif t <= peakYrs: cohIdx = 1.0 + 0.18 * (t / peakYrs)
else:        cohIdx = 1.18 * exp(-(ln2 / halfLife) * (t - peakYrs))
cohIdx = max(0.01, cohIdx)
```

### 4.5 Annual Legacy Expenditure

$$E_t = \max\!\left(0,\; (E_0^{base} - S_0) \cdot \phi_t \cdot \mathcal{I}_t\right) \tag{11}$$

### 4.6 Contribution Flows

Contributions grow with the nominal wage bill:

$$W_t = W_0 \cdot \Omega_t \tag{12}$$

$$C^s_t = W_t \cdot \tau^s \quad \text{(100\% to capitalisation)} \tag{13}$$

$$C^e_t = W_t \cdot \tau^e \tag{14}$$

### 4.7 HLM Parc Social Proceeds

The stock declines geometrically at rate $\rho$:

$$U_t = U_0 \cdot (1-\rho)^t \tag{15}$$

$$\Delta U_t = U_{t-1} \cdot \rho \tag{16}$$

$$H_t = \Delta U_t \cdot \max\!\left(0,\; P^{mkt}_0 \cdot \mathcal{H}_t - P^{book}\right) \cdot \frac{0.95}{10^9} \quad \text{[Md€]} \tag{17}$$

The 0.95 coefficient represents the statutory remittance rate to the legacy fund. Book value $P^{book}$ is held constant (no inflation adjustment), which slightly overstates gains in the long run.

### 4.8 Fiscal Abatement Recovery

$$A_t = A_0 \cdot \Omega_t \tag{18}$$

This represents the annual recovery from abolishing the 10% flat-rate tax abatement on pension income, growing with the wage bill.

### 4.9 Fund Investment Return

Applied at the Fisher-adjusted nominal rate to the current fund balance:

$$R^f_t = F_t \cdot r_{f,n} \tag{19}$$

### 4.10 Debt Interest

$$I_t = D_t \cdot r_d \tag{20}$$

where $D_t$ is the nominal outstanding debt stock entering year $t$. Interest is treated as a senior claim, deducted before any other allocation.

### 4.11 Employer Contribution Allocation

Net non-employer inflows after debt service:

$$X_t = R^f_t + H_t + A_t - I_t \tag{21}$$

Employer contributions are allocated to cover the legacy deficit first:

$$C^{e \to leg}_t = \min\!\left(\max(0,\; E_t - X_t),\; C^e_t \cdot (1 - \phi_f)\right) \tag{22}$$

$$C^{e \to cap}_t = C^e_t - C^{e \to leg}_t \tag{23}$$

*Pseudo-code:*
```
emplrAvailForLegacy = emplrC * (1 - emplrFloor)
deficit = legacyExp - nonEmplrNet
if deficit <= 0:
    emplrToLeg = 0;  emplrToCap = emplrC
elif deficit <= emplrAvailForLegacy:
    emplrToLeg = deficit;  emplrToCap = emplrC - deficit
else:
    emplrToLeg = emplrAvailForLegacy;  emplrToCap = emplrC * emplrFloor
```

### 4.12 Raw Net Flow and Borrowing

Total legacy inflows:

$$\Sigma_t = X_t + C^{e \to leg}_t \tag{24}$$

Raw net flow:

$$\eta_t = \Sigma_t - E_t \tag{25}$$

**If $\eta_t < 0$** (deficit year): sovereign borrowing fills the gap exactly.

$$B_t = -\eta_t, \quad D_{t+1}^{pre} = D_t + B_t, \quad F_t \text{ unchanged} \tag{26}$$

**If $\eta_t \geq 0$** (surplus year): fraction $\alpha$ repays principal.

$$\text{repaid}_t = \min(\alpha \cdot \eta_t,\; D_t) \tag{27}$$

$$D_{t+1}^{pre} = D_t - \text{repaid}_t \tag{28}$$

$$F_{t+1} = F_t + \eta_t - \text{repaid}_t \tag{29}$$

### 4.13 Transition Levy on Capitalisation Flows

After year $T_\lambda$, while $D_t > 0$, a fraction $\lambda$ of capitalisation flows is redirected to debt repayment. This operates as a direct deduction from individual account contributions.

$$\mathcal{L}_t = \begin{cases} \lambda \cdot (C^s_t + C^{e \to cap}_t) & \text{if } t \geq T_\lambda \text{ and } D_t > 0 \\ 0 & \text{otherwise} \end{cases} \tag{30}$$

$$D_{t+1} = \max\!\left(0,\; D_{t+1}^{pre} - \mathcal{L}_t\right) \tag{31}$$

Net capitalisation flow after levy:

$$\tilde{C}_t = C^s_t + C^{e \to cap}_t - \mathcal{L}_t \tag{32}$$

### 4.14 Capitalisation Account Accumulation

$$K_t = K_{t-1} \cdot (1 + r_{c,n}) + \tilde{C}_t \tag{33}$$

Real value (constant 2026 euros):

$$K_t^{real} = \frac{K_t}{(1+\pi)^{t+1}} \tag{34}$$

---

## 5. State Variable Summary

Each simulation year $t$ updates the following state vector in order:

| Step | Variable updated | Equation(s) |
|------|-----------------|-------------|
| 1 | Cohort index $\phi_t$ | (10) |
| 2 | Legacy expenditure $E_t$ | (11) |
| 3 | Contributions $C^s_t$, $C^e_t$ | (13–14) |
| 4 | HLM proceeds $H_t$ | (15–17) |
| 5 | Fund return $R^f_t$ | (19) |
| 6 | Debt interest $I_t$ | (20) |
| 7 | Employer allocation $C^{e\to leg}_t$, $C^{e\to cap}_t$ | (22–23) |
| 8 | Net flow $\eta_t$; borrow or repay | (25–29) |
| 9 | Transition levy $\mathcal{L}_t$; update $D_t$ | (30–31) |
| 10 | Capitalisation $K_t$ | (33) |

---

## 6. Key Assumptions and Limitations

### 6.1 Structural assumptions

- **Uniform distribution within deciles.** Intra-decile pension distributions are assumed uniform between $\ell_d$ and $h_d$. The D10 right tail (mean 4,120€/mo, no upper bound) is particularly sensitive to this: the true distribution is heavily right-skewed, so $S_0$ is probably underestimated for high cut rates.
- **Cohort index is parametric, not actuarial.** Equation (10) uses a smooth analytic profile calibrated to approximate aggregate dynamics. It does not use INSEE T60 mortality tables or CNAV/AGIRC-ARRCO generation-specific accrual data.
- **CDC assets generate returns from Day 1.** The CDC portfolio includes illiquid participations (La Poste ~26%, EDF ~2.4%) that cannot be liquidated at par and do not immediately generate cash returns. The model overstates fund income in years 1–5 by an estimated 20–30%.
- **HLM book value is constant.** $P^{book}$ does not inflate, slightly overstating long-run gains. More importantly, some HLM bailleurs carry residual construction debt against their assets; the 95% remittance rate applies to the accounting gain, not the net cash gain. Effective recovery may be lower.
- **No behavioural effects.** Gruber-Wise retirement delay, precautionary savings response, labour supply effects, and market reactions to sovereign debt accumulation are all excluded.
- **Pension cut is a step function.** The 10% reduction applies to the entire pension above the 1.5×SMIC threshold; there is no taper. This creates an economically inefficient notch and is likely politically unstable.
- **Wage bill grows uniformly.** No distinction between employment growth and real wage growth; no cyclical or unemployment shocks.

### 6.2 The capitaReturn sensitivity problem

Equation (33) is a geometric series with ratio $(1+r_{c,n})$. At $r_c = 4.5\%$ real and $\pi = 2\%$, the nominal growth factor per euro is:

$$r_{c,n} = (1.045)(1.02) - 1 \approx 6.59\%$$

Over 55 years, 1€ of capitalisation contribution in year 1 compounds to $\approx 11€$ in nominal terms. This means the terminal capitalisation stock is extraordinarily sensitive to $r_c$:

$$\frac{\partial K_{55}}{\partial r_c} \approx K_{55} \cdot 55 \cdot \frac{1+\pi}{r_{c,n}} \quad \text{(approximate log-linear sensitivity)}$$

At fund size approaching French GDP (~2.8 Tn€ after ~20 years), general equilibrium feedback would depress equity premia. The 4.5% real assumption is appropriate for historical OECD 60/40 benchmarks applied to a *small* fund. It is not appropriate for a fund of this scale. **Treat the capitalisation stock as illustrative rather than a forecast; the 2–3% real scenario is more defensible.**

---

## 7. Default Parameter Results

At the parameters listed in Section 2:

| KPI | Value |
|-----|-------|
| Legacy fund solvency | Guaranteed by construction |
| Peak sovereign debt | ~1.5 Tn€ (reached ~Y+20, 2046) |
| Debt-free year | ~2060–2065 (with 30% levy from Y+15) |
| Total interest cost | ~2.3 Tn€ (nominal, cumulative) |
| Capitalisation pot (nominal, 2080) | ~130–140 Tn€ |
| Capitalisation pot (real 2026€, 2080) | ~45–50 Tn€ |
| Net position (nominal) | ~130 Tn€ |

---

## 8. Sensitivity Analysis

The table below reports key outputs across selected parameter variants. All parameters not listed are held at default values from Section 2 (levy: 30% from Y+15, unless noted). Values marked † should be read from the interactive simulator; approximate analytical ranges are given where derivation is straightforward.

### 8.1 Capitalisation return sensitivity

The dominant parameter for the terminal pot.

| $r_c$ (real) | $r_{c,n}$ (nominal) | $K_{55}$ nominal | $K_{55}$ real (2026€) | Debt-free year | Net position |
|---|---|---|---|---|---|
| 2.0% | ~4.04% | [read simulator] | [read simulator] | [read simulator] | [read simulator] |
| 3.0% | ~5.06% | [read simulator] | [read simulator] | [read simulator] | [read simulator] |
| 4.5% (default) | ~6.59% | ~130–140 Tn€ | ~45–50 Tn€ | ~2060–2065 | ~130 Tn€ |

**Analytical note:** the ratio of terminal pots at $r_c = 2\%$ vs $4.5\%$ is approximately:

$$\frac{K_{55}(r_c=0.02)}{K_{55}(r_c=0.045)} \approx \frac{(1.0404)^{55}-1}{(1.0659)^{55}-1} \cdot \frac{0.0659}{0.0404} \approx \frac{8.1}{31.9} \cdot 1.63 \approx 0.41$$

So the 2% real scenario yields roughly **40% of the 4.5% pot** — approximately 50–55 Tn€ nominal, 18–20 Tn€ real.

### 8.2 Borrowing rate sensitivity

| $r_d$ (nominal) | Real debt cost | Spread $\sigma$ | Peak debt | Total interest | Debt-free year |
|---|---|---|---|---|---|
| 2.5% | 0.5% | +2.5% | [read simulator] | [read simulator] | Earlier |
| 3.5% (default) | 1.5% | +1.5% | ~1.5 Tn€ | ~2.3 Tn€ | ~2060–2065 |
| 5.0% | 3.0% | 0.0% | [read simulator] | [read simulator] | [read simulator] |
| 6.0% | 4.0% | −1.0% | [read simulator] | [read simulator] | Possibly never |

**Critical threshold:** when $r_d = r_f + \pi$ (i.e., $\sigma = 0$), the fund earns exactly enough to service the real cost of the debt but accumulates no buffer. Above this threshold the debt is self-reinforcing and may never be repaid regardless of the levy.

At defaults: threshold $r_d^* = r_f + \pi = 3\% + 2\% = 5\%$. The model is therefore **marginally safe** at $r_d = 3.5\%$ but at risk above $r_d \approx 5\%$.

### 8.3 Transition levy sensitivity

| $\lambda$ | $T_\lambda$ | Debt-free year | Levy cumulative cost | $K_{55}$ nominal |
|---|---|---|---|---|
| 0% (no levy) | — | Never | 0 | ~150 Tn€ |
| 15% | Y+15 | [read simulator] | [read simulator] | [read simulator] |
| 30% (default) | Y+15 | ~2060–2065 | [read simulator] | ~130–140 Tn€ |
| 50% | Y+15 | Earlier | [read simulator] | [read simulator] |
| 30% | Y+0 | Earlier | Higher | Lower |

**Tradeoff:** every 1pp increase in $\lambda$ reduces the terminal nominal pot by approximately $\lambda \cdot \tilde{C}_{avg} \cdot \frac{(1+r_{c,n})^{N-T_\lambda}-1}{r_{c,n}}$ Md€, where $\tilde{C}_{avg}$ is the average annual flow to capitalisation during the levy period (~250–350 Md€/yr). The savings in interest cost are determined by how much earlier the debt is cleared and the debt stock at that point.

---

## 9. Replication Checklist

To independently replicate this model:

1. Implement the Fisher conversion (equations 1–2) **before** applying any rate to a stock. Failure to do so will apply real rates to nominally-growing stocks, producing compounding errors that grow exponentially with $N$.
2. Ensure debt interest (eq. 20) is deducted **before** employer allocation (eq. 22), not after. Order matters: treating interest as senior changes the employer residual and therefore the borrowing requirement.
3. The cohort index (eq. 10) is applied multiplicatively to $(E_0^{base} - S_0)$, not to $E_0^{base}$ alone. The cut savings $S_0$ are fixed at Year 0 levels — they do not grow with $\mathcal{I}_t$. This is a modelling choice (cut savings accrue on a fixed nominal threshold) that slightly understates savings in real terms over time.
4. HLM units decline **geometrically** (eq. 15), not linearly. At 10%/yr, ~65% of the stock remains after 5 years and ~9% after 25 years. Linear interpolation significantly overestimates mid-period proceeds.
5. The transition levy (eq. 30) is applied to **net capitalisation flows** $(C^s_t + C^{e\to cap}_t)$, not to the gross capitalisation stock $K_t$. Applying it to the stock instead would be equivalent to a wealth tax and would produce a much larger and economically different effect.
6. Real display of the capitalisation pot (eq. 34) deflates by $(1+\pi)^{t+1}$, not $(1+\pi)^t$. The off-by-one reflects the convention that Year 0 flows are invested and compounded for 1 year before display.

---

## 10. Suggested Extensions

| Extension | Complexity | Impact |
|-----------|------------|--------|
| Actuarial cohort tables (INSEE T60, CNAV) | High | Moderate — refines peak timing and amplitude |
| Per-asset CDC liquidation schedule with illiquidity discounts | Medium | High in years 1–5 |
| Progressive taper above 1.5×SMIC (vs. step function) | Low | Low on aggregate savings, high on distributional conclusions |
| HLM regional disaggregation (IDF vs. province) | Medium | Moderate on total proceeds |
| Macro shock module (unemployment → contribution shortfall) | High | High on debt trajectory |
| Lifecycle glide path for capitalisation returns | Medium | Moderate on terminal pot |
| General equilibrium feedback on $r_c$ as fund size grows | High | Very high — dominant uncertainty at long horizons |

---

*All monetary values in billions of euros (Md€) unless otherwise noted (Tn€ = trillion €). Real values are in constant 2026 euros. The interactive simulator (HTML, self-contained) runs the full model in-browser and is the reference implementation against which this document should be verified.*
