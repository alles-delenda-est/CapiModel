// v1.1 verification — preset r_d_cap regime check + mortality bias sensitivity.
//
// Two checks:
//
//   A. r_d_cap regime: for each preset, record peak r_d(t) value and year
//      under v1.1. Cross-check against v1.0a default fixture (the only v1.0a
//      artifact available on this branch). Other presets are reported as
//      "v1.1 only — v1.0a not captured" since no v1.0a fixture exists for
//      them in tests/fixtures/.
//
//   B. Mortality bias sensitivity: rebuild `transitionalPaygExp_t` under an
//      "older-cohorts-die-first" assumption (linear-in-age mortality proxy)
//      and compute the delta on peak debt, debt-free year, total interest.
//      The held-flat rule overstates the surviving cohort's average legacy
//      share — this script quantifies by how much.

import { readFileSync } from 'node:fs'
import {
  runSimulation, DEFAULT_CONFIG, T_capi_start_of, legacyShareOfCohort,
} from '../src/simulation-engine.js'
import { PRESETS, extractKPIs } from '../src/presets.js'

const v1_0a_fixture = JSON.parse(
  readFileSync('tests/fixtures/v1.0a-default-trace.json', 'utf8'),
)

console.log('========== A. r_d_cap regime check (v1.1 vs v1.0a default) ==========')
console.log('preset                year-of-peak  peak r_d   crossed cap (≥ 0.20)?')
console.log('-'.repeat(80))

const fmtRD = (rows) => {
  let peakR = 0
  let peakYear = null
  for (const r of rows) {
    if (r.r_d_t > peakR) { peakR = r.r_d_t; peakYear = r.year }
  }
  return { peakR, peakYear, crossedCap: peakR >= 0.20 - 1e-12 }
}

const v1_0a_default_peak = fmtRD(v1_0a_fixture)
console.log(
  'v1.0a default (fixture)'.padEnd(22),
  String(v1_0a_default_peak.peakYear).padStart(11),
  v1_0a_default_peak.peakR.toFixed(4).padStart(11),
  v1_0a_default_peak.crossedCap ? ' YES' : ' no',
)

for (const [name, preset] of Object.entries(PRESETS)) {
  const rows = runSimulation(preset.params)
  const peak = fmtRD(rows)
  console.log(
    `${name} (v1.1)`.padEnd(22),
    String(peak.peakYear).padStart(11),
    peak.peakR.toFixed(4).padStart(11),
    peak.crossedCap ? ' YES' : ' no',
  )
}

console.log('\n========== B. Mortality bias sensitivity (default preset) ==========')

const cfg = { ...DEFAULT_CONFIG }
const rows = runSimulation(cfg)
const T_capi = T_capi_start_of(cfg)

// Re-derive transitionalPaygExp_t under "older-cohorts-die-first":
// Track per-cohort populations alive at each year. New entrants at year tt
// have population deltaCapiRet(tt). Each year, each cohort's population
// decays by mortality(age) where age = Y0 + t - B. Linear-in-age mortality:
//   q(age) = clamp(0.02 × (age - 65) / 20, 0, 0.10)  (≈ 0% at 65, 2% at 85, 10% cap)
// This is a crude proxy for INSEE T60; the plan calls for "simple
// linear-with-age mortality proxy" and "If the bias is < 2 % on peak debt,
// leave held-flat in place".
//
// Aggregate: transitionalPaygExp_alt(t) = (Σ_B aliveCohort(B,t) × share(B))
//                                          × E0_legacy_t × I_factor_t
// Then propagate: deficit_alt = transitionalPaygExp_alt + legacyExp - nonEmplrNet
// (replacing the engine's transitionalPaygExp_t in eq 39').
//
// We don't re-solve the full simulation under (b) — that would require
// re-running the §5.10 borrow loop with feedback into r_d. Instead we
// approximate the first-order impact by comparing the *cumulative*
// difference in transitionalPaygExp under (a) vs (b), which bounds the
// debt impact (the engine's deficit channel is approximately additive in
// the inflow shock for moderate perturbations).

const mortality = (age) => Math.min(0.10, Math.max(0, 0.02 * (age - 65) / 20))

let cohorts = []  // [{birthYear, popRetMult, retiredAtT}]
let prev = 0
const transAlt = new Array(rows.length).fill(0)
const transHeld = new Array(rows.length).fill(0)
const heldShareAvgArr = rows.map(r => r.legacyShareAvg)

for (let t = 0; t < rows.length; t++) {
  const r = rows[t]
  // 1. Add new cohort entering this year (delta capiRetirees, raw — no
  //    mortality yet).
  const cap = r.capiRetirees
  const delta = Math.max(0, cap - prev)
  if (delta > 0) {
    const B = cfg.Y0 + t - cfg.retirementAgeBase
    cohorts.push({ B, pop: delta, retT: t })
  }
  prev = cap
  // 2. Decay each cohort by mortality(age) at this year. (Newly-entered
  //    cohorts experience zero mortality in their entry year.)
  for (const c of cohorts) {
    if (c.retT < t) {
      const age = cfg.Y0 + t - c.B
      c.pop *= (1 - mortality(age))
    }
  }
  // 3. Compute alt transitionalPaygExp_t.
  let weighted = 0
  let popSum = 0
  for (const c of cohorts) {
    const share = legacyShareOfCohort(c.B, cfg)
    weighted += share * c.pop
    popSum += c.pop
  }
  // weighted has units of retiree-multiples × share; multiply by E0_legacy_t
  // and I_factor_t to get Md€/yr.
  transAlt[t] = weighted * r.E0_legacy_t * r.I_factor_t
  transHeld[t] = r.transitionalPaygExp_t
}

// First-order shock analysis (no full alternate simulation).
// A proper alt simulation would re-resolve r_d → debtInterest → nonEmplrNet
// at every step under the alt mortality assumption. That is invasive and
// out of scope for v1.1 (the alt is being defended-against, not adopted).
//
// Bounded bias estimate: at the engine's PEAK year, compare yearly
// transitionalPaygExp under (a) vs (b), and the cumulative difference up
// to that year. The peak-debt bias is bounded between (cum diff up to peak
// year) and that × (1 + avg r_d)^(N − t_peak) for the compounded case.
// This is a conservative range — the true bias is somewhere inside.

const kpisHeld = extractKPIs(rows)
const t_peak = kpisHeld.peakDebtYear - cfg.Y0
let cumDiffToPeak = 0
let cumDiffTotal = 0
let peakAbsDiff = 0
for (let t = 0; t < rows.length; t++) {
  const d = transHeld[t] - transAlt[t]
  cumDiffTotal += d
  if (t <= t_peak) cumDiffToPeak += d
  if (Math.abs(d) > Math.abs(peakAbsDiff)) peakAbsDiff = d
}
const avg_r_d = rows.reduce((s, r) => s + r.r_d_t, 0) / rows.length
const compoundFactor = Math.pow(1 + avg_r_d, rows.length - t_peak)
const peakBiasLow = cumDiffToPeak / kpisHeld.peakDebt * 100
const peakBiasHigh = (cumDiffToPeak * compoundFactor) / kpisHeld.peakDebt * 100

console.log('Held-flat (engine default, v1.1):')
console.log(`  peakDebt      = ${kpisHeld.peakDebt.toFixed(1)} Md€ at ${kpisHeld.peakDebtYear}`)
console.log(`  debtFreeYear  = ${kpisHeld.debtFreeYear ?? 'never (within horizon)'}`)
console.log(`  totalInterest = ${kpisHeld.totalInterest.toFixed(1)} Md€`)
console.log(`  avg r_d       = ${(avg_r_d * 100).toFixed(2)} %`)
console.log()
console.log('"Older-cohorts-die-first" alt (linear-in-age mortality, 0% @ 65, 2% @ 85, 10% cap):')
console.log('  Yearly transitionalPaygExp shock (held overstates):')
console.log(`    cum ∑(held − alt) up to peak year (t=${t_peak}) = ${cumDiffToPeak.toFixed(1)} Md€`)
console.log(`    cum ∑(held − alt) over full horizon            = ${cumDiffTotal.toFixed(1)} Md€`)
console.log(`    peak yearly delta                              = ${peakAbsDiff.toFixed(2)} Md€/yr`)
console.log()
console.log(`  Peak-debt bias estimate (held overstates by):`)
console.log(`    lower bound (linear)     = ${peakBiasLow.toFixed(2)} %`)
console.log(`    upper bound (compounded) = ${peakBiasHigh.toFixed(2)} %`)
console.log()
console.log('Plan threshold:')
console.log('  - < 2% on peak debt → keep held-flat (current implementation)')
console.log('  - 2–5% → judgement call; documented in §5.6.1 as conservative bias')
console.log('  - > 5% → defer to v1.2 actuarial work; flag in spec with measured number')
console.log()
const verdict = peakBiasLow > 5
  ? 'BIAS > 5% — defer to v1.2 actuarial work; flag in §5.6.1.'
  : peakBiasLow > 2
    ? 'BIAS in 2–5% band — judgement call.'
    : 'BIAS < 2% — held-flat OK.'
console.log(`Verdict: ${verdict}`)
