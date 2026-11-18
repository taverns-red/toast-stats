---
date: 2026-10-25
tier: lesson
category: lesson
summary: When a CDN file's zod contract is .strict(), adding an optional field is backward-compatible for new readers but breaks the readers already deployed, so the schema change must be released to prod before any pipeline run writes the field
tags: [schema, zod, data-pipeline, deploy-order, frontend, contracts]
---

# A strict CDN contract makes an additive field a breaking change for deployed readers

**Date:** 2026-10-25
**Issue:** #2296

## What happened

#2296 added an optional `officerTraining` field to every block of
`snapshots/{date}/region-rollups.json`. The writer and the reader changed in
the same PR, and every test passed. Review then caught the problem.
`RegionRollupsSchema` is `.strict()`, and the frontend running in prod was
built from the old schema. The first daily run after the merge would have
written the new key. Prod's `safeParse` would then have failed, and
`fetchCdnRegionRollups` would have returned null, so every region page would
have said "not published for this date". This would have lasted until someone
cut and deployed a release.

"Optional" only means a file without the key still parses (backward
compatibility). It says nothing about whether a reader that is already out
there accepts a file with the key (forward compatibility). A `.strict()`
schema does not.

Prod deploys only on a hand-approved release-please release. The pipeline
writes on its next daily run. So "merge" and "deployed" can be days apart.

## The takeaway

Before adding a field to a published file, check whether its deployed reader
rejects unknown keys (`.strict()`, or `additionalProperties: false`). If it
does, ship in this order:

1. A schema-only PR that accepts the field. Release it and confirm it is live
   in prod.
2. The writer.
3. Any consumers, and any backfill.

Pin both directions in tests: old files under the new schema, and files with
the new key under the reader you are about to ship. Non-strict readers, such as
the time series here, strip the key and are safe in either order.
