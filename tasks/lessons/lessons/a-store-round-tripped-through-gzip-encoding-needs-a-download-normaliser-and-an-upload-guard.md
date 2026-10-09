---
date: 2026-10-09
tier: lesson
summary: A store that is downloaded and re-uploaded with `-Z` depends on the download tool inflating Content-Encoding gzip; normalise on download, refuse gzip bytes on upload, and never let `| tee` drop the exit code
tags: [ci, pipeline, gcs, silent-failure, data-integrity]
---

# A store round-tripped through gzip encoding needs a download normaliser and an upload guard

**Date:** 2026-10-09
**Issue:** #1702 (caused by #1412 / #1649)

## What happened

The time-series store is uploaded with `gcloud storage cp -Z`, so GCS holds it
as `Content-Encoding: gzip`. `gsutil rsync` inflated those objects on download.
`gcloud storage rsync` on the runner's SDK (~588) did not. Swapping one for the
other was a one-line CLI migration, and every run after it went like this:

1. `compute-analytics` could not parse any index. It logged the error and
   carried on, and `| tee` without `pipefail` threw away the exit code, so
   the step stayed green.
2. The untouched gzip bytes went back up through `cp -Z`, which added one more
   layer. That was about 10 layers per object after three days. Trends froze.

## The takeaway

When a pipeline downloads a store, edits it and re-uploads it with an encoding
flag, it relies on the download tool's decode behaviour. That behaviour can
change between versions and platforms. Do not rely on it:

- **Normalise right after download.** Peel every layer on disk and require
  the file to parse. Fixing only the reader is not enough: files the run does
  not rewrite go straight back up.
- **Guard right before the encoding upload.** If the bytes on disk are already
  encoded, fail loudly.
- **Make a store read failure fatal.** "Log and continue" plus `| tee` gives a
  green run that corrupts its own input.

`scripts/store-encoding.ts` (`normalize` / `check`) and the guard test
`scripts/lib/__tests__/dataPipelineStoreEncoding.test.ts` encode this.
