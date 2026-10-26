---
date: 2026-10-26
tier: lesson
category: lesson
summary: A position-fixed bar whose items run past the viewport adds no document scroll, so no-horizontal-scroll gates pass while the off-screen items are unreachable; assert each item's box is inside the viewport instead
tags: [mobile, layout, testing, navigation, frontend]
---

# A fixed bar that overflows adds no page scroll

**Date:** 2026-10-26
**Issue:** #2318 (region bottom bar cut off on an iPhone)

## What happened

The phone bottom bar (`SectionBar`) is a fixed, non-scrolling flex row
built for four sections plus More. The region subnav handed it six
primaries. At 390px the last items sat at x = 392–588, off the right edge,
and could not be tapped. `no-horizontal-scroll` and the 375 gate stayed
green: a `position: fixed` element that overflows the viewport does not
widen `documentElement.scrollWidth`, so the page has nothing to scroll.

## Takeaway

For fixed or sticky chrome, "no horizontal scroll" proves nothing about
reach. Measure each interactive item's bounding box against the viewport
(the section-bar smoke now does this for every bar, region included). When
a primitive has a capacity contract (4 + More), a new caller is the place
it breaks, so add the caller to the primitive's shared smoke, not a new
one-off test.
