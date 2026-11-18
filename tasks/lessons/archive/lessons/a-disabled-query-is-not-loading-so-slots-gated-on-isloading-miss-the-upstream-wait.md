---
date: 2026-10-06
tier: lesson
summary: A dependent (disabled-until-ready) query reports isLoading=false, so slots gated on it are not reserved while its upstream query is still pending
tags: [cls, react-query, skeleton, frontend, performance]
---

# A disabled query is not "loading", so slots gated on its isLoading miss the upstream wait

**Issue:** #1647 (`/district/:id` CLS 0.25–0.69)

## What happened

The district overview's analytics queries are enabled only once the date index
resolves (`hasValidDates ? districtId : null`). In TanStack Query v5 a disabled
query has `isLoading === false`. So during the date-index wait the page read as
"not loading, no data". The KPI strip and the Overview stack were gated on
`hasOverviewData`, the Overview panel on `hasValidDates`, and the header's
freshness pill on the date itself. None of these slots existed on the first
paint, and each one inserted from 0px when the dates landed.

The per-component skeletons were not the main problem. A 64px KPI bar swapping
for a 312px/750px strip mattered too, but the largest shifts came from slots
that were never reserved, because the "loading" signal was false.

## The transferable point

When a query depends on another query, its `isLoading` covers only its own
fetch. The "is this slot pending?" signal is the OR of the chain:
`(own isLoading) || (upstream isLoading)`. Gate the skeleton on that, not on
the leaf query.

## How to apply

- For every late block, trace which query enables it. If that query has an
  `enabled`/null-key gate, add the upstream query's `isLoading` to the
  pending condition.
- Measure with a buffered `layout-shift` observer and print
  `sources[].node` with before/after rects, plus a rAF snapshot of the slot
  heights. The snapshot shows which slot appeared, not just what moved.
- A cheap way to make a structural skeleton exact is to render the loaded
  component itself, with representative values, `invisible` + `inert` +
  `aria-hidden`, under a shimmer. Its height then comes from the same CSS.
  (KPI strip, Overview composition grid.)

## Related

- [[a-deferred-async-insert-cls-source-reactivates-when-its-data-lands]] (107)
- [[reserve-a-data-dependent-slot-with-a-structural-skeleton-not-a-measured-height]] (158)
