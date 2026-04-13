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

// --- Equinoxe progressive reduction curve anchor points ---
// r(p) = reduction rate as a function of monthly brut pension p
const EQUINOXE_ANCHORS = [
  { p: 1800, r: 0.001 },
  { p: 2000, r: 0.004 },
  { p: 2500, r: 0.041 },
  { p: 3000, r: 0.10  },
  { p: 4000, r: 0.20  },
]

// Slope for extrapolation above 4000: (0.20 - 0.10) / (4000 - 3000) = 0.0001 per €
const EQUINOXE_EXTRAPOLATION_SLOPE = 0.0001

/**
 * Equinoxe reduction rate for a given monthly pension level.
 * Piecewise linear interpolation between anchor points.
 */
export function equinoxeReductionRate(p) {
  if (p <= 1800) return 0
  const anchors = EQUINOXE_ANCHORS
  for (let i = 0; i < anchors.length - 1; i++) {
    if (p <= anchors[i + 1].p) {
      const frac = (p - anchors[i].p) / (anchors[i + 1].p - anchors[i].p)
      return anchors[i].r + frac * (anchors[i + 1].r - anchors[i].r)
    }
  }
  // Above 4000: extrapolate linearly
  return anchors[anchors.length - 1].r + (p - anchors[anchors.length - 1].p) * EQUINOXE_EXTRAPOLATION_SLOPE
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
    description: 'r_c=3%, w_r=0.7%, E₀=345 Md€, réductions Equinoxe, taux endogènes',
    params: {
      N: 70, pi: 0.02, w_r: 0.007,
      r_f: 0.03, r_c: 0.03,
      r_d_base: 0.035, endogenousRd: true, extraSpread: 0,
      W0: 1250, tauS: 0.113, tauE: 0.165, phiF: 0,
      F0: 220, E0: 345,
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.05, g_h: 0.015,
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
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.10, g_h: 0.015,
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
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.05, g_h: 0.015,
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
      U0: 5.3, P0: 175, Pbook: 45, rho: 0.03, g_h: 0.015,
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
    U0, P0, Pbook, rho, g_h,
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
  const iota = Math.min(pi, w_n)  // pension indexation rate

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

  for (let t = 0; t < N; t++) {
    const year = 2026 + t

    // Growth factors (eqs 4-6)
    const wFactor = Math.pow(1 + w_n, t)      // eq 4
    const idxFact = Math.pow(1 + iota, t)      // eq 5
    const hpFact = Math.pow((1 + g_h) * (1 + pi), t)  // eq 6 (nominal house price growth, Fisher)

    // Cohort index (eq 10, modified)
    // Hard extinction: last worker with PAYG accrual (age ~20 at reform) retires at ~65
    // and dies by ~90, so legacy cohort extinct by t ≈ 70. Linear ramp to zero
    // from the exponential decay, reaching zero at T_extinct.
    const T_extinct = 70  // years after reform: no legacy pensioners remain
    let cohIdx
    if (t === 0) {
      cohIdx = 1.0
    } else if (t <= Tpk) {
      cohIdx = 1.0 + 0.18 * (t / Tpk)
    } else if (t >= T_extinct) {
      cohIdx = 0
    } else {
      // Exponential decay with linear blend to zero at T_extinct
      const expDecay = 1.18 * Math.exp(-(Math.LN2 / Thl) * (t - Tpk))
      // Linearly force to zero between T_extinct-10 and T_extinct
      const blendStart = T_extinct - 10
      if (t >= blendStart) {
        const blendFrac = (T_extinct - t) / (T_extinct - blendStart)
        cohIdx = expDecay * blendFrac
      } else {
        cohIdx = expDecay
      }
    }
    cohIdx = Math.max(0, cohIdx)

    // Annual legacy expenditure (eq 11)
    const legacyExp = Math.max(0, E0net * cohIdx * idxFact)

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

    // Volume-dependent price discount (critique fix #3)
    let priceDiscount = 0
    if (hlmDiscount && delta > 0) {
      priceDiscount = delta * (unitsSoldCount / baselineTransactions)
      priceDiscount = Math.min(priceDiscount, 0.30)  // floor: max 30% discount
    }
    const effectivePrice = P0 * hpFact * Math.max(0.70, 1 - priceDiscount)

    const capitalGain = Math.max(0, effectivePrice - Pbook)  // k€ per unit
    const hlmProceeds = unitsSold * capitalGain * 0.95  // Md€ (unitsSold in millions × capitalGain in k€ = 10⁶×10³ = Md€)

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

    // Transition levy (eqs 30-31) — only on actual capi inflows, and only after
    // cohort capi contributions have started.
    let levy = 0
    if (t >= Tlambda_effective && debt > 0) {
      levy = lambda * (emplC_s_toCapi + emplrToCap)  // eq 30
    }
    debt = Math.max(0, debt - levy)                  // eq 31

    // Net capitalisation flow (eq 32) — only the share flowing to capi
    const netCapiFlow = emplC_s_toCapi + emplrToCap - levy

    // --- Capitalisation pension payouts ---
    // Each retiring cohort's capi share = (post-reform career years) / (total career).
    // A worker retiring at t has min(t, career) years of capi contributions out of
    // ~43-year career (age 22→65). The first retirees (t=1-3) have tiny capi pots;
    // by t=43 new retirees are 100% capi-funded. The average capi share across all
    // retirees alive at time t is approximately t / T_career, capped at 1.
    // We use T_career ≈ 43 but weight early years lower (few retirees have capi yet,
    // and their pots are tiny), so use a slightly convex ramp: (t/T_career)^1.2.
    // With cutoffAge, payouts only begin after T_capi_start (= 66 - cutoffAge) years:
    // no cohort eligible to capi has yet reached retirement age. When cutoffAge == null,
    // T_capi_start = 0 and the formula is bit-exact identical to the original.
    let capiPayoutShare
    if (t < T_capi_start) {
      capiPayoutShare = 0
    } else {
      const effT = Math.min(t - T_capi_start, T_career)
      capiPayoutShare = Math.min(1, Math.pow(effT / T_career, 1.2))
    }
    // "Full system" expenditure = what total pensions would be with no reform
    // (indexed E0, before Equinoxe cuts — since capi pensions replace the original level)
    const fullSystemExp = E0 * idxFact
    const capiPayout = capiPayoutShare * fullSystemExp
    // Total pension expenditure = legacy (PAYG) + capi-funded
    const totalPensionExp = legacyExp + capiPayout

    // Capitalisation accumulation (eqs 33-34) — net of payouts
    capi = capi * (1 + r_c_n) + netCapiFlow - capiPayout  // eq 33, adjusted
    capi = Math.max(0, capi)
    const capiReal = capi / Math.pow(1 + pi, t + 1)  // eq 34

    // Spread (eq 3)
    const spread = r_f - (r_d - pi)

    // Cumulative interest (for KPI)
    const prevCumInterest = t > 0 ? results[t - 1].cumInterest : 0

    // --- NPV calculations ---
    // Discount rate: use r_d as the discount rate (opportunity cost of sovereign borrowing)
    // PV factor for year t cash flows
    const pvFactor = 1 / Math.pow(1 + r_d, t + 1)

    // NPV of remaining legacy liabilities: sum of future legacy expenditure from year t onward
    // We compute the PV contribution of this year's legacy expenditure
    const pvLegacyExp = legacyExp * pvFactor
    // NPV of capi payouts this year
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
  }
}
