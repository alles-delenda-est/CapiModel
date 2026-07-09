# Design & strategic steps — CapiModel

Companion to the implementation specs (0001–0004). These are the **decisions**,
not the builds. Each carries: **Why**, **Interaction with the specs**,
**Pros / Cons**, **Next best alternative**. Ordered roughly by leverage.

---

## S1 — Fence the normative frame ("parti pris")

**Why.** The project is advocacy and entitled to be — but it currently mixes
registers silently. It presents as a neutral simulator while carrying loaded
framing: the "écoles/justice/santé" opportunity-cost earmarking labels, the
openly polemical `fn_2` housing-allocation footnote ("des proches de partis de
gauche…"), and a "contre toute évidence" jab. A hostile reader who screenshots
`fn_2` against the "neutral model" framing has an easy hit. Declaring the stance
*strengthens* the argument by separating the model (defensible) from the framing
(a choice).

**Interaction with the specs.** Adjacent to Spec 0004 (collapse-overlay
governance) — both are about *honesty of presentation* over the same public
surfaces (IntroPage, Hypothèses). Do them together: 0004 documents the stylised
dynamics, S1 declares the normative stance, and the two share the disclosure
real estate. No modelling change.

**Pros / Cons.** Pro: converts the single most screenshot-able liability into a
credibility asset; costs one paragraph + label rewording. Con: an explicit
"parti pris" box makes the advocacy undeniable to readers who preferred to read
it as neutral analysis — but that honesty is the point.

**Next best alternative.** Minimal: strip or source `fn_2` and drop the "contre
toute évidence" jab (the two highest-risk sentences) and reword earmarking labels
to neutral "transferts du budget général" with the opportunity-cost framing
explained *as a framing* — without a full stance box, if a formal "parti pris"
declaration feels too heavy.

---

## S2 — Build a calibration-constants register with document-grade citations

**Why.** Externally-sourced constants are scattered through the engine and pages
with thin provenance ("INSEE", not a table/number/date), and several are stale or
slightly off (end-2024 debt 3 305 not 3 200; 2024 GDP 2 919,9 not 2 850; FRR ~20
not 36; R0 "fin 2024" year-slip = 17,2 M is fin 2023; NBIM real return 4,3 % not
~4,5 %; C22/C56 and C41/C57 two-anchor conflicts). "Contre-Budget 2026" sources
10 Md€/an of the Équinoxe package and is a ghost reference. One module where every
constant lives with value, source document, vintage, and a live render on the
Hypothèses page fixes all of these while passing through.

**Interaction with the specs.** Directly enables Spec 0002 (return/rate sliders):
the r_c default and its 4,3 %-vs-4,5 % note belong in this register, and the
slider's tooltip should read from it. Also underpins 0003 (Monte Carlo) — the
σ/ρ calibration and the demographic-vintage anchors need a sourced home. Do S2
*before or with* 0002 so the slider defaults are the corrected, cited values.

**Pros / Cons.** Pro: corrects ~half a dozen factual slips in one pass, makes the
model auditable to the source-document level, single point of truth for the
sliders and MC. Con: a register is only as good as its maintenance; a live
Hypothèses render adds a small coupling between data and UI.

**Next best alternative.** A static `src/calibration.js` with sourced constants
(no live Hypothèses render) — captures the provenance and de-duplicates the
values without the UI wiring, if the live render is more than wanted now.

---

## S3 — Decide the fate of the frozen `app/` duplicate

**Why.** A stale `app/` directory holds an older build (34 equations, a Monte
Carlo worker, old preset names). It is the *source* of the ghost claims the
review kept finding — CLAUDE.md's "Monte Carlo exists" was true only of this dead
copy. As long as it sits in the tree, greps and future agents will resurrect its
false facts.

**Interaction with the specs.** Blocks a clean Spec 0003: the review explicitly
says "the MC worker survives only in the frozen `app/` copy — do not fix it,
build fresh." Deleting `app/` removes the temptation and the confusion before MC
is built. Also removes the 34-equations ghost that 0004's/CLAUDE's doc-sync keeps
having to correct.

**Pros / Cons.** Pro (delete): removes a whole class of stale-fact findings,
shrinks the repo, unambiguous single source. Con: loses the only in-repo copy of
the old MC worker — mitigated by git history (it's recoverable) and by the fact
that 0003 rebuilds it properly anyway.

**Next best alternative.** If deletion feels risky, **archive** it: move to
`archive/app-frozen/` with a README stating "superseded, not built, do not cite",
and add it to `.eslintignore`/grep-ignore so it stops polluting searches — keeps
the artifact without the confusion.

---

## S4 — Resolve the stalled draft PR #22 (debt-profile optimisation)

**Why.** `feat/debt-profile-optimisation` (2026-05-12) has been stalled ~8 weeks
on a base ~7 weeks behind `main`, recorded in no plan doc. It's a decision debt:
either it's alive or it isn't.

**Interaction with the specs.** Post-PR-B a debt-profile optimiser is arguably
*more* relevant — the financed cascade's τ_K/α schedule is now the difference
between solvency and spiral, which is exactly what such an optimiser would tune.
But the branch predates the June recalibration, so its calibration work is
presumptively obsolete, and it would need the Spec 0002 sliders + 0003 MC to be
evaluated honestly against uncertainty. So: not blocked by the specs, but only
worth reviving *after* them.

**Pros / Cons.** Pro (close now, reopen fresh against v2.1): clears the decision
debt, avoids rebasing obsolete calibration. Con: loses whatever design thinking
is in the branch — capture it in an issue before closing.

**Next best alternative.** Rebase onto v2.1 and re-run its calibration — only if
someone will own it this quarter; otherwise close with a note and an issue
capturing the idea (the recommended path).

---

## S5 — Set the post-recalibration roadmap priority (distributional vs ALM vs legal toggles)

**Why.** The v4.0 roadmap lists ALM, contingent-liability balance sheet,
behavioural responses, GE completeness, and distributional outputs as one bucket.
Post-PR-B the highest-value *next* modelling feature is contestable and worth an
explicit decision. The review's steer: **distributional-by-decile** interacts
directly with the Équinoxe mechanism (defined over the DREES decile table), so a
"who pays" view is closer and more valuable to the site's argument than ALM; and
pulling the **CDC/FRR/Agirc-Arrco scope toggle** (part of legal-feasibility)
forward is justified because F₀'s components (V11: AA 85,6 confirmed, FRR ~20 not
36, CDC unverifiable) need per-component treatment anyway.

**Interaction with the specs.** Sits *after* the specced work in sequence:
0001 (gate), 0002 (sliders), 0003 (MC) are the "make the current model honest and
uncertainty-aware" layer; this decides what *new* capability comes next. Guarantee
fair-value KPIs (a roadmap item) explicitly depend on 0003 and should follow it.

**Pros / Cons.** Pro (distributional-first): leverages existing DREES decile
machinery, answers the "who pays" question the advocacy needs. Con: distributional
outputs inherit every base-case assumption, so they're only as credible as the MC
bands that should accompany them — hence sequence after 0003.

**Next best alternative.** Legal-feasibility toggles first (Agirc-Arrco scope /
CDC basis / HLM pace) — higher value for the *policy* audience and forced by the
F₀-component uncertainty — if the audience is legislators more than the public.

---

## S6 — Close the feedback loop (and verify the Supabase privacy posture)

**Why.** There's a feedback widget backed by Supabase but no stated privacy
handling (what's stored, where, retention), no issue templates, no CONTRIBUTING,
and the RLS insert-only policy is unverified in-repo. A public advocacy site
collecting name/email owes a privacy sentence and a verifiable data posture.

**Interaction with the specs.** Independent of the modelling specs, but pairs with
Spec 0001's CI gate (add a check that the Supabase keys aren't committed) and with
S1 (both are trust/credibility surfaces). Verify RLS before any wider launch the
sliders/MC might drive traffic to.

**Pros / Cons.** Pro: cheap, closes a real privacy gap, gives technical readers a
contribution path. Con: collecting feedback creates a triage obligation and a data
-protection surface (RGPD) that must actually be honoured, not just described.

**Next best alternative.** If the widget's data-protection burden isn't wanted,
drop the name/email capture to anonymous thumbs-up/down + free text, add a
one-line privacy note, and point technical readers at GitHub issues instead.

---

### Explicitly parked (structural modelling, not near-term strategy)
Split `R0` into direct-rights vs survivors sub-cohorts (structural; do when next
touching the retiree kernel, pairs with the age-lever-honesty fix B4). Per-age
employment tables (deferred, fine). npm audit triage (fold into the Spec 0001 CI
work). Simplified-view spec DRAFT-header flip + PlanTemp archive (housekeeping).
See `findings/CapiModel/PENDING_NEXT_STEPS.md` / `PROPOSED_NEXT_STEPS.md`.
