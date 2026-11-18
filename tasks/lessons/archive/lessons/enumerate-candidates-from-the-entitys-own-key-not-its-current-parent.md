---
date: 2026-08-22
tier: lesson
summary: A history view keyed on a parent scope truncates at every reparenting event, and renders nothing rather than erroring
tags: [frontend, hooks, cdn, district-reformation, silent-failure, club-id]
---

# Enumerate candidates from the entity's own key, not from its current parent

**Date:** 2026-08-22
**Issue:** #1437 (related: #1440, #1436)

## What happened

`useClubHistory` built a club's multi-year history like this:

```ts
const dates = snapshotDatesFrom({ dates: index[districtId!] ?? [] })
```

Candidate snapshot dates came from **one district's** entry in the snapshot
index, and each year's row was then looked up inside that district's year-end
file. A club's identity, though, is its **club number** — the club is
continuous across a district change (same number, same charter). Toastmasters'
2026-07-01 reformation merged and split districts and moved clubs between them,
so a club now in D70 that spent 2019–2025 in D90 had those years dropped before
a single fetch was made. Not a lookup that failed: a candidate set that never
contained them.

The loss was invisible because every unhappy path in the hook returned `null`
and was filtered out — missing snapshot, failed collection, club not present —
and the page rendered `rows.length === 0` as "No completed program years on
file yet". Three distinct facts, one pixel-identical empty table (the Lesson 47
signature, one level up: there the *lookup* degraded to nothing, here the
*candidate enumeration* did).

## The takeaway

**The source of a candidate set must be keyed on the same thing the entity is
keyed on.** If an entity's identity is X (club number) but candidates are
enumerated from Y (its current parent district), the view silently truncates at
every event that changes the X→Y mapping — a reparenting, a merge, a rename.
The bug is dormant until the mapping changes, then it deletes history without
an error.

Two practical corollaries:

- **Enumerate widely, resolve narrowly.** Candidate program years now come
  from the *whole* index (every district's dates = every year the archive
  covers); each year is then resolved against this district's own dates. The
  years this district cannot cover are *reported*, not skipped.
- **A skip needs a reason, and the reason has to reach the UI.** Four
  outcomes — `district-absent`, `snapshot-unavailable`, `snapshot-failed`,
  `club-absent` — used to be four `return null`s. Returning the reason is what
  makes the remaining gap diagnosable at all; it is the durable part of the
  fix, more than the enumeration change.

## The part worth flagging

Fully recovering a moved club's earlier rows needs a **club → district-per-year
index**, which the pipeline does not emit: `config/club-index.json` is rebuilt
from the LATEST snapshot date only, so it knows one district per club and no
history. The read-time alternative — probing every district's year-end snapshot
for each missing year — is ~100 multi-hundred-KB fetches per year, which is not
a page-load read path. When the clean fix needs a pipeline change, report that
and ship the honest partial rather than a frontend workaround that half-works
and looks complete.

## Also

`normalizeClubId` had lived as a **private** method on `DataTransformer`, used
for exactly one join, while Toastmasters demonstrably emits both `00009905` and
`9905` — within a single snapshot (`DataTransformer.test.ts:772-780`). Every
strict `===` against a stored club id is therefore a silent miss waiting for
the day the export form drifts. It now lives in `shared-contracts/naming/`
beside the snapshot-file matcher; #1440 adopts it at the remaining call sites.
