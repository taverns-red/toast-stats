---
date: 2026-09-01
tier: principle
summary: To tell "no data" from "a real zero", measure presence on a wider population than the count you are guarding — a signal scoped to the same filter as the count can never distinguish the two
tags:
  [
    data-pipeline,
    analytics,
    absent-is-not-zero,
    global-rollup,
    guards,
    contracts,
  ]
---

# Principle — the presence signal must be wider than the count it guards

**Date:** 2026-09-01
**Issue:** #1514 (defect out of epic #1496 Sprint 3)

## What happened

`v1/global-history.json` published `suspendedClubs: 0` for eight of its ten
program years while `newClubsStillActive` stayed healthy in all ten. Zero clubs
suspended worldwide in eight separate years is not a credible reading, but the
number was contract-valid and the frontend rendered it faithfully.

The census settled it: those eight year-ends carry **no `Susp` value on any
`districtPerformance` row of any in-scope district** — 0 of 15,261 rows at
2025-06-30, 0 of 16,203 at 2023-06-30 — while the `Charter` branch of the very
same `Charter Date/Suspend Date` column is populated on all ten. The parse
(#1497) was correct. The datum was missing, and `rollUpGlobal` summed nothing
into a variable initialised to `0`.

## The trap, and the shape of the fix

The obvious guard is "publish `null` when the count is 0". That is wrong in the
other direction: it collapses a genuine zero into "unknown" and makes every
quiet year unpublishable. The count and the guard would share a filter, so
neither can see past it.

The fix is a **second measurement on a deliberately wider population than the
count**. `suspendedClubs` counts suspensions inside the program-year window;
the guard counts clubs carrying a parseable `Susp` date on **any** date,
window or not. Presence of the datum outside the window still proves the column
was collected — so:

| in-scope rows carrying a `Susp` date | in-window count | published        |
| ------------------------------------ | --------------- | ---------------- |
| none anywhere                        | 0               | `null` (unknown) |
| some, all outside the window         | 0               | `0` (measured)   |
| some, inside the window              | n               | `n`              |

This is not hypothetical: 2022-06-30 carries four `Susp` rows stamped July 2022
— after its own snapshot date, the later-rewrite shape of #1465. They prove
collection without being counted, which is exactly the row the wider signal
exists to see.

Same shape as #1501's `isUncollectedCharterCount`, which needed a
population-level all-zero over a census-sized file rather than a per-district
zero. Different data, same rule: **the discriminator lives one scope out from
the thing it discriminates.**

## Takeaway

When a pipeline field is `number | null` with `null` meaning "unknown", the
guard that chooses between `0` and `null` must be measured on a strictly wider
slice than the count itself — a different date window, a wider entity set, a
looser predicate. A guard scoped identically to the count is structurally
incapable of telling absence from zero, and will either publish phantom zeros
or null out every quiet year. Prove it both ways by mutation: remove the guard
(the absent years must go back to `0`) and over-fire it (the measured zeros
must break).
