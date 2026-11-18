---
date: 2026-08-22
tier: lesson
summary: Two setSearchParams calls in one handler silently drop the first key — coupled URL params need a single combined setter
tags: [frontend, react-router, url-state, program-year]
---

# Coupled URL params need one setter, not two calls

**Date:** 2026-08-22
**Issue:** #1436 (frontend: the degraded district view drops the program-year selector)
**Tags:** frontend, react-router, url-state, program-year

## What happened

`useUrlProgramYear` exposes `setSelectedProgramYear` (writes `?py=`) and
`setSelectedDate` (writes `?date=`) as two independent setters, each doing its
own `setSearchParams(prev => …)`. `searchIndex.ts` already documents why the two
params are coupled: the hook **reads** them independently, so a `?date=` outside
the selected program year leaves the page self-inconsistent. Omni-search
therefore sets both when it routes to a historical district.

The obvious way to honour that from a year selector is
`setSelectedProgramYear(py); setSelectedDate(dateInNewYear)`. It does not work.
react-router 7's `useSearchParams` hands the functional updater the
**render-time** `searchParams` value captured in the `useCallback` closure — not
the pending one:

```js
let setSearchParams = React.useCallback((nextInit, navigateOptions) => {
  const newSearchParams = createSearchParams(
    typeof nextInit === 'function' ? nextInit(new URLSearchParams(searchParams)) : nextInit
  )
  navigate('?' + newSearchParams, navigateOptions)
}, [navigate, searchParams])
```

Both calls in one handler are computed from the same pre-click base, so the
second navigation wins outright and the first call's key is discarded. Setting
`py=2024` then clearing `date` lands on a URL with **no `py` at all** — silently
back on the default year, which is exactly the state the selector existed to
escape.

## The fix

One setter that writes both keys in a single `setSearchParams` call
(`setProgramYearAndDate`), with the invariant enforced inside it: a date outside
the target program year is dropped rather than written, so the inconsistent pair
is not reachable through the API even by a caller mistake.

## Rule

When two URL params must agree, expose **one** setter that writes them in one
navigation, and enforce the invariant inside it. Never compose the guarantee out
of two independent setters — with a render-time-captured base, the second write
silently reverts the first, and the bug is invisible in the hook's return value
(which reflects the new location) while being wrong in the URL.

## Warning

The same shape applies to any pair of `useSearchParams`-backed setters called in
one event handler, not just `py`/`date` — `useUrlState` consumers included.
Assert on the committed **search string**, not on the hook's returned state: a
test that only checks `result.current.selectedProgramYear` passes while the URL
is wrong.
