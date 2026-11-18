---
date: 2026-07-04
tier: principle
summary: A shared "self-heal" hook that rewrites the URL on mount clobbers a consumer's navigation state; gate the write for pages that receive location.state
tags: [frontend, react-router, hooks, program-year, navigation-state, self-heal, shared-hook]
legacy_id: 177
---

# Principle — A mount-time URL self-heal clobbers a consumer's navigation state

**Date:** 2026-07-04
**Issue:** #1302 (epic #1298 Sprint 3 — PY selector on Division/Area/Club pages)

## The failure

Extracting the district-scoped PY/date wiring into a shared hook
(`useDistrictProgramYearControls`) added a **self-heal effect**: when the
selected program year has no data, the effect calls
`setSelectedProgramYear(newest)` → `setSearchParams(..., { replace: true })`
so the chip and `?py=` agree (L124, never strand the user on an empty grid).

DivisionPage/AreaPage — reached via plain `<Link>` — were fine. But
ClubDetailPage **receives navigation state**: `ClubsTable` passes the prior
filtered search via `location.state.fromClubsSearch` so the "Clubs" breadcrumb
can round-trip the user back to their filtered list (#577). React Router's
`setSearchParams` writes a **new location with `state: undefined`** — so the
mount-time self-heal silently wiped `fromClubsSearch`, and the crumb regressed
to the unfiltered `/district/:id/clubs`. Three pre-existing tests caught it
(the crumb href assertion + two `mockReturnValueOnce` tests that the *extra
re-render* consumed).

## The transferable insight

**A shared hook that writes the URL as a side effect is safe only for pages
that own their whole URL. A page that was navigated to *with state* must not
auto-rewrite its URL on mount** — the rewrite drops `location.state`.

The original ClubDetailPage was correct precisely because it only *derived*
`effectiveProgramYear` (a `useMemo`) and never wrote back. The extraction
regressed it by generalizing the write to every consumer.

## How to apply

- Make the URL-writing side effect **opt-out**: `useDistrictProgramYearControls(id, { selfHeal: false })`. Pages reached via plain links keep `selfHeal: true`; a page that reads `location.state` passes `false`.
- The opted-out page stays honest by rendering the **derived** value
  (`effectiveProgramYear ?? selectedProgramYear`) in the chip — the picker shows
  the year whose data is displayed without any URL write. The URL only changes
  on an explicit user action, which is an acceptable moment to drop stale state.
- When you extract shared inline logic into a hook, **enumerate what each
  consumer differs on** before assuming parity (R6). Here the differentiator was
  invisible in the types: one caller had incoming `location.state`, the others
  didn't. A green extraction that only ran the *new* callers' tests would have
  shipped the regression — run the migrated caller's existing suite too.
- Fragile test smell: `mockReturnValueOnce` breaks when a change adds a render.
  That breakage is a *signal* the component now re-renders more — investigate the
  new render, don't just switch to `mockReturnValue`.
