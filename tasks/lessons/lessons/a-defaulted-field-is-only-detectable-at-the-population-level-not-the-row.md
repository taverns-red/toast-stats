---
date: 2026-08-31
tier: principle
summary: A field defaulted to zero because its source was missing is indistinguishable from a real zero at the row level; the tell is at the population level
tags:
  [
    data-pipeline,
    frontend,
    hooks,
    recognition,
    snapshots,
    data-quality,
    guards,
  ]
---

# A defaulted field is only detectable at the population level, not the row

**Date:** 2026-08-31
**Issue:** #1501 (epic #1473)

## What happened

`newCharteredClubs` is derived by the collector from the raw
`district-performance.csv` charter dates. A rankings file rebuilt on a
runner that never synced those CSVs (R2 — runners start empty) still
writes the field, defaulted to `0`, on every row. All five
program-year-end files in the live archive are exactly that: field
present on 125–132 rows, global sum `0`, while a normal month-end
alongside them sums to 638.

`useClubGrowthMilestones` guarded against the field being **absent**:

```ts
if (typeof row.newCharteredClubs !== 'number') return { reason: 'count-absent' }
return { count: row.newCharteredClubs }
```

A phantom zero **is** a number, so the guard waved it through, the
milestone predicate found no tier reached, and the card would have
rendered a confident "No milestone reached by September 30" — for every
district, including five already sitting at 3 charters.

## The transferable takeaway

**Presence checks cannot detect a defaulted value; only the population
can.** Looking at one row, `0` from "nothing chartered" and `0` from
"never collected" are the same bytes. The distinguishing evidence lives
one level up: an all-zero total across a whole district census is a
state the world does not produce, while a single district's zero is
ordinary. So when a field can be silently defaulted, put the
implausibility test on the aggregate you already have in hand — the
whole file was fetched anyway — not on the row.

Two corollaries that keep such a guard honest:

- **Be conservative in both directions.** The guard needs a
  census-sized file (≥50 rows carrying the field; live files hold
  94–132) *and* not one positive value anywhere. Below that floor the
  count is reported as given: suppressing a real zero is the
  mirror-image lie.
- **Give it its own reason code.** `count-not-collected` is separate
  from `count-absent` and `snapshot-missing`, because they are three
  different things for an operator to go fix, and collapsing them into
  one "unavailable" throws away the diagnosis.

This is the sibling of the #1475 hazard. That one was *substitution* — a
missing checkpoint rendering as today's numbers. This one is a
*present-but-unpopulated field rendering as an earned-nothing verdict*.
Both are the same failure shape this repo keeps paying for: not an
error, not a blank, but a valid-looking smaller truth.

## What to do next time

When wiring a UI verdict to a pipeline-derived field, ask what the field
holds when its **source** was missing rather than when the field was
missing. If the answer is a legal-looking value, the guard belongs on
the distribution, and it needs a failing test built from the real
archive's numbers — plus a mutation run proving the guard is
load-bearing.
