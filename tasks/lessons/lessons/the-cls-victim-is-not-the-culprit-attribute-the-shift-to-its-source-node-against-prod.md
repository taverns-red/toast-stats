---
date: 2026-09-01
tier: lesson
summary: A new section can carry a big CLS number without causing any of it — attribute each layout-shift entry to its source node and measure the same page on prod before touching your own code
tags: [cls, performance, frontend, verification, playwright, skeleton]
---

# The CLS victim is not the culprit — attribute the shift to its source node, and measure prod for the same page

**Date:** 2026-09-01
**Issue:** #1500 (epic #1496 Sprint 4 — the worldwide scoreboard on `/history`)

## What happened

The new `/history` worldwide scoreboard was built to the tripwire: a
height-matched skeleton while its query resolves, a fixed-height placeholder
when the artifact 404s, never `null`-until-data. The preview drive still
measured page CLS at 1280 of **0.210** against prod's **0.085**, and the
`layout-shift` entry named `section.wws` — the new section — as the shifting
node. Every instinct said the new component was the regression.

Two measurements falsified that in about five minutes:

1. **Drive the same viewport with and without the section's data.** The
   un-injected run (artifact 404 → placeholder only, no table at all) measured
   the *identical* 0.210. A section that shifts by the same amount whether it
   renders 620px of placeholder or 1500px of table is not the thing growing.
2. **Read `entry.sources[].previousRect` / `currentRect`, not just the node.**
   `section.wws` moved *from* y=584 — it was pushed down. Something above it
   grew.

The culprit was one component upstream: `ProgramYearSummaryCards` rendered a
hardcoded `SKELETON_COUNT = 3` while the loaded grid now renders **ten** cards
(the epic's own 2016-17 → 2020-21 backfill had landed that morning). The grid
went from one skeleton row to three real rows — about 800px — on every load.

That shift had been there for months. On prod it moved a 54px methodology
callout and a footer, so its impact fraction was small and it scored 0.076. Add
a tall section below it and the *same* shift suddenly moves a screenful,
scoring 0.21. The new section changed the price of an old bug, not the bug.

## The transferable principle

**The node named in a `layout-shift` entry is usually the element that got
moved, not the element that grew. Attribute the shift before you fix it: read
`previousRect`/`currentRect` to see which direction it travelled, drive the
page with your feature's data absent to see whether the number survives, and
measure the same route on prod for a baseline.** A CLS number that is identical
with and without your feature's data is not yours; a number that appears only
once your feature renders is.

Corollary for reservations: **a skeleton's count is a claim about the loaded
list's size, and it goes stale the day the data grows.** `SKELETON_COUNT = 3`
was honest when the archive held three years. Reserve one skeleton per item you
will actually render — pass the expected count from the page (R3) rather than
freezing it as a module constant — or the reservation quietly becomes an
under-reservation that only bites when something tall lands beneath it.

## How to apply

- In a Playwright CLS probe, collect `e.sources.map(s => ({node, previousRect,
  currentRect}))`, not just the total. The rect pair is the whole diagnosis.
- Always run the A/B: same URL, same viewport, once with the feature's data
  fulfilled by `page.route` and once without.
- Always run prod as a third arm. "0.21 is bad" is not actionable; "0.085 on
  prod, 0.210 here, and the delta survives with my data absent" is.
- When you inherit a fixed skeleton count, check it against today's loaded
  count before assuming it still reserves the right height.
