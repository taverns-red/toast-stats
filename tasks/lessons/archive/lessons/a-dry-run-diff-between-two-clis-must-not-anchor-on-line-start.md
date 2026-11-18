---
date: 2026-10-06
tier: lesson
summary: When proving two CLIs plan the same operations by diffing their dry-run output, match the operation marker anywhere in the line — progress meters share stderr and a `^Would` anchor silently drops lines, faking a mismatch (or hiding one)
tags: [gcs, data-pipeline, verification, cli-migration, dry-run]
---

# A dry-run diff between two CLIs must not anchor on line start

**Issue:** #1412 (gsutil rsync → gcloud storage rsync)

## What happened

To prove the promotion rsync was a no-op under `gcloud storage rsync`, both
tools were dry-run staging → prod and their `Would copy …` lines diffed.
The first pass showed gsutil planning 93 snapshot copies and gcloud 94 — a
"gcloud copies one extra object" finding that looked like a real semantic
difference. A rerun showed 93 again, but missing a *different* object.

The cause was the harness, not the tools: gsutil's `[0/94 files]` progress
meter writes to the same stream without a newline, so one `Would copy` line
lands mid-line and `grep '^Would'` drops it. Matching `Would copy .*`
anywhere gave 94/94, identical.

Separately: gsutil `rsync -n` is a dry run, gcloud `rsync -n` is
`--no-clobber` — a flag that *writes*. Never port `-n` mechanically; the
workflow guard now forbids it on `gcloud storage rsync`.

## The transferable principle

**An equivalence diff is only as good as its extraction step.** Before
trusting a mismatch (or a match) between two tools' outputs, check that the
parser captured every operation line — compare the raw substring count
(`grep -o 'Would copy' | wc -l`) to the parsed count. A nondeterministic
"difference" that moves between runs is a parser bug until proven otherwise.

## How to apply

- Extract with an unanchored match (`grep -oE 'Would (copy|delete) .*'`).
- Cross-check parsed counts against raw substring counts.
- Read the second tool's flag reference for every short flag you carry over:
  identical letters can mean opposite things.
