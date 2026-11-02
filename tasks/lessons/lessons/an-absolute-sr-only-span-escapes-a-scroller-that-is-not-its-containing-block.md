---
date: 2026-11-01
tier: lesson
category: lesson
summary: An absolutely positioned sr-only span inside an overflow scroller is clipped only if the scroller (or something inside it) is its containing block; otherwise it sits at its static position past the scroller and widens the page
tags: [css, accessibility, tables, responsive, frontend]
---

# An absolute sr-only span escapes a scroller that is not its containing block

**Date:** 2026-11-01
**Issue:** #2432 (Clubs table "since last year" preset)

## What happened

The preset added a "vs last year" column that renders `ChangeIndicator`,
whose screen-reader word ("increase") is an absolutely positioned `sr-only`
span. The table lives in an `overflow-x: auto` scroller, and at 768px the
column sits past the scroller's right edge. The page grew from 768px to
841px wide. The scroller's own `scrollWidth` was fine; its wrapper's was
not. The wrapper was `position: relative` and the scroller was static, so the
wrapper was each span's containing block, and `overflow` clips only
descendants whose containing block is the scroller or inside it.

`no-horizontal-scroll.smoke.ts` caught it once the preset URL was added to
its routes (841 > 768 at 768px in both themes); unit tests could not.

## Takeaway

An `overflow: auto/hidden` box only clips absolutely positioned descendants
when it, or an element inside it, is their containing block. When a cell
inside a scroller holds an absolute element (`sr-only`, a badge, a
tooltip), give the cell or the scroller `position: relative`. To find the
cause, list elements past the viewport edge whose `position` is not
`static`. Filtering out everything inside a scroller hides exactly these.
The opt-in Changes delta columns use the same `ChangeIndicator`, so they are
worth the same check.
