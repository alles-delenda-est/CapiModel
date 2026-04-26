// Scenario analysis: age-cutoff + hard-delay capi payouts vs baseline smooth ramp
// Runs 4 variants: baseline, cutoff=60, cutoff=55, cutoff=50
// Does NOT modify the production simulation-engine.js — standalone re-impl of the loop.

import { PRESETS, equinoxeReductionRate } from './src/simulation-engine.js'

// --- DREES 2022 pension distribution (copy — not re-exported) ---
const DREES_DECILES = [
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

function equinoxeSavings(R) {
  let S0 = 0
  const STEPS = 50
  for (const d of DREES_DECILES) {
    const lo = Math.max(d.lo, 0); const hi = d.hi
    const width = hi - lo
    if (width <= 0) continue
    let integral = 0
    for (let i = 0; i < STEPS; i++) {
      const p = lo + (i + 0.5) * (width / STEPS)
      integral += equinoxeReductionRate(p) * p * (width / STEPS)
    }
    S0 += (R / 10) * (integral / width) * 12 / 1e3
  }
  return S0
}

function calcBorrowRate(debtRatio, base, extra) {
  let premium = 0
  if (debtRatio > 150 && debtRatio <= 200) premium = (debtRatio - 150) * 0.0002
  else if (debtRatio > 200 && debtRatio <= 300) premium = 50 * 0.0002 + (debtRatio - 200) * 0.0004
  else if (debtRatio > 300) premium = 50 * 0.0002 + 100 * 0.0004 + (debtRatio - 300) * 0.0010
  return base + premium + extra
}

// Modified simulation with optional age cutoff + hard delay.
// cutoffAge=null → baseline behaviour (smooth ramp, no cutoff, Tlambda as configured)
function runWithCutoff(params, cutoffAge) {
  const {
    N, pi, w_r, r_f, r_c, r_d_base, endogenousRd, extraSpread,
    W0, tauS, tauE, phiF, F0, E0, U0, P0, Pbook, rho, g_h,
    hlmDiscount, delta, A0, R, kappa, threshold, useEquinoxe,
    Tpk, Thl, alpha, lambda, Tlambda,
    existingDebt, baseGDP,
  } = params

  const w_n = pi + w_r + pi * w_r
  const r_f_n = (1 + r_f) * (1 + pi) - 1
  const r_c_n = (1 + r_c) * (1 + pi) - 1
  const iota = Math.min(pi, w_n)

  const S0 = useEquinoxe ? equinoxeSavings(R) : 0
  const E0net = E0 - S0
  const baselineTransactions = 850000

  // --- Cutoff-derived values ---
  let T_capi_start, initialShareCapi, Tlambda_effective
  if (cutoffAge == null) {
    T_capi_start = 0
    initialShareCapi = 1
    Tlambda_effective = Tlambda  // keep original
  } else {
    T_capi_start = 66 - cutoffAge  // first capi retirement year
    initialShareCapi = (cutoffAge - 22) / 43
    Tlambda_effective = T_capi_start  // tie levy start to capi-payout start
  }

  const results = []
  let debt = 0, fund = F0, capi = 0

  for (let t = 0; t < N; t++) {
    const year = 2026 + t
    const wFactor = Math.pow(1 + w_n, t)
    const idxFact = Math.pow(1 + iota, t)
    const hpFact = Math.pow((1 + g_h) * (1 + pi), t)

    // Legacy cohort index (unchanged)
    const T_extinct = 70
    let cohIdx
    if (t === 0) cohIdx = 1.0
    else if (t <= Tpk) cohIdx = 1.0 + 0.18 * (t / Tpk)
    else if (t >= T_extinct) cohIdx = 0
    else {
      const expDecay = 1.18 * Math.exp(-(Math.LN2 / Thl) * (t - Tpk))
      const blendStart = T_extinct - 10
      cohIdx = t >= blendStart ? expDecay * (T_extinct - t) / (T_extinct - blendStart) : expDecay
    }
    cohIdx = Math.max(0, cohIdx)

    const legacyExp = Math.max(0, E0net * cohIdx * idxFact)

    // Wage bill
    const wageBill = W0 * wFactor
    const emplC_s_total = wageBill * tauS
    const emplC_e = wageBill * tauE

    // --- Share of workers in capi (grows linearly from initial to 1) ---
    let shareWorkersCapi
    if (cutoffAge == null) {
      shareWorkersCapi = 1
    } else {
      shareWorkersCapi = Math.min(1, (cutoffAge - 22 + t) / 43)
    }

    const emplC_s_toCapi = emplC_s_total * shareWorkersCapi
    const emplC_s_toPayg = emplC_s_total * (1 - shareWorkersCapi)  // adds to legacy revenue

    // HLM
    const unitsSold = (t === 0 ? U0 * rho : U0 * Math.pow(1 - rho, t - 1) * rho)
    const unitsSoldCount = unitsSold * 1e6
    let priceDiscount = 0
    if (hlmDiscount && delta > 0) {
      priceDiscount = Math.min(delta * (unitsSoldCount / baselineTransactions), 0.30)
    }
    const effectivePrice = P0 * hpFact * Math.max(0.70, 1 - priceDiscount)
    const capitalGain = Math.max(0, effectivePrice - Pbook)
    const hlmProceeds = unitsSold * capitalGain * 0.95

    const abatement = A0 * wFactor
    const fundReturn = fund * r_f_n

    // Borrowing rate
    const gdp = baseGDP * wFactor
    const debtRatio = ((existingDebt + debt) / gdp) * 100
    const r_d = endogenousRd ? calcBorrowRate(debtRatio, r_d_base, extraSpread) : r_d_base
    const debtInterest = debt * r_d

    // Employer contribution allocation — include emplC_s_toPayg as additional legacy income
    const nonEmplrNet = fundReturn + hlmProceeds + abatement + emplC_s_toPayg - debtInterest
    const deficit = legacyExp - nonEmplrNet
    const emplrAvail = emplC_e * (1 - phiF)

    let emplrToLeg, emplrToCap
    if (deficit <= 0) { emplrToLeg = 0; emplrToCap = emplC_e }
    else if (deficit <= emplrAvail) { emplrToLeg = deficit; emplrToCap = emplC_e - deficit }
    else { emplrToLeg = emplrAvail; emplrToCap = emplC_e * phiF }

    const totalInflows = nonEmplrNet + emplrToLeg
    const netFlow = totalInflows - legacyExp

    let borrowed = 0, repaid = 0
    if (netFlow < 0) { borrowed = -netFlow; debt = debt + borrowed }
    else { repaid = Math.min(alpha * netFlow, debt); debt = debt - repaid; fund = fund + netFlow - repaid }

    // Levy (tied to T_capi_start when cutoffAge set)
    let levy = 0
    if (t >= Tlambda_effective && debt > 0) {
      levy = lambda * (emplC_s_toCapi + emplrToCap)
    }
    debt = Math.max(0, debt - levy)

    const netCapiFlow = emplC_s_toCapi + emplrToCap - levy

    // Capi payouts: hard delay + career-pro-rata ramp (capped at 1)
    let capiPayoutShare
    if (t < T_capi_start) {
      capiPayoutShare = 0
    } else {
      capiPayoutShare = Math.min(1, Math.pow((t - T_capi_start) / 43, 1.2))
    }
    const fullSystemExp = E0 * idxFact
    const capiPayout = capiPayoutShare * fullSystemExp

    capi = capi * (1 + r_c_n) + netCapiFlow - capiPayout
    capi = Math.max(0, capi)
    const capiReal = capi / Math.pow(1 + pi, t + 1)
    const spread = r_f - (r_d - pi)
    const prevCum = t > 0 ? results[t - 1].cumInterest : 0

    results.push({
      t, year, debt, fund, capi, capiReal, debtRatio, r_d, spread,
      borrowed, repaid, levy, capiPayout, capiPayoutShare, shareWorkersCapi,
      cumInterest: prevCum + debtInterest,
    })
  }
  return results
}

function kpis(r) {
  const peakDebt = Math.max(...r.map(x => x.debt))
  const peakYear = r.find(x => x.debt === peakDebt).year
  const debtFree = r.find(x => x.debt <= 0.01 && x.t > 5)?.year || null
  const totalInt = r[r.length - 1].cumInterest
  const finalCapi = r[r.length - 1].capi
  const finalCapiReal = r[r.length - 1].capiReal
  const minSpread = Math.min(...r.map(x => x.spread))
  const maxDebtRatio = Math.max(...r.map(x => x.debtRatio))
  return { peakDebt, peakYear, debtFree, totalInt, finalCapi, finalCapiReal, minSpread, maxDebtRatio }
}

const p = PRESETS.default.params
const variants = [
  { name: 'Baseline (actuel)',           cutoff: null },
  { name: 'Cutoff 60 ans  (T_start=6)',  cutoff: 60 },
  { name: 'Cutoff 55 ans  (T_start=11)', cutoff: 55 },
  { name: 'Cutoff 50 ans  (T_start=16)', cutoff: 50 },
]

console.log('\n=== Comparative analysis: age cutoff + hard-delay capi ===\n')
const fmt = (n, d = 0) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)

// Header
console.log('Variant                          | Dette pic  | An. pic | Dette-free | Int. cum.  | Capi réel  | Max dette/PIB')
console.log('---------------------------------|------------|---------|------------|------------|------------|---------------')
const comparisons = []
for (const v of variants) {
  const r = runWithCutoff(p, v.cutoff)
  const k = kpis(r)
  comparisons.push({ name: v.name, r, k })
  console.log(
    v.name.padEnd(33) + ' | ' +
    (fmt(k.peakDebt) + ' Md€').padStart(10) + ' | ' +
    String(k.peakYear).padStart(7) + ' | ' +
    String(k.debtFree || 'jamais').padStart(10) + ' | ' +
    (fmt(k.totalInt) + ' Md€').padStart(10) + ' | ' +
    (fmt(k.finalCapiReal) + ' Md€').padStart(10) + ' | ' +
    (fmt(k.maxDebtRatio, 1) + ' %').padStart(13)
  )
}

// Debt trajectory at key years
console.log('\n=== Trajectoire de la dette (Md€) par année-clé ===\n')
const keyYears = [2030, 2035, 2040, 2045, 2050, 2060, 2070, 2080, 2095]
const header = 'Variant                          | ' + keyYears.map(y => String(y).padStart(7)).join(' | ')
console.log(header)
console.log('-'.repeat(header.length))
for (const c of comparisons) {
  const row = c.name.padEnd(33) + ' | ' +
    keyYears.map(y => {
      const rec = c.r.find(x => x.year === y)
      return (rec ? fmt(rec.debt) : '').padStart(7)
    }).join(' | ')
  console.log(row)
}

// Capi payout start timing check
console.log('\n=== Quand la capi commence-t-elle à verser ? ===\n')
for (const c of comparisons) {
  const firstPayout = c.r.find(x => x.capiPayout > 1)
  console.log(`${c.name.padEnd(33)} → 1ers versements capi > 1 Md€ en ${firstPayout ? firstPayout.year : 'jamais'}`)
}

// Capi pot trajectory
console.log('\n=== Pot de capitalisation (réel, Md€) ===\n')
console.log(header)
console.log('-'.repeat(header.length))
for (const c of comparisons) {
  const row = c.name.padEnd(33) + ' | ' +
    keyYears.map(y => {
      const rec = c.r.find(x => x.year === y)
      return (rec ? fmt(rec.capiReal) : '').padStart(7)
    }).join(' | ')
  console.log(row)
}
