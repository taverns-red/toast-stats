---
date: 2026-09-01
tier: principle
category: principle
summary: An aggregate assembled in a step shared with other artifacts must omit the row it cannot build, not fail the step — otherwise one un-backfilled input takes unrelated manifests down with it
tags: [data-pipeline, ci, gcs, silent-failure, snapshots, program-year]
---

# An aggregate published from a shared step must degrade per row, not per step

**Date:** 2026-09-01
**PR:** #1499 (epic #1496, ruled on #1426)

## What happened

`v1/global-history.json` is one worldwide row per completed program year,
assembled in the pipeline's "Generate CDN manifests" step — the same step
that publishes `v1/latest.json`, `v1/dates.json` and `v1/rankings.json`. Its
inputs are ten small artifacts from ten historical snapshot dates, each of
which exists only because a backfill dispatch put it there.

The sibling runner for a single date, `build-global-totals.ts`, deliberately
does the opposite: it **refuses to publish** when its input is incomplete, and
exits 1. Copying that posture here looked like consistency. It would have
meant that the first program year whose rollup had not yet been backfilled
failed the whole step — and `v1/latest.json`, which every page reads, would
stop being written until someone ran a dispatch for a year nobody was looking
at. Ten completed program years are in the dates listing today; five have
rollups.

## The distinction that decides it

The two runners have different failure shapes, and the shape — not a house
style — picks the posture:

- `build-global-totals` sums **parts of one row**. A district file that
  half-arrives makes membership and payments quietly understated while the
  rankings-derived counts stay whole. Nothing looks broken. Partial input
  produces a **plausible wrong number**, so it must fail closed.
- `build-global-history` assembles **whole rows from whole artifacts**. A
  missing input cannot corrupt a row; it can only remove one. Partial input
  produces a **visibly shorter list**, so it can fail soft.

Fail closed when incompleteness is invisible in the output. Fail soft when it
is visible — and then make it visible on purpose: the omitted year is
published in an `omitted[]` array with its reason and logged as a
`::warning::` naming the dispatch that fixes it, so "we never backfilled that
year" never reads as "that year never happened".

## How to apply

Before choosing a posture for a step that writes a derived artifact, ask two
questions:

1. **Can the missing input silently distort what I do publish?** If yes, fail
   the step. If it can only shorten it, omit the row.
2. **What else does this step publish?** A step's blast radius is every
   artifact it writes. An abort is a decision to stop publishing all of them,
   and that decision belongs to the artifact with the widest readership in the
   step, not to the one that happened to hit the error.

The corollary for absent data is the same rule one level down: an omitted row,
a `null` education block and a `0` are three different facts, and collapsing
any two of them into one is the bug this whole epic exists to avoid.

## Related

- `scripts/lib/globalHistory.ts` — `buildGlobalHistory` returns `omitted[]` and
  `warnings[]`; the runner logs them and still exits 0
- `scripts/build-global-totals.ts` — the fail-closed sibling, and why
- `.github/workflows/data-pipeline.yml` — "Generate global-history manifest"
