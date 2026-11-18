---
date: 2026-10-17
tier: lesson
category: lesson
summary: Normalising an id at write time leaves a persisted store keyed the old way; normalise when the store is loaded too
tags: [data-pipeline, club-trends, club-id, gcs-store]
---

# A key normalisation must also run where a persisted store is loaded

**Date:** 2026-10-17
**Issue:** #2100 (found in the S2 drift investigation)

#1447 made the transform emit canonical club ids, but the GCS-backed
club-trends store (R9) is read, upserted and written back each run. Every
pre-#1447 key (`00000180`) survived next to the new canonical one (`180`),
because nothing ever re-read the old keys. Two months later the D61 PY
2017-2018 store held 412 keys for 206 clubs (878,684 bytes; 438,818 after
the merge). `topGrowthClubs` iterates every store entry, so a club could be
listed twice.

**Takeaway:** when you change the form of a key in an accumulating store,
the change is not done at the write site. Fold the old form into the new one
in the store's `load` (with a recorded old-shape fixture as the red test),
and the next ordinary publish writes a clean store. No separate migration
or bucket rewrite is needed.
