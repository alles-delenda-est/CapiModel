# Spec — SimplifiedView redesign (Project B)

**Status:** DRAFT for review. Author: Claude (Opus 4.8). Reviewer: Sonnet agent (cold).
**Depends on:** Project A (250 % / 30 % restructuring) landing first — B's collapse-year and
pension-delta KPIs read A's restructuring logic. **Its own PR**, after A.

---

## 1. Thesis (the one sentence everything serves)

> **There is no free lever.** Every path to keeping French pensions running has a price —
> paid in *pensions cut*, in *budget sacrificed* (schools, justice, solidarity), or in *debt*.
> The simple view lets a lay visitor feel those trade-offs by choosing a reform and watching
> the four "prices" move.

Every option, KPI and parameter below is justified only insofar as it serves that sentence.
Anything that doesn't, we cut.

## 2. Architecture — single source of truth for reforms (the key decision)

Today the reforms are defined **twice**: `LADDER_RUNGS` (intro) and the SimplifiedView's own
`SCENARIOS`. That risks the *same* reform showing *different* numbers in two places.

**Decision:** extract one shared module — `src/reforms.js` — exporting the canonical reform
set (id, label, lay-friendly description, `paramOverrides`, `greekCollapse` flag). Both the
intro ladder and the simple view consume it. The simple view picks a subset; the intro keeps
its 5-rung ordering. New reforms (Équilibre 2070) are added here once.

Canonical reforms (superset):
`actuel · equinoxe · equilibre2070 (NEW) · suede · chiliFinance · chiliUnfunded · capiPur`

SimplifiedView exposes **5**: `actuel · equinoxe · equilibre2070 · suede · chiliFinance`
(Patrick's 01–05). *Open Q: confirm 01/02 = actuel/equinoxe.*

## 3. Layout (mobile-first; the current view already works on mobile — keep it)

```
┌ Réforme (selector, 5 options) ─────────────────────────┐
├ 4 KPI cards (2×2 on mobile) ───────────────────────────┤
├ Chart: cotisations vs dette vs diversification (ex-dette)┤
├ Paramètres (incl. macro "conditions" folded in) ───────┤
└ Reste (narrative / individual perspective) as-is ──────┘
```

Per Patrick B3: the macro **conditions** (optimiste/neutre/stress) move *into* the parameters
block rather than a second top selector — so there's **one** top-level choice (the reform) and
everything else is a parameter. Cleaner for lay users; keeps reform × conditions orthogonal.

## 4. KPIs (4 — the "four prices")

| KPI | Definition | Notes |
|---|---|---|
| **Pension moyenne 2070** | *Delta* vs today, **real** (€2027), €/mois. `perRetireeRealMo(2070) − perRetireeRealMo(2027)`. | Mouse-over explains "écart en pouvoir d'achat vs aujourd'hui". Under a collapsing scenario this reflects A's 30 % cut → strongly negative (the point). Baseline "today" = 2027 model value, stated. |
| **Année de collapse** | First year the restructuring trigger (A: 250 % GDP) fires, else "—". | Blank/"Aucun" for solvent reforms — informative, not a bug. |
| **Sacrifices budgétaires** | Cumulative budget-général transfers, real €2027 (`totalFiscalTransferReal`, already in extractKPIs). | The KPI added in #49. |
| **Fonds net 2070** | `K_t(2070) − D_t(2070)` (net funded position at COR's horizon). | 2070 not 2096, to align with COR. |

## 5. Chart — cotisations vs dette vs "diversification des moyens de financement (ex-dette)"

Three annual series, %GDP or Md€:
- **Cotisations** — payroll contributions (`C_s_t + C_e_t`).
- **Dette** — transition debt stock `D_t` (with A's 250 % cap overlay for display).
- **Diversification des moyens de financement (hors dette)** — the *non-debt* financing the
  system leans on: budget transfers + HLM proceeds + CDC endowment draw + tauK sweep. i.e. every
  euro closing the gap that isn't a cotisation and isn't new debt.
  *Open Q: confirm the exact components — proposal above.*

## 6. Parameters (the material few; each with a COR reference in tiny text)

| Param | Control | COR reference (tiny text) |
|---|---|---|
| **Âge de départ** | number 60–70 | *COR : 64 (réforme 2023) ; 67,6 pour équilibrer en 2070* |
| **Indexation de l'âge** | Fixe / Indexé | *COR : ~67,6 ans en 2070 sous indexation* |
| **Croissance (productivité)** | slider (w_r) | *COR central : 0,7 %/an* |
| **Taux d'emploi** | slider (employmentRateTarget) | *COR : hypothèse ~... ; nous 76 %* |
| **Sacrifices budgétaires** | Oui/Non (transfers toggle) | mouse-over (Patrick): *"diversification des moyens de financement, c.-à-d. couper le budget de l'éducation, de la justice, et de la solidarité"* |
| **Financement HLM + CDC** | Oui/Non (default Oui) | bundles rho/delta/F0 into one switch |
| **Conditions macro** | Prudent / Neutre / Optimiste | folded here per B3 |

Lay register: use plain-language labels, not jargon (e.g. "L'âge suit-il l'espérance de vie ?").

## 7. Équilibre 2070 (per B4 decision)

A **pre-solved** parametric package (not a live optimizer) calibrated so that, by 2070,
net debt ≈ 0 **and** budget transfers ≈ 0 — balancing *répartition as-is* by age + employment
+ (if needed) contributions. The reveal of *what it takes* (the param values) is the lesson.
Distinct from chiliFinance (funded). Build note: solve the package offline, pin it in `reforms.js`.

## 8. Dependencies, testing, risks

- **A before B** (collapse + pension-cut logic).
- **Tests:** data-contract test for `reforms.js` (each reform's headline KPIs pinned, ±0.5 %),
  mirroring `simulatorPage-data.test.js`. Guards drift.
- **Risk:** Équilibre 2070 may push age/employment to extreme values to hit nil-debt/nil-transfer
  — that extremity *is* the message, but check it stays within control ranges (age ≤ 70 ceiling).
- **Risk:** folding conditions into params must not explode the param count on mobile — keep to 7.

## 9. Open questions for Patrick

1. Confirm options 01/02 = Actuel / Rééquilibrage (Équinoxe)?
2. Exact components of "diversification (ex-dette)" — proposal in §5.
3. Équilibre 2070: which levers may it move (age + employment only, or also contributions)?
4. Keep the 5 sliders' current friendly copy, or rewrite fully?

---

## 10. Revisions after the cold Sonnet review

**Accepted (fold into build):**
- **[B1] `perRetireeRealMo` is NOT a row field** — it's derived in IntroPage from
  `legacyExp_t + transitionalPaygExp_t + ndcPaygPension_t + capiPayout_t` over
  `legacyRetirees_t + capiRetirees_t`, deflated by `I_factor_t`. Extract a shared
  `derivePerRetireePension(row)` helper (part of the single-source-of-truth work);
  don't treat it as a row property.
- **[B2] Pin the pension "today" baseline** from ONE reference run (`actuel`, t=0),
  computed once at mount — not from the selected reform (Équinoxe cuts at t=0, which
  would move the baseline and make cross-reform comparison meaningless).
- **[R2] "Diversification (ex-dette)" chart series** = `fiscalTransfer_t + H_t_proceeds
  + tauKLevy_t + surplusLevy_t` (identifiable add-on financing). Do NOT include
  `fundReturn_t` — it's already inside the deficit waterfall → double-counting.
- **[R4] Mobile control types:** 3 continuous *sliders* (productivité, âge, emploi) in
  one group; the discrete controls (indexation Fixe/Indexé, transfers Oui/Non, HLM+CDC
  Oui/Non, conditions Prudent/Neutre/Optimiste) in a separate "Réglages" sub-section —
  don't mix range inputs and toggles in one visual rhythm.
- **[M1/M3] Scope it as a REWRITE, not an extension.** Explicitly retire the current
  SCENARIOS concept and list what stays (individual-perspective panel, "comment ça
  marche") vs what's dropped (the 3-chart section, the decade table) — decide per item.
- **[M2] Audit `IndividualPerspectivePanel`** before assuming "as-is": it may read the
  old r_c/rho/lambda params, which are gone from the new param set.

**Resolved by testing:**
- **[B3] "Équilibre 2070" IS buildable.** Under the merged demographics (cor_central),
  a PAYG-only, no-transfer package clears debt by 2070 with e.g. **age 68 + emploi 80 %**,
  or **age 67 indexed + Équinoxe + emploi 80 %** (debt clears, peak only ~200 Md€). The
  *severity* is the lesson. Pre-solve one package and pin it in `reforms.js`.

**Rejected / corrected:**
- **[R3] The reviewer claimed "no project test files exist" — false.** `tests/` has
  engine, engine-reference, introPage-data, simulatorPage-data, retirementAge (327
  tests). The *valid* half stands: the ID rename must be systematic (MECHANISMS + intro
  display keyed to IDs) and guarded by a `reforms.js` data-contract test.

**Decided by Patrick:**
- **[R1] Keep the "Année de collapse" KPI.** For **solvent outcomes** (no collapse),
  display **"Système sain"** instead of a blank/"—" — turns the empty state into a
  positive signal. It shows a *year* only when the system collapses (e.g. the statu quo
  once the budget transfers are switched off), tying it directly to the Sacrifices
  budgétaires KPI — the "no free lever" point made visible.
