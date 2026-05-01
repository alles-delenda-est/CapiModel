// Optimisation sweep: betaK (excess-return channel) and tauK (stock-levy channel).
//
// For each parameter value the script runs the full 70-year v1.1 engine and
// records five KPIs:
//   peakDebt        Md€   — max D_t across the horizon
//   totalInterest   Md€   — cumulative CI_t (debtInterest sum)
//   debtFreeYear    yr    — first year D_t < 1 Md€ (null = never)
//   capiPayoutRatio  %    — (ΣcapiPayout_t sweep) / (ΣcapiPayout_t baseline)
//   minCapiPayoutRatio % — min(capiPayout_t sweep / capiPayout_t baseline) year-by-year
//
// Sweeps run independently (not jointly) to keep runtime manageable.

import { runSimulation, DEFAULT_CONFIG } from '../src/simulation-engine.js'

// ── helpers ────────────────────────────────────────────────────────────────

function kpis(rows, baselineRows) {
  const peakDebt      = Math.max(...rows.map(r => r.D_t))
  const totalInterest = rows[rows.length - 1].CI_t
  const debtFreeYear  = rows.find(r => r.D_t < 1 && r.t > 5)?.year ?? null

  // capi payout preservation
  let sumPayout = 0, sumBaseline = 0, minRatio = 1
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i].capiPayout_t
    const b = baselineRows[i].capiPayout_t
    sumPayout    += p
    sumBaseline  += b
    if (b > 0.01) minRatio = Math.min(minRatio, p / b)
  }
  const capiPayoutRatio    = sumBaseline > 0 ? sumPayout / sumBaseline : 1
  const minCapiPayoutRatio = minRatio

  return { peakDebt, totalInterest, debtFreeYear, capiPayoutRatio, minCapiPayoutRatio }
}

const fmt = (v, dec = 1) => v == null ? '     never' : v.toFixed(dec).padStart(10)
const fmtYr = v => v == null ? '      never' : String(v).padStart(11)

// ── baseline ───────────────────────────────────────────────────────────────

const baseline = runSimulation(DEFAULT_CONFIG)
const base = kpis(baseline, baseline)

console.log('================================================================')
console.log('  CapiModel v1.1 — debt-reduction optimisation sweep')
console.log('================================================================')
console.log()
console.log(`Baseline (betaK=0, tauK=0):`)
console.log(`  peakDebt      = ${base.peakDebt.toFixed(1)} Md€`)
console.log(`  totalInterest = ${base.totalInterest.toFixed(1)} Md€`)
console.log(`  debtFreeYear  = ${base.debtFreeYear ?? 'never (within 70-yr horizon)'}`)
console.log(`  capiPayoutRatio = 100% (reference)`)
console.log()

// ── sweep A: betaK ─────────────────────────────────────────────────────────

const betaKValues = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50,
                     0.60, 0.70, 0.80, 0.90, 1.00]

console.log('══════════════════════════════════════════════════════════════')
console.log('  Sweep A — betaK: fraction of excess capi return → debt')
console.log('  (excess = max(0, K_prev × r_cn − capiPayoutDesired))')
console.log('══════════════════════════════════════════════════════════════')
console.log(
  'betaK'.padEnd(8),
  'peakDebt(Md€)'.padStart(14),
  'Δpeak%'.padStart(8),
  'totInt(Md€)'.padStart(12),
  'ΔtotInt%'.padStart(10),
  'debtFreeYr'.padStart(11),
  'payoutRat%'.padStart(11),
  'minPayout%'.padStart(11),
)
console.log('-'.repeat(87))

const sweepA = []
for (const bk of betaKValues) {
  const rows = runSimulation({ ...DEFAULT_CONFIG, betaK: bk })
  const k = kpis(rows, baseline)
  sweepA.push({ betaK: bk, ...k })
  console.log(
    bk.toFixed(2).padEnd(8),
    k.peakDebt.toFixed(1).padStart(14),
    ((k.peakDebt / base.peakDebt - 1) * 100).toFixed(1).padStart(8),
    k.totalInterest.toFixed(1).padStart(12),
    ((k.totalInterest / base.totalInterest - 1) * 100).toFixed(1).padStart(10),
    fmtYr(k.debtFreeYear),
    (k.capiPayoutRatio * 100).toFixed(2).padStart(11),
    (k.minCapiPayoutRatio * 100).toFixed(2).padStart(11),
  )
}

// Find optimal betaK: maximize debt reduction while keeping minPayoutRatio >= 90%
const eligibleA = sweepA.filter(r => r.minCapiPayoutRatio >= 0.90)
const optA = eligibleA.reduce((best, r) =>
  r.totalInterest < best.totalInterest ? r : best, eligibleA[0] ?? sweepA[0])
console.log()
console.log(`→ Optimal betaK (minPayout ≥ 90%): betaK = ${optA.betaK.toFixed(2)}`)
console.log(`  peakDebt = ${optA.peakDebt.toFixed(1)} Md€ (${((optA.peakDebt/base.peakDebt-1)*100).toFixed(1)}%)`)
console.log(`  totalInterest = ${optA.totalInterest.toFixed(1)} Md€ (${((optA.totalInterest/base.totalInterest-1)*100).toFixed(1)}%)`)
console.log(`  debtFreeYear = ${optA.debtFreeYear ?? 'never'}`)
console.log(`  minCapiPayoutRatio = ${(optA.minCapiPayoutRatio*100).toFixed(1)}%`)

// ── sweep B: tauK ──────────────────────────────────────────────────────────

const tauKValues = [0, 0.0025, 0.005, 0.0075, 0.010, 0.0125, 0.015,
                    0.020, 0.025, 0.030, 0.035, 0.040, 0.050]

console.log()
console.log('══════════════════════════════════════════════════════════════')
console.log('  Sweep B — tauK: annual levy on K_t stock → debt')
console.log('  (applied only while D_t > 0)')
console.log('══════════════════════════════════════════════════════════════')
console.log(
  'tauK%'.padEnd(8),
  'peakDebt(Md€)'.padStart(14),
  'Δpeak%'.padStart(8),
  'totInt(Md€)'.padStart(12),
  'ΔtotInt%'.padStart(10),
  'debtFreeYr'.padStart(11),
  'payoutRat%'.padStart(11),
  'minPayout%'.padStart(11),
)
console.log('-'.repeat(87))

const sweepB = []
for (const tk of tauKValues) {
  const rows = runSimulation({ ...DEFAULT_CONFIG, tauK: tk })
  const k = kpis(rows, baseline)
  sweepB.push({ tauK: tk, ...k })
  console.log(
    (tk * 100).toFixed(2).padEnd(8),
    k.peakDebt.toFixed(1).padStart(14),
    ((k.peakDebt / base.peakDebt - 1) * 100).toFixed(1).padStart(8),
    k.totalInterest.toFixed(1).padStart(12),
    ((k.totalInterest / base.totalInterest - 1) * 100).toFixed(1).padStart(10),
    fmtYr(k.debtFreeYear),
    (k.capiPayoutRatio * 100).toFixed(2).padStart(11),
    (k.minCapiPayoutRatio * 100).toFixed(2).padStart(11),
  )
}

const eligibleB = sweepB.filter(r => r.minCapiPayoutRatio >= 0.90)
const optB = eligibleB.reduce((best, r) =>
  r.totalInterest < best.totalInterest ? r : best, eligibleB[0] ?? sweepB[0])
console.log()
console.log(`→ Optimal tauK (minPayout ≥ 90%): tauK = ${(optB.tauK*100).toFixed(2)}%`)
console.log(`  peakDebt = ${optB.peakDebt.toFixed(1)} Md€ (${((optB.peakDebt/base.peakDebt-1)*100).toFixed(1)}%)`)
console.log(`  totalInterest = ${optB.totalInterest.toFixed(1)} Md€ (${((optB.totalInterest/base.totalInterest-1)*100).toFixed(1)}%)`)
console.log(`  debtFreeYear = ${optB.debtFreeYear ?? 'never'}`)
console.log(`  minCapiPayoutRatio = ${(optB.minCapiPayoutRatio*100).toFixed(1)}%`)

// ── sweep C: combined optimal ──────────────────────────────────────────────

console.log()
console.log('══════════════════════════════════════════════════════════════')
console.log('  Sweep C — combined: betaK = opt-A × tauK grid')
console.log(`  (betaK fixed at ${optA.betaK.toFixed(2)}, vary tauK)`)
console.log('══════════════════════════════════════════════════════════════')
console.log(
  'tauK%'.padEnd(8),
  'peakDebt(Md€)'.padStart(14),
  'Δpeak%'.padStart(8),
  'totInt(Md€)'.padStart(12),
  'ΔtotInt%'.padStart(10),
  'debtFreeYr'.padStart(11),
  'payoutRat%'.padStart(11),
  'minPayout%'.padStart(11),
)
console.log('-'.repeat(87))

const sweepC = []
for (const tk of tauKValues) {
  const rows = runSimulation({ ...DEFAULT_CONFIG, betaK: optA.betaK, tauK: tk })
  const k = kpis(rows, baseline)
  sweepC.push({ tauK: tk, ...k })
  console.log(
    (tk * 100).toFixed(2).padEnd(8),
    k.peakDebt.toFixed(1).padStart(14),
    ((k.peakDebt / base.peakDebt - 1) * 100).toFixed(1).padStart(8),
    k.totalInterest.toFixed(1).padStart(12),
    ((k.totalInterest / base.totalInterest - 1) * 100).toFixed(1).padStart(10),
    fmtYr(k.debtFreeYear),
    (k.capiPayoutRatio * 100).toFixed(2).padStart(11),
    (k.minCapiPayoutRatio * 100).toFixed(2).padStart(11),
  )
}

const eligibleC = sweepC.filter(r => r.minCapiPayoutRatio >= 0.90)
const optC = eligibleC.reduce((best, r) =>
  r.totalInterest < best.totalInterest ? r : best, eligibleC[0] ?? sweepC[0])
console.log()
console.log(`→ Optimal combined (minPayout ≥ 90%): betaK=${optA.betaK.toFixed(2)}, tauK=${(optC.tauK*100).toFixed(2)}%`)
console.log(`  peakDebt = ${optC.peakDebt.toFixed(1)} Md€ (${((optC.peakDebt/base.peakDebt-1)*100).toFixed(1)}%)`)
console.log(`  totalInterest = ${optC.totalInterest.toFixed(1)} Md€ (${((optC.totalInterest/base.totalInterest-1)*100).toFixed(1)}%)`)
console.log(`  debtFreeYear = ${optC.debtFreeYear ?? 'never'}`)
console.log(`  minCapiPayoutRatio = ${(optC.minCapiPayoutRatio*100).toFixed(1)}%`)

// ── year-by-year detail for combined optimum ───────────────────────────────

console.log()
console.log('══════════════════════════════════════════════════════════════')
console.log('  Detail — combined optimum vs baseline (selected years)')
console.log('══════════════════════════════════════════════════════════════')
const detailRows = runSimulation({ ...DEFAULT_CONFIG, betaK: optA.betaK, tauK: optC.tauK })
console.log(
  'year'.padEnd(6),
  'D_t base(Md€)'.padStart(14),
  'D_t opt(Md€)'.padStart(13),
  'K_t base(Md€)'.padStart(14),
  'K_t opt(Md€)'.padStart(13),
  'capiPayout base'.padStart(16),
  'capiPayout opt'.padStart(15),
  'betaKRep'.padStart(9),
  'tauKLev'.padStart(8),
)
console.log('-'.repeat(112))
const milestones = new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 69])
for (let t = 0; t < detailRows.length; t++) {
  if (!milestones.has(t)) continue
  const r = detailRows[t]
  const b = baseline[t]
  console.log(
    String(r.year).padEnd(6),
    b.D_t.toFixed(1).padStart(14),
    r.D_t.toFixed(1).padStart(13),
    b.K_t.toFixed(1).padStart(14),
    r.K_t.toFixed(1).padStart(13),
    b.capiPayout_t.toFixed(2).padStart(16),
    r.capiPayout_t.toFixed(2).padStart(15),
    r.betaKRepayment_t.toFixed(2).padStart(9),
    r.tauKLevy_t.toFixed(2).padStart(8),
  )
}
