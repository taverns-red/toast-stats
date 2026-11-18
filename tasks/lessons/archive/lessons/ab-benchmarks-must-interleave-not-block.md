---
date: 2026-09-08
tier: lesson
summary: A/B benchmarks must interleave the two versions, not run them in blocks — sequential blocks measure machine drift
tags: [performance, testing, benchmarking, migration]
---

# A/B benchmarks must interleave, not block

**Date:** 2026-09-08
**PR:** #1538 (#1530, `@tanstack/react-table` 8 → 9)

## What happened

`ClubsTable.performance.test.tsx` logs a render time rather than gating on
one, so "the test passed" says nothing about a library upgrade. #1530 asked
for a before/after comparison, so I measured.

First attempt: five runs on v8, then (after the migration) five runs on v9.
Result looked like a large win — 300-club median 332 ms → 247 ms (-25%),
1000-club 805 ms → 522 ms (-35%). I nearly wrote that into the PR as
"v9 is meaningfully faster."

It was not. Re-measured with the two versions **interleaved** — a second
worktree pinned at the pre-bump commit with its own `node_modules`, then
`v8, v9, v8, v9, …` six times each — the difference collapsed to noise:

| | v8 | v9 | delta |
|---|---|---|---|
| 300 clubs | 233 ms | 237 ms | +1.7% |
| 1000 clubs | 561 ms | 538 ms | -4.2% |

The whole 25-35% "win" was machine load drifting between the two blocks.
The v8 block happened to run while the machine was busier.

## The takeaway

**Anything that varies over wall-clock time — CPU contention, thermal state,
background jobs — is confounded with the variable you are testing whenever
you measure A for a while and then B for a while.** Interleave the samples so
that drift hits both arms equally, and report the spread alongside the
median so a delta smaller than the spread is visibly not a result.

The cheap way to interleave a dependency A/B in this monorepo: a second
`git worktree` pinned at the pre-bump commit with its own `npm ci`, then
alternate runs between the two directories. Do **not** try to A/B by swapping
`package.json` / `package-lock.json` in one worktree — the source has already
been migrated, so the old library version cannot even load (`createSortedRowModel
is not a function`). The version of the code and the version of the dependency
have to move together.

## The rule

A before/after performance claim needs interleaved samples and a stated
spread. A median-vs-median from two sequential blocks is not evidence.
