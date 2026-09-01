---
date: 2026-08-31
tier: principle
summary: When the codebase already holds the FACT a heuristic was approximating, gate on the fact and let size only filter noise — and set that noise floor from a measured control period, not intuition
tags: [analytics, heuristics, thresholds, reformation, what-changed, calibration, cdn-data]
---

# Gate on the fact you hold; calibrate the leftover noise floor against a control period

**Date:** 2026-08-31
**Issue:** #1470 (follow-up to #1443 / PR #1448)
**PR:** #1507

## What happened

#1448 decided "did a district realignment move these clubs?" from magnitude
alone — `moved / roster ≥ 20% AND ≥ 8 clubs`. Measured over the live CDN's
`2026-06-30 → first-July` pair, that fired for **19 of the 94 districts holding
data on both sides**. District 03 took six clubs from district 05 — a district
with **no July snapshot at all, because it was dissolved** — and still read
*"Clubs that joined"*. Seven clubs, 5% of the roster: a ratio cannot see a small
district's real realignment, and lowering the ratio would have started labelling
ordinary churn in every other year.

## The reframe

The magnitude test was a **proxy for a fact the codebase already held**. #1442
had landed `spansDistrictReformation` — the reformation date is data, not an
inference. Once the boundary is known, size is no longer the evidence that a
realignment happened; it only has to separate a transfer from the handful of
clubs that appear or vanish from an export for unrelated reasons. So the rule
became: **at a known reformation boundary, a small absolute floor and no ratio;
everywhere else, the original magnitude test unchanged.**

Two different questions, two different tests — instead of one test doing both
jobs badly.

## Calibrating the leftover floor

The floor is the only judgement call left, and it was set from data rather than
taste: three **ordinary** July rollovers on the same CDN (`2023/2024/2025-06-30
→ 07-31`, 386 district observations) are the control for "what does a
non-realignment July look like?".

| non-closure moves | share of districts in an ordinary year |
| --- | --- |
| 1 | ~25% |
| 2 | ~9% |
| 3 | ~4% |
| ≥ 5 | **2 of 386** |

A floor of 3 would have been indistinguishable from background; 5 sits above
essentially all of it and still clears the motivating case with margin. Result:
19 → 26 districts at the 2026 boundary, and the three control rollovers
**unchanged at 2 each** — both of which moved 100+ clubs.

## The transferable rule

1. Before tuning a heuristic's constant, ask whether the thing it approximates
   is already a **fact** somewhere in the codebase. If it is, gate on the fact
   and shrink the heuristic to whatever noise it still has to reject.
2. Set that remaining threshold from a **control period** the effect is known to
   be absent from — the same pipeline, the same shape of data, a year when the
   event did not happen. "Feels about right" and "the issue suggested ≥3" are
   not evidence.
3. Report the count on both sides. "Fires for 26 of 94, control years unchanged
   at 2 of 128" is a falsifiable claim; "should catch more districts now" is
   not.

## Where it lives

- `packages/analytics-core/src/analytics/diffSnapshots.ts` —
  `detectRosterDiscontinuity`, the single seam; the known-boundary half is read
  from `@taverns-red/shared-contracts`, never re-derived, so a future
  reformation date moves this gate and the year-over-year gates in one edit.
- `frontend/src/content/programYearRuleChanges.ts` — the reader-facing statement
  of **both** thresholds (#1400), pinned by a test so the log cannot describe
  the exception as if it were the rule.
