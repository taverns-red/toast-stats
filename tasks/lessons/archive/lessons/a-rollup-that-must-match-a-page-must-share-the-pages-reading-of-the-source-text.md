---
date: 2026-10-16
tier: lesson
summary: When a pipeline rollup sums figures a page already derives from free text, move the page's parser into the shared package and have both call it, or the region total and the district pages it sums drift apart
tags: [data-pipeline, analytics, shared-contracts, frontend, reports, transformation]
---

# A rollup that must match a page must share the page's reading of the source text

**Date:** 2026-10-16
**Issue:** #2012 (the remainder of #1799)

## What happened

The reports rollups (`snapshots/<date>/reports-rollups.json`) count prospective
clubs by stage, dues-renewal state and sponsors/mentors from the daily-reports
sidecars. Those cells are free text (`#1 Application to Organize Complete -
04/15/2025Payment Complete - …`, `Verified complete - 08/03/2026`,
`MENTORU`). The frontend already read them in `clubGrowthFunnel.ts` and
`clubCompliance.ts`, with rules that are not obvious from the text: a
verification counts only inside the period's window (the report keeps last
period's), April is "not yet due" before 1 January, and a `U` suffix is the same
role. The two frontend files didn't even agree with each other: one date parser
took one- or two-digit parts, the other two digits only.

A pipeline copy of those rules would have been a third copy. The first time TI
changed a string, a region total would stop equalling the sum of the district
pages under it, and nothing would flag it.

## The principle

When a derived aggregate has to reconcile with a view that already interprets
the same source, the interpretation is shared code, not a convention. Move it to
the package both sides import (here `shared-contracts/src/reports/`), and point
the existing callers at it in the same PR. The existing view tests then become
the parity proof.

## How to apply

- Before writing a parser for a pipeline rollup, grep the frontend for the
  source's vocabulary (a sample string from the recorded fixture works well).
- If a parser exists there, move it and re-export it from its old module, so
  importers and tests don't change.
- Keep the aggregate's own tests computing expected values independently (jq
  over the recorded bytes). Shared code makes the two sides agree; it does not
  make either of them right.
