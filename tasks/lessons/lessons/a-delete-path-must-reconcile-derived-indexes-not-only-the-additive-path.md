---
date: 2026-06-29
tier: lesson
summary: A delete/prune path must reconcile its derived indexes, not just the additive path
tags: [pipeline, gcs, index, automation, workflow, ci, data-integrity]
legacy_id: "176"
---

# Lesson 176 — A delete/prune path must reconcile its derived indexes, not just the additive path

**Date:** 2026-06-29
**Issue:** #1279 (epic #1281 Sprint 1)
**PR:** (this sprint)

## What happened

The data pipeline's "Update district-snapshot-index" step had two branches:
`rebuild` (regenerate the index from the actual GCS `district_*.json`
listing) and an `else`/`daily` path (download the existing index and **merge
today's date in**). A third mode — `prune`, which **deletes**
`snapshots/<date>/` prefixes from GCS — had no branch of its own, so it fell
through to the additive `else` path. With no daily scrape having run, that
path merged an empty date into the existing index and wrote it **straight back
unchanged**. The index kept advertising the just-deleted dates; the frontend
only requests index-listed dates, so it fetched phantom snapshots → 404 →
the change-digest error UI. D61's index listed 83 dates for 2026, 42 of which
404'd.

The fix was one line: route `prune` through the same regenerate-from-GCS path
as `rebuild` (`[ "$MODE" = "rebuild" ] || [ "$MODE" = "prune" ]`), so the index
is rebuilt from files that actually still exist.

## The transferable principle

**A derived index/manifest is only as correct as its *most destructive*
writer.** An additive merge-forward path ("add today's entries") silently
assumes the underlying data only ever grows. The day a delete/prune/retention
job removes underlying objects, that same merge path re-advertises the
deleted entries because it never subtracts. Any operation that *removes*
source data must reconcile every index derived from it — regenerate from the
real listing, or explicitly remove the entries — in the **same run**. Don't
let a destructive mode fall through to an additive default branch (this is the
R17 "every conditional needs an explicit case for every value" failure with a
data-integrity blast radius).

## How to apply

- For any pre-computed index/manifest, enumerate its writers and ask: *which
  mode deletes source data, and does that mode reconcile this index?* If a
  delete path shares a branch with an additive path, that's the bug.
- Prefer "regenerate from the live listing" over "merge a delta" for any index
  whose source can shrink — it's self-healing against deletions.
- Guard it from the workflow YAML itself (the `dataPipelineStoreSync` /
  `ciConfigGuard` pattern): parse the step, assert the destructive mode reaches
  the regenerate branch. A literal-string assertion would pin to today's text;
  parsing the real condition can't drift. See
  [[a-scope-rename-grep-proof-must-also-search-the-regex-escaped-slash-form]]
  for why workflow guards must be sourced from the parsed file.
- Forward fixes don't heal already-corrupted derived state — pair the code fix
  with a one-time remediation (a `rebuild`-mode run) to reconcile prod.

## Related

- R17 — every conditional in an automated workflow needs an explicit case for
  every value; the missing `prune` branch is exactly this, here with a
  data-integrity rather than a control-flow consequence.
- R9 — GCS-backed store sync; the "regenerate from listing" approach is the
  deletion-safe counterpart to additive merge.
