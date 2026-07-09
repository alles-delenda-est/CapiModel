# CapiModel — Project Reference

## What this is

A browser-based financial simulator modelling France's transition from pay-as-you-go (PAYG) pensions to full capitalisation. Implements 60 numbered equations over a 70-year horizon (2027–2096, `Y0 = 2027`). Built as a proof of concept, not a forecast.

**Headline state (post June-2026 "PR B" recalibration):** the demographic tables are primary-source INSEE-2026 / COR-RA2026 transcriptions and `demoMode: 'actuarial'` is the default. Under these demographics the minimal balanced cascade (`v1_default`) is a debt spiral; the solvent base case the pedagogy leans on is `v1_finance` ("Transition financée"). See `THEORY.md` and the regenerated tables in `CapiModel_overview.md`.

## Deployment

- **Vercel** (auto-deploys on push to `main`): https://capi-model.vercel.app
- Vercel project: `capi-model` on team `alles-delenda-ests-projects`
- GitHub repo: `alles-delenda-est/CapiModel`, default branch `main`
- There is also an archived `master` branch (markdown-only, no app code)
- There is a Supabase backend for the feedback widget (see `supabase/`); everything else is client-side.

## Build & test

- **Root-level build** is the active one (`vite.config.js`, `package.json`, `index.html` all at repo root)
- There is also an `app/` directory with a **frozen older duplicate** of the build — **do not use it** and do not trust its numbers (34 equations, Monte Carlo worker, old presets: all superseded); the root `src/` is canonical
- Stack: React 19 + Recharts + Vite 7
- `npm install && npx vite build` from repo root; dev server: `npx vite`
- **Tests: `npm test`** (vitest, `tests/` — 359 tests incl. reference-trace regressions against `tests/fixtures/` and a 1000-config property suite). After an intentional `DEFAULT_CONFIG`/row-schema change, regenerate fixtures with `node scripts/regen-fixtures.mjs` and justify the diff.

## Source structure

```
src/
  main.jsx                  — React entry point
  App.jsx                   — Shell: header, navigation, page routing, expert simulator UI
  App.css                   — Global styles + simulator styles
  simulation-engine.js      — Core engine (60 equations; immutable spec-mapped core)
  presets.js                — UI_CONFIG, PRESETS (v1_*, equinoxe*, pureCapi…), extractKPIs
  reforms.js                — Intro-ladder reform configs (REFORMS, paramOverrides)
  demographic-tables.js     — INSEE-2026 / COR-RA2026 primary-source tables (provenance in comments)
  pension.js, equilibre-solver.js, simplified-kpis.js — satellite modules
  components/               — Navigation etc.
  hooks/useHashNavigation.js — Hash routing (#/intro, #/simple, #/simulateur, #/hypotheses…)
  pages/
    IntroPage.jsx           — Public intro (ladder of rungs, live-computed KPIs)
    IntroLadderRungs.js     — Ladder rung configs, copy, footnotes, collapse overlay
    SimulatorPage.jsx       — Expert simulator
    SimplifiedView.jsx      — Lay-audience view
    HypothesesPage.jsx      — Hypotheses & sources
    TransitionWalkthrough.jsx — ORPHANED (not routed); pending archive
```

## Key files you'll touch most often

| Task | File(s) |
|------|---------|
| Change the financial model | `src/simulation-engine.js` (spec-mapped; add tests) |
| Change presets / KPIs | `src/presets.js` |
| Change the intro ladder | `src/pages/IntroLadderRungs.js` + `src/reforms.js` |
| Change the expert simulator UI | `src/pages/SimulatorPage.jsx` |
| Change the simplified view | `src/pages/SimplifiedView.jsx` |
| Add a new page/tab | `src/hooks/useHashNavigation.js` + `src/components/Navigation.jsx` + `src/App.jsx` |

## Navigation system

Hash-based routing via `useHashNavigation` hook. Pages are registered in three places:
1. `src/hooks/useHashNavigation.js` — `PAGES` set (valid page IDs)
2. `src/components/Navigation.jsx` — `TABS` array (tab labels and order)
3. `src/App.jsx` — conditional rendering block (`{currentPage === 'xxx' && <Component />}`)

## Documentation files (repo root)

- `THEORY.md` — the operating theory; the most current narrative document
- `cdc_legacy_fund_model.md` — original technical specification. **Partially superseded**: it stops at eq (33) + annexe while the engine implements 60 equations (§§5.13–5.16 balanced cascade, bonds, Sweden, transfers have no spec section). Engine `// eq (N)` comments remain the ground truth mapping.
- `CapiModel_overview.md` — high-level description + results tables (regenerated from the live engine; `node scripts/intropage-snapshot.mjs`)
- `INTRO_LADDER_MAPPING.md` — intro-ladder ↔ preset mapping (code is canonical)
- `critique.md`, `CapiModel_Theoretical_Review.md` — reviews

## Presets

Defined in `src/presets.js` → `PRESETS` (not in the engine): `v1_default`, `v1_finance`, `v1_optimiste`, `v1_stress`, `equinoxeOnly`, `labourHousingOnly`, `equinoxeAndLabour`, `pureCapi`. `chileMode` / `swedenMode` are canonical toggles, not presets. The intro ladder derives its five rungs from `UI_CONFIG` + `REFORMS` overrides (see `INTRO_LADDER_MAPPING.md`).
