---
date: 2026-06-29
tier: lesson
summary: Order additive set-level keep passes by whose reason should win, and have later passes yield to already-set state
tags: [data-pipeline, collector-cli, tdd, retention, observability]
---

# Lesson — Order additive set-level keep passes by whose reason should win

**Date:** 2026-06-29
**Issue:** #1280 (epic #1281 Sprint 2 — prune retention: first-of-month + month-end)
**PR:** _(record on merge)_

## What happened

The prune retention rule swapped its second per-month anchor from the
penultimate day to the *first available* snapshot of the month. The new keep
is set-relative (the minimum `snapshotDate` per `YYYY-MM` group), so it was
implemented as a second set-level pass `applyFirstOfMonthKeep`, mirroring the
existing `applyInProgressMonthExemption` (#1178). Both passes are
*additive*: each only ever flips `keep = false → true`, never the reverse.

Two subtleties decided correctness:

1. **Both passes can claim the same record.** A live-month daily that is also
   its month's earliest snapshot qualifies for BOTH the in-progress reason
   and the first-of-month reason. The `keep` boolean is identical either way,
   but the `reason` string — the operator-facing audit of *why* a date
   survived — is not. A regression test pinned that every in-progress daily
   carries the in-progress reason. Running first-of-month first would have
   stamped `06-06` with "First-of-month" and broken that contract even though
   the keep decision was unchanged.

2. **The fix is ordering + yield-to-existing-state.** Run the in-progress
   exemption first, then first-of-month, and have first-of-month `continue`
   over any record already `keep = true`. The reason that should win is set
   first; the later pass defers.

## The transferable principle

**When two additive passes over the same set can both legitimately keep the
same record, the `keep` flag is order-independent but the *reason* is not.
Order the passes so the reason you want to win runs first, and make every
later additive pass yield to already-set state rather than overwrite it.**
The boolean is idempotent; the explanation is last-writer-wins, so the
explanation is where ordering bugs hide — and a reason string is exactly the
kind of observability a fresh operator trusts during an incident.

## How to apply

- Stacking set-level passes that each only add keeps? Decide the reason
  precedence explicitly, encode it as pass order, and `if (c.keep) continue`
  in every downstream pass.
- Test the *reason*, not just the boolean, for any record both passes can
  claim — the boolean assertion passes under either order and hides the bug.
- A "keep first AND last of each group" rule keeps everything in any group of
  size ≤ 2. Fixtures that exercise pruning need a genuine interior member
  (group size ≥ 3); a swap from a per-date predicate to a first/last rule
  silently turns every 2-date-month fixture into an all-keep case.

## Related

- [[a-destructive-boundary-derived-from-set-evidence-must-filter-by-provenance]]
  — the sibling set-level pass (#1178); first-of-month is purely additive, so
  the provenance hazard there does not bind here (it never moves a boundary).
- [[a-delete-path-must-reconcile-derived-indexes-not-only-the-additive-path]]
  — the companion #1279 prune-index reconciliation from the same epic.
