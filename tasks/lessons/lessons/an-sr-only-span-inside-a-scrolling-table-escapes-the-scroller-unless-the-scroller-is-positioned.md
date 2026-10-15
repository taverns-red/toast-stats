---
date: 2026-10-15
tier: lesson
category: lesson
summary: A `.sr-only` span (position absolute) inside an overflow-x scroller is laid out against the nearest POSITIONED ancestor, so when the scroller is not positioned it lands outside it and scrolls the whole page sideways; give the scroller `position: relative`, and gate it with a document-overflow check on the preview
tags: [css, accessibility, responsive, mobile, tables, overflow, verification]
---

# An sr-only span inside a scrolling table escapes the scroller unless the scroller is positioned

**Issue:** #1817 (charter cohort survival). PR #2059.

## What happened

The survival table sits in a `overflow-x: auto` region so a 12-column table
scrolls inside its own box at 375 px. Its cells carry screen-reader text
(`<span class="sr-only">not reached</span>`). On the preview the page still
scrolled sideways: `scrollWidth` 936 at 375, 168 px extra at 768. Every
ancestor up to `<body>` was 375 wide or narrower, and no element outside the
scroller reached past the viewport.

`.sr-only` is `position: absolute`. An absolutely positioned box is placed
against its nearest positioned ancestor, not its overflow ancestor. The
scroller was `position: static`, so the spans in the far-right cells were
positioned against something outside it, at their in-table x (up to ~900 px),
and they extended the document. The scroller's own clipping never applied to
them. Adding `position: relative` to the scroller (checked first by injecting
the rule on the preview: 936 → 375) fixed it.

## Takeaway

When a scroller holds absolutely positioned descendants, including `.sr-only`
text, make the scroller a containing block with `position: relative`.
A unit test cannot see this (jsdom has no layout), so assert
`documentElement.scrollWidth <= clientWidth` on the deployed preview at each
breakpoint.
