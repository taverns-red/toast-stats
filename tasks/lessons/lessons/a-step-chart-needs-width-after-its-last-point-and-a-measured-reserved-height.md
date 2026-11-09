---
date: 2026-11-09
tier: lesson
summary: A stepAfter chart gives its latest point no width, and a reserved height must be measured, not estimated
tags: [charts, recharts, cls, education]
---

# A step chart needs width after its last point, and a reserved height must be measured

**Date:** 2026-11-09
**PR:** #2592 (Education timeline chart, epic #2590)

## What happened

The Education timeline copied the Clubs `RaceChart`: a stacked `stepAfter` area
on a categorical date axis. A step holds its value AFTER its date, so the final
snapshot, the one that must equal the KPI tiles, had zero width. The chart's
visible top edge read 62 while the headline said 71, and the dates were evenly
spaced whatever the real gaps.

Separately, the first reserved height (640 px) was an estimate. Measured at
375 / 768 / 1024 / 1280, with and without the touch readout and in both
groupings, the loaded block ran 524-849 px: only the legend's wrapping changes.

## Takeaway

- Put a stepped series on a numeric time axis and add one display-only tail row
  that repeats the final values (keeping the final date, so a tooltip over it
  reads the real snapshot). Then the latest step has width and gaps look like gaps.
- Reserve a skeleton's height from a measurement per width, input type and mode,
  and pin it with a smoke that compares the block before and after it loads.
