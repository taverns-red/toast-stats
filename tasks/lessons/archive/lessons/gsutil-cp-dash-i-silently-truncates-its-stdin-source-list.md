---
date: 2026-08-31
tier: lesson
summary: '`gsutil cp -I` copies only the first two stdin sources and exits 0 — use `gcloud storage cp`'
tags: [gcs, gsutil, bash, ci, pipeline, silent-failure]
---

# `gsutil cp -I` silently truncates its stdin source list

## What happened

Two published indexes — `config/club-index.json` and
`config/divisions-areas-index.json` — covered **2 of 94 districts** for an
unknown period. Both were built by a pipeline step that listed source objects,
filtered them, and fed the survivors to `gsutil` on stdin:

```bash
gsutil ls "gs://$BUCKET/snapshots/$DATE/district_*.json" 2>/dev/null \
  | grep -v '_reports\.json$' > /tmp/srcs.txt || true
gsutil -m cp -I /tmp/src/ < /tmp/srcs.txt 2>/dev/null || true
```

The listing was correct — 94 lines. **`gsutil cp -I` consumed only the first
two source URLs, copied them, and exited 0.** Reproduced against the live
bucket with an 8-line list: 2 files landed, exit 0. With `-m` and all 94
sources it hung instead, which is arguably the better failure.

Districts sort `02, 03, 06, 101, …`, so production shipped exactly districts 02
and 03: `club-index` at 345 clubs of 14,355. `gcloud storage cp -I` given the
identical list delivers all 94.

## Why nobody noticed for weeks

Three suppressions on two lines: `2>/dev/null` discarded the error stream,
`|| true` discarded the exit code, and the consumer's
`catch { /* skip corrupt files */ }` would have eaten whatever survived. The
step then wrote a **well-formed, valid index** and printed
`Clubs indexed: 345` into every run summary. There was nothing to alert on —
no error, no exception, no malformed output. Just a smaller number that nobody
had a reason to distrust.

The user-visible symptom was three layers away: a club that genuinely moved
districts rendered "Club Not Found" on its old-district URL — defeating a fix
(#1445) that was itself correct, because the index it depended on did not know
the club existed.

## The takeaway

**Prefer `gcloud storage` over `gsutil` for anything reading sources from
stdin**, and never let a data-producing step discard both stderr and its exit
code. But the durable half is the guard, not the tool swap:

> A step that produces a *collection* cannot validate its own output by
> inspecting it — N items is always a plausible answer. It must compare N
> against an independently-derived expectation.

Here that expectation was free: the listing already knew there were 94 files.
Both builders now refuse to publish an index covering fewer files than the
listing found (`scripts/lib/syncCoverage.ts`). "More parsed than listed" is
allowed (a benign race with a concurrent write); fewer is the bug.

This is the same shape as the 2026 reformation read-layer defects
([[a-phantom-field-is-a-live-default-every-read-of-it-silently-becomes-the-fallback]]):
**the failure mode that costs weeks is the one that renders as a valid, smaller
truth.** Related: [[reserve-a-future-seam-with-a-tripwire-test-not-just-a-comment]]
— the comment saying "inline JS in YAML cannot import the shared matcher" was
accurate and stood for months while the code it guarded was untestable.

Issue #1469. See also #1412 (migrate the pipeline off `gsutil` to
`gcloud storage` before Google removes the bundled `gsutil`) — this is one more
reason to finish that migration rather than defer it.
