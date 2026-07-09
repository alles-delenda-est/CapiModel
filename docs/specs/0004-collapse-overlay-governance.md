# Spec 0004 — Collapse-overlay governance (documentation + citation half)

**Status:** Draft · **Priority:** P1 (HIGH; the code half already shipped) ·
**Source:** external review BUGS.md B2, PROPOSED_NEXT_STEPS #3, V2 ·
**Est. effort:** ~half a day (mostly docs + one CSS/chart change)

---

## 1. Context — what is already done vs what remains

The pedagogical "Greek collapse" overlay (`applyGreekCollapseOverlay` in
`IntroLadderRungs.js`) rewrites engine output above the model-validity limit:
+4 %/yr GE acceleration above 150 % GDP, forced restructuring at 250 % GDP or
r_d ≥ 19.5 %, a 30 % real pension cut over 3 years.

**Already shipped** (this session): the **uniform validity rule** — the overlay
now applies to every rung that crosses the thresholds, in both the intro ladder
and the expert simulator, with insolvency-year KPIs and an adaptive disclosure
banner.

**Still open** (this spec), the three governance gaps the review flagged:

1. The overlay constants and rationale appear **nowhere in THEORY.md** or the
   Hypothèses page — it is outside the 60-equation system but undocumented.
2. The disclosure rests on a **Reinhart–Rogoff citation that overstates the
   source**: the tooltip claims "no country has sustained debt > 300 % of GDP
   without restructuring", which is not a finding of *This Time Is Different*
   (whose famous — and contested — threshold is 90 % of GDP for growth
   compression). Japan (~250 % gross debt/GDP, no restructuring) is a live
   counterexample to the chosen 250 % trigger.
3. Overlaid chart segments are drawn in the **same visual language** as engine
   output, so a reader cannot see where the model stops and the stylisation
   starts.

## 2. Goal

Make the overlay an honest, documented, visually-distinct pedagogical device:
disclosed in the engine-room docs, defensibly sourced, and visibly separated
from real model output.

## 3. Design

### 3.1 Document the overlay in THEORY.md

Add a section "**Pedagogical collapse overlay (outside the equation system)**"
that states plainly:

- The overlay is **not** one of the 60 equations; it post-processes chart series
  after `runSimulation` for scenarios that cross the model-validity limit.
- The four constants with their values and rationale:
  `GREEK_GE_THRESHOLD_PCT_GDP = 150` (refinancing-risk snowball begins),
  `GREEK_GE_ACCEL_PER_YEAR = 0.04`, `GREEK_COLLAPSE_TRIGGER_PCT = 250`
  (forced restructuring; chosen below R&R's 300 % because EU fiscal rules make
  300 % unreachable for a member state), `GREEK_R_D_RESTRUCTURE_TRIGGER = 0.195`,
  and the 30 %-over-3-years pension haircut.
- Why it exists: beyond the validity limit the raw engine amounts are
  meaningless (they mark insolvency, not a forecast); the overlay stylises the
  post-collapse dynamics the equation system does not model.
- A pointer that the uniform validity rule applies it to all rungs.

Mirror a short version on the **Hypothèses page** (public-facing), framed as
"present­ation stylisée au-delà des limites du modèle".

### 3.2 Replace the Reinhart–Rogoff citation

The current tooltip (in `IntroLadderRungs.js` FOOTNOTES and the SimulatorPage
`Cite`) must stop attributing the 300 % claim to R&R. Replace with a defensible
basis:

- State R&R's **actual** finding (≈90 % GDP → growth compression) **with** the
  Herndon–Ash–Pollin (2013) caveat that the result is fragile.
- Justify the 250 % trigger on the **sovereign-debt-intolerance / EU-fiscal-rule**
  argument instead: a Stability-and-Growth-Pact member cannot run to 300 %; the
  refinancing/rollover-risk literature and the ECB/OMT backstop conditionality
  bite well before.
- **Name Japan as the counterexample** and give the reason France ≠ Japan: no
  captive domestic savings base (BoJ/Japanese households hold ~90 % of JGBs), no
  monetary sovereignty (euro member, cannot monetise). This turns a weak
  citation into an honest argument.

### 3.3 Visually distinguish overlaid segments

In the debt charts (IntroPage `MultiPanel` / scrolly, and SimulatorPage
`ChartsTab`), render the series **after** the collapse index differently:
dashed stroke + a subdued fill + a labelled `ReferenceLine`/`ReferenceArea`
"scénario stylisé" starting at `collapse.collapseYear`. The collapse index is
already known (`collapse.collapseYear` / `collapseIdx`); split the series at it.

## 4. Files

| File | Change |
|---|---|
| `THEORY.md` | new "collapse overlay" section (constants, rationale, outside-equations statement) |
| `src/pages/HypothesesPage.jsx` | short public disclosure of the overlay |
| `src/pages/IntroLadderRungs.js` | FOOTNOTES: replace the R&R tooltip text (Japan counterexample, HAP caveat, EU-rules basis) |
| `src/pages/SimulatorPage.jsx` | same `Cite` tooltip text; dashed "scénario stylisé" segment past collapseYear |
| `src/pages/IntroPage.jsx` | dashed overlaid segment + ReferenceArea |
| `*.css` | dashed/stylised segment styling |

## 5. Acceptance criteria

- THEORY.md documents all four constants + the haircut, states the overlay is
  outside the equation system, and cross-refs the uniform validity rule.
- No user-facing tooltip attributes the "300 %" claim to Reinhart–Rogoff; the
  replacement cites R&R's real 90 % finding with the HAP caveat and names Japan.
- On any insolvent scenario the chart shows a visually distinct "scénario
  stylisé" region starting at the restructuring year.
- 359 tests unchanged; build clean. (Add a test asserting the FOOTNOTES text no
  longer contains the "300 %"→R&R attribution string, so it can't regress.)

## 6. Risks

- Keep the copy tight — the Hypothèses disclosure should inform, not turn into
  an essay. The engine-room detail lives in THEORY.md.
- The dashed-segment split must handle the no-collapse case (solvent rungs draw
  normally, no stylised region).
