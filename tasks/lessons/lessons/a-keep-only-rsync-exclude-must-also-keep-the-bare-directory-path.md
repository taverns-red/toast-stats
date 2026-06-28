---
date: 2026-06-12
tier: lesson
summary: A "keep only X" rsync exclude must also keep the bare directory path, or traversal prunes the parent before X is ever compared
tags: [gcs, ci, data-pipeline, verification, regex]
legacy_id: "162"
---

# Lesson 162 — A "keep only X" rsync exclude must also keep the bare directory path, or traversal prunes the parent before X is ever compared

**Date:** 2026-06-12
**Issue:** #1175 (epic #1102 Sprint 4 — prune skeleton sync)
**PR:** _(record on merge)_

## What happened

The prune sync was narrowed from a full-content `gsutil -m rsync -r` (which
outgrew the runner's disk post-#1147) to a skeleton: materialize every date
dir from `gsutil ls`, then overlay only `<date>/metadata.json` via
`rsync -x <exclude>`. The natural exclude — "everything that isn't
`<date>/metadata.json`" (`^(?!\d{4}-\d{2}-\d{2}/metadata\.json$).*`) — has a
trap: gsutil matches the pattern against paths relative to the source URL,
and **a pattern that matches a DIRECTORY path excludes that directory from
traversal entirely**. The bare path `2026-02-13` doesn't look like
`<date>/metadata.json`, so the naive exclude matches it, the walker skips the
dir, and the metadata.json inside is never even compared — the overlay
silently syncs nothing while exiting 0.

The shipped pattern keeps both the file AND its parent dir:
`^(?!\d{4}-\d{2}-\d{2}(/metadata\.json)?$).*`. Three layers of proof: unit
tests on the constant (including the bare-dir case), a python3 `re` canary
(gsutil's actual engine), and a live staging run that overlaid exactly 79
metadata.json files with **zero** payload files downloaded (1.5 MB total for
a bucket that no longer fits a runner disk).

## The transferable principle

**Any allowlist expressed as an exclusion regex over hierarchical paths must
allowlist every ancestor of the kept leaf, not just the leaf — a tool that
prunes traversal on directory matches turns "exclude everything but X" into
"exclude X's parent, therefore X", and the failure is a silent, successful-
looking no-op.** Test the constant against the bare ancestor paths, in the
regex dialect the tool actually uses, and verify on the live tree by counting
what DID transfer (kept-file count > 0, excluded-file count == 0) — exit code
and "no errors" prove nothing about an overlay that skipped everything.

## How to apply

- Writing an `-x`/`--exclude` for rsync/gsutil/robocopy-style tools: for each
  kept path `a/b/c`, the pattern must also keep `a` and `a/b`.
- Pin the pattern as an exported, unit-tested constant; have the
  runner/workflow print it from the lib (`--print-exclude-regex`) instead of
  hand-copying it into YAML.
- Cross-engine regexes (JS test, Python execution) get a one-off canary in
  the target engine before shipping.
- Verify the live result by positive AND negative counts: files overlaid ==
  listing-derived expectation; non-matching files transferred == 0.

## Related

- [[161-scale-fail-closed-thresholds-to-the-actions-reversibility]] — the
  skeleton-cache dry-run discipline this sprint reused for live verification.
- `scripts/lib/pruneSkeletonSync.ts` (`RAW_CSV_METADATA_ONLY_EXCLUDE`),
  `scripts/prune-skeleton-sync.ts`, data-pipeline.yml prune Step 1.
