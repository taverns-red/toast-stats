---
date: 2026-10-11
tier: lesson
summary: Playwright's isMobile emulation widens the layout viewport to fit the content, so scrollWidth − innerWidth reads 0 on a page that overflows; measure overflow in a plain setViewportSize viewport, and give nowrap row lists inline-size containment so they cannot widen a min-content-sized ancestor
tags: [mobile, responsive, playwright, verification, css, overflow, frontend]
---

# Lesson — `isMobile` emulation hides horizontal overflow; measure it in a plain viewport

**Date:** 2026-10-11
**Issues:** #1833 (MobileRowList), PR #1871

## What happened

I measured the compact-row adoptions on PR previews with a Playwright script.
Its context used `isMobile: true, hasTouch: true` at 375×812. Every route
reported `documentElement.scrollWidth − innerWidth = 0`.

The repo's `e2e/context-bar.smoke.ts` failed the same preview anyway: the
Action List overflowed by **120–193 px**. The smoke sizes its pages with
`page.setViewportSize`, without `isMobile`.

With `isMobile`, Chromium emulates a mobile meta-viewport. The layout viewport
grows to the content's width, so `innerWidth` grows with it, and the
difference stays 0. A real phone would zoom out or scroll sideways. Rerun with
a plain viewport, the same script showed the overflow straight away. The widest
element was `.action-list-section` at 471 px.

The cause was the row list itself. The title and meta lines use
`white-space: nowrap` with an ellipsis. That sets the list's **min-content**
width to the longest line, and the section was sized by min-content, so it grew
to fit instead of letting the ellipsis engage. `min-width: 0` on the flex items
does not help: it changes their automatic minimum, not their min-content
contribution.

## How to apply

- **Measuring overflow:** use `setViewportSize` (or a context without
  `isMobile`). Do the same for any "fits at 375" check. Keep `isMobile` only for
  touch or user-agent behaviour, and never trust it for a width assertion.
- **A nowrap/ellipsis list inside an unknown container:** give the list root
  `contain: inline-size; width: 100%`. Its intrinsic width then ignores its
  content, so ancestors size from the viewport and the ellipsis does its job.
  Pin this in a CSS contract test.
- When a repo smoke disagrees with your own measurement, find out which
  measurement is right before you move on. Here the smoke was right.

## Related

- [Lesson 134](a-status-chip-in-an-overflowing-table-is-still-clipped-detable-the-row.md):
  verify "fits" by bounding box, in a real engine.
