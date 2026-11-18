---
date: 2026-06-12
tier: lesson
summary: A destructive boundary derived from set-level evidence must filter that evidence by provenance, not by shape
tags: [data-pipeline, collector-cli, verification, tdd, metadata, gcs]
legacy_id: "163"
---

# Lesson 163 — A destructive boundary derived from set-level evidence must filter that evidence by provenance, not by shape

**Date:** 2026-06-12
**Issue:** #1178 (epic #1102 Sprint 5 — prune exempts the in-progress month)
**PR:** _(record on merge)_

## What happened

The sprint added the in-progress-month exemption to prune: every date after
the most recent completed month-end in the classification set is always
kept, so a mid-month prune can no longer delete the live latest snapshot.
The boundary was computed as "max snapshotDate where `isMonthEnd`".

The fresh-context review caught the hole: `isMonthEnd` is a statement about
the date string's SHAPE, not about evidence. A metadata-less raw-csv dir
whose name happens to be the 30th/31st (a scrape that crashed before
writing metadata.json — exactly the #1131 population) reports
`isMonthEnd: true` over an unproven raw→snapshot mapping. One such dir
dated inside the in-progress month would have silently advanced the
boundary and un-protected every daily of the month the exemption exists to
protect — the protected classification itself becoming the key that
unlocks deletion of its neighbours.

The fix: classifications carry `mappingProven` (true when metadata.json or
a registry closing window decided the mapping; false when the snapshot
date is just the raw date echoed back), and the boundary scan requires
`isMonthEnd && mappingProven`.

## The transferable principle

**When a rule derives a boundary (latest, max, newest, threshold) from a
set of records and then acts destructively relative to that boundary, each
record must qualify as evidence by its PROVENANCE, not by its shape — a
value that merely looks like the evidence class (right format, right
position, right date pattern) but was defaulted, echoed, or guessed will
silently move the boundary, and the failure lands on the records the
boundary was supposed to protect.** This is the set-level sibling of
Lesson 158's laundered default: there a persisted `false` read as a
decision; here an echoed raw date read as a completed month-end.

## How to apply

- Deriving a max/latest/newest over records that feed a destructive or
  gating decision? Ask of each record: "who decided this value?" If any
  branch produces the field by echo or default, add a provenance flag at
  the writer and filter on it in the scan.
- The hazardous records are usually the PROTECTED ones (fail-closed keeps,
  unknowns) — they survive into the set precisely because they're unproven,
  so they're always available to poison set-level aggregates.
- Test it with the adversarial fixture: the unproven record placed exactly
  where it would move the boundary (here: a bare dir named like the
  in-progress month's month-end).

## Related

- [[158-a-fail-closed-chain-is-only-as-honest-as-its-writers-a-persisted-default-reads-as-a-decision]]
  — the per-record version of the same laundering failure.
- [[161-scale-fail-closed-thresholds-to-the-actions-reversibility]] — why
  the unproven population exists in the set at all.
- `packages/collector-cli/src/services/PruneService.ts`
  (`applyInProgressMonthExemption`, `mappingProven`).
