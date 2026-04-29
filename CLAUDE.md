# CapiModel — Project Reference

## What this is

A browser-based financial simulator modelling France's transition from pay-as-you-go (PAYG) pensions to full capitalisation. Implements **60 numbered equations** over a 70-year horizon (Y0 = 2027, runs to 2096) per `CapiModelSpec_v1_0a.md`. Built as a proof of concept, not a forecast.

## Deployment

- **Vercel** (auto-deploys on push to `main`): https://capi-model.vercel.app
- Vercel project: `capi-model` on team `alles-delenda-ests-projects`
- GitHub repo: `alles-delenda-est/CapiModel`, default branch `main`
- The canonical spec lives on its own branch: `spec/v1.0a` (file `CapiModelSpec_v1_0a.md`).
- An archived `master` branch (markdown-only, no app code) exists for historical reference.

## Build

- **Root-level build** is the active one (`vite.config.js`, `package.json`, `index.html` all at repo root)
- There is also an `app/` directory with a duplicate older build setup — **do not use it** for new work; the root `src/` is canonical
- Stack: React 19 + Recharts + Vite 7, no backend, fully client-side
- `npm install && npx vite build` from repo root
- Dev server: `npx vite` from repo root
- Tests: `npm test` (Vitest, currently 125/125 passing including a 1000-config property-based suite)

## Source structure

```
src/
  main.jsx                       — React entry point
  App.jsx                        — Shell: header, navigation, page routing, simulator UI
  App.css                        — Global styles + simulator styles
  simulation-engine.js           — Core financial model (60 equations §5, plus
                                   computeIndividualPerspective and
                                   buildCounterfactualParams for the panel)
  presets.js                     — PRESETS (3 baseline + 3 paquet partiel) + extractKPIs
  components/
    Navigation.jsx/.css          — Tab bar
    EnhancedSlider.jsx/.css      — Tier-A slider with default-value reset + clamping
    CollapsibleSection.jsx/.css  — Critical/normal/advanced visual-priority groups
    CutoffSelector.jsx/.css      — Birth-year-based capi cohort selector
    ChartTooltip.jsx/.css        — Custom Recharts tooltip
    IndividualPerspectivePanel.jsx/.css — "Et pour vous ?" reusable panel
                                          (used on SimplifiedView and Simulator)
  hooks/
    useHashNavigation.js         — Hash-based SPA routing
                                   (#/intro, #/simple, #/walkthrough,
                                    #/simulateur, #/hypotheses)
  pages/
    IntroPage.jsx/.css           — Reform rationale, 4 horsemen/virtues, baseline results
    SimplifiedView.jsx/.css      — Lay-audience view: 3 scenarios, sliders, narrative,
                                   charts, individual perspective
    TransitionWalkthrough.jsx/.css — 5-stage pedagogical walkthrough
                                     (#/walkthrough), with chart truncation at
                                     500% debt/GDP
    HypothesesPage.jsx/.css      — Parameter table + sources documentation
```

## Key files you'll touch most often

| Task | File(s) |
|------|---------|
| Change the financial model | `src/simulation-engine.js` |
| Change presets / KPI extraction | `src/presets.js` |
| Change the expert simulator UI | `src/App.jsx` |
| Change the simplified view | `src/pages/SimplifiedView.jsx` |
| Change the intro page | `src/pages/IntroPage.jsx` |
| Change the walkthrough / stage definitions | `src/pages/TransitionWalkthrough.jsx` |
| Change the "Et pour vous ?" panel | `src/components/IndividualPerspectivePanel.jsx` |
| Add a new page/tab | `src/hooks/useHashNavigation.js` + `src/components/Navigation.jsx` + `src/App.jsx` |

## Navigation system

Hash-based routing via `useHashNavigation` hook. Pages are registered in three places:
1. `src/hooks/useHashNavigation.js` — `PAGES` set (valid page IDs: intro, simple, walkthrough, simulateur, hypotheses)
2. `src/components/Navigation.jsx` — `TABS` array (tab labels and order)
3. `src/App.jsx` — conditional rendering block (`{currentPage === 'xxx' && <Component />}`)

## Documentation files (repo root)

Canonical (current):
- `CapiModelSpec_v1_0a.md` — **Full v1.0a specification** (60 equations + invariants + calibration sources). Single source of truth for the engine; every non-trivial line of `src/simulation-engine.js` carries a `// Spec §X.Y eq (N)` comment that maps back to the spec. Lives on the `spec/v1.0a` branch and on `main`.
- `CapiModel_overview.md` — High-level project description: feature surface, default KPIs, walkthrough mechanics.
- `THEORY.md` — Operating theory, key v1.0a discoveries, engineering philosophy, v1.1 candidates. Read this on session start to orient.
- `CHANGELOG.md` — v1.0a corrections vs v1.0 (carry-trade, HLM mass, capi asset-share, Équinoxe split).
- `tests/fixtures/v1.0a-default-trace.json` — §11.3 regression contract.

Historical / deprecated:
- `cdc_legacy_fund_model.md` — **Deprecated v5 spec** (March 2026, 34 equations). Has a banner at top redirecting to the v1.0a sources. Preserved for historical reference; do not use for current behaviour.
- `critique.md` — Structured critique with recommendations.

## Presets

Defined in `src/presets.js`, six total:

Baseline (3):
- `v1_default` — Spec §3 default values.
- `v1_optimiste` — Marchés porteurs, démographie réformée, plein-emploi.
- `v1_stress` — Marchés baissiers, démographie pessimiste, Équinoxe partielle.

Paquet partiel pedagogical (3):
- `equinoxeOnly` — Équinoxe alone, no capi/HLM/labour. Realistic demographics.
- `labourHousingOnly` — Capi + HLM + labour, no Équinoxe. Realistic demographics.
- `equinoxeAndLabour` — Équinoxe + labour (no capi/HLM). COR central demographics.

The simplified view maps three of these to friendly labels: "Prudent" (`v1_stress`), "Central" (`v1_default`), "Optimiste" (`v1_optimiste`).
