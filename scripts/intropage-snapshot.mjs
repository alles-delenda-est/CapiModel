// One-shot inspection script: dump every value the IntroPage shows
// for the v1_default preset under the current engine, so we can see
// whether the page's narrative still matches reality.
import { runSimulation, buildCounterfactualParams } from '../src/simulation-engine.js'
import { extractKPIs, PRESETS } from '../src/presets.js'

const params = PRESETS.v1_default.params
const results = runSimulation(params)
const kpis = extractKPIs(results)

// Mirror IntroPage's local derivations
const peakKRow = results.reduce((acc, r) => r.K_t > acc.K_t ? r : acc, results[0])
const inflationDeflator = Math.pow(1.02, peakKRow.t)
const peakCapiReal = peakKRow.K_t / inflationDeflator
const peakCapiYear = peakKRow.year

const cfRows = runSimulation(buildCounterfactualParams(params))
const counterfactualFinalDebt = cfRows[cfRows.length - 1].D_t

// Sidebar knobs
const KEYS = ['cutoffAge', 'r_c', 'w_r', 'rho', 'employmentRateTarget']
const knobs = KEYS.map(k => ({ key: k, value: params[k] }))

// First/last/peak rows for D_t
const last = results[results.length - 1]
const dRange = [
  { kind: 'D_t min', val: Math.min(...results.map(r => r.D_t)) },
  { kind: 'D_t max', val: Math.max(...results.map(r => r.D_t)) },
  { kind: 'D_t Y0', val: results[0].D_t },
  { kind: 'D_t Y69', val: last.D_t },
  { kind: 'K_t Y0 nominal', val: results[0].K_t },
  { kind: 'K_t Y69 nominal', val: last.K_t },
  { kind: 'K_t Y69 real', val: last.K_t / Math.pow(1.02, last.t) },
  { kind: 'K_t peak nominal', val: peakKRow.K_t },
  { kind: 'K_t peak year', val: peakKRow.year },
]

console.log('=== Sidebar knobs (PRESETS.v1_default.params) ===')
console.table(knobs)

console.log('\n=== KPI strip (extractKPIs + IntroPage local derivations) ===')
console.table({
  peakDebt: kpis.peakDebt,
  peakDebtYear: kpis.peakDebtYear,
  debtFreeYear: kpis.debtFreeYear,
  totalInterest: kpis.totalInterest,
  finalCapi: kpis.finalCapi,
  finalCapiReal: kpis.finalCapiReal,
  peakCapiReal,
  peakCapiYear,
  minSpread: kpis.minSpread,
  minSpreadPct: kpis.minSpread * 100,
  counterfactualFinalDebt,
  cfRatio: Math.round(counterfactualFinalDebt / Math.max(kpis.peakDebt, 1)),
})

console.log('\n=== D_t and K_t range ===')
console.table(dRange)

console.log('\n=== Engine constants ===')
console.log('Y0:', params.Y0, 'N:', params.N, 'iota:', params.iota)
console.log('cashFlowMode:', params.cashFlowMode, 'geKneeRatio:', params.geKneeRatio, 'geFloorRatio:', params.geFloorRatio)
console.log('fiscalTransferMode:', params.fiscalTransferMode)

// =====================================================================
// Extended v1_default values for overview.md "Default scenario results"
// =====================================================================
const peakRdRow = results.reduce((acc, r) => (r.r_d_t ?? 0) > (acc.r_d_t ?? 0) ? r : acc, results[0])
const minRdRow = results.reduce((acc, r) => (r.r_d_t ?? 0) < (acc.r_d_t ?? 0) ? r : acc, results[0])
const peakCombined = results.reduce((acc, r) => {
  const v = (r.D_ext_t ?? 0) + (r.D_t ?? 0)
  return v > acc.v ? { v, year: r.year } : acc
}, { v: 0, year: 0 })
console.log('\n=== Extended v1_default values (for overview table) ===')
console.table({
  finalLegacyFund: last.F_t,
  cumulativeCapiGuarantee: last.CK_t,
  rd_min_pct: (minRdRow.r_d_t ?? 0) * 100,
  rd_max_pct: (peakRdRow.r_d_t ?? 0) * 100,
  S0_total_t0: results[0].S0_total,
  csgcrds_t0: results[0].S0_csg ?? results[0].csgRevenue_t,
  peakCombinedDebt: peakCombined.v,
  peakCombinedYear: peakCombined.year,
  capiAssetShare_Y69: last.capiAssetShare_t,
  totalCapiShortfall: kpis.totalCapiShortfall,
})

// =====================================================================
// All six presets — peak D_t, debt-free, CI, K Y69 nominal
// =====================================================================
console.log('\n=== All presets (under current engine) ===')
const summary = Object.entries(PRESETS).map(([name, preset]) => {
  const r = runSimulation(preset.params)
  const k = extractKPIs(r)
  return {
    preset: name,
    peakDebt: Math.round(k.peakDebt),
    peakDebtYear: k.peakDebtYear,
    debtFreeYear: k.debtFreeYear ?? 'never',
    totalInterest: Math.round(k.totalInterest),
    K_t_Y69_nominal: Math.round(k.finalCapi),
    K_t_Y69_real: Math.round(k.finalCapiReal),
    minSpread_pct: (k.minSpread * 100).toFixed(2),
  }
})
console.table(summary)

