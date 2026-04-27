// Offline calibration for stage 5 (labor market reform) in the transition walkthrough.
// Objective: minimize totalInterest subject to per-retiree real pension staying
// at or above its stage-5 2026 value throughout the simulation horizon.
// Run: node scripts/calibrate-stage5.js

import { runSimulation, extractKPIs, PRESETS } from '../src/simulation-engine.js'

// Stage 5 base: default preset + realistic demo + all reforms active
// (demographic reform of stage 6 is NOT applied yet).
const stage5Base = {
  ...PRESETS.default.params,
  demoProfile: 'realistic',
  useEquinoxe: true,
  cutoffAge: 50,
  hlmDiscount: true,
  delta: 0.3,
  rho: 0.05,
  T_hlm: 20,
  lambda: 0.30,
}

function minRealPerRetireeRatio(results, pi) {
  // Benchmark = t=0 per-retiree real pension in 2026€.
  const r0 = results[0]
  const benchmark = (r0.legacyExp + r0.capiPayoutDesired) / r0.retireeIdx
  let minRatio = Infinity
  for (const r of results) {
    const nominalPerRetiree = (r.legacyExp + r.capiPayoutDesired) / r.retireeIdx
    const realPerRetiree = nominalPerRetiree / Math.pow(1 + pi, r.t)
    const ratio = realPerRetiree / benchmark
    if (ratio < minRatio) minRatio = ratio
  }
  return minRatio
}

const R_ramp_grid = [0.02, 0.03, 0.05, 0.07, 0.10]
const R_ramp_years_grid = [8, 10, 12, 15]

const rows = []
for (const R_ramp of R_ramp_grid) {
  for (const R_ramp_years of R_ramp_years_grid) {
    const params = { ...stage5Base, R_ramp, R_ramp_years }
    const results = runSimulation(params)
    const k = extractKPIs(results)
    const minRatio = minRealPerRetireeRatio(results, params.pi)
    rows.push({
      R_ramp,
      R_ramp_years,
      totalInterest: k.totalInterest,
      peakDebt: k.peakDebt,
      debtFreeYear: k.debtFreeYear,
      minRatio,
      feasible: minRatio >= 1 - 1e-9,
    })
  }
}

// Also compute stage-4 (no labor reform) for context.
const stage4 = runSimulation({ ...stage5Base, R_ramp: 0, R_ramp_years: 10 })
const k4 = extractKPIs(stage4)
const r4 = minRealPerRetireeRatio(stage4, stage5Base.pi)

console.log('\nStage 4 (no labor reform) baseline:')
console.log(`  totalInterest = ${k4.totalInterest.toFixed(1)} Md€`)
console.log(`  peakDebt      = ${k4.peakDebt.toFixed(1)} Md€`)
console.log(`  debtFreeYear  = ${k4.debtFreeYear ?? 'never'}`)
console.log(`  minRealPerRetireeRatio = ${r4.toFixed(4)} (feasible: ${r4 >= 1})\n`)

console.log('Grid search results (sorted by totalInterest, ascending):\n')
console.log('R_ramp R_ramp_y  feasible  totalInt   peakDebt  debtFree  minRatio')
console.log('------ --------  --------  ---------  --------  --------  --------')
const sorted = [...rows].sort((a, b) => a.totalInterest - b.totalInterest)
for (const r of sorted) {
  const mark = r.feasible ? '  yes   ' : '  no    '
  console.log(
    `${r.R_ramp.toFixed(2)}     ${String(r.R_ramp_years).padStart(2)}      ${mark}  ` +
    `${r.totalInterest.toFixed(1).padStart(7)}   ${r.peakDebt.toFixed(1).padStart(7)}  ` +
    `${String(r.debtFreeYear ?? 'never').padStart(7)}   ${r.minRatio.toFixed(8)}`
  )
}

const feasible = sorted.filter(r => r.feasible)
if (feasible.length === 0) {
  console.log('\nNo feasible combination found. Consider widening the grid.')
  process.exit(1)
}

const best = feasible[0]
const near = feasible.filter(r => r.totalInterest <= best.totalInterest * 1.01)
const picked = near.sort((a, b) => a.R_ramp - b.R_ramp || a.R_ramp_years - b.R_ramp_years)[0]

console.log('\nBest feasible (lowest totalInterest):')
console.log(`  R_ramp=${best.R_ramp}, R_ramp_years=${best.R_ramp_years}`)
console.log(`  totalInterest=${best.totalInterest.toFixed(1)} Md€, peakDebt=${best.peakDebt.toFixed(1)} Md€, minRatio=${best.minRatio.toFixed(4)}`)

console.log('\nPicked (tie-break: smaller R_ramp within 1% of best):')
console.log(`  R_ramp=${picked.R_ramp}, R_ramp_years=${picked.R_ramp_years}`)
console.log(`  totalInterest=${picked.totalInterest.toFixed(1)} Md€, peakDebt=${picked.peakDebt.toFixed(1)} Md€, minRatio=${picked.minRatio.toFixed(4)}`)

// Observation: the pension-floor constraint is non-binding here because pensions
// are inflation-indexed (ι ≈ π) and capi shortfalls are state-guaranteed, so
// per-retiree real pension is roughly constant regardless of labor-reform level.
// The optimizer therefore sits on the upper-R_ramp boundary of the grid.
// We pick R_ramp=0.10, R_ramp_years=8 — roughly closing the France/Germany
// employment-rate gap over 8 years. More aggressive values would keep lowering
// cumulative interest but stretch credibility.
const allFeasibleOnBoundary = feasible.every(r => r.minRatio > 1 - 1e-6)
if (allFeasibleOnBoundary) {
  console.log(
    '\nNote: pension-floor constraint is non-binding across the whole grid ' +
    '(real per-retiree pension is constant by construction). The picked value ' +
    'sits at the R_ramp upper boundary.'
  )
}
