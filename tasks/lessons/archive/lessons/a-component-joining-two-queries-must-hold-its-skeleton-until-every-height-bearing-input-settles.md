---
date: 2026-10-06
tier: lesson
summary: A component built from two independent queries must stay in its skeleton until every input that changes its height has settled; rendering on the first one paints a partial state whose height differs, and the race only loses on slow runners
tags: [cls, react-query, skeleton, flaky-test, frontend, performance]
---

# A component joining two queries must hold its skeleton until every height-bearing input settles

**Issue:** #1685 (district-overview CLS smoke flaky at 1350px)

## What happened

The district KPI strip's data joins the analytics file and the
performance-targets file. It rendered as soon as analytics landed, with
`targets: null` and null rankings standing in for the second read. Those
fallbacks drop each card's rank line and bullet bar, so the strip was 88px
shorter at 1350px until the targets landed and it grew back. That meant two
shifts of the Overview stack, about 0.06 CLS. On a fast local load both reads
resolved in the same frame and the smoke passed 20/20. In CI, and in the
Playwright Docker image with 4x CPU throttling, the order sometimes flipped:
3 of 30 runs breached 0.1, all with the same sources as CI.

## Takeaway

When a skeleton gates on `!data`, check which query `data` actually comes
from. If a second query changes the loaded height, include its pending state
in the gate (`if (isLoadingB) return null`). Let a settled-empty read fall
through to its fallback, so a missing file never pins the skeleton.

To make a network race deterministic in an e2e test, hold the losing response
with `page.route(...)` plus a delay. Reruns stay green by luck; a pinned order
is red every time.
