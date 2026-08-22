---
date: 2026-08-22
tier: lesson
summary: A TanStack Query that just became `enabled` reports idle, not fetching — gate deferred copy on "unresolved", not on isFetching
tags: [frontend, react-query, tanstack-query, loading-states, ui-copy]
---

# A query that just became `enabled` is idle, not fetching

**Date:** 2026-08-22
**PR:** #1441 (moved-club redirect)

## What happened

`ClubDetailPage` had to stop telling visitors a club "may have been removed"
before it had asked the club index where the club actually went. The lookup is a
`useQuery` with `enabled` flipped on only when the club is missing from this
district's snapshot — so the natural gate looked like:

```tsx
if (!club && isClubIndexFetching) return <Skeleton />
if (!club && movedTo) return <MovedMessage />
if (!club) return <MayHaveBeenRemoved />   // ← rendered for one frame
```

On the render where `enabled` flips from `false` to `true`, the query's status
is `pending` but its **`fetchStatus` is still `'idle'`** — the fetch is kicked
off from an effect, after that render commits. So `isFetching` is `false`, the
first two guards both fall through, and the user gets one frame of the exact
claim the whole change existed to prevent, immediately retracted.

## The fix

Gate on *unresolved* — the query has neither settled to data nor to an error —
rather than on the in-flight flag:

```tsx
const isClubIndexUnresolved = !!clubId && !clubIndex && !isClubIndexError
```

That covers idle-before-fetch, in-flight, and retries in one predicate, and it
falls through the moment the answer exists in either direction.

## Rule

When a deferred query decides *which claim to render* (not merely whether to
show a spinner over content that is already correct), derive the "don't speak
yet" gate from the absence of a settled result — `!data && !isError` — not from
`isFetching` / `isLoading`. `fetchStatus` lags `enabled` by one render, and a
gate that lags is a gate that flashes the wrong answer.

## Warning

The same one-frame gap exists for any `enabled`-gated query whose false branch
is a *statement about the world* — "not found", "no access", "no results",
"unsupported" — rather than an inert placeholder. The flash is invisible in
JSDOM tests that `await findBy…`, so tests will not catch it; only reading the
render order will.
