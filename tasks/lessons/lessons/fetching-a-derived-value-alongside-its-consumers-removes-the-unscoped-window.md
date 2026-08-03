---
date: 2026-08-03
tier: lesson
summary: The unscoped-first window is a property of SPLITTING a fetch across two query boundaries, not of the data — when a derived value and its consumers can resolve in one promise, the race stops existing instead of needing a guard
tags:
  [
    frontend,
    hooks,
    react-query,
    caching,
    loading-states,
    search,
    program-year,
  ]
---

# Fetching a derived value alongside its consumers removes the unscoped window

**Date:** 2026-08-03
**Issue:** #1403 (omni-search could not find a district that no longer exists)
**Related:** #1398/#1401 (the same 388 KB file, one day earlier), #1396, R3

## What happened

Three issues in two days all came down to one artifact:
`config/district-snapshot-index.json`, 388 KB, the map of which districts have
snapshots on which dates. #1396 and #1398 each needed a **date** derived from
it in order to scope a query, and both paid for it: the date arrives from a
fetch, so the first render has no date, the query runs its `date ?? 'latest'`
branch — the unscoped one, the exact query that caused the bug — and the wrong
answer wins the race routinely, because the roster that produces it is 4.4×
smaller than the file that says which roster to ask for. #1401 fixed that with
a **gate**: the consumer waits on the scoping value's own arrival, not merely
on its result being non-undefined.

#1403 consumed the *same* file, in the same app, on the search path. I went
looking for where to put the gate, and there wasn't one to put.

## The non-obvious part

`loadSearchIndex()` is not a query keyed on a derived value. It is one async
function that fans out to its sources in a single `Promise.all` and returns one
built index. Adding the snapshot index as a fourth source meant it resolved
**with** the rankings rather than **before** them — so the "current roster
only" intermediate state that caused #1398 never becomes observable. Not
because it was guarded. Because it was never published.

That reframes the earlier lesson. The unscoped-first window is not a property
of "a value that arrives asynchronously." It is a property of **splitting one
logical read across two query boundaries** — the first boundary is forced to
answer before the second has landed, and whatever it answers is a real state
the UI will render. Keep the read on one side of one boundary and there is no
first answer to be wrong.

The corollary matters as much: **you don't get to skip the decision.** Atomic
resolution is a choice with a cost — the whole index now waits on the slowest
of four fetches, and this one is 388 KB. It is right *here* because search is a
typeahead, where results reordering under a moving cursor is worse than a
"Searching…" state, and because a user who typed `27`, saw "No matches", and
gave up would never see a late correction. On a page where a partial answer is
genuinely useful, the split plus a gate is the better trade. What is never
acceptable is arriving at either behaviour by accident and calling it fine.

## How to apply

- When a value must be threaded into a query key, first ask whether the
  consumer could just fetch it **itself, in the same promise**. If yes, the
  race stops existing rather than needing a guard, a gate, or a test that pins
  the guard.
- If it can't — different lifetimes, different cache policies, an expensive
  source that only some consumers need — then you own the intermediate state.
  Say in the PR what renders during it and why that is the right thing to
  render. "Nothing, deliberately" is a valid answer; "I didn't think about it"
  is the #1398 bug.
- Weigh it against the user-visible failure mode, not against latency in the
  abstract. A typeahead that answers wrong and corrects itself has already lost
  the user; a page that fills in progressively has not.
- Adding a source to a shared loader breaks every harness that `vi.mock`s the
  module with an explicit factory — the new export is simply absent and the
  loader calls `undefined()`. Three harnesses here fell back to "Searching…"
  with no error. Same shape as #1401's `setQueryData(['districts'], …)`
  near-miss: grep the module path across `__tests__/`, not just `src/`.

## Related

- [[a-query-scoped-by-an-async-value-runs-unscoped-first]] — #1398, the same
  file and the same window; that lesson covers guarding it, this one covers
  not creating it.
- [[a-deliberately-shared-query-key-is-a-coupling-with-no-compiler]] — #1396,
  the third instance of the same artifact causing trouble at a cache boundary.
