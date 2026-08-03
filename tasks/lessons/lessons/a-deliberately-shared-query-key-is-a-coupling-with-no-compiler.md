---
date: 2026-08-03
tier: lesson
summary: Two hooks sharing a React Query key to avoid a duplicate fetch are coupled with nothing but a comment — narrowing one hook's key silently re-scopes or breaks the other, so decide explicitly and pay the fetch
tags: [frontend, hooks, react-query, caching, program-year, coupling]
---

# A deliberately shared query key is a coupling with no compiler

**Date:** 2026-08-03
**Issue:** #1396 (Payment Composition showed the current year on a past year)
**Related:** #1321 (the sharing), #1310, R3

## What happened

`useDistrictRanking` fetched `v1/rankings.json` under a fixed
`['district-rankings', 'latest']` key with no date, so a district page showing a
**past** program year rendered the **current** year's payment breakdown. The fix
is obvious: take the date the parent already has, and put it in the query key so
React Query cannot serve year B out of year A's entry.

The non-obvious part was that a second hook — `useLatestAsOfDate` — deliberately
uses **that exact key and queryFn**, so the two don't both pull the same ~126KB
file on pages that read both. Nothing enforces that; it is a comment:

```ts
// Shares `useDistrictRanking`'s key/queryFn/staleTime so the two don't fetch
// the same 126KB rankings.json under competing keys (#1321).
```

So the "obvious" fix had a trap on either side of it:

- Re-key the hook unconditionally → `useLatestAsOfDate` keeps its own key and
  the sharing quietly dies (a doubled fetch, no test fails), **or**, if you
  "helpfully" re-key both, `useLatestAsOfDate` starts returning a *historical*
  as-of date to a pill whose entire job is to report the **latest** one.
- Leave the key alone and only change the fetcher → every year is a cache hit on
  the first one. The numbers never change, and the fix *looks* applied.

## The transferable lesson

**A shared cache key is a coupling that no type, test, or compiler protects.**
The only record of it is prose, and prose does not fail CI. When you narrow one
consumer's key, the other consumer's behaviour changes silently — in whichever
direction you weren't thinking about.

Treat "who else keys on this?" as a required step of any cache-key change, and
resolve it **explicitly** rather than by whichever edit is smaller. Here: keep
the old key on the undated path (so the sharing survives untouched for the hook
that genuinely wants "latest"), and let the dated path key on its date and pay
for a second fetch. An extra request is a fair price for a page that shows the
year it claims to show; a silently de-scoped freshness pill is not.

## How to apply

- Before editing a `queryKey`, grep the key's literal across the app. A key that
  appears in two files is an undeclared contract.
- Make the divergence conditional on the new parameter (`date ?? 'latest'`) so
  the pre-existing path is byte-for-byte unchanged and the old sharing holds.
- Pin the sharing with a test that asserts the cache entry exists under the
  shared key — `client.getQueryData(['district-rankings', 'latest'])` — so the
  next refactor breaks a test instead of a network budget.
- Prove the *other* half too: render year A, then year B on the **same**
  `QueryClient`, and assert the values change. A single-year test passes
  identically with and without the date in the key.
- Name the cost in the PR. "This adds one fetch to the district page, and here
  is the follow-up that removes it" is a decision; silence is a regression
  waiting to be discovered by someone else.

## Related

- R3 (`tasks/rules.md`) — the parent owned the date and the child re-derived
  "latest" from nothing. The cache key is where R3 violations hide.
- [[key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate]]
  — the sibling trap about *which* date belongs in the key.
- [[assert-the-echo-field-that-is-invariant-not-the-one-that-looks-semantic]] —
  the guard used here (`snapshotDate === requestedDate`) works because
  `fetchCdnRankingsForDate` echoes its argument on a real hit and leaves it
  unset on the silent latest-fallback.
