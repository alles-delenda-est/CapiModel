// Inline verification for Task 4 fixup #2:
// Print peak (existingDebt + transitionDebt) / GDP per stage to choose
// the chart-truncation threshold (default 500%, bumped to 1000% if any
// catastrophic stage peaks below 600%).
//
// Mirrors the five STAGES from src/pages/TransitionWalkthrough.jsx.

import { runSimulation, DEFAULT_CONFIG } from '../src/simulation-engine.js'

const BASE = DEFAULT_CONFIG

const STAGE_1 = {
  ...BASE,
  demoProfile: 'realistic',
  useEquinoxe: false,
  enableCapi: false,
  hlmDiscount: false,
  delta: 0,
  rho: 0,
  lambda: 0,
  employmentRate0: 0.69,
  employmentRateTarget: 0.69,
}
const STAGE_2 = { ...STAGE_1, useEquinoxe: true }
// New ordering (Task 4 fixup-2 v2):
//   Stage 3 = capi + labor reform (no HLM, no transition levy yet)
//   Stage 4 = stage 3 + HLM cessions + transition levy lambda
//   Stage 5 = stage 4 + demographic reform
const STAGE_3 = {
  ...STAGE_2,
  enableCapi: true,
  cutoffAge: 50,
  employmentRateTarget: 0.759,
  employmentTransitionYears: 8,
}
const STAGE_4 = {
  ...STAGE_3,
  hlmDiscount: true,
  delta: 0.3,
  rho: 0.05,
  T_hlm: 20,
  lambda: 0.30,
}
const STAGE_5 = { ...STAGE_4, demoProfile: 'reformed' }

const stages = [
  ['1 status_quo',   STAGE_1],
  ['2 equinoxe',     STAGE_2],
  ['3 capi+labor',   STAGE_3],
  ['4 +HLM/transit', STAGE_4],
  ['5 demographie',  STAGE_5],
]

const checkThreshold = (rows, pct) => {
  for (const r of rows) {
    const ratio = (r.D_ext_t + r.D_t) / r.GDP_t * 100
    if (ratio > pct) return r.year
  }
  return null
}

console.log('Stage'.padEnd(20), 'peakRatio%'.padStart(12), 'peakYear'.padStart(10),
            'cross500%'.padStart(11), 'cross1000%'.padStart(12))
console.log('-'.repeat(70))

for (const [label, params] of stages) {
  const rows = runSimulation(params)
  let peak = -Infinity, peakYear = null
  for (const r of rows) {
    const ratio = (r.D_ext_t + r.D_t) / r.GDP_t * 100
    if (ratio > peak) { peak = ratio; peakYear = r.year }
  }
  const c500 = checkThreshold(rows, 500)
  const c1000 = checkThreshold(rows, 1000)
  console.log(
    label.padEnd(20),
    peak.toFixed(1).padStart(12),
    String(peakYear).padStart(10),
    String(c500 ?? '—').padStart(11),
    String(c1000 ?? '—').padStart(12),
  )
}
