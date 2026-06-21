---
id: '171'
category: lesson
tags: [frontend, hooks, data-pipeline, cdn, verification, tests, contracts]
auto_load: true
date: 2026-06-21
issues: [1229, 1228]
---

# Lesson 171 — A dated CDN district snapshot is a `PerDistrictData` envelope; mock the wrapper or the page reads empty on live

**Date:** 2026-06-21
**Issue:** #1229 (epic #1228 Sprint 1 — per-club history view)
**PR:** _(record on merge)_

## What happened

`useClubHistory` fetched each year-end snapshot and read the club list as
`snap.clubs.find(...)`, typing the fetch as `DistrictStatisticsFile`. Eight unit
tests passed; the page worked in every test. A fresh-context `/review`
(pre-push) pulled the **live** CDN file
(`cdn.taverns.red/snapshots/2025-06-30/district_61.json`) and found its
top-level keys are `{districtId, districtName, collectedAt, status, data}` — the
parsed `clubs[]` live under **`.data.clubs`**, not the top level. The dated file
at `snapshots/{date}/district_{id}.json` is a **`PerDistrictData` envelope**
(`{ status, data: DistrictStatisticsFile }`), as `useSnapshotDiff` already
knew (it types the fetch `<PerDistrictData>` and consumes `.data`).

So `snap.clubs` was `undefined`, `.find` threw, the per-year `try/catch`
swallowed it as "skip this year," and **every** completed year was dropped —
the page rendered "No completed program years on file yet" for every real club.
The tests were green only because the mock returned the _unwrapped_ inner
object. The bug lived entirely in the gap between the mock shape and the wire
shape.

## The transferable lesson

**A hook is only as honest as the shape its mock returns.** When a test fakes a
fetch, the fake must mirror the _envelope the wire actually sends_, not the
convenient inner payload. A mock that returns the unwrapped object turns the
unit suite into a rubber stamp for the happy path and hides the unwrap entirely
— the sibling of Lesson 139 ("green on mocks, broken on live"), but for
_structure_ rather than _date semantics_.

Two cheap guards would each have caught it:

- **Cross-check the contract against an existing consumer** before writing the
  fetch. `useSnapshotDiff` already unwrapped `.data`; `grep` for other callers
  of `fetchCdnDistrictSnapshot` and copy their typing.
- **Verify against the live artifact** (R2 spirit): one `curl` of the real CDN
  file shows the envelope immediately.

A swallow-all `catch` that maps every error to "skip" actively _hides_ this
class of bug — it converted a structural crash into a silent empty state.
Narrow the catch, or at least guard the known-bad case explicitly (here:
`if (snap.status === 'failed') return null`, then `snap.data?.clubs`).

## How to apply

- Fetching `snapshots/{date}/district_{id}.json`? It is `PerDistrictData`. Read
  `.data` for the `DistrictStatisticsFile` (`.data.clubs`, `.data.totals`, …),
  and skip `status === 'failed'`.
- A new data hook's test fixtures must reproduce the **full wire envelope**.
  When in doubt, `curl` the live file and shape the mock to it.
- Treat a fresh-context review's "I pulled the live file" finding as gold — it
  is exactly the boundary a unit suite cannot see.

## Related

- [[139-a-year-end-snapshots-source-date-falls-in-july-so-a-program-year-equality-guard-drops-every-year]]
  — sibling "green on mocks, broken on live" trap, date-semantics flavour.
- [[123-totals-distinguished-counts-are-unpopulated-mid-year-count-from-clubperformance]]
  — verify the served value/shape for a representative entity before wiring.
- `frontend/src/hooks/useSnapshotDiff.ts` — the existing consumer that unwraps
  `.data` correctly; the contract precedent to copy.
