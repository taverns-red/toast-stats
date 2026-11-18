---
date: 2026-10-09
tier: lesson
summary: A store that is downloaded and re-uploaded with `-Z` depends on the download tool inflating Content-Encoding gzip; normalise on download, refuse gzip bytes on upload, never let `| tee` drop the exit code — and never accept an op-list or count comparison as proof the content is right: decode, parse and check what lands
tags: [ci, pipeline, gcs, silent-failure, data-integrity, verification, dry-run, cli-migration]
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

## Second takeaway: matching op lists is not evidence the content is right

#1649 (#1412) was verified. Its evidence table showed that `gsutil rsync -n`
and `gcloud storage rsync --dry-run` planned the same operations: 1564 = 1564
time-series objects, and the same for every other prefix. That check could
not have caught this bug:

- **A dry run transfers no bytes.** Decompressive transcoding, `-Z`, hashes
  and metadata belong to the transfer, not the plan. Neither tool reads
  `Content-Encoding` while it plans.
- **Copying into an empty directory plans every object.** For a download
  into an empty runner cache, 1564 = 1564 is true no matter how either tool
  compares files.
- **Equal path sets can still hold different bytes,** and that is exactly
  this failure.

Afterwards the runs stayed green for the same reason. The gates compared two
counters and one rankings file, and `compute` reported `succeeded: 94` while
it wrote 0 time-series points. Nothing ever read a time-series object back the
way the browser does.

**Rule:** a dry run, a plan diff or a count only shows that the same paths
were touched. It says nothing about what is in them. Before you call a
transfer change, tool swap, rebuild or promotion verified:

- Read what actually landed, through the reader's path. Run the real transfer
  into a temp dir, or `curl --compressed` the object the way the browser
  fetches it.
- **Decode it.** It must have no `1f 8b` magic left after the expected
  layers.
- **Parse it.** `jq empty`, or the Zod schema.
- **Check its shape.** The last data point is the expected date, and the
  point count went up, not just the file count.
- For a tool swap, run both tools for real into two directories and
  `cmp -r` them, starting from a **non-empty** destination as well as an
  empty one.

The dry-run lesson
(`a-dry-run-diff-between-two-clis-must-not-anchor-on-line-start.md`) makes the
plan comparison accurate. This lesson is about why an accurate plan comparison
still is not enough.

