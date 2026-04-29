// Smoke test for computeIndividualPerspective + buildCounterfactualParams.
// Prints monthly euro amounts for three reference birth years against the
// default v1.0a config, to sanity-check the pedagogical projection.

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
for (const birthYear of [1965, 1970, 1977, 1985, 1990, 2000, 2005, 2010]) {
  const r = computeIndividualPerspective(reformParams, reformRows, cfRows, birthYear)
  console.log(
    String(r.birthYear).padStart(7),
    fmt(r.ageInY0),
    fmt(r.retirementYear),
    String(r.inCapi).padStart(7),
    fmt(r.yearsInPayg),
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
