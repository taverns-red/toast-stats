---
date: 2026-10-12
tier: lesson
summary: A gzip byte budget depends on the zlib build that compresses; measure near the line with CI's Node (npx -p node@<.nvmrc>), not the local one
tags: [performance, bundle-budget, ci, gzip, verification, map]
---

# A gzip byte budget must be measured with the CI runtime's zlib

**Date:** 2026-10-12
**Issue:** #1784 (district club map, map-route budget from ADR-016)

## What happened

The map-route budget is 307,200 B of gzip. Locally the route measured
306,888 B and passed. CI failed it at 308,311 B. The extra 1.4 KB did not
come from different code. The MapLibre worker is copied into the build
unchanged, and it alone grew from 144,069 B to 144,769 B.

## Why

`check-map-route-budget` gzips with Node's `zlib`. Local Node 25 ships zlib
1.2.12, and CI's `.nvmrc` Node 22.23.1 ships zlib 1.3.1. The same bytes
compress about 0.5% differently, and on a 300 KB budget that is about
1.4 KB.

## Takeaway

Near a gzip budget line, measure with the runtime CI uses:

```bash
npx -y -p node@$(cat .nvmrc) node --import tsx scripts/check-map-route-budget.ts
```

This reproduced CI's numbers exactly, including the worker's 144,769 B.
Leave margin for the next change, because shared chunks such as the
district header count against every map route.
