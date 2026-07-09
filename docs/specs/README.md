# Implementation specs — CapiModel

Detailed specs for the high-priority "do first" items from the 2026-07 external
review (weekend-review `findings/CapiModel/`). One file per task. Drafts for the
maintainer, not committed roadmap.

| # | Spec | Priority | Depends on | Status |
|---|---|---|---|---|
| 0001 | [CI test gate before deploy](0001-ci-test-gate.md) | P0 | — | Draft |
| 0002 | [Expose return/rate/life-exp sliders](0002-expose-return-rate-sliders.md) | P1 | 0001 | Draft |
| 0003 | [Monte Carlo stochastic return paths](0003-monte-carlo.md) | P1 | 0001 (0002 helps) | Draft |
| 0004 | [Collapse-overlay governance (docs/citation half)](0004-collapse-overlay-governance.md) | P1 | — (code half shipped) | Draft |

**Design & strategic decisions** (the non-code choices around these specs) live
in [STRATEGY.md](STRATEGY.md): fencing the normative frame, the calibration-
constants register, the frozen `app/` duplicate, the stalled draft PR #22, the
post-recalibration roadmap priority, and the feedback/privacy posture.

**Sequencing.** 0001 first (so everything else lands gated). 0002 is cheap and
high-leverage (the verdict hinges on r_c post-PR-B) — note r_c is *already*
editable in the simulator; the work is bounding it + exposing r_d_base /
lifeExpAt65_per_decade + a public headline control. 0003 is the biggest feature
and builds on the same live engine (re-scope off the dead `app/` worker). 0004
is mostly docs + citation + a dashed-segment chart change; the uniform-validity
code half already shipped in PR #59.

**Not specced here** (deferred per the review): guarantee fair-value KPIs
(needs 0003 first), legal-feasibility toggles (v4.0), ALM / distributional-by-
decile outputs, per-age employment tables, the R0 direct-rights/survivors split,
the calibration-constants register, the normative-frame "parti pris" box, the
stalled draft PR #22 (rebase-or-close decision), and repo hygiene (delete the
frozen `app/`, archive `TransitionWalkthrough`). See
`findings/CapiModel/PENDING_NEXT_STEPS.md` and `PROPOSED_NEXT_STEPS.md`.
