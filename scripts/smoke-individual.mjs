// Smoke test for computeIndividualPerspective + buildCounterfactualParams.
// Prints monthly euro amounts for several reference birth years against the
// default v1.1 config, to sanity-check the pedagogical projection.
//
// v1.1 note: the per-cohort PAYG share `legacyShare` is now read directly
// from the engine helper `legacyShareOfCohort` (eq 15a). Per-individual
// values aggregated across transitional cohorts coincide by construction
// with the engine's `transitionalPaygExp_t` (eq 25b) — see
// tests/engine.test.js > "panel ↔ engine reconciliation (v1.1)".
//
// Boundary discipline: cohort age = cutoffAge in Y0 is transitional
// (legShare = 28/42 ≈ 0.67 with defaults), NOT 1.0. The 1977 row in the
// output below shows this: legShare = 0.67 even though the cohort retires
// at age 50 in 2027.

import {
  runSimulation, DEFAULT_CONFIG,
  buildCounterfactualParams, computeIndividualPerspective,
} from '../src/simulation-engine.js'

const reformParams = DEFAULT_CONFIG
const cfParams = buildCounterfactualParams(reformParams)
const reformRows = runSimulation(reformParams)
const cfRows = runSimulation(cfParams)

const fmt = v => String(v).padStart(7)
console.log('birthYr  ageY0  retYr  inCapi  yrPAYG  yrCapi  legShare  pensCF  legacyR  capiAnn  pensTot  gain  potReal')
console.log('-'.repeat(120))
for (const birthYear of [1965, 1970, 1976, 1977, 1985, 1990, 2000, 2005, 2010]) {
  const r = computeIndividualPerspective(reformParams, reformRows, cfRows, birthYear)
  console.log(
    String(r.birthYear).padStart(7),
    fmt(r.ageInY0),
    fmt(r.retirementYear),
    String(r.inCapi).padStart(7),
    fmt(Math.round(r.yearsInPayg)),
    fmt(r.yearsInCapi),
    fmt(r.legacyShare.toFixed(2)),
    fmt(r.monthlyPensionCF),
    fmt(r.monthlyPensionLegacy),
    fmt(r.monthlyCapiAnnuity),
    fmt(r.monthlyPensionTotal),
    fmt(r.monthlyGain),
    fmt(r.capiPotReal),
  )
}
