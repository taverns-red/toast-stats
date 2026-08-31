---
date: 2026-08-31
tier: lesson
summary: A write dated in the past must take its entity set from that date's own source — a successful fetch is not evidence the entity existed then
tags: [data-pipeline, collector-cli, program-year, silent-failure, snapshots]
---

# A dated write must take its entity set from that date, not from now

**Date:** 2026-08-31
**PR:** #1480 (#1465; read-side guard #1466)

## What happened

`snapshots/2026-06-30/` held 158 district files — the 128 districts that
existed at the 2025-26 close, plus the 30 renumbered PY 2026-27 districts
(201–231). A rewrite on 2026-07-31 was handed the **then-current** discovery
set and pointed at a closed date. 4,673 clubs ended up filed under two
districts on one date; a naive rollup over the directory inflates clubs
+31.1%, membership +32.5%, payments +5.0%.

Nothing failed. Districts 201–231 did not exist on 2026-06-30, but the
Toastmasters per-district export endpoint **ignores the program-year token**
(#1342), so every one of those fetches returned HTTP 200 with current-year
data. A successful fetch looked exactly like proof that the district existed
on that date, and it was not.

## The takeaway

When a write is *dated* — a backfill, a rescrape, a month-end regeneration —
the set of entities it may write is a property of **that date**, and must be
read from a source that is itself scoped to the date. "The set we discovered
this morning" is a different question with the same shape, and it type-checks.

Two corollaries worth carrying:

- **Where an upstream endpoint ignores the date/year parameter, response
  success carries no date evidence at all.** Validate the body against the
  date you asked for, or scope the request set before you make the requests.
- **The authoritative set is usually already in hand.** Here the program-year
  resolver (#1284) had already downloaded and validated that date's
  districtsummary CSV; the fix reads its DISTRICT column. No extra fetch, no
  second program-year computation, and `calculateProgramYear` stays
  calendar-pure.

And the read side must not depend on the write side being fixed: a rollup that
becomes correct only after an archive is rewritten is one restatement away
from being wrong again (#1466 keys on the canonical club id and scopes to the
date's own rankings file, pinned by a fixture frozen from the defective
directory).
