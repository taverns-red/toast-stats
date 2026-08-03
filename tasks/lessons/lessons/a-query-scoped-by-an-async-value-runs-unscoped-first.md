---
date: 2026-08-03
tier: lesson
summary: A query keyed on a value that itself arrives asynchronously runs UNSCOPED on first render, so any gate reading its result must wait for the scoping value — not just for the result
tags: [frontend, hooks, react-query, caching, program-year, loading-states]
---

# A query scoped by an async value runs unscoped first

**Date:** 2026-08-03
**Issue:** #1398 (past-year districts fell through to the Global-Rankings page)
**Related:** #1396 (the sibling fix), R3

## What happened

`useDistricts` built the browsable district list from the undated
`fetchCdnRankings()` — the current program year only. Districts get realigned
between years (132 in the 2025-06-30 snapshot, 94 today), and
`DistrictDetailPage` uses that list as an **existence gate**, so every district
realigned away since was judged not to exist on *any* year's URL and its
visitors landed on the limited Global-Rankings page.

The fix is #1396's, one hook over: take the date the page already owns, put it
in the query key. Done — except the page then flickered.

## The non-obvious part

The date being threaded in, `effectiveEndDate`, is itself derived from a
**fetch** (the per-district snapshot-date index). So the first render has no
date, and the hook runs its `date ?? 'latest'` branch — the *unscoped* one, the
exact query whose answer caused the bug. Only after the index lands does the key
change and the correctly-scoped fetch start.

That is a race, and I assumed it was a narrow one. Measuring said otherwise:

| file                                | size  |
| ----------------------------------- | ----- |
| `config/district-snapshot-index.json` | 388KB |
| `v1/rankings.json`                    | 88KB  |

The roster that produces the *wrong* answer is 4.4× smaller than the file that
tells you which roster to ask for. The unscoped answer wins the race
**routinely**, not occasionally — so a past-year district page would render the
"This district has limited data available" fallback first and its real page
second. Not the original bug, but the same pixels, on every load.

## The transferable lesson

**Scoping a query by a value that arrives asynchronously does not make the
query scoped — it makes it unscoped for one window, then scoped.** Any consumer
that acts on the result (a gate, a redirect, a 404, an analytics event) must
wait for the *scoping value*, not merely for the result to be non-undefined.
`data !== undefined` is the wrong readiness signal here: it is true during the
unscoped window.

React Query hides this well. When the key changes the new entry starts empty, so
the gate goes quiet again on its own — which is why the flash is a flash and not
a stuck page, and why it survives a naive test that only waits for the final
state.

## How to apply

- When threading a date/tenant/locale into a query key, ask **where that value
  comes from**. If it comes from another query, you have an unscoped window.
- Gate the *consumer* on the scoping value's own arrival —
  `if (cachedDatesData && districtsData && !selectedDistrict)`, not just
  `if (districtsData && !selectedDistrict)`.
- Prefer that to `enabled:` on the query when a legitimately absent value must
  still produce an answer: here a district with *no* snapshots never gets a
  date, and disabling the fetch would have left it with no roster at all — the
  fallback page it actually needs would never render.
- **Measure the race rather than reasoning about it.** Two `curl -w
  %{size_download}` calls turned "there is a theoretical flash" into "the wrong
  answer wins by 4.4×." That flipped this from a nit to a required guard.
- Grep the key literal across `__tests__/` too, not just `src/`. #1396's lesson
  says "a key that appears in two files is an undeclared contract" — the second
  file here was a test harness seeding `setQueryData(['districts'], …)`, which
  simply stopped matching and silently degraded the assertion's subject.
- Pin it with a test that holds the scoping query in its loading state for the
  whole test (`mockReturnValue`, not `mockReturnValueOnce`) and asserts the gate
  stays shut. Re-apply the loaded default in `beforeEach` — `vi.clearAllMocks()`
  clears calls, **not** implementations, so a persistent `mockReturnValue` set
  inside one test leaks into the next.

## Related

- [[a-deliberately-shared-query-key-is-a-coupling-with-no-compiler]] — #1396,
  the same defect one hook over; that lesson covers the key itself, this one
  covers the window before the key is right.
- R3 (`tasks/rules.md`) — both bugs are the same violation: the parent owned the
  date and the child answered from `latest` instead.
