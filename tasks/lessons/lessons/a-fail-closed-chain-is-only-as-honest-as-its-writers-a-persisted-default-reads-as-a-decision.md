---
date: 2026-06-10
tier: lesson
summary: A fail-closed chain is only as honest as its writers: a persisted default reads as a decision
tags: [data-pipeline, collector-cli, verification, tdd, metadata]
legacy_id: "158"
---

# Lesson 158 — A fail-closed chain is only as honest as its writers: a persisted default reads as a decision

**Date:** 2026-06-10
**Issue:** #1129 (epic #1098 Sprint 2 — rebuild closing remap fails closed)
**PR:** _(record on merge)_

## What happened

The sprint built a fail-closed closing-period chain for the rebuild:
metadata.json → CSV "As of" footer → closing-date registry → refuse.
The trust rule at the first link is "an explicit `isClosingPeriod: false`
written by the scraper is a decision; honor it."

The /simplify altitude review then found the hole: the scraper's own footer
parser returned `{ isClosingPeriod: false }` both when the footer said
"non-closing" **and when no footer existed at all**, and the orchestrator
persisted that value verbatim into metadata.json. Every footer-less scrape
day on disk carries an explicit-looking `false` that is actually a parser
default — and the new chain's trust branch would have honored it, re-opening
the exact raw-date-publish hole the sprint exists to close, through the
daily-scrape door instead of the rebuild door.

The fix had to land at the **writer**, not the reader: the parser now
returns `footerFound`, the orchestrator omits the `isClosingPeriod` key
entirely when nothing decided it, and the reader warns when a trusted
explicit `false` contradicts a registry closing window (the legacy laundered
population on disk can't be retro-fixed). A second writer with the same
hardcoded-false pattern (`BackfillOrchestrator.buildBackfillMetadata`) was
found by the fresh-context review and filed as #1160.

## The transferable principle

**Before a fail-closed consumer trusts a persisted field as an "explicit
decision," audit every writer of that field for laundered defaults — a
`return { value: false }` fallback in a parser becomes an explicit `false`
on disk one writer downstream, and no reader can distinguish them after the
fact.** The honest shapes are: tri-state at the source (`footerFound` /
`decided`), key-omission when undecided, and provenance on every derived
write (`closingPeriodSource`). When a legacy population of laundered values
already exists, add a contradiction warning at the reader; you can't
re-derive intent from a boolean.

## How to apply

- Adding a "trust the explicit value" branch? `grep` every writer of that
  field first (Lesson 61 applies to writers, not just formulas). Each
  writer must be able to say "I didn't decide" — usually by omitting the key.
- A parser/extractor whose not-found path returns the same shape as a real
  negative is the root enabler. Return a found-flag or a discriminated
  union; never let the default leave the function unlabeled.
- Stamp derived writes with their deciding authority (`source` field) so the
  next audit can separate decisions from defaults without forensics.

## Related

- [[150-an-exhaustiveness-guard-on-a-classification-map-misses-a-misclassification-that-keeps-the-set-valid]]
  — sibling: the structurally-valid value that's semantically wrong.
- [[061-fix-the-formula-everywhere-not-just-the-one-in-the-bug-report]] — the
  twin-writer audit this lesson extends to persistence paths.
- `packages/collector-cli/src/utils/closingWindowResolver.ts`,
  `CollectorOrchestrator.ts` (metadata write), #1160 (BackfillOrchestrator).
