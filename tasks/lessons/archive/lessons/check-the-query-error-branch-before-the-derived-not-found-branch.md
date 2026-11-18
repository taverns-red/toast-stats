---
date: 2026-06-13
tier: lesson
summary: When a page derives "not found" from query data, check the error branch FIRST or every fetch failure is misreported as a missing entity
tags: [frontend, react, tanstack, error-handling, verification]
legacy_id: "166"
---

# Lesson 166 — When a page derives "not found" from query data, check the error branch FIRST or every fetch failure is misreported as a missing entity

**Date:** 2026-06-13
**Issue:** #1104 (epic #1191 Sprint 2 — frontend defects)
**PR:** #1201

## What happened

Three district subpages (`ClubDetailPage`, `DistrictAnalyticsPage`,
`DistrictClubsPage`) destructured only `{ data, isLoading }` from
`useDistrictAnalytics` (a raw `useQuery`), discarding `isError`/`error`/
`refetch`. They then derived presence from the data:

```ts
const club = analytics?.allClubs.find(c => c.clubId === clubId) ?? null
// …
if (!club) return <EmptyState title="Club Not Found" message="…may have been removed" />
```

On a transient CDN reject, `analytics` is `undefined` → `club` is `null` →
the page rendered a confident **"Club Not Found … may have been removed"** — a
false data claim about a network blip, with no retry. The sibling pages
silently rendered an empty table / blank section. The hub (`DistrictDetailPage`)
did it right, capturing `error` + `refetch` and rendering `<ErrorDisplay
onRetry={refetch} />`.

## The transferable principle

**A "not found" / "empty" state derived from query data is indistinguishable
from a fetch error at the data layer — on error the derived entity is `null`
and the derived list is `[]`, exactly as if the entity genuinely didn't exist.
So the `isError` branch must be checked BEFORE the derived not-found/empty
branch.** If the not-found branch comes first (or the error state is never read
at all), every network failure is laundered into a confident, wrong "this was
removed" claim. Order the terminal states `isLoading → isError → notFound/empty
→ loaded`, and wire the error state's retry to the query's `refetch`.

This is the component-level sibling of [[148-a-render-thrown-response-is-not-wrapped-by-isrouteerrorresponse]]'s
"gate not-found on data _loaded_, not emptiness": there the gate was for a
route-throwing 404; here it is for an in-page query whose error and emptiness
collapse to the same derived value.

## How to apply

- Destructuring a `useQuery` for a page that derives presence from `data`? Take
  `isError`, `error`, **and** `refetch`, not just `{ data, isLoading }`. The
  hub component in the same area is usually the reference pattern — copy it.
- Put the `isError` return/branch physically before the `!entity` branch.
  A trailing error check after a not-found early-return is dead code (on error
  the entity is null, so not-found already returned).
- Reuse the shared error component (`ErrorDisplay` here) with `onRetry={() =>
refetch()}`; don't hand-roll a one-off.
- Give the error branch the **same outer wrapper geometry** as the loading /
  not-found states so it adds no layout shift ([[125-a-cls-fix-for-the-loading-state-must-cover-the-error-and-empty-states-too]]).
- Verify by **driving the real error path**: intercept the data fetch
  (Playwright `route.fulfill({ status: 503 })`) on the live preview and assert
  the retry affordance renders and the not-found copy is absent — in both
  engines.

## Related

- [[148-a-render-thrown-response-is-not-wrapped-by-isrouteerrorresponse]] — the
  route-level form of "don't infer not-found from emptiness."
- [[125-a-cls-fix-for-the-loading-state-must-cover-the-error-and-empty-states-too]]
  — keep the error state's geometry aligned with loading/not-found.
- [[146-a-root-errorelement-renders-outside-the-app-context-providers]] — the
  branded root boundary handles uncaught throws; this lesson is about the
  handled, in-page query-error state that should never reach that boundary.
- `frontend/src/pages/{ClubDetailPage,DistrictAnalyticsPage,DistrictClubsPage}.tsx`,
  `frontend/src/components/ErrorDisplay.tsx`.
