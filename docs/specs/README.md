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
| 0005 | [Distributional "who pays" by income decile](0005-distributional-by-decile.md) | P2 | 0003 | Draft *(file arrives via the strategy PR #61 branch)* |
| 0006 | [Debt-profile optimisation](0006-debt-profile-optimisation.md) | P2 | 0001; 0003 for Phase B | Draft (issue #60) |

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

**Since resolved via the strategy execution (PR #61 + issue #60):** the
normative frame (resolved as: neutral, loaded wording removed), the
calibration-constants register (`src/calibration.js` + Hypothèses render +
lock test), the frozen `app/` duplicate (deleted), the stalled draft PR #22
(closed; idea captured in issue #60 → spec 0006), distributional-by-decile
(prioritised as roadmap v3.1 → spec 0005), and the feedback/privacy surface.

**Still not specced** (deferred per the review): guarantee fair-value KPIs
(needs 0003 first), legal-feasibility toggles (v4.0), ALM, per-age employment
tables, the R0 direct-rights/survivors split, and archiving
`TransitionWalkthrough`. See `findings/CapiModel/PENDING_NEXT_STEPS.md` and
`PROPOSED_NEXT_STEPS.md`.
