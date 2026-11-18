---
date: 2026-09-09
tier: principle
summary: A guard that says "we cannot read this" must also say whether that is a rename or a fact of history
tags: [dcp, analytics, data-pipeline, guards, csv-headers]
---

# A guard that says "we cannot read this" must also say which kind

**Date:** 2026-09-09
**Issue:** #1539 (found by the #1534 absence-as-zero census)

## What happened

`DCP_GOAL_DEFINITIONS` carried aliases for the current education-column
headers and the oldest, but not the era in between. Exports from
2020-07-31 to 2025-06-30 name goals 5 and 6 `Level 4s, Level 5s, or DTM
award` and its `Add.` twin, and nothing matched. Because
`hasDcpGoalColumns` deliberately spans all ten goals (#1399), that
suppressed `dcpGoalsAchieved` for every club in every district across
five program years — about 1.0M club-date records.

The #1399 guard worked exactly as designed: the field degraded to
`undefined`, never to a phantom zero. It logged a warning every run. And
the defect still sat there for five program years.

## Why the warning did not help

`missingDcpGoalHeaders` answers *which goals we cannot read*, and that
one answer covers two situations that could not be more different:

- **A rename.** Actionable, one alias string away, and costing every club
  its per-goal data until someone types it.
- **An era that never had the column.** A fact about history that no code
  change can recover — the pre-2020-07 exports really do have no
  additional-Level-4 column.

Told apart only by a human reading a header list, the first hides inside
the second indefinitely. The warning was true every month; it was never
*new*, so nobody looked.

## The principle

When a guard degrades safely, the degradation message must distinguish
the fixable case from the permanent one, and name the fix. Otherwise a
correct guard becomes a permanent low-grade warning — and a permanent
warning is indistinguishable from no warning at all.

Here that meant `suspectedDcpGoalHeaderRenames`: for each unresolved
goal, look for a header the export *does* carry that matches that goal's
shape and that no alias claims. Found, it errors and names the column;
not found, it stays a warning. Every rename TI has made extended the
existing name (`Level 2s` → `Level 2s or EOM`, `Level 4s` → `Level 4s,
Level 5s, or DTM award` → `…, Path Completions, …`), so an anchored
prefix pattern catches the shape that actually occurs.

## The blind spot recurs at every OR

Writing the detector, I keyed it on the *goal*: scan a goal's columns only
when the goal resolved nothing. Review caught that this rebuilds the #1399
defect one level down. DCP goal 10 passes on October dues **alone**, so
renaming just the October column leaves the goal resolved, the missing-goals
list empty, and the detector exiting before it tests a single pattern — while
the renamed column reads 0 and the UI renders that 0 as a sub-item for every
club in every district.

The original #1399 bug was a sentinel keyed on the one column that did not
change. This was the same bug, keyed one level out. **Wherever alternatives
are OR'd, a satisfied parent hides an unsatisfied child** — so a detector must
run at the granularity of the thing that can change (the column), never at the
granularity of the thing that has a fallback (the goal).

## The corollary that cost more

The alias table existed **twice**. `frontend/src/utils/extractEducationLevels.ts`
kept its own copy, and the copy had the same gap — but no all-or-nothing
guard, so it did the thing #1399 was built to prevent: it rendered five
program years of absent columns as a confident **0 awards**. The safe
degradation only ever protected the copy that had a guard.

A fallback alias list is a policy, not data. Derive the second consumer
from the first; a comment saying "mirrors X" is not a mirror.
