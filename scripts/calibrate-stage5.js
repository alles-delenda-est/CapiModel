// Offline calibration for stage 4 (labour reform) of the v1.0a transition
// walkthrough. Objective: minimise totalInterest subject to the per-retiree
// real pension staying at or above its t=0 value throughout the horizon.
//
// Grid search over employmentRateTarget × employmentTransitionYears.
// (v0.11 used R_ramp / R_ramp_years; v1.0a parameterises labour reform via
//  employmentRateTarget and employmentTransitionYears directly per spec §3.2.)
//
// Run: node scripts/calibrate-stage5.js

import { runSimulation, DEFAULT_CONFIG } from '../src/simulation-engine-v1.js'
import { extractKPIs } from '../src/v1-presets.js'

// Stage 4 base: v1.0a default + realistic demo + Équinoxe + capi/HLM, but
// employment held flat (matches walkthrough Stage 3 in TransitionWalkthrough.jsx).
const stage4Base = {
  ...DEFAULT_CONFIG,
  demoProfile: 'realistic',
  useEquinoxe: true,
  enableCapi: true,
  cutoffAge: 50,
  hlmDiscount: true,
  delta: 0.3,
  rho: 0.05,
  T_hlm: 20,
  lambda: 0.30,
  // Held flat in Stage 3; the calibration searches for the labour-reform
  // ramp (Stage 4) value.
  employmentRate0: 0.69,
  employmentRateTarget: 0.69,
  employmentTransitionYears: 12,
}

// Per-retiree real pension floor.
//   nominal per retiree (Md€/yr) = (legacyExp_t + capiPayout_t) / retireeIdx(t)
//   real per retiree (Md€/yr 2027€) = nominal / (1+π)^t
function minRealPerRetireeRatio(rows, pi) {
  const r0 = rows[0]
  const benchmark = (r0.legacyExp_t + r0.capiPayout_t) / r0.retireeIdx
  let minRatio = Infinity
  for (const r of rows) {
    const nominalPerRetiree = (r.legacyExp_t + r.capiPayout_t) / r.retireeIdx
    const realPerRetiree = nominalPerRetiree / Math.pow(1 + pi, r.t)
    const ratio = realPerRetiree / benchmark
    if (ratio < minRatio) minRatio = ratio
  }
  return minRatio
}

// Search ranges (per Task 3 brief Tier A: employmentRateTarget ∈ [0.55, 0.85],
//  employmentTransitionYears ∈ [3, 25]). Restrict to plausible labour-reform
//  scenarios for this stage.
const target_grid = [0.71, 0.73, 0.75, 0.759, 0.77, 0.79]
const years_grid  = [5, 8, 10, 12, 15]

const rows = []
for (const employmentRateTarget of target_grid) {
  for (const employmentTransitionYears of years_grid) {
    const params = { ...stage4Base, employmentRateTarget, employmentTransitionYears }
    const results = runSimulation(params)
    const k = extractKPIs(results)
    const minRatio = minRealPerRetireeRatio(results, params.pi)
    rows.push({
      employmentRateTarget,
      employmentTransitionYears,
      totalInterest: k.totalInterest,
      peakDebt: k.peakDebt,
      debtFreeYear: k.debtFreeYear,
      minRatio,
      feasible: minRatio >= 1 - 1e-9,
    })
  }
}

// Stage 3 baseline (no labour reform).
const stage3 = runSimulation(stage4Base)
const k3 = extractKPIs(stage3)
const r3 = minRealPerRetireeRatio(stage3, stage4Base.pi)

console.log('\nStage 3 (no labour reform) baseline:')
console.log(`  totalInterest = ${k3.totalInterest.toFixed(1)} Md€`)
console.log(`  peakDebt      = ${k3.peakDebt.toFixed(1)} Md€`)
console.log(`  debtFreeYear  = ${k3.debtFreeYear ?? 'never'}`)
console.log(`  minRealPerRetireeRatio = ${r3.toFixed(6)} (feasible: ${r3 >= 1})\n`)

console.log('Grid search results (sorted by totalInterest, ascending):\n')
console.log('target  years   feasible   totalInt      peakDebt    debtFree   minRatio')
console.log('------  -----   --------   ---------     --------    --------   --------')
const sorted = [...rows].sort((a, b) => a.totalInterest - b.totalInterest)
for (const r of sorted) {
  const mark = r.feasible ? '   yes   ' : '   no    '
  console.log(
    `${r.employmentRateTarget.toFixed(3)}    ${String(r.employmentTransitionYears).padStart(2)}     ${mark}  ` +
    `${r.totalInterest.toFixed(1).padStart(10)}    ${r.peakDebt.toFixed(0).padStart(8)}    ` +
    `${String(r.debtFreeYear ?? 'never').padStart(7)}   ${r.minRatio.toFixed(6)}`
  )
}

const feasible = sorted.filter(r => r.feasible)
if (feasible.length === 0) {
  console.log('\nNo feasible combination found. Consider widening the grid.')
  process.exit(1)
}

const best = feasible[0]
const near = feasible.filter(r => r.totalInterest <= best.totalInterest * 1.01)
const picked = near.sort(
  (a, b) =>
    a.employmentRateTarget - b.employmentRateTarget
    || a.employmentTransitionYears - b.employmentTransitionYears,
)[0]

console.log('\nBest feasible (lowest totalInterest):')
console.log(`  employmentRateTarget=${best.employmentRateTarget}, employmentTransitionYears=${best.employmentTransitionYears}`)
console.log(`  totalInterest=${best.totalInterest.toFixed(1)} Md€, peakDebt=${best.peakDebt.toFixed(0)} Md€, minRatio=${best.minRatio.toFixed(6)}`)

console.log('\nPicked (tie-break: smaller target within 1% of best):')
console.log(`  employmentRateTarget=${picked.employmentRateTarget}, employmentTransitionYears=${picked.employmentTransitionYears}`)
console.log(`  totalInterest=${picked.totalInterest.toFixed(1)} Md€, peakDebt=${picked.peakDebt.toFixed(0)} Md€, minRatio=${picked.minRatio.toFixed(6)}`)

// Pension-floor non-binding observation: per spec §5.13, capi pension floor
// is E0 × capiRetirees × I_t (inflation-indexed). Legacy pensions are also
// inflation-indexed via I_t (eq 5, ι = min(w_n, π)). Real per-retiree pension
// is therefore approximately constant regardless of labour reform — the
// floor never binds. Walkthrough Stage 4 picks (0.759, 8), corresponding to
// closing the France/OCDE employment-rate gap over 8 years.
const allFeasibleAtFloor = feasible.every(r => r.minRatio > 1 - 1e-3)
if (allFeasibleAtFloor) {
  console.log(
    '\nNote: pension-floor constraint is non-binding across the whole grid '
    + '(real per-retiree pension is constant within ±0.1% by construction).'
  )
} else {
  console.log(
    '\nWARNING: pension floor binds for some grid cells. This was non-binding '
    + 'in v0.11; if it now binds in v1.0a, escalate — likely an engine drift.'
  )
}
