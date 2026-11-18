---
date: 2026-11-02
tier: lesson
category: lesson
summary: Record a write-once copy of a published file after the last stage that rewrites it in place, not where it is first written
tags: [pipeline, collector, closing-period, reconciliation, data-integrity, gcs]
---

# Record a write-once copy after the last in-place rewrite

**Issue:** #2475 (month-end reconciliation revisions, phase 1)

## What happened

The design put the revision copy (`snapshots/<monthEnd>/revisions/<asOf>/`)
in `TransformService`'s closing branch, which is where `district_<id>.json` is
first written. But `process-dates.sh` rewrites those files in place twice
afterwards: the Find-A-Club merge (step 7) and, potentially, the carry-forward.
A copy taken in the transform would have been the unenriched file. The
revision would never be byte-identical to the month end published that day,
so "at rollover `snapshots/<monthEnd>/` equals `revisions/<final>/`" could
never hold. The transform also runs on an empty runner (R2), so it could see
neither staging's index nor the pre-close month end needed for revision 0.

The copy moved to a CLI step (`record-revision`) that runs after validate (9)
and before upload (10). It operates on the bytes about to be uploaded, with
the index and the prior month end hydrated from staging just before it.

## The transferable rule

Before you snapshot an artifact "as published", list every stage between its
first write and its upload that rewrites it in place (merge, enrich,
carry-forward, scrub). Take the copy after the last of them. Hydrate the
copy's state store from the bucket in that same step, and treat "absent"
(first run) differently from "unreadable" (record nothing), so that a fresh
index never overwrites the bucket's.
