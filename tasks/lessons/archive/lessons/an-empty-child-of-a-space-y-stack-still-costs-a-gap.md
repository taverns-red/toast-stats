---
date: 2026-11-01
tier: lesson
category: lesson
summary: An empty element in a Tailwind space-y stack still adds a full gap; an IntersectionObserver marker that renders on every page must be out of flow
tags: [frontend, css, layout, mobile, page-budget, lazy-loading]
---

# An empty child of a `space-y` stack still costs a gap

**Date:** 2026-11-01
**Issue:** #2427 (predecessor history panel on new districts)

## What happened

The panel gates itself lazily: until its slot nears the viewport it renders
a zero-height `<div>` for `useNearViewport` to observe, on every district's
Overview. That marker sat inside the Overview's `space-y-4 sm:space-y-6`
stack. Measured on D61 at 375: with the marker in flow the page was 3,964px,
without it 3,947px. The "invisible" element cost 17px (one 16px gap plus its
1px) on every district page, and the 375 Overview has about 12px of headroom
under its 4,000px budget (PAGE_MAX_H).

## The transferable principle

`space-y-*` puts its margin between every pair of children, and an empty
element is still a child. Zero height is not zero cost. Any always-present
marker, sentinel or placeholder inside a spaced stack (`space-y`, `gap` in a
flex/grid column) adds a full gap. Take it out of the flow
(`position: absolute`, a 1px box still intersects for IntersectionObserver)
or put it outside the stack.

## How to apply

When a component returns "nothing" as an element rather than `null` (for a
ref, an observer or a reserved slot), check its parent's spacing utility and
measure the page with the element in flow and removed. A unit test can pin
the out-of-flow rule (see `PredecessorHistoryPanel.test.tsx`).
