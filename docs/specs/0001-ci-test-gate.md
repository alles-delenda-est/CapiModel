# Spec 0001 — CI test gate before deploy

**Status:** Draft · **Priority:** P0 (do before any other CapiModel work) ·
**Source:** external review PROPOSED_NEXT_STEPS #2, BUGS.md B10 ·
**Est. effort:** ~1 hour

---

## 1. Problem

`.github/workflows/deploy.yml` fires a Vercel deploy hook on **every push to
`main`** with no gate:

```yaml
on: { push: { branches: [main] } }
jobs:
  trigger:
    steps:
      - run: curl -fsSL -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}"
```

Nothing runs the 359-test suite or `vite build` before production ships. This
is how the two root analysis scripts silently bit-rotted (B10) and how a
red-test change could reach the live site. It is the cheapest insurance in the
whole backlog.

## 2. Goal

No deploy of `main` unless `npm test` (359 tests) and `npm run build` pass.
Also run the suite on PRs so regressions surface before merge, not after.

## 3. Design

### 3.1 New `ci.yml` (runs on PRs and pushes)

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm test
      - run: npm run build
```

### 3.2 Gate the deploy on the test job

Two viable approaches; pick one:

**A — single workflow, `needs:` dependency (recommended).** Fold the deploy
`trigger` job into `ci.yml` with `needs: test` and `if: github.ref ==
'refs/heads/main' && success()`. The deploy hook only fires after `test`
(and the build) pass on `main`. One file, no branch-protection dependency.

**B — branch protection.** Keep `deploy.yml` separate but add a required status
check on `test` in `main`'s branch-protection rules, so nothing merges to `main`
red and the deploy only ever runs on green history. Requires repo-admin config
in addition to the workflow.

Recommend **A** (self-contained, reviewable in-repo) with **B** as a
belt-and-braces follow-up once the check is trusted.

### 3.3 Interaction with Vercel's own git build

Vercel also builds from its git integration (that is what produces the PR
previews). Ensure the deploy hook and the git-integration build do not
double-deploy; if the git integration already deploys `main` on push, the hook
job may be redundant — in that case the value of this spec is purely the **PR
test gate** + making the Vercel production build itself gated. If Vercel builds
regardless of CI, add the test command to Vercel's build step
(`npm test && npm run build`) so a red suite fails the production build too.

## 4. Files touched

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | **new** — test + build on PR/push |
| `.github/workflows/deploy.yml` | fold into ci.yml (`needs: test`) or leave + document branch-protection |
| `vercel.json` / Vercel dashboard | (optional) build command `npm test && npm run build` |
| `CLAUDE.md` | note the gate under Build & test |

## 5. Acceptance criteria

- A PR with a failing test shows a red `test` check and cannot deploy.
- A green push to `main` deploys exactly once.
- `npm ci && npm test && npm run build` is the exact local repro.
- The two root scripts (`test_payg_baseline.mjs`, `scenario_cutoff_analysis.mjs`)
  are optionally added to CI as a smoke step so their class of rot is caught
  (they are not part of `vitest` — add `node test_payg_baseline.mjs >/dev/null`).

## 6. Risks

- **Node version drift** — pin to the version Vercel uses (check the dashboard;
  align `node-version` to avoid "works in CI, fails on Vercel").
- **npm ci needs a committed lockfile** — `package-lock.json` is present, good.
- Do this **first** so the r_c-slider / Monte-Carlo / overlay work all land
  gated.
