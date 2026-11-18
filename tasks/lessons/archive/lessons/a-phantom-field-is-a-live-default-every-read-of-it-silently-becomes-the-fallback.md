---
date: 2026-07-15
tier: principle
summary: A phantom field (typed but never on the wire) doesn't fail — it silently becomes its fallback, so the default is the real code path; grep the primitive, and a `?? today` default hides it forever
tags:
  [
    frontend,
    contracts,
    types,
    closing-period,
    snapshot-date,
    dead-code,
    verification,
    regression-class,
  ]
---

# Principle — A phantom field is a live default, not a missing value

**Date:** 2026-07-15
**Issue:** #1321 (epic #1319 Sprint 2 — snapshot-date guard)

## What happened

`DistrictStatistics.asOfDate` was declared, typed `string` (not optional), and
read at five production sites. It has **never existed on the wire**. One `curl`
settles it — the live envelope is
`{districtId, districtName, collectedAt, status, data}` and the payload carries
`data.snapshotDate` only:

```
asOfDate at top? False    asOfDate in data? False    data.snapshotDate = 2026-06-30
```

Nothing crashed, because every read fed a fallback:

```ts
extractDivisionPerformance(snapshot, snapshot.asOfDate) // → undefined
const effectiveSnapshotDate = snapshotDate ?? todayIso() // → the WALL CLOCK
```

So the "fallback for unwired callers" was the **only** path the wired callers
ever took. On 2026-07-15, viewing the pinned 2026-06-30 close, the page reported
visit **round 1 of PY 2026-2027** instead of **round 2 of PY 2025-2026** —
whitewashing deadlines that had passed unmet as merely "provisional". Live, for
as long as the field existed.

## Why it survives every gate

- **TypeScript endorses it.** `asOfDate: string` is not optional, so `?.` isn't
  even required and no reader looks twice. The type is the *claim*, not the data.
- **The tests prove the fixture, not the wire.** Every page fixture carried
  `asOfDate: '2026-03-15'` — the mock asserting the phantom into existence. Green
  on mocks, dead on live (Lesson 171's structural sibling).
- **The default absorbs the signal.** `?? todayIso()` converts "this field is
  missing" into a plausible, *wrong* value. A throw would have surfaced it on day
  one; the default made it a silent 340-days-a-year-correct bug.

The compounding shape: a phantom field + a forgiving default = a bug that is
invisible to types, tests, and reviewers, and only wrong during the closing
window — when it matters most.

## The rule

- **A field's presence is a claim about the wire; verify it against the wire.**
  Before wiring or trusting any field, `curl` the real artifact. Free, decisive.
  (R7 + the "name can lie" lesson, one step further: not just *is it populated*,
  but *does it exist at all*.)
- **Make the load-bearing parameter required and delete the default.** No
  default means TypeScript enumerates every call site that can't supply one — the
  guard is the *absence* of the fallback. Here it immediately named two sites the
  issue's change set had missed.
- **Grep the primitive, not the named function.** The issue named 3 call sites;
  grepping `asOfDate` / `todayIso` found **5** (`DistrictDivisionsPage`,
  `AreaRedirectPage`). A ticket's list is a lower bound.
- **`{phantom && <Panel/>}` is dead code with a pulse.** A phantom guarding a
  render is a panel that has never shipped. Fixing the field silently *turns it
  on* — verify what a phantom was suppressing before you fix it, or a bug fix
  becomes an unrequested release. Here the resurrected panel would have printed
  "Data as of {pinned snapshot date}" — planting a 5th recurrence of the very
  conflation the epic was killing, in fresh UI copy.

## How to apply

- Deleting a phantom is not enough if the *type* that spawned it is still
  fiction. `useDistrictStatistics` still types the `PerDistrictData` envelope as
  `DistrictStatistics`, so `membership` / `education` / `clubs` remain phantoms
  on that type — the generator is still running (filed separately). A guard
  minted from a lying type is a lock on a door in a fictional wall.
- When a test's fixture is the only reason a field "exists", the fixture is the
  bug. Shape fixtures to the wire, and set the two dates **apart** — a fixture
  where `sourceCsvDate === snapshotDate` cannot see this class at all.

Related:
[[key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate]] —
the same divergence at the fetch key.
[[a-dated-cdn-snapshot-is-a-perdistrictdata-envelope-mock-the-wrapper-or-the-page-reads-empty-on-live]]
— the envelope mis-typing that generated this phantom.
[[a-fields-name-and-comment-can-lie-about-whether-its-populated-in-your-surface]]
— populated-ness; this is its harsher case: existence.
[[fix-a-date-derivation-bug-by-grepping-the-primitive-not-the-named-function]] —
why the ticket's 3 sites were 5.
