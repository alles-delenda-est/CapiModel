# Spec 0003 — Monte Carlo stochastic return paths + P50/P90/P95 KPIs

**Status:** Draft · **Priority:** P1 (biggest genuinely-pending feature) ·
**Depends on:** Spec 0001 (CI gate); benefits from Spec 0002 (r_c exposed) ·
**Source:** external review PENDING_NEXT_STEPS #3, THEORY.md roadmap v3.0,
DemographicKernel_plan §9.5, BUGS.md Phase-3 (the worker does not exist) ·
**Est. effort:** ~1 week

---

## 1. Goal

Replace the model's single deterministic trajectory with a **distribution** of
trajectories driven by stochastic return paths, and report the headline KPIs as
**P50 / P90 / P95 bands** rather than point estimates.

Post-PR-B this is the single most valuable feature: the central result now
flips sign within a plausible r_c range, which is *precisely* what return-path
uncertainty bands exist to show honestly. A fan chart of debt / capi-pot paths
communicates "this is a bet on returns" far better than a single line.

## 2. Re-scope first (important)

The roadmap and CLAUDE.md imply a Monte Carlo module already exists
(`src/monte-carlo-worker.js`, Cholesky-correlated shocks). **It does not** — the
worker survives only in the frozen `app/` duplicate and is dead. Do not "fix" it;
build fresh against the live `src/simulation-engine.js`. The integration design
in DemographicKernel_plan §9.5 (uniform draw over cor_low/central/high replacing
Cholesky demographic shocks) is a good starting point but references the
nonexistent worker — treat it as a sketch, not a spec.

## 3. Design

### 3.1 Stochastic drivers

Per simulation draw, perturb the return/rate inputs the deterministic engine
already consumes:

- **`r_c` (capi real return)** — the dominant driver. Model as a mean-reverting
  or i.i.d.-annual real return with mean = configured `r_c` and an annual σ
  (default ≈ 0.07, calibrated to a 60/40-ish real-return vol; make it a
  parameter). Simplest defensible v1: draw a *single* realised average real
  return per path from N(r_c, σ_path) with σ_path ≈ σ/√horizon — i.e. path-level
  return dispersion, not year-by-year. Document the choice; year-by-year AR(1)
  is a v2.
- **`r_f_portfolio` (legacy fund return)** — correlated with r_c (ρ ≈ 0.8, both
  are risk-asset returns). Draw jointly (2×2 Cholesky) so the fund and the capi
  pot don't diverge implausibly.
- **`r_d_base` (borrowing rate)** — optional second block; can stay deterministic
  in v1 (the endogenous premium already responds to debt). Note that making it
  stochastic *and* negatively correlated with returns is the honest tail risk
  (bad returns + high borrowing cost = the spiral) — flag as v2.
- **Demographic scenario** — optional uniform/weighted draw over
  {cor_low, cor_central, cor_high} per DemographicKernel §9.5, so demographic
  uncertainty enters too. v1 may hold demographics at cor_central and vary only
  returns; expose a toggle.

### 3.2 Engine reuse — no engine rewrite

`runSimulation(config)` is pure and deterministic in its config. A draw =
`runSimulation({ ...baseConfig, r_c: draw.r_c, r_f_portfolio: draw.r_f })`.
The MC layer is a **wrapper**, not an engine change:

```
function runMonteCarlo(baseConfig, { nPaths=1000, seed, sigma, rho, varyDemo }) {
  const rng = mulberry32(seed)                  // seeded, reproducible
  const paths = []
  for (let i = 0; i < nPaths; i++) {
    const draw = sampleDrivers(rng, baseConfig, { sigma, rho, varyDemo })
    const rows = runSimulation({ ...baseConfig, ...draw })
    paths.push(extractPathSummary(rows))        // per-year D_t, K_t + scalar KPIs
  }
  return aggregatePercentiles(paths)            // P5/P50/P90/P95 per year + per KPI
}
```

### 3.3 Web Worker

1000 × 70-year runs must not block the UI. Put `runMonteCarlo` in a real
`src/monte-carlo-worker.js` (module worker), posting `{type:'progress', pct}`
and a final `{type:'result', bands}`. The engine imports cleanly into a worker
(pure functions, no DOM). Provide a non-worker fallback for tests/SSR.

### 3.4 Outputs

- **Fan chart**: debt/GDP and capi-pot (real) with P5–P95 ribbon + P50 line, per
  rung. New chart in `SimulatorPage` (Graphiques tab, behind a "Monte Carlo"
  toggle) and optionally a simplified version on the intro page for the headline
  rung.
- **KPI bands**: `extractKPIs`-style scalars reported as P50 (P90) — e.g.
  "Position nette finale réelle: −X Md€ (P90: −Y)". Add a `KpisTab` variant.
- **Probability-of-insolvency**: fraction of paths that cross the
  model-validity limit (reuse `detectGreekCollapse` from SimulatorPage) — the
  single most honest headline number post-PR-B ("under these assumptions, N %
  of return paths end in restructuring").

## 4. Files

| File | Change |
|---|---|
| `src/monte-carlo.js` | **new** — `runMonteCarlo`, `sampleDrivers` (seeded RNG, Cholesky), `aggregatePercentiles` |
| `src/monte-carlo-worker.js` | **new** — module worker wrapping the above |
| `src/pages/SimulatorPage.jsx` | MC toggle, fan chart, KPI-band variant, insolvency-probability card |
| `src/hooks/useMonteCarlo.js` | **new** — worker lifecycle + progress state |
| `tests/monte-carlo.test.js` | **new** — see §5 |
| `CLAUDE.md`, `THEORY.md` | correct the "MC exists" claim → "MC implemented (v3.0)"; document the sampling model and its assumptions |

## 5. Tests & acceptance

1. **Determinism** — same seed ⇒ identical bands (regression-lockable).
2. **Sanity** — P50 path ≈ the deterministic run at the mean inputs (within MC
   error at n=1000); bands widen with σ; ρ=1 collapses the fund/capi spread.
3. **Percentile correctness** — `aggregatePercentiles` matches a reference
   quantile on a known sample.
4. **Insolvency probability** monotonic in σ and in (−r_c).
5. **Performance** — 1000 paths complete in the worker within a budget (target
   < a few seconds on a laptop); assert the worker posts progress and a result.
6. CI (Spec 0001) runs the non-worker path; 359 existing tests unchanged.

## 6. Risks & open questions

- **Sampling model is a modelling choice, not a fact.** Path-level vs
  year-by-year return draws give different tail shapes; whichever is chosen must
  be documented in THEORY.md as an assumption (same discipline as the
  demographic kernel). Get the σ/ρ calibration reviewed.
- **Correlation with borrowing cost** is the real tail (bad returns coincide
  with high r_d). v1 omits it and will therefore *understate* spiral risk — say
  so explicitly; do not ship the fan chart implying it is the full risk picture.
- **Scope discipline** — guarantee fair-value KPIs (PENDING #4) build on this;
  do them as a follow-up, not in the same PR.
