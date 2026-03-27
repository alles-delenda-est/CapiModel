# CapiModel — Project Reference

## What this is

A browser-based financial simulator modelling France's transition from pay-as-you-go (PAYG) pensions to full capitalisation. Implements 34 financial equations over a 70-year horizon (2026-2096). Built as a proof of concept, not a forecast.

## Deployment

- **Vercel** (auto-deploys on push to `main`): https://capi-model.vercel.app
- Vercel project: `capi-model` on team `alles-delenda-ests-projects`
- GitHub repo: `alles-delenda-est/CapiModel`, default branch `main`
- There is also an archived `master` branch (markdown-only, no app code)

## Build

- **Root-level build** is the active one (`vite.config.js`, `package.json`, `index.html` all at repo root)
- There is also an `app/` directory with a duplicate older build setup — **do not use it** for new work; the root `src/` is canonical
- Stack: React 19 + Recharts + Vite 7, no backend, fully client-side
- `npm install && npx vite build` from repo root
- Dev server: `npx vite` from repo root

## Source structure

```
src/
  main.jsx                  — React entry point
  App.jsx                   — Shell: header, navigation, page routing, simulator UI
  App.css                   — Global styles + simulator styles
  simulation-engine.js      — Core financial model (34 equations, PRESETS, KPI extraction)
  monte-carlo-worker.js     — Web Worker for stochastic simulation (Cholesky-correlated shocks)
  components/
    Navigation.jsx/.css     — Tab bar (Introduction | Version simple | Simulateur | Hypotheses)
  hooks/
    useHashNavigation.js    — Hash-based SPA routing (#/intro, #/simple, #/simulateur, #/hypotheses)
  pages/
    IntroPage.jsx/.css      — Introduction page (reform rationale, 4 horsemen/virtues, baseline results)
    SimplifiedView.jsx/.css — Simplified view for lay audiences (3 scenarios, 5 sliders, narrative, 3 charts)
    HypothesesPage.jsx/.css — Hypotheses & sources documentation page
```

## Key files you'll touch most often

| Task | File(s) |
|------|---------|
| Change the financial model | `src/simulation-engine.js` |
| Change the expert simulator UI | `src/App.jsx` |
| Change the simplified view | `src/pages/SimplifiedView.jsx` |
| Change the intro page | `src/pages/IntroPage.jsx` |
| Add a new page/tab | `src/hooks/useHashNavigation.js` + `src/components/Navigation.jsx` + `src/App.jsx` |
| Change Monte Carlo behaviour | `src/monte-carlo-worker.js` |

## Navigation system

Hash-based routing via `useHashNavigation` hook. Pages are registered in three places:
1. `src/hooks/useHashNavigation.js` — `PAGES` set (valid page IDs)
2. `src/components/Navigation.jsx` — `TABS` array (tab labels and order)
3. `src/App.jsx` — conditional rendering block (`{currentPage === 'xxx' && <Component />}`)

## Documentation files (repo root)

- `cdc_legacy_fund_model.md` — Technical specification (34 equations)
- `critique.md` — Structured critique with recommendations
- `CapiModel_overview.txt` — High-level project description

## Presets

Four scenario presets defined in `simulation-engine.js` → `PRESETS`:
- `default` — Base case (r_c=3%, w_r=0.7%, endogenous rates, Equinoxe)
- `originalV5` — Original model (r_c=4.5%, w_r=1.5%, fixed rates)
- `optimiste` — Optimistic (r_c=4%, w_r=1.2%)
- `stress` — Stress test (r_c=2.5%, w_r=0.5%, +50bps spread)

The simplified view maps these to "Prudent" (stress), "Central" (default), and "Optimiste" (optimiste).
