---
date: 2026-08-22
tier: lesson
summary: A feed that renders from an explicit ordered list of categories drops any category the list does not name — a new enum value is silently invisible, never an error, so the reclassification that produced it reads as data loss
tags: [frontend, analytics-core, snapshot-diff, enums, what-changed]
---

# A new event category is dropped, not errored, by an explicit display list

**Date:** 2026-08-22
**Issue:** #1443 (What Changed presents district-reformation transfers as clubs joining and leaving)
**Tags:** frontend, analytics-core, snapshot-diff, enums, what-changed

## What happened

#1443 reclassified roster moves across a district realignment: instead of
`club-added` / `club-removed`, `diffSnapshots` emits `club-transferred-in` /
`club-transferred-out` for the clubs a boundary change moved. Adding the two
values to `DiffEventCategorySchema` and emitting them typechecked clean, the
engine tests went green, and the diff carried exactly the right events.

The page rendered none of them. `DistrictChangesPage` renders its feed from
`CATEGORY_GROUPS` — an explicit, ordered list of `{ category, heading }` pairs
— and `ChangeGroup` returns `null` for an empty list. A category the array does
not name has no group to land in, so its events are dropped on the floor: no
warning, no fallback bucket, no type error. The reclassification looked exactly
like deletion. Twenty-two transferred clubs went from "wrongly described" to
"absent", which is worse.

## Proof

The page test asserting the transfer groups failed with the events present in
the fixture and the DOM containing only the untouched `club-added` group —
nothing anywhere reported an unrendered category. Adding the two entries to
`CATEGORY_GROUPS` was the entire fix.

## Rule

When a consumer renders from an explicit ordered list keyed by an enum, the
enum and the list are two halves of one contract with nothing enforcing the
join. Widening the enum is only half the change — grep for every literal list
of that enum's values (`CATEGORY_GROUPS`-shaped arrays, `Record<Category, …>`
maps missing an index signature, switch statements with a silent `default`)
before assuming a new value will surface. An exhaustive `Record<Enum, T>` type
turns the omission into a compile error; an array of objects never will.

## Warning

The ordering of such a list is product behaviour, not decoration. Appending the
transfer groups *after* the genuine roster groups is what keeps a real new club
at the top of the feed instead of buried among thirty transfers — the same
reason the reclassification exists at all. Put a new entry where it belongs,
not at whichever end is easiest to append to.
