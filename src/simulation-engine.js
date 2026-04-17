// CDC Legacy Fund Simulation Engine
// Implements all 34 equations from cdc_legacy_fund_model.md with critique fixes

// --- DREES 2022 pension distribution (decile bounds in €/month) ---
export const DREES_DECILES = [
  { lo: 0,    hi: 770,  mid: 520  },
  { lo: 770,  hi: 900,  mid: 833  },
  { lo: 900,  hi: 1010, mid: 954  },
  { lo: 1010, hi: 1130, mid: 1069 },
  { lo: 1130, hi: 1270, mid: 1199 },
  { lo: 1270, hi: 1450, mid: 1358 },
  { lo: 1450, hi: 1680, mid: 1560 },
  { lo: 1680, hi: 2050, mid: 1852 },
  { lo: 2050, hi: 2900, mid: 2380 },
  { lo: 2900, hi: 6000, mid: 4120 },
]

// --- Rééquilibrage Équinoxe — step function per bracket (Contre-Budget 2026) ---
// Rates applied to total pension; hard cap at 20% above 4 000 €/month.
export function equinoxeReductionRate(p) {
  if (p <= 1800) return 0
  if (p <= 2000) return 0.001   // 0,1 %
  if (p <= 2500) return 0.004   // 0,4 %
  if (p <= 3000) return 0.041   // 4,1 %
  if (p <= 4000) return 0.10    // 10 %
  return 0.20                    // 20 % — capped per Équinoxe proposal
}

/**
 * Original step-function reduction: κ applied to full pension above threshold.
 */
function stepReductionSavings(R, kappa, threshold) {
  let S0 = 0
  for (const d of DREES_DECILES) {
    let fracAbove, avgAbove
    if (d.hi <= threshold) {
      fracAbove = 0; avgAbove = 0
    } else if (d.lo >= threshold) {
      fracAbove = 1; avgAbove = d.mid
    } else {
      fracAbove = (d.hi - threshold) / (d.hi - d.lo)
      avgAbove = (threshold + d.hi) / 2
    }
    // R is in millions, avgAbove in €/mo → multiply by 1e6 then /1e9 = /1e3
    S0 += (R / 10) * fracAbove * avgAbove * kappa * 12 / 1e3
  }
  return S0
}

/**
 * Equinoxe progressive reduction savings.
 * For each decile, numerically integrate r(p)*p over [lo, hi] assuming uniform distribution.
 */
function equinoxeSavings(R) {
  let S0 = 0
  const STEPS = 50 // integration steps per decile
  for (const d of DREES_DECILES) {
    const lo = Math.max(d.lo, 0)
    const hi = d.hi
    const width = hi - lo
    if (width <= 0) continue
    let integral = 0
    for (let i = 0; i < STEPS; i++) {
      const p = lo + (i + 0.5) * (width / STEPS)
      integral += equinoxeReductionRate(p) * p * (width / STEPS)
    }
    // Average savings per retiree in this decile = integral / width (uniform density)
    // R in millions, savings in €/mo → ×1e6 then /1e9 = /1e3
    S0 += (R / 10) * (integral / width) * 12 / 1e3
  }
  return S0
}

/**
 * Endogenous borrowing rate: r_d = r_d_base + risk_premium(totalDebt/GDP)
 * Piecewise linear model calibrated to France.
 */
export function calculateBorrowingRate(debtRatio, options = {}) {
  const {
    baseRate = 0.035,
    threshold1 = 150,    // No premium below 150% — reform credibility, cf. US/Italy
    slope1 = 0.0002,     // 2 bps per pp (150–200%): markets start noticing
    threshold2 = 200,
    slope2 = 0.0004,     // 4 bps per pp (200–300%): sustained pressure
    threshold3 = 300,
    slope3 = 0.0010,     // 10 bps per pp (>300%): crisis regime
    extraSpread = 0,
  } = options

  let premium = 0
  if (debtRatio <= threshold1) {
    premium = 0
  } else if (debtRatio <= threshold2) {
    premium = (debtRatio - threshold1) * slope1
  } else if (debtRatio <= threshold3) {
    premium = (threshold2 - threshold1) * slope1
      + (debtRatio - threshold2) * slope2
  } else {
    premium = (threshold2 - threshold1) * slope1
      + (threshold3 - threshold2) * slope2
      + (debtRatio - threshold3) * slope3
  }
  return baseRate + premium + extraSpread
}

// --- Preset configurations ---
export const PRESETS = {
  default: {
    label: 'Hypothèses de base',
    description: 'r_c=3%, w_r=0.7%, E₀=345 Md€, rééquilibrage Équinoxe, taux endogènes',
    params: {
      N: 70, pi: 0.02, w_r: 0.007,
      r_f: 0.03, r_c: 0.03,
      r_d_base: 0.035, endogenousRd: true, extraSpread: 0,
      W0: 1250, tauS: 0.113, tauE: 0.165, phiF: 0,
      F0: 220, E0: 345,
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.05, g_h: 0.015, T_hlm: 20,
      hlmDiscount: true, delta: 0.3,
      A0: 7.0,
      R: 17,
      kappa: 0.10, threshold: 2097,
      useEquinoxe: true,
      Tpk: 8, Thl: 18,
      alpha: 1.0, lambda: 0.30, Tlambda: 15,
      existingDebt: 3200, baseGDP: 2850,
      cutoffAge: 50, existingDebtGrowth: 0.027,
      // Risk premium thresholds
      rpThreshold1: 150, rpSlope1: 0.0002,
      rpThreshold2: 200, rpSlope2: 0.0004,
      rpThreshold3: 300, rpSlope3: 0.0010,
    },
  },
  originalV5: {
    label: 'Original v5',
    description: 'Paramètres du modèle original §2 (r_c=4.5%, w_r=1.5%, r_d fixe)',
    params: {
      N: 55, pi: 0.02, w_r: 0.015,
      r_f: 0.03, r_c: 0.045,
      r_d_base: 0.035, endogenousRd: false, extraSpread: 0,
      W0: 1250, tauS: 0.113, tauE: 0.165, phiF: 0,
      F0: 220, E0: 307,
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.10, g_h: 0.015, T_hlm: 20,
      hlmDiscount: false, delta: 0,
      A0: 7.0,
      R: 17,
      kappa: 0.10, threshold: 2097,
      useEquinoxe: false,
      Tpk: 8, Thl: 28,
      alpha: 1.0, lambda: 0.30, Tlambda: 15,
      existingDebt: 3200, baseGDP: 2850,
      cutoffAge: null, existingDebtGrowth: 0,
      rpThreshold1: 150, rpSlope1: 0.0002,
      rpThreshold2: 200, rpSlope2: 0.0004,
      rpThreshold3: 300, rpSlope3: 0.0010,
    },
  },
  optimiste: {
    label: 'Optimiste',
    description: 'r_c=4%, w_r=1.2%, endogenous r_d, ρ=5%',
    params: {
      N: 70, pi: 0.02, w_r: 0.012,
      r_f: 0.03, r_c: 0.04,
      r_d_base: 0.035, endogenousRd: true, extraSpread: 0,
      W0: 1250, tauS: 0.113, tauE: 0.165, phiF: 0,
      F0: 220, E0: 345,
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.05, g_h: 0.015, T_hlm: 20,
      hlmDiscount: true, delta: 0.3,
      A0: 7.0,
      R: 17,
      kappa: 0.10, threshold: 2097,
      useEquinoxe: true,
      Tpk: 8, Thl: 18,
      alpha: 1.0, lambda: 0.30, Tlambda: 15,
      existingDebt: 3200, baseGDP: 2850,
      cutoffAge: 50, existingDebtGrowth: 0.02,
      rpThreshold1: 150, rpSlope1: 0.0002,
      rpThreshold2: 200, rpSlope2: 0.0004,
      rpThreshold3: 300, rpSlope3: 0.0010,
    },
  },
  stress: {
    label: 'Stress Test',
    description: 'r_c=2.5%, w_r=0.5%, r_d endogenous +50bps, ρ=3%, 15% HLM discount',
    params: {
      N: 70, pi: 0.02, w_r: 0.005,
      r_f: 0.03, r_c: 0.025,
      r_d_base: 0.035, endogenousRd: true, extraSpread: 0.005,
      W0: 1250, tauS: 0.113, tauE: 0.165, phiF: 0,
      F0: 220, E0: 345,
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.03, g_h: 0.015, T_hlm: 20,
      hlmDiscount: true, delta: 0.5,
      A0: 7.0,
      R: 17,
      kappa: 0.10, threshold: 2097,
      useEquinoxe: true,
      Tpk: 8, Thl: 18,
      alpha: 1.0, lambda: 0.30, Tlambda: 15,
      existingDebt: 3200, baseGDP: 2850,
      cutoffAge: 50, existingDebtGrowth: 0.035,
      rpThreshold1: 150, rpSlope1: 0.0002,
      rpThreshold2: 200, rpSlope2: 0.0004,
      rpThreshold3: 300, rpSlope3: 0.0010,
    },
  },
}

/**
 * Run the full deterministic simulation.
 * Returns an array of yearly state objects.
 */
export function runSimulation(params) {
  const {
    N, pi, w_r,
    r_f, r_c,
    r_d_base, endogenousRd, extraSpread,
    W0, tauS, tauE, phiF,
    F0, E0,
    U0, P0, Pbook, rho, g_h, T_hlm = 20,
    hlmDiscount, delta,
    A0, R,
    kappa, threshold,
    useEquinoxe,
    Tpk, Thl,
    alpha, lambda, Tlambda,
    existingDebt, baseGDP,
    cutoffAge = null,
    existingDebtGrowth = 0,
    rpThreshold1, rpSlope1,
    rpThreshold2, rpSlope2,
    rpThreshold3, rpSlope3,
  } = params

  // Transition rule derived values (cutoff-based cohort routing)
  const T_career = 43
  const T_capi_start = (cutoffAge == null) ? 0 : Math.max(0, 66 - cutoffAge)
  const Tlambda_effective = Math.max(Tlambda, T_capi_start)

  // Fisher conversion (eqs 1-2)
  const w_n = pi + w_r + pi * w_r  // exact Fisher
  const r_f_n = (1 + r_f) * (1 + pi) - 1  // eq 1
  const r_c_n = (1 + r_c) * (1 + pi) - 1  // eq 2
  // Pension indexation: French law indexes on inflation (π). When real wage
  // growth is negative (w_n < π), legal indexation would exceed wage growth,
  // so we cap at wage growth to avoid pensions outpacing the wage bill.
  const iota = (w_n < pi) ? w_n : pi

  // Smoothstep helper (Hermite C¹ blend from 0 to 1 on [a,b])
  const smoothstep = (x, a, b) => {
    if (b === a) return x >= a ? 1 : 0
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)
  }

  // Pension reduction savings (eq 8 or Equinoxe)
  const S0 = useEquinoxe ? equinoxeSavings(R) : stepReductionSavings(R, kappa, threshold)

  // Base expenditure net of savings
  const E0net = E0 - S0

  // HLM baseline transactions for volume discount
  const baselineTransactions = 850000

  const results = []
  let debt = 0        // model-specific sovereign debt (Md€)
  let fund = F0       // legacy fund balance (Md€)
  let capi = 0        // capitalisation pot (Md€)
  let cumDiscount = 1 // Π_{s=0..t-1} 1/(1+r_d(s)), proper time-varying discount
  let cumCapiShortfall = 0  // cumulative unmet capi pension payouts (Md€)

  for (let t = 0; t < N; t++) {
    const year = 2026 + t

    // Growth factors (eqs 4-6)
    const wFactor = Math.pow(1 + w_n, t)      // eq 4
    const idxFact = Math.pow(1 + iota, t)      // eq 5
    const hpFact = Math.pow((1 + g_h) * (1 + pi), t)  // eq 6 (nominal house price growth, Fisher)

    // --- Retiree kernel (eq 10, revised) ---
    // `retireeIdx` is the total retiree headcount index (COR central scenario:
    //   1.00 in 2026 → 1.30 peak ~2060 → 1.25 long-run plateau). The boomer
    //   bulge is already embedded in this aggregate trajectory.
    // `cohIdx` is the pre-reform cohort SHARE: fraction of today's retirees
    //   (plus their contemporaries still retiring) still alive. Monotonic
    //   smooth decay from 1.0 to 0.0 over T_extinct years. No bulge — the
    //   bulge lives in retireeIdx, not here. (Tpk/Thl still tune the decay
    //   shape via a half-life-like parameterisation.)
    //
    // Prior formulation used `max(cohIdx, demographicBaseline)` which
    // created a kink when the two curves crossed (visible dip in total
    // pensions ~2035). This version separates aggregate demography from
    // cohort share and routes the two populations cleanly.
    const T_extinct = 70
    const cohIdx = t >= T_extinct
      ? 0
      : 1 - smoothstep(t, 0, T_extinct)
    const DEMO_PEAK_T = 22
    const DEMO_PEAK_MULT = 1.30
    const DEMO_LONG_RUN_MULT = 1.25
    const demoRampUp = smoothstep(t, 0, DEMO_PEAK_T) * (DEMO_PEAK_MULT - 1)
    const demoDecline = smoothstep(t, DEMO_PEAK_T, T_extinct) * (DEMO_PEAK_MULT - DEMO_LONG_RUN_MULT)
    const retireeIdx = 1 + demoRampUp - demoDecline
    // Capi retiree pool builds gradually as successive post-cutoff cohorts cross retirement age.
    const capiRampSpan = cutoffAge == null ? 20 : Math.max(5, cutoffAge - 22)
    const capiActivation = smoothstep(t, T_capi_start, T_capi_start + capiRampSpan)
    // Post-reform share of retirees, eligible for capi; gated by capiActivation.
    const capiRetirees = (1 - cohIdx) * retireeIdx * capiActivation
    // Legacy retirees = pre-reform cohort + post-reform retirees not yet on capi.
    // Conservation: legacyRetirees + capiRetirees = retireeIdx exactly.
    const legacyRetirees = retireeIdx - capiRetirees
    // Diagnostic share (fraction of retirees drawing capi)
    const capiRetireeShare = retireeIdx > 0 ? capiRetirees / retireeIdx : 0

    // Annual legacy expenditure (eq 11) — scales with legacy retiree headcount
    const legacyExp = Math.max(0, E0net * legacyRetirees * idxFact)

    // Wage bill and contributions (eqs 12-14)
    const wageBill = W0 * wFactor               // eq 12
    const emplC_s = wageBill * tauS              // eq 13
    const emplC_e = wageBill * tauE              // eq 14

    // Routing worker contributions: with cutoffAge, only a progressive share of the
    // workforce is enrolled in the capi regime. Others keep contributing to PAYG (legacy).
    // shareWorkersCapi = fraction of the workforce whose age in 2026 was ≤ cutoffAge,
    // increasing linearly as older cohorts retire. Bit-exact reproduces old model when
    // cutoffAge == null (share = 1 always).
    const shareWorkersCapi = (cutoffAge == null)
      ? 1
      : Math.min(1, Math.max(0, (cutoffAge - 22 + t) / T_career))
    const emplC_s_toCapi = emplC_s * shareWorkersCapi
    const emplC_s_toPayg = emplC_s * (1 - shareWorkersCapi)

    // HLM proceeds (eqs 15-17)
    const unitsRemaining = U0 * Math.pow(1 - rho, t)  // eq 15 (millions)
    const unitsSold = (t === 0 ? U0 * rho : U0 * Math.pow(1 - rho, t - 1) * rho)  // eq 16 (millions)
    const unitsSoldCount = unitsSold * 1e6  // actual count

    // Volume-dependent price discount (critique fix #3) — single 30% cap
    let priceDiscount = 0
    if (hlmDiscount && delta > 0) {
      priceDiscount = Math.min(0.30, delta * (unitsSoldCount / baselineTransactions))
    }
    const effectivePrice = P0 * hpFact * (1 - priceDiscount)

    const capitalGain = Math.max(0, effectivePrice - Pbook)  // k€ per unit
    // Finite program horizon: smooth taper to zero over the last 5 years of T_hlm.
    const hlmProgramActive = 1 - smoothstep(t, T_hlm - 5, T_hlm)
    const hlmProceeds = unitsSold * capitalGain * 0.95 * hlmProgramActive

    // Fiscal abatement recovery (eq 18)
    const abatement = A0 * wFactor

    // Fund investment return (eq 19)
    const fundReturn = fund * r_f_n

    // Endogenous borrowing rate (critique fix #2)
    // GDP grows at nominal wage growth rate (simplification)
    const gdp = baseGDP * wFactor
    // Existing French debt grows at its own nominal rate (pre-reform trajectory).
    // Default 0 reproduces prior behaviour bit-exact.
    const existingDebtCurrent = existingDebt * Math.pow(1 + existingDebtGrowth, t)
    const totalDebtForRatio = existingDebtCurrent + debt
    const debtRatio = (totalDebtForRatio / gdp) * 100

    let r_d
    if (endogenousRd) {
      r_d = calculateBorrowingRate(debtRatio, {
        baseRate: r_d_base,
        threshold1: rpThreshold1, slope1: rpSlope1,
        threshold2: rpThreshold2, slope2: rpSlope2,
        threshold3: rpThreshold3, slope3: rpSlope3,
        extraSpread,
      })
    } else {
      r_d = r_d_base
    }
    // Hard ceiling on sovereign rate. Without it, the endogenous spread creates
    // a positive feedback (high debt → high r_d → more debt) that diverges
    // numerically under stress parameters. 20% matches historical EM-crisis
    // ceilings (Greece 2012 ~12%, Argentina 2001 ~20%); beyond that level a
    // sovereign is effectively cut off from markets and this model no longer
    // applies. Surfacing the cap is more honest than silently exploding.
    const R_D_CAP = 0.20
    r_d = Math.min(r_d, R_D_CAP)

    // Debt interest (eq 20)
    const debtInterest = debt * r_d

    // Employer contribution allocation (eqs 21-23)
    const nonEmplrNet = fundReturn + hlmProceeds + abatement + emplC_s_toPayg - debtInterest  // eq 21
    const deficit = legacyExp - nonEmplrNet
    const emplrAvail = emplC_e * (1 - phiF)

    let emplrToLeg, emplrToCap
    if (deficit <= 0) {
      emplrToLeg = 0
      emplrToCap = emplC_e
    } else if (deficit <= emplrAvail) {
      emplrToLeg = deficit
      emplrToCap = emplC_e - deficit
    } else {
      emplrToLeg = emplrAvail
      emplrToCap = emplC_e * phiF
    }

    // Net flow (eqs 24-25)
    const totalInflows = nonEmplrNet + emplrToLeg  // eq 24
    const netFlow = totalInflows - legacyExp        // eq 25

    // Borrow or repay (eqs 26-29)
    let borrowed = 0, repaid = 0
    if (netFlow < 0) {
      borrowed = -netFlow                            // eq 26
      debt = debt + borrowed
    } else {
      repaid = Math.min(alpha * netFlow, debt)       // eq 27
      debt = debt - repaid                           // eq 28
      fund = fund + netFlow - repaid                 // eq 29
    }

    // Transition levy (eqs 30-31) — smoothed activation and phase-out (critique fix #5).
    // Activation: 2-year ramp around Tlambda_effective (was a hard step).
    // Phase-out: scales with debt/gdp, fading to zero as debt → 0 (was a step at debt=0).
    // Legacy behavior recovered in the limit debt ≫ gdp and t ≫ Tlambda_effective.
    const levyActivation = smoothstep(t, Tlambda_effective - 1, Tlambda_effective + 1)
    const debtToGdp = gdp > 0 ? debt / gdp : 0
    const levyPhaseOut = smoothstep(debtToGdp, 0, 0.05)  // fades over last 5% of GDP
    const levyFactor = levyActivation * levyPhaseOut
    const grossLevy = levyFactor * lambda * (emplC_s_toCapi + emplrToCap)  // eq 30
    const levy = Math.min(grossLevy, debt)
    debt = Math.max(0, debt - levy)                  // eq 31

    // Net capitalisation flow (eq 32) — only the share flowing to capi
    const netCapiFlow = emplC_s_toCapi + emplrToCap - levy

    // --- Capitalisation pension payouts ---
    // Desired payout scales with retiree headcount (cohIdx) × capi share × full index.
    // This ties legacy and capi to a single demographic kernel so their sum is
    // continuous across the transition.
    const capiPayoutDesired = E0 * capiRetirees * idxFact

    // Pot constraint (critique fix #2): cannot pay out more than the pot holds
    // after this year's returns and contributions. Shortfall is tracked explicitly
    // rather than silently masked by a Math.max(0) clamp on `capi`.
    
    // General Equilibrium (GE) feedback on capi return.
    // As the fund approaches the size of the macro-economy, capital abundance
    // suppresses the equity premium, driving real returns towards 0.
    // Return approaches inflation as fund reaches GDP, caps at inflation (real return 0) at 2x GDP.
    const capiToGdpRatio = gdp > 0 ? capi / gdp : 0
    const gePenalty = Math.max(0, 1 - (capiToGdpRatio / 2))
    const r_c_eff = r_c * gePenalty
    const r_c_n_eff = (1 + r_c_eff) * (1 + pi) - 1

    const capiAvailable = capi * (1 + r_c_n_eff) + netCapiFlow

    // State Guarantee (Holistic Resolution): 
    // If the capitalisation fund goes bankrupt, the state cannot let pensions plummet.
    // The state guarantees the payout, absorbing any shortfall as new sovereign debt.
    const capiShortfall = Math.max(0, capiPayoutDesired - capiAvailable)
    const capiPayout = capiPayoutDesired // State guarantees full desired payout
    
    if (capiShortfall > 0) {
      debt += capiShortfall
      borrowed += capiShortfall // Track for UI flows
    }

    cumCapiShortfall += capiShortfall
    // Kept for diagnostic continuity with prior API
    const capiPayoutShare = capiPayoutDesired > 0 ? capiPayout / capiPayoutDesired : 0

    // Total pension expenditure = legacy (PAYG) + capi-funded actually paid
    const totalPensionExp = legacyExp + capiPayout

    // Capitalisation accumulation (eqs 33-34) — bounded at 0 if bankrupt
    capi = Math.max(0, capiAvailable - capiPayout)  // eq 33, adjusted
    const capiReal = capi / Math.pow(1 + pi, t + 1)  // eq 34

    // Spread (eq 3)
    const spread = r_f - (r_d - pi)

    // Cumulative interest (for KPI)
    const prevCumInterest = t > 0 ? results[t - 1].cumInterest : 0

    // --- NPV calculations (critique fix #1) ---
    // Proper time-varying discount: cumulative product of (1 + r_d(s)) over the path,
    // not this year's rate raised to (t+1). Previous formula caused retroactive jumps
    // in cumulative PV whenever endogenous r_d stepped up (debt-crisis regime).
    cumDiscount = cumDiscount / (1 + r_d)
    const pvFactor = cumDiscount
    const pvLegacyExp = legacyExp * pvFactor
    const pvCapiPayout = capiPayout * pvFactor
    // NPV of debt stock: just the nominal debt discounted (though debt IS the NPV of itself at par)
    // More useful: we track cumulative PV of legacy liabilities and capi assets

    const prevPvLegacyCum = t > 0 ? results[t - 1].pvLegacyCum : 0
    const prevPvCapiPayoutCum = t > 0 ? results[t - 1].pvCapiPayoutCum : 0

    results.push({
      t,
      year,
      cohIdx,
      legacyExp,
      capiPayout,
      totalPensionExp,
      capiPayoutShare,
      wageBill,
      emplC_s,
      emplC_s_toCapi,
      emplC_s_toPayg,
      shareWorkersCapi,
      emplC_e,
      existingDebtCurrent,
      emplrToLeg,
      emplrToCap,
      unitsRemaining: unitsRemaining * 1e6,
      unitsSold: unitsSoldCount,
      hlmProceeds,
      priceDiscount,
      abatement,
      fundReturn,
      fund,
      r_d,
      debtInterest,
      debtRatio,
      nonEmplrNet,
      netFlow,
      borrowed,
      repaid,
      levy,
      debt,
      netCapiFlow,
      capi,
      capiReal,
      capiPayoutDesired,
      capiShortfall,
      cumCapiShortfall,
      spread,
      cumInterest: prevCumInterest + debtInterest,
      S0,
      gdp,
      // NPV series (cumulative PV of future flows, discounted at r_d)
      pvLegacyExp,
      pvLegacyCum: prevPvLegacyCum + pvLegacyExp,
      pvCapiPayout,
      pvCapiPayoutCum: prevPvCapiPayoutCum + pvCapiPayout,
    })
  }

  return results
}

/**
 * Extract KPIs from simulation results.
 */
export function extractKPIs(results) {
  const peakDebt = Math.max(...results.map(r => r.debt))
  const peakDebtYear = results.find(r => r.debt === peakDebt)?.year

  const debtFreeYear = results.find(r => r.debt <= 0.01 && r.t > 5)?.year || null

  const totalInterest = results[results.length - 1].cumInterest

  const finalCapi = results[results.length - 1].capi
  const finalCapiReal = results[results.length - 1].capiReal

  const finalDebt = results[results.length - 1].debt
  const netPosition = finalCapi - finalDebt

  const minSpread = Math.min(...results.map(r => r.spread))

  const last = results[results.length - 1]
  const totalCapiShortfall = last.cumCapiShortfall
  const peakCapiShortfall = Math.max(...results.map(r => r.capiShortfall))
  const firstShortfallYear = results.find(r => r.capiShortfall > 0.1)?.year || null
  return {
    peakDebt,
    peakDebtYear,
    debtFreeYear,
    totalInterest,
    finalCapi,
    finalCapiReal,
    netPosition,
    minSpread,
    S0: results[0]?.S0 || 0,
    pvLegacyTotal: last.pvLegacyCum,
    pvCapiPayoutTotal: last.pvCapiPayoutCum,
    totalCapiShortfall,
    peakCapiShortfall,
    firstShortfallYear,
  }
}
