---
date: 2026-10-17
tier: lesson
category: lesson
summary: A new subdirectory under snapshots/<date>/ is not uploaded by the per-date `*.json` globs, and process-dates.sh discards it on purpose (`./*/*) ;;`), so a writer that lands files there needs an upload line at every upload site
tags: [data-pipeline, gcs, run-manifest, silent-failure, snapshots]
---

# A new snapshot subdirectory is silently dropped by every flat upload glob

**Date:** 2026-10-17
**Issue:** #1800 (epic #1781)

## What happened

The per-region club shards are written to `snapshots/<date>/clubs-by-region/`.
Earlier date-level artifacts sit flat in `snapshots/<date>/`, where
compute-analytics only has to write the file: the daily upload's
`snapshots/${SNAPSHOT_DATE}/*.json` and process-dates.sh's top-level bucket
pick it up and record it in the run manifest. That is no longer true once the
artifact is in a subdirectory:

- the daily step's `"./cache/snapshots/${SNAPSHOT_DATE}"/*.json` does not
  recurse, so it never sees `clubs-by-region/*.json`;
- `upload_snapshot` in process-dates.sh sorts files into `top` and
  `analytics`, and its `./*/*) ;;` arm throws away every other nested path.

Writer tests, the schema, the content gate and promotion classification would
all have passed. The files would only have existed on the runner: absent from
staging, from the run manifest and from every gate. That is the "visible by
absence only" failure ADR-015 P5 exists to prevent.

## Takeaway

Before writing a new artifact into a new directory, list every upload site
for its parent prefix (`grep -n 'analytics/' .github/workflows/*.yml
scripts/pipeline/*.sh`) and add a line at each one. Then pin each line with a
test that reads the uploaded object back from the shim bucket and the run
manifest (`processDates.test.ts`), not with a test of the writer alone.
