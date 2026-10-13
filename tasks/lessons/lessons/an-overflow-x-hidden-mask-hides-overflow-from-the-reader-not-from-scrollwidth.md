---
date: 2026-10-13
tier: lesson
summary: A body overflow-x:hidden mask stops the reader from scrolling to overflow but scrollWidth still reports it — check what a mask hides before building a gate around it
tags: [tests, playwright, e2e, mobile, css, verification]
---

# An overflow-x:hidden mask hides overflow from the reader, not from scrollWidth

**Date:** 2026-10-13
**Issue:** #1841 (epic #1827)

## What happened

The mobile review said `body { overflow-x: hidden }` (index.css) "masks" the
overflow that `no-horizontal-scroll.smoke.ts` looks for, so the 375 gate was
specified to measure "with the mask disabled". A canary injected a 600px div
into `<main>` on `/district/61` at 375 and measured both ways, in Chromium and
WebKit: `documentElement.scrollWidth - clientWidth` was 225 with the mask on
and 225 with it off. Only `window.scrollTo(500, y)` differed: with the mask on,
`scrollX` stayed 0.

So the mask hides overflow from the reader (they cannot pan to it, and the
content past the edge is cut off), not from `scrollWidth`. The existing smoke
was never blind to it. The gate still switches the mask off, so the result
does not depend on how body overflow propagates to the viewport.

## The transferable lesson

Before you build a gate around "X masks the defect", measure what X actually
hides: run the same measure with X on and off against an injected defect. A
mask can hide a defect from the user while the metric still sees it, or the
other way round, and the gate's design depends on which.
