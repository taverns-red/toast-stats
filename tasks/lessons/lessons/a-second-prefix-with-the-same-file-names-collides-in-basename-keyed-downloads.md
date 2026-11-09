---
date: 2026-11-09
tier: lesson
summary: Adding a second prefix whose files share names with an existing one collides wherever a downloader keys by basename
tags: [data-pipeline, promotion, derived]
---

# A second prefix with the same file names collides in basename-keyed downloads

**Issue:** #2591 (education timeline, epic #2590)

## What happened
The first cut of the education timeline published one object per program year,
`derived/education-timeline/<PY>.json`, next to `derived/education-rollup/<PY>.json`, so
`2026-2027.json` existed in both prefixes. The report-sidecar planner downloaded every object
the rollup index names into one directory and hashed `path.basename(p)`, so the timeline would
have overwritten the rollup year (or the reverse) and been hashed from the wrong bytes. The gate
and the promoter key by full path and were fine; only the plan's scratch directory collided.
The planner now downloads into one directory per source directory, which also holds for the
published per-entity layout (`<PY>/world.json`, `<PY>/district-<id>.json`).

## Takeaway
When a new artifact family reuses an existing family's file names, grep for `basename` in
every step that downloads or hashes a mixed list, and download into one directory per source
directory. The shim test stages different bytes under colliding names in both prefixes
(`educationTimelinePromotion.test.ts`).
