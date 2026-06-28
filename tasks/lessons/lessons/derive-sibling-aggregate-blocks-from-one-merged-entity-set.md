---
date: 2026-06-10
tier: lesson
summary: When sibling reports share one entity universe, derive every aggregate block from the single merged entity set
tags: [data-pipeline, analytics, transformation, fixtures, verification]
legacy_id: "157"
---

# Lesson 157 — When sibling reports share one entity universe, derive every aggregate block from the single merged entity set

**Date:** 2026-06-10
**Issue:** #1124 (epic #1096 Sprint 2)
**PR:** #1150

## What happened

The snapshot's `divisions[]`, `areas[]`, and `totals` blocks were each
extracted from a _different_ raw report: divisions from
division-performance (reading invented aggregate columns — the real file
is per-club rows with no aggregates and no payments), areas from
club-performance (reading a payments column it doesn't have), totals
from clubs plus a fallback that treated `districtPerformance[0]` as a
district aggregate row (it's a club row). Three extraction paths, three
ways to be wrong, and no structural relationship between the blocks —
divisions could disagree with areas could disagree with totals, and in
production all three were structurally zero.

The fix collapsed the three paths onto one: extract the merged clubs
once (membership from club-performance, payments joined from
district-performance), then derive divisions, areas, and totals as
groupings/sums of that one array. `sum(divisions) == sum(areas) ==
totals` is now true **by construction**, and one sum-equality test pins
it.

The precondition that makes this safe is _not_ assumable: the sibling
reports must actually cover the same entity set. Verified empirically
before consolidating — club sets identical across all three CSVs for
three districts, **including the Suspended category** (the cohort most
likely to be filtered out of one view per Lesson 118).

## The transferable principle

**When a source emits several sibling reports over what should be one
entity universe, don't write one extractor per report for aggregate
blocks that must agree — extract the merged entity set once and derive
every aggregate block from it, after verifying (not assuming) that the
universes coincide, category by category.** Per-report extraction forks
one fact (the entity universe) into N implementations that drift
independently (the lesson-61 two-copies failure at the block level).
Derivation from one set makes cross-block consistency structural — the
same move as Lesson 154's "emit only the top state": the invariant holds
because the code is incapable of violating it, not because a test
happens to check it.

## How to apply

- Aggregate blocks (per-group, per-parent, grand totals) that consumers
  expect to reconcile should be groupings of one extracted entity list,
  not parallel reads of different report files.
- Before consolidating, verify the universes match on real data across
  more than one entity scope, and check the categories a filtered view
  would drop (suspended/closed/private — Lesson 118's cohort).
- Add the cheap structural test: every block sums to the same grand
  total. It costs three asserts and catches any future re-fork.
- A vendor report named like an aggregate ("division performance") may
  be per-entity rows; read the real header row (R20 spirit) before
  writing an extractor against remembered column names.

## Related

- [[061-fix-the-formula-everywhere-not-just-the-one-in-the-bug-report]] —
  the drift failure mode this removes, at block level instead of formula
  level.
- [[118-missing-from-fac-is-a-registry-visibility-signal-not-a-data-gap]] —
  why the universe-equality check must include the filtered categories.
- [[154-synthetic-fixtures-validate-the-code-only-a-captured-real-pair-validates-the-policy]] —
  the captured D61 pair is what proved the real shapes (per-club rows,
  no payments column) and the policy.
- `packages/analytics-core/src/transformation/DataTransformer.ts`
  (`extractDivisions`/`extractAreas`/`calculateTotals`),
  `DataTransformer.realHeaders.test.ts` (the sum-equality pin).
