---
date: 2026-08-02
tier: lesson
summary: A writer that only inspects responses cannot tell "wrote" from "wrote where nothing reads" — verify by reading back from the destination, and never through the write-through cache the writer itself populated
tags: [gcs, storage, backfill, collector, verification, silent-failure, caching, cli]
---

# A write-through cache cannot verify its own write

**Date:** 2026-08-02
**Issue:** #1388 (`--gcs-prefix ''` wrote to a double-slash key prefix)
**Related:** #1342, #1384 — same class, the correct-looking wrong thing

## What happened

An operator-approved ingest of 2026-07-26 → 07-29 ran `collector-cli backfill
--gcs-prefix ''` and reported:

```
[DONE] Backfill complete — requests=1132 emptySkipped=0 mismatches=0 errors=0
```

Exit 0. No error lines. Every footer assertion — the #1384 period guard, the
as-of-date guard, the empty-CSV skip — passed, because they were all correct:
1132 genuinely correct fetches of genuinely correct data.

Every object went to `gs://toast-stats-data-staging//raw-csv/2026-07-26/…`.

The composition was `${prefix}/raw-csv/${date}/…`. An empty prefix makes that
key start with `/`, and `gs://bucket/` + `/raw-csv` is `gs://bucket//raw-csv` —
an empty path *segment*. GCS keys are opaque strings, so `//` is perfectly
legal: it created a silent parallel key space that nothing in the pipeline
reads. It was caught only because the verification step happened to read the
**real** `raw-csv/` path and found June's data still sitting there.

## Two things had to be missing for this to be invisible

**1. The run never named its destination.** Not one log line, at any verbosity,
contained the string it was writing to. The `[INFO] Using GCS storage:` line
interpolated the *raw* prefix (`gs://bucket//`) but only under `--gcs-bucket`,
and no one reads a slash. There was nothing to compare against intent.

**2. Every gate inspected the response, none inspected the destination.** The
guards ask "is this the CSV I asked for?" — a question about the *fetch*. No
guard asked "is the object I just wrote there?" That question is the only one
that can distinguish a good run from a run that wrote perfect data into a void.

## The trap in fixing #2

The obvious read-back is `storage.exists(key)`. In this codebase that is
worthless, and subtly so: `GcsBackfillStorage.warmCache()` pre-lists the bucket
into a `Set` for O(1) resume checks, and `write()` **adds to that set**. So
`exists()` after a write always answers yes — it re-reads the writer's own
optimism, not the bucket. A read-back through it would have passed the whole
incident.

Verification needs a path that bypasses every cache the writer touched
(`existsFresh()`, going to `file.exists()`). If your verifier can be satisfied
by state the writer wrote locally, it is not a verifier.

## The transferable takeaway

**A write is only verified by a read that goes through the same door a reader
uses.** Everything short of that — a 200, a happy summary line, a
write-through cache lookup — confirms only that the writer believed itself.

Three cheap habits that would each have caught this independently:

- **Print the fully-qualified destination before writing anything.** Composed,
  not the raw flag. It costs one line and turns an invisible mistake into an
  obvious one.
- **Read back a sample per unit of work, from the store, uncached.**
- **Make the read-back a non-zero exit, not a warning.** A warning is exactly
  what an operator scrolls past on the way to `errors=0`.

And a corollary about defaults: `--gcs-prefix` defaulted to `'backfill'`, so
*omitting* the flag also wrote where nothing reads. A default destination that
no reader consumes is the same bug already loaded into the chamber — that is
why the operator had to pass `''` at all.
