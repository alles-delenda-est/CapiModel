# Spec 0002 — Expose the return / rate / life-expectancy assumptions as bounded sliders

**Status:** Draft · **Priority:** P1 ("do first of the six") ·
**Depends on:** Spec 0001 (land it gated) ·
**Source:** external review PENDING_NEXT_STEPS #7 & #8, BUGS.md notes V1/V12 ·
**Est. effort:** ~half a day

---

## 1. Why this matters most

After the June-2026 PR-B recalibration the solvency verdict is **r_c-sensitive
at its core**: `v1_default` spirals, `v1_finance` survives, and the difference
tracks the assumed real return. Letting the reader move r_c is therefore not a
nicety — it is the honest way to show that the headline is an assumption, not a
fact. It also mitigates review finding V1 (source says 4.3 % real for the NBIM
fund; model default is 4.5 %): let the reader dial it.

## 2. Current state (reconcile the roadmap with the code)

Partly shipped — the roadmap is behind the code again:

- **`r_c` is already editable** in the expert simulator as a `NumInput`
  ("Rendement réel attendu", `SimulatorPage.jsx:521`). What is missing: a
  **bounded slider [2.5 %–6 %]** with the calibration note, and surfacing it on
  the **intro / simplified** headline surfaces (where the verdict is asserted
  but the knob is invisible).
- **`r_d_base`** is reachable only via the "Stress test" Conditions preset
  (`r_d_base: 0.045`); there is no direct control. It should be a Tier-B slider
  so the reader can stress the V12-confirmed 2026 range (3.25–3.88 %).
- **`lifeExpAt65_per_decade`** (default 0.91, engine eq 12a) is **not exposed
  anywhere**. It drives the indexed-retirement-age trajectory; expose it as a
  Tier-B slider.

## 3. Design

### 3.1 r_c — promote to a bounded slider + headline surface

- In `ParamsTab` replace the r_c `NumInput` with a slider bounded **[0.025,
  0.06]**, step 0.005, default 0.045, with a tip citing the NBIM 1998–2025 real
  median (≈4.3 %) and the GE-penalty note. Keep numeric entry as a fallback.
- On the **IntroPage** (or the Hypothèses page) add a single "et si le rendement
  était de X %" control that re-runs `v1_finance` / `v1_default` live and
  updates the headline verdict, so the r_c-sensitivity is visible to the
  non-expert. Reuse `runSimulation` + `extractKPIs` (the pages already compute
  live).

### 3.2 r_d_base & lifeExpAt65_per_decade — Tier-B sliders

Add to the advanced (`mode === 'advanced'`) params, in a new "Hypothèses de
marché / démographie" group:

| Param | Range | Step | Default | Tip |
|---|---|---|---|---|
| `r_d_base` | 0.025–0.06 | 0.0025 | 0.035 | Taux d'emprunt de base (hors prime endogène); 2026 OAT ≈ 3.25–3.88 % |
| `lifeExpAt65_per_decade` | 0.4–1.4 | 0.05 | 0.91 | Gain d'espérance de vie à 65 ans par décennie; pilote l'âge indexé |

`setTweak('r_d_base', v)` etc. already flows through `buildParams` → engine, so
no engine change is needed — these are pure UI additions.

### 3.3 Consistency guard

The "Conditions macro" presets (optimist/neutral/stress) set some of these same
keys. Ensure a manual slider tweak visibly overrides the preset (the existing
`tweaks` layer already wins over `conditions` in `buildParams` — verify and add
a "modifié" affordance so the user knows they've left the preset).

## 4. Files touched

| File | Change |
|---|---|
| `src/pages/SimulatorPage.jsx` | r_c → bounded slider; new Tier-B group for r_d_base + lifeExpAt65_per_decade |
| `src/pages/IntroPage.jsx` (or HypothesesPage) | live "et si r_c = X %" headline control |
| `src/pages/SimulatorPage.css` | slider-group styling if needed |
| tests | see §5 |

No engine change — all three keys are already read from config.

## 5. Tests & acceptance

1. **Sliders drive the engine** — a Vitest component/logic test that
   `buildParams(rung, conditions, { r_c: 0.03 }).r_c === 0.03` and that
   `runSimulation` output changes monotonically with r_c (higher r_c → higher
   finalCapiReal, lower peak debt for `v1_finance`).
2. **Bounds enforced** — slider clamps to [0.025, 0.06]; out-of-range numeric
   entry is clamped.
3. **Headline reactivity** — the intro control re-runs and the verdict text
   flips from "solvable" to "spirale" as r_c crosses the threshold for
   `v1_default` (pin the crossing in a test so it can't silently drift).
4. Existing 359 tests unchanged; build clean.

## 6. Risks

- **Intro-page performance** — re-running `runSimulation` on every slider tick
  can jank; debounce and/or memoise, or run on release rather than on drag.
- **Preset/tweak confusion** — mitigated by the "modifié" affordance (§3.3).
- Keep the headline control to r_c only on the public page; r_d_base and
  lifeExp belong in the expert tier to avoid overwhelming lay readers.
