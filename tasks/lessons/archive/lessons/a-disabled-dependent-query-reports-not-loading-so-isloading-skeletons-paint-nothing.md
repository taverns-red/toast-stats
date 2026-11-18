---
date: 2026-10-12
tier: lesson
category: lesson
summary: A dependent TanStack query that is disabled while its key is unresolved reports isLoading false, so an `isLoading && <Skeleton/>` arm paints nothing for that whole window; gate the skeleton on the full dependency chain
tags: [cls, react-query, skeleton, frontend, performance, playwright, verification]
---

# A disabled dependent query reports "not loading", so `isLoading && <Skeleton/>` paints nothing

**Issue:** #1837 (district subpages CLS: divisions 0.20, analytics 0.24–0.30, action-list 0.23)

## What happened

Every `/district/:id/<subpage>` keys its data queries on a date resolved from
the per-district snapshot index and passes `null` (query disabled) until that
index lands. In TanStack Query v5 a disabled query is `isPending: true` but
`isLoading: false` (`isLoading = isPending && isFetching`). Every page wrote
its loading arm as `isLoading && <LoadingSkeleton/>`, so for the whole
date-index window (several seconds on a throttled mobile load) the data slot
rendered nothing. Static content below the slot (the DDP criteria), a sibling
fed by a faster query (the education card), or empty-data sections (the action
list) painted at the top — and the real content then landed above them.

The skeletons existed and were never on screen. Reading the code, every page
looked correctly guarded.

The first CLS smoke written for the fix also passed against the broken prod
build: it waited for `load` and then for "no loading placeholder in the DOM".
On prod that condition was true immediately — the bug is exactly that no
placeholder renders — so it sampled CLS before the data reads even started.

## Takeaway

A skeleton gated on `isLoading` of a query whose `enabled`/key depends on
another query is blind to the upstream window. Gate it on the whole chain:
pending = no data, no error, and (dependency resolved OR dependency still in
flight) — see `utils/districtSlotPending.ts`. End it on an error or on a
dependency that settled with nothing usable, so it is never permanent.

When a CLS/geometry check waits for "placeholders gone", also wait for the
data reads to finish (`networkidle`), or the absence of a placeholder that
never rendered reads as "loaded".
