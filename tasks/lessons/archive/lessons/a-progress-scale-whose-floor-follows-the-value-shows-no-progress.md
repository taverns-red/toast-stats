---
date: 2026-10-28
tier: lesson
summary: A progress scale whose floor follows the value can never show progress
tags: [charts, frontend]
---

# A progress scale whose floor follows the value can never show progress

**Date:** 2026-10-28
**Issues:** #2387 (found while building #2297)

## What happened

To stop the tier labels colliding, #558 (Lesson 65) zoomed the KPI bullet bar into the tier band with `minScale = min(current, 0.9 × Distinguished)`. For any district below 0.9 × D, the left edge of the scale was `current` itself. The marker therefore sat at 0% with an empty fill, every time. D61's 139 of 171 paid clubs (about 80% of the way) looked like no progress at all. This shipped for five months because the tests asserted the pin ("pins marker at 0% when current is far below the tier band") as intended behaviour.

#1517 then moved the labels into a flow legend. That removed the zoom's only reason, but nobody removed the zoom.

## Takeaway

- If a bar's job is to show progress toward a goal, keep the value out of the scale's domain floor. Otherwise "how far along" is erased exactly when the answer matters.
- A test that pins an edge case at 0% or 100% is worth a second look: ask whether that edge is the feature, or the feature failing.
- When a later change removes a workaround's cause (here, the colliding labels), revisit the workaround as well.

Lesson 65 (`when-tier-thresholds-cluster-zoom-the-scale-into-the-band.md`) is superseded for the KPI bullet bar.
