---
date: 2026-10-06
tier: lesson
summary: Derive the program year (and any PY window) from a snapshot's logical date (the 06-30 it describes), never its collection date — a June close collected in July otherwise resolves to the next PY; and when rebuilding the past, exclude later years with `<`, not `!==`
tags: [data-pipeline, collector-cli, program-year, year-end-close, awards, rebuild, dates]
---

# Derive the program year from a snapshot's logical date, not its collection date

**Date:** 2026-10-06
**Issue:** #1622 (PR #1625) · **Sibling:** #1609 (PR #1635) · **Related:**
#1608 / PR #1619 (rebuild clobbered a close), CLAUDE.md #1284 tripwire,
Lesson `a-dated-write-must-take-its-entity-set-from-that-date`

## What happened

A snapshot has two dates. The **logical** date is the period it describes
(`snapshots/2026-06-30`, `dataMonth` June). The **collection** date is when TI
published it (the June close is collected in late July, e.g. 2026-07-25).
The rankings path computed `getProgramYearStartDate(collectionDate)`. For a
June close that resolved to the **next** PY (2026-07-01), so no charter or
suspension in the closing year was `>= programYearStart`. `newCharteredClubs`
came out 0 and Club Retention `(paid − newCharters) / base` went over 100%
(117.3% for 2026, 115.8% for 2025). This happened on every June-close
year-end built from a July collection. Nobody noticed for years, because
mid-year snapshots, where the two dates share a PY, were correct. PR #1625
scoped the PY window to the snapshot's logical date. After the rebuild, the
maximum retention on every year-end is 100.0%.

The same session turned up a sibling bug. When a 2025-26 snapshot was rebuilt,
"exclude the current year" was written as `programYear !== current`. That let
2026-27 rows, which already existed, leak into the past-year Leadership
Excellence streak and zero it out (#1609). PR #1635 changed the filter to
`programYear < current`.

## The transferable principle

**Which year a record belongs to depends on the period it describes, not on
when it was fetched or built.** At the July 1 boundary, the collection date
and the logical date land in different program years. Any PY window derived
from the collection date is off by one year for exactly the snapshots that
matter most: the year-end closes. Rebuilding a past period has the same
hazard. "Not the current year" is only the same as "earlier years" when no
later year exists yet. During a rebuild, a later year always exists.

## How to apply

- Take the PY window from the snapshot's logical date (`snapshotDate` /
  `dataMonth`) or from the PY resolved once per run (#1284). Read the source
  CSVs from the collection date. Keep `calculateProgramYear` calendar-pure.
- Test a June close **collected in July** for every metric that is scoped to
  a PY. A mid-year fixture can't tell the two dates apart.
- When a computation looks at "prior years" relative to the period being
  built, filter with `<` (or `<=`), never `!==`. Write the test as a rebuild
  with later-year rows already present.
- A ratio over 100% on a metric that should be bounded is a date-scoping
  symptom until proven otherwise.
