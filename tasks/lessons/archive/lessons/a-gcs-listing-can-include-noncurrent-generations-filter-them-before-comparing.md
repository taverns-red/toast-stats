---
date: 2026-10-10
tier: lesson
summary: '`gcloud storage objects list` on the prod bucket returns noncurrent generations next to the live object (marked by `noncurrent_time`), so any listing-keyed comparison must drop them or it compares a stale hash'
tags: [gcs, gcloud, data-pipeline, promotion-gate, listing, fixtures]
---

# A GCS listing can include noncurrent generations; filter them before comparing

**Date:** 2026-10-10
**Issue:** #1730 (plan E2-4, value gate fetches only hash-differing dates)

## What happened

The value gate now skips dates whose `all-districts-rankings.json` has the
same stored hash in staging and prod. Recording the real
`gcloud storage objects list "gs://…/snapshots/*/all-districts-rankings.json" --format=json`
output before writing the parser showed that the prod listing had 321
entries for 206 dates. 115 names appeared twice: the live object and a
noncurrent generation with a different hash, marked by `noncurrent_time`.
Prod has versioning off today, but generations made while it was on are
still listed. A parser keyed on `name` alone would have kept whichever
entry came last, and could have compared a stale hash.

The hash keys are also `crc32c_hash` / `md5_hash`, not the JSON-API
`crc32c` / `md5Hash` that the Node SDK returns.

## Takeaway

- Before comparing listings by name, drop entries with `noncurrent_time`
  (or `soft_delete_time`). If a name still appears more than once, treat it
  as ambiguous and take the safe path.
- Record the exact listing call once, read-only, and keep it as the test
  fixture (`packages/collector-cli/src/services/__tests__/fixtures/gcs-objects-list/`).
  The duplicate generations only show up in the recording. A fixture written
  by hand would not have them.
