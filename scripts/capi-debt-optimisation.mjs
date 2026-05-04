// Optimisation sweep: tauK (stock-levy channel) debt-reduction analysis.
//
// v1.2: betaK channel deleted (non-monotone, K_t→0 at horizon, never debt-free).
//       tauK with K_t solvency floor is the only debt-reduction channel.
//
// For each tauK value the script runs the full 70-year v1.2 engine and
// records five KPIs:
//   peakDebt        Md€   — max D_t across the horizon
//   totalInterest   Md€   — cumulative CI_t (debtInterest sum)
//   debtFreeYear    yr    — first year D_t < 1 Md€ (null = never)
//   capiPayoutRatio  %    — (ΣcapiPayout_t sweep) / (ΣcapiPayout_t baseline)
//   minCapiPayoutRatio % — min(capiPayout_t sweep / capiPayout_t baseline) year-by-year

import { runSimulation, DEFAULT_CONFIG } from '../src/simulation-engine.js'

// ── helpers ────────────────────────────────────────────────────────────────

function kpis(rows, baselineRows) {
  const peakDebt      = Math.max(...rows.map(r => r.D_t))
  const totalInterest = rows[rows.length - 1].CI_t
  const debtFreeYear  = rows.find(r => r.D_t < 1 && r.t > 5)?.year ?? null
  const terminalDebt  = rows[rows.length - 1].D_t
  // K_t sustainability: K_t at t=69 minus K_floor_t at t=69 (positive = sustainable)
  const terminalKSurplus = rows[rows.length - 1].K_t - rows[rows.length - 1].K_floor_t

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

  return { peakDebt, totalInterest, debtFreeYear, terminalDebt, terminalKSurplus,
           capiPayoutRatio, minCapiPayoutRatio }
}

const fmt = (v, dec = 1) => v == null ? '     never' : v.toFixed(dec).padStart(10)
const fmtYr = v => v == null ? '      never' : String(v).padStart(11)

// ── baseline ───────────────────────────────────────────────────────────────

const baseline = runSimulation(DEFAULT_CONFIG)
const base = kpis(baseline, baseline)

console.log('================================================================')
console.log('  CapiModel v1.2 — tauK debt-reduction optimisation sweep')
console.log('================================================================')
console.log()
console.log(`Baseline (tauK=0):`)
console.log(`  peakDebt      = ${base.peakDebt.toFixed(1)} Md€`)
console.log(`  totalInterest = ${base.totalInterest.toFixed(1)} Md€`)
console.log(`  debtFreeYear  = ${base.debtFreeYear ?? 'never (within 70-yr horizon)'}`)
console.log(`  capiPayoutRatio = 100% (reference)`)
console.log()

// ── sweep: tauK ────────────────────────────────────────────────────────────

const tauKValues = [0, 0.0025, 0.005, 0.0075, 0.010, 0.0125, 0.015,
                    0.020, 0.025, 0.030, 0.035, 0.040, 0.050]

console.log('══════════════════════════════════════════════════════════════')
console.log('  Sweep — tauK: annual levy on K_t stock → debt')
console.log('  (applied only while D_t > 0; capped by K_t solvency floor)')
console.log('══════════════════════════════════════════════════════════════')
console.log(
  'tauK%'.padEnd(8),
  'peakDebt(Md€)'.padStart(14),
  'Δpeak%'.padStart(8),
  'totInt(Md€)'.padStart(12),
  'ΔtotInt%'.padStart(10),
  'termDbt(Md€)'.padStart(13),
  'KsurplusT69'.padStart(12),
  'minPayout%'.padStart(11),
)
console.log('-'.repeat(101))

const sweep = []
for (const tk of tauKValues) {
  const rows = runSimulation({ ...DEFAULT_CONFIG, tauK: tk })
  const k = kpis(rows, baseline)
  sweep.push({ tauK: tk, ...k })
  console.log(
    (tk * 100).toFixed(2).padEnd(8),
    k.peakDebt.toFixed(1).padStart(14),
    ((k.peakDebt / base.peakDebt - 1) * 100).toFixed(1).padStart(8),
    k.totalInterest.toFixed(1).padStart(12),
    ((k.totalInterest / base.totalInterest - 1) * 100).toFixed(1).padStart(10),
    k.terminalDebt.toFixed(1).padStart(13),
    k.terminalKSurplus.toFixed(1).padStart(12),
    (k.minCapiPayoutRatio * 100).toFixed(2).padStart(11),
  )
}

// Optimum: minPayoutRatio ≥ 90% AND terminal debt is NOT the global peak
// (terminalDebt == peakDebt means K_t depletion created a late-horizon spike).
// Margin: require terminalDebt < 95% of peakDebt.
const eligible = sweep.filter(r => r.minCapiPayoutRatio >= 0.90 && r.terminalDebt < r.peakDebt * 0.95)
const opt = eligible.reduce((best, r) =>
  r.totalInterest < best.totalInterest ? r : best, eligible[0] ?? sweep[0])
console.log()
console.log(`→ Optimal tauK (minPayout ≥ 90%, K sustainable at t=69): tauK = ${(opt.tauK*100).toFixed(2)}%`)
console.log(`  peakDebt = ${opt.peakDebt.toFixed(1)} Md€ (${((opt.peakDebt/base.peakDebt-1)*100).toFixed(1)}%)`)
console.log(`  totalInterest = ${opt.totalInterest.toFixed(1)} Md€ (${((opt.totalInterest/base.totalInterest-1)*100).toFixed(1)}%)`)
console.log(`  terminalDebt = ${opt.terminalDebt.toFixed(1)} Md€`)
console.log(`  terminalKSurplus = ${opt.terminalKSurplus.toFixed(1)} Md€`)
console.log(`  debtFreeYear = ${opt.debtFreeYear ?? 'never'}`)
console.log(`  minCapiPayoutRatio = ${(opt.minCapiPayoutRatio*100).toFixed(1)}%`)

// ── year-by-year detail for optimal tauK ──────────────────────────────────

console.log()
console.log('══════════════════════════════════════════════════════════════')
console.log('  Detail — optimal tauK vs baseline (selected years)')
console.log('══════════════════════════════════════════════════════════════')
const detailRows = runSimulation({ ...DEFAULT_CONFIG, tauK: opt.tauK })
console.log(
  'year'.padEnd(6),
  'D_t base(Md€)'.padStart(14),
  'D_t opt(Md€)'.padStart(13),
  'K_t base(Md€)'.padStart(14),
  'K_t opt(Md€)'.padStart(13),
  'K_floor(Md€)'.padStart(13),
  'capiPay base'.padStart(13),
  'capiPay opt'.padStart(12),
  'tauKLevy'.padStart(9),
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
    r.K_floor_t.toFixed(1).padStart(13),
    b.capiPayout_t.toFixed(2).padStart(13),
    r.capiPayout_t.toFixed(2).padStart(12),
    r.tauKLevy_t.toFixed(2).padStart(9),
  )
}
