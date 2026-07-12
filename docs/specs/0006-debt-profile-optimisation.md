# Spec 0006 — Debt-profile optimisation (revival of issue #60 / stalled PR #22)

**Status:** Draft · **Priority:** P2 (after Monte Carlo for the publishable
variant; a deterministic exploration can start earlier) ·
**Depends on:** Spec 0001 (CI gate); Spec 0003 (Monte Carlo) for Phase B ·
**Source:** issue #60 (captured from stalled draft PR #22), STRATEGY §S4,
review PENDING_NEXT_STEPS #13 ·
**Est. effort:** Phase A ~2–3 days · Phase B ~2–3 days on top of 0003

---

## 1. Goal

Find, and let the user find, the **financing schedule that minimises the cost
of the transition** — the τ_K / sweep-share / levy-timing profile that repays
transition debt with the least cumulative interest and the lowest peak, subject
to the model's own solvency guarantees (pensions never cut, capi floor never
breached). Post-PR-B this is no longer a nicety: under the 2026-vintage
demographics the financing schedule **is the difference between solvency and
spiral** (`v1_default` spirals; `v1_finance`, which differs mainly in its
financing profile, clears its debt by 2074).

Deliverable shape: a reproducible **optimiser script + committed results table**
first (Phase A), and a **robust, uncertainty-aware optimisation** integrated
with Monte Carlo (Phase B). A UI "profil optimisé" preset only after Phase B —
never publish an optimum tuned to a single deterministic path.

## 2. Context and prior art (read before building)

1. **Stalled PR #22** (`feat/debt-profile-optimisation`, 2026-05-12, closed;
   captured in issue #60; head `02ee9e34`, restorable from the PR page).
   Footprint: `simulation-engine.js` +344/−163, its own `demographic-tables.js`,
   +580 test lines, fully rewritten default fixture, large THEORY/overview
   rewrites. **Everything it calibrated predates the June-2026 PR-B
   recalibration and the v2.1 balanced cascade** — its numbers are obsolete and
   its engine edits would conflict wholesale. Mine it for *design intent* only;
   do not rebase it.
2. **`scripts/capi-debt-optimisation.mjs`** (working, single-lever): sweeps τ_K
   over the full engine and reports exactly the right KPI set — peakDebt,
   totalInterest, debtFreeYear, terminalDebt, terminalKSurplus,
   capiPayoutRatio, minCapiPayoutRatio (payout preservation vs baseline). This
   is the seed of Phase A: generalise it from one lever to a profile.
   ⚠️ Its local `debtFreeYear` helper still uses the old "first year D_t < 1"
   semantics — switch to the permanent-clearance definition (import
   `extractKPIs` from `src/presets.js` rather than re-deriving).
3. **The v1.3 empirical optimum** recorded in the `DEFAULT_CONFIG` comments
   (employer-cut study: step 0.5 %, PA 0 %, τ_K 2.5 % → CI 3 508 Md€, terminal
   debt 17 Md€) is **pre-PR-B** — treat it as methodology precedent, not as a
   number to reproduce.

## 3. Decision variables (the "profile")

All already exist as engine config — the optimiser is a wrapper, no engine
change in Phase A:

| Lever | Key(s) | Range | Notes |
|---|---|---|---|
| Stock levy on fund growth | `tauK` | 0–0.05 | The main channel (v1.2 finding: only monotone debt-reduction channel; K_t solvency floor already guards it) |
| Surplus sweep share | `debtSweepSurplusFrac` | 0.25–1.0 | v2.1 default 0.75; governs debt-repayment vs capi-bonus split |
| Transition levy | `lambda`, `Tlambda` | 0–0.5 · start yr 0–30 | Levy on capi flows; timing matters for early-years compounding |
| Repayment share of netFlow | `alpha` | 0.25–1.0 | Split of positive netFlow between debt repayment and fund |
| Employer-cut schedule | `deltaTauxPatronal`, `deltaTauxPatronalPA`, `taxCutStartT` | per v1.3 study | Optional second block; interacts strongly with τ_K (the v1.3 study is the precedent) |

Keep the search space honest: 3–5 levers, coarse grids. This is a policy-shape
search, not a hyperparameter fit — a 5-lever fine grid would overfit the model.

## 4. Objectives and constraints

**Objective (lexicographic, in this order):**
1. Feasibility first — see constraints; infeasible profiles are discarded, not
   scored.
2. Minimise **cumulative interest** `CI_t[T]` (the actual cost of the
   transition financing).
3. Tie-break on **peak D_t**, then earlier permanent `debtFreeYear`.

**Hard constraints (all already observable in engine rows):**
- **No pension erosion:** `minCapiPayoutRatio ≥ 0.999` vs the same-config
  no-levy baseline (the script's existing guard — the whole point of the
  balanced cascade is that financing never eats pensions).
- **No guarantee calls:** `CK_t[T] = 0`.
- **K-floor respected at horizon:** `terminalKSurplus ≥ 0`.
- **Model validity:** the profile never triggers `detectGreekCollapse`
  (combined debt ratio stays under the restructuring thresholds).
- **Politically bounded levers:** ranges in §3 are caps, and τ_K is only ever
  levied above the solvency floor (engine-enforced).

Report near-misses (profiles failing exactly one constraint) in the output
table — the boundary is itself informative.

## 5. Design

### Phase A — deterministic optimiser (script + committed report)

`scripts/optimise-debt-profile.mjs`:

1. **Stage 1 — coarse grid** over (τ_K × sweepFrac × λ/Tλ) on the `v1_finance`
   base (and optionally `v1_default` to show whether *any* profile saves the
   unfinanced cascade — a headline-relevant question). ~10³–10⁴ runs; the
   engine is a few ms/run, so minutes, not hours.
2. **Stage 2 — coordinate refinement** around the top-k feasible points
   (halve step sizes, 2 passes). No fancy optimiser needed; the surfaces in the
   existing τ_K sweep are smooth and monotone-ish.
3. **Output**: `docs/optimisation/debt-profile-report.md` — committed table of
   the frontier (CI vs peak-debt trade-off), the chosen optimum, the
   constraint-boundary near-misses, and the exact CLI to reproduce
   (seedless/deterministic). KPIs via `extractKPIs` (post-B7/B8 semantics).

### Phase B — robust optimisation (after Spec 0003)

Re-score the Phase-A frontier under the Monte Carlo draws:

- For each candidate profile: run the MC wrapper (same seeds across profiles —
  common random numbers, so differences are profile effects, not noise).
- **Robust objective:** minimise **P90 cumulative interest** subject to
  **P(insolvency) ≤ ε** (ε explicit, e.g. 5 %) and the §4 constraints holding
  at P90. The deterministic optimum and the robust optimum will differ — *that
  gap is the finding*, publish both.
- Only after Phase B: surface an optional **"profil optimisé (robuste)"**
  preset/toggle in the simulator, clearly labelled as the output of this
  procedure with a link to the report.

### What NOT to do (lessons from PR #22)

- No engine modifications to "help" the optimiser (PR #22's +344/−163 in the
  engine is why it rotted). The engine is the objective function; the optimiser
  stays outside it.
- No fixture rewrites: the optimiser adds no default-path change.
- No fine-grained year-by-year τ_K(t) schedules in v1 — a free per-year
  schedule will exploit model artefacts (GE-penalty knee, cap boundaries) and
  produce an uninterpretable, non-legislatable profile. Constant-plus-start-year
  parameterisations only, until someone demonstrates the need.

## 6. Files

| File | Change |
|---|---|
| `scripts/optimise-debt-profile.mjs` | **new** — Phase A (grid + refinement, feasibility filter, frontier table) |
| `docs/optimisation/debt-profile-report.md` | **new** — committed reproducible results |
| `src/monte-carlo.js` (from 0003) | Phase B: expose a `scoreProfile(config, draws)` entry with common-random-number support |
| `scripts/capi-debt-optimisation.mjs` | fold in or retire (note pointing at the new script); fix its stale debtFreeYear semantics either way |
| `tests/optimiser.test.js` | **new** — see §7 |
| `THEORY.md` | short §: what was optimised, objective/constraints, deterministic-vs-robust gap |

## 7. Tests & acceptance

1. **Feasibility filter correctness** — a profile that cuts payouts
   (constructed: huge τ_K, no floor headroom) is rejected; the `v1_finance`
   defaults are feasible.
2. **Reproducibility** — the script is deterministic; running twice yields an
   identical frontier (lock a small-grid regression fixture).
3. **Sanity direction** — on `v1_finance`, τ_K = 0 strictly dominates on
   payouts but is (weakly) worse on CI than the frontier optimum; the recorded
   optimum beats the hand-tuned 2.5 % default on CI without violating any
   constraint (or the report states the default *is* the optimum — also a
   valid, publishable outcome).
4. **Phase B (with 0003):** common-random-number scoring — same seed set across
   profiles; P(insolvency) monotone in τ_K→0 on `v1_default`.
5. Existing suite untouched (the optimiser adds no engine change); CI (0001)
   runs the optimiser's unit tests, not the full grid.

## 8. Risks & open questions

- **Optimising into model artefacts.** The GE-penalty knee, the 20 % r_d cap
  and the sweep caps create kinks; an optimiser will park solutions on them.
  Mitigation: report each optimum's distance to every active cap, and treat
  "optimum sits exactly on an engine cap" as a red flag for interpretation.
- **False precision.** A deterministic optimum under one demographic path is a
  curve fit, not a policy recommendation — that is exactly why Phase B gates
  the UI exposure. The report must carry the same "not a forecast" framing as
  the rest of the model.
- **Objective choice is normative.** Minimising CI implicitly weights
  taxpayers over capi savers relative to, say, maximising terminal K subject to
  debt-free-by-2075. State the objective in THEORY.md as a choice; optionally
  report the frontier for one alternative objective to show sensitivity.
- **Interaction with the employer-cut block** (v1.3) doubles the search space;
  keep it a separate, optional stage as the v1.3 study did.
