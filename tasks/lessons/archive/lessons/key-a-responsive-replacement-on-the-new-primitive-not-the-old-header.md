---
date: 2026-10-11
tier: lesson
summary: When a mobile primitive replaces a shared header, key its hide/collapse CSS on the primitive (`.context-bar ~ …`), not on the header — sibling pages that bypass the header are otherwise skipped
tags: [frontend, css, mobile, responsive, verification, playwright]
---

# Key a responsive replacement on the new primitive, not on the old header

**Date:** 2026-10-11
**Issue:** #1831 (mobile epic #1827): phone context bar
**PR:** #1860

## What happened

The phone context bar was mounted inside `DistrictDetailHeader`, which "every
district route" uses. The first CSS hid the old breadcrumb with
`.district-detail-page-header ~ .subpage-breadcrumb`. Unit tests were green.
The preview smoke ran all nine district routes and found that one,
`/district/61/changes`, still started its content at y=245. `DistrictChangesPage`
renders its own H1 and breadcrumb and never mounts `DistrictDetailHeader`. So
it had no bar, and the hide rule (keyed on that header) skipped it.

## The lesson

"All routes use the shared header" is a claim you should check per route,
not assume. And a rule that removes old chrome should hang off the thing
that replaces it:

- `.context-bar ~ .subpage-breadcrumb` and `.context-bar ~ h1` hide old chrome
  only where the bar is actually present. A page that adopts the bar later
  gets the collapse for free, and a page without it keeps its chrome. That
  is the safe failure: you never end up with a page that has neither.
- Keying on the old header does the opposite. It hides chrome only where the
  old header exists, so a page that skips the header falls outside both the
  new primitive and the collapse.

## How to apply

- Before saying a primitive "ships on every X route", grep each route's page
  for the shared component, or let the smoke iterate the route list from
  config (`DISTRICT_SECTIONS`), not from memory.
- Write the collapse CSS as sibling/descendant selectors of the new
  primitive.
- A smoke that measures geometry per route (bounding box, Lesson 134)
  catches this kind of miss. jsdom cannot.
