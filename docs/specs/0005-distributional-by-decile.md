# Spec 0005 — Distributional "who pays / who gains" view by income decile

**Status:** Draft · **Priority:** P2 (next modelling feature after Monte Carlo) ·
**Depends on:** Spec 0003 (Monte Carlo — so decile outcomes carry bands) ·
**Source:** external review PENDING_NEXT_STEPS #6, STRATEGY S5 (decision recorded
in THEORY.md roadmap v3.1) ·
**Est. effort:** ~1 week

---

## 1. Goal

Show, per income decile, who bears the cost and who gains under each reform rung
— the "who pays" question the advocacy needs and the natural complement to the
aggregate solvency story. Each decile's outcome should carry the Monte Carlo
band (Spec 0003), not a false-precision point.

## 2. Why this, and why now

The Équinoxe mechanism is **already defined decile by decile**: `equinoxeRate` /
`computeS0Brackets` operate over the DREES 2022 decile table (`DREES_DECILES` in
the engine). So the model already knows each decile's pension level and the
Équinoxe reduction applied to it — the distributional view is largely *surfacing
a computation that exists*, not building a new one. This makes it closer to
shipping than the ALM / balance-sheet items it was bucketed with in v4.0, and
more central to the site's argument (a headline solvency number says nothing
about incidence). Prioritised in THEORY.md roadmap as v3.1.

## 3. Design

### 3.1 Per-decile outcome vector

For a given rung/params, compute for each DREES decile `d`:

- **Contribution side** — the decile's share of the Équinoxe reduction
  (`equinoxeRate(pension_d) × pension_d`), the CSG/CRDS restoration incidence,
  and (once modelled) any decile-specific effect of the cotisation routing.
- **Benefit side** — the decile's pension trajectory: legacy vs capi-annuity
  mix at retirement, and the real replacement rate under the rung.
- **Net position** — lifetime (or at-retirement) net gain/loss vs the no-reform
  counterfactual for a representative individual in that decile.

Reuse `computeIndividualPerspective` (already in the engine, used by the
simulator's "Et pour vous" tab) parameterised by a decile-representative
income/pension, rather than a single median worker.

### 3.2 Monte Carlo bands (depends on 0003)

Run the per-decile net position across the MC draws (Spec 0003) so each decile
bar shows P50 with a P10–P90 whisker. Without 0003 the view is a point estimate;
gate the band rendering on MC availability and label a single-run view as
"scénario central" explicitly.

### 3.3 Presentation

- A decile bar chart (D1…D10 on the x-axis, net €/mo or net lifetime PV on the
  y-axis, colour = gain/loss), one per rung, with the MC whisker.
- A short "incidence" caption: is the package progressive, flat, or regressive
  by decile? (The Équinoxe design — reducing high pensions, sparing low ones —
  should read as progressive on the contribution side; verify and state it.)
- Add to the expert simulator as a new tab ("Qui paie ?") and a simplified
  single-rung version on the intro page.

## 4. Files

| File | Change |
|---|---|
| `src/distributional.js` | **new** — per-decile outcome vector from `DREES_DECILES` + `computeIndividualPerspective` + `equinoxeRate` |
| `src/pages/SimulatorPage.jsx` | new "Qui paie ?" tab with the decile chart + MC whiskers |
| `src/pages/IntroPage.jsx` | simplified single-rung incidence chart |
| `tests/distributional.test.js` | per-decile sanity + progressivity checks |
| `THEORY.md` | document the incidence methodology + its assumptions (uniform-density-within-decile caveat) |

## 5. Tests & acceptance

1. **Decile coverage** — all 10 DREES deciles produce a finite net position for
   every rung.
2. **Équinoxe progressivity** — the contribution-side incidence is monotone
   non-decreasing in decile (high pensions bear more); pin it so a mis-sign
   can't regress.
3. **Counterfactual consistency** — a decile's net vs no-reform equals its
   reform outcome minus its counterfactual outcome (no double counting).
4. **Band correctness** (with 0003) — the P50 decile bar ≈ the single-run
   central value; whiskers widen with σ.
5. 359 existing tests unchanged; build clean.

## 6. Risks & open questions

- **Uniform-density-within-decile** — `computeS0Brackets` assumes a uniform
  income density inside each DREES decile (esp. the open-ended top decile
  2 900–6 000 €). That approximation drives the incidence numbers; document it
  and consider a finer top-decile split (review Phase-5 lead).
- **Representative individual ≠ decile distribution** — a single representative
  per decile hides within-decile dispersion; state that the bars are decile
  averages, not guarantees for any individual (same discipline as the aggregate
  "not a forecast" framing).
- **Sequencing** — do not ship the decile view as point estimates if 0003 is
  close; a "who pays" chart without uncertainty invites the same false-precision
  critique the aggregate KPIs already answer.
