---
date: 2026-08-01
tier: lesson
summary: Two URL-state hooks written in the same handler silently lose one facet — react-router resolves a functional updater against the current render, not the pending update
tags: [frontend, react-router, url-state, deep-links, filters]
---

# Two URL-state hooks in one handler lose a facet

**Date:** 2026-08-01
**Issue:** #1362 (Recognition filtering on the rankings table)

## What happened

The Recognition filter is two facets — `?awards=extension,retention` and
`?tier=select` — combined with AND. The obvious implementation reuses the
page's existing primitive once per param:

```ts
const [awards, setAwards] = useUrlState('awards', NO_AWARDS, AWARDS_OPTS)
const [tier, setTier] = useUrlState('tier', null, TIER_OPTS)

const setFilter = (next) => {
  setAwards(next.awards)
  setTier(next.tier)
}
```

Every single-facet test passed. Clicking a tier chip filtered correctly and
wrote `?tier=select`. Clicking an **award** chip did nothing at all, and
`?awards=` never appeared — even though the award predicate had its own
passing unit tests.

## Why

`useUrlState` is built on react-router's `setSearchParams`, and a functional
updater there resolves against the params of the **current render**, not
against a queued previous update the way `useState` does. Two calls in one
handler are therefore not composed — the second rebuilds the whole query
string from the pre-click params and navigates, discarding the first.

The symptom is asymmetric and that is what makes it slow to diagnose: the
facet written **last** works perfectly, so the feature looks half-implemented
rather than broken. Whichever call you happen to put second is the one that
appears correct.

## The fix

One writer, one write. A dedicated hook reads both params and writes both
inside a single `setSearchParams` callback:

```ts
setSearchParams(prev => {
  const params = new URLSearchParams(prev)
  awards ? params.set('awards', awards) : params.delete('awards')
  tier ? params.set('tier', tier) : params.delete('tier')
  return params
}, { replace: true })
```

## How to apply

- **A URL param is not a piece of state; the query string is.** If two params
  can change in one user action, they need one writer. `useUrlState` is safe
  per-handler, not per-param.
- The tell to look for in review: two `useUrlState` / `setSearchParams` calls
  in the same function body. It reads as harmless sequential assignment and is
  not.
- **Test the atomicity explicitly.** A test per facet cannot fail on this —
  each one only ever writes its own param. The falsifying test is "one action
  writes both facets, and both survive."

## Related

- `frontend/src/hooks/useUrlRecognitionFilter.ts` — the single-writer hook
- `frontend/src/hooks/useUrlState.ts` — correct for one param per handler
- Issue #978 — the `?regions=` convention this follows
