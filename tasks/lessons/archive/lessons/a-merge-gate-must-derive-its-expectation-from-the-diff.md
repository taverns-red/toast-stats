---
date: 2026-09-01
tier: principle
summary: A gate that only inspects the checks that are present cannot tell "all passed" from "none ran" — derive the expected set from the diff
tags: [ci, github-actions, branch-protection, gates, falsifiability]
---

# A merge gate must derive its expectation from the diff, not from the checks that happen to be present

**Date:** 2026-09-01
**Issue:** #1216 (ci: require status checks on main via ruleset)
**Tags:** ci, github-actions, branch-protection, gates, falsifiability

## What happened

`main`'s ruleset enforced only `deletion` + `non_fast_forward`; CI green was
advisory. PR #1484 reported `mergeState: CLEAN` and was mergeable with **zero
check runs** on nine of its ten commits — no workflow ever scheduled. It was
caught only because a human noticed and closed it as superseded.

The obvious fix — require `Test Suite` — is worse than the disease. `ci.yml` is
path-filtered (`paths-ignore` for markdown/`tasks/`/`docs/`), so a docs-only PR
legitimately skips it. A required check that its own path filter can skip never
reports, sits `Expected` forever, and deadlocks every PR of the complementary
shape. Requiring `Docs Gate` deadlocks the mirror-image set.

## The transferable takeaway

**Absence and success are indistinguishable to any gate that only looks at what
is present.** So invert the direction: compute the set of checks that *should*
exist from an independent source of truth — here the PR's own changed files,
classified by the same globs the workflows filter on — and then require every
member of that set to be present *and* successful.

That inversion is what makes three cases separable, where a
"look at the checks" gate collapses all three into "green":

| | Expected set says | Checks say | Verdict |
|---|---|---|---|
| Legitimately skipped | not expected | absent | pass |
| **Never scheduled** | expected | absent | **fail** |
| Present but `skipped` | expected | `conclusion: skipped` | **fail** |

The third row matters on its own: GitHub's native required checks count
`skipped` as success, so a job-level `if:` — or a job skipped because its
`needs:` went red — passes a naive gate.

## Corollaries

- **The aggregator must be the one thing that cannot be skipped.** Its workflow
  carries no path filter, and a drift guard asserts that. If the deciding check
  can itself go missing, the whole scheme reduces to the bug it replaces.
- **Fail closed on the degenerate input too.** An empty changed-file list
  expects the full CI set, not nothing. "Nothing to check" must never be a
  free pass.
- **The expectation's source of truth needs its own drift guard.** The
  classifier's globs, `ci.yml`'s `paths-ignore`, and `docs.yml`'s `paths` are
  one fact in three files; when they drift, the gate either blocks a PR forever
  or waves one through ungated. One test, sourced from all three artifacts.
- **Prove it against the real incident, not just fixtures.** Running the gate
  against #1484's actual zero-check SHA (fails) and a real merged docs-only PR
  (passes) falsified the design in a way unit tests alone could not — the
  fixtures were written by the same person who wrote the logic.
