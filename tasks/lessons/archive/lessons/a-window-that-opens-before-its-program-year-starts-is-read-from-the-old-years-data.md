---
date: 2026-10-25
tier: lesson
category: lesson
summary: A TI window that opens before its program year (officer-training Round 1 opens Jun 1, the PY on Jul 1) is open while every snapshot still carries the old year's numbers, so "open on this date" must also check that the snapshot belongs to the round's program year
tags: [program-year, dcp, officer-training, frontend, data-pipeline]
---

# A window that opens before its program year is read from the old year's data

**Date:** 2026-10-25
**Issue:** #2296

## What happened

DCP goal 9 counts officers trained in Round 1 (Jun 1 – Aug 31) and Round 2
(Nov 1 – end of Feb). Round 1 belongs to the program year that starts on
July 1, yet it opens on June 1. TI's rollover lags into late July (#1284), so
for about eight weeks every daily snapshot carries the previous program
year's `Off. Trained Round 1`, which is last summer's final count.

A plain "is a round open on this date?" check says yes on June 15. The Action
List would then have listed most clubs as short of training for the new round,
reading figures from a year earlier. The D61 2026-08-01 capture shows the same
thing from the other side: after the rollover, every club reads 0 in both
rounds until TI posts the new counts.

## The takeaway

When a rule's window is anchored to one program year but opens before that
year's data exists, "open" takes two conditions: the date is inside the window,
and the snapshot's own program year is the window's. Pass the page's program
year in (R3) and treat a window from the next program year as pending, never
as open. `trainingRoundContext` (frontend) returns `pendingOpen` for exactly
this case, and the boundary tests pin June.
