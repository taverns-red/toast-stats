---
date: 2026-10-11
tier: lesson
summary: Narrowing a pre-promotion gate to "what this run wrote" is only safe once promotion copies only that too; until then the gate must keep checking whatever else the copy step will carry, such as a held run's leftovers
tags: [data-pipeline, promotion-gate, content-gate, run-manifest, gcs, migration]
---

# A gate must cover what the copy step copies, not only what this run wrote

**Date:** 2026-10-11
**Issue:** #1762 (ADR-015 step 4, the run manifest)

## What happened

Step 4 says that the content gate should read every object in the run
manifest "instead of diffing and sampling the bucket". Promotion still
rsyncs four whole prefixes, though, and the scoped promote is step 5
(#1763). Suppose a held run leaves a corrupt object in staging. The next
run does not write that object, so it is not in that run's manifest. If
the gate read only the manifest, it would pass and the whole-prefix rsync
would ship the object to prod. The diff gate re-checks such an object on
every run until someone fixes it, and that guarantee would be lost without
anyone noticing.

The gate now does both. It reads every manifest object, with no sampling
and a hash check. The changed objects that are not in the manifest still
get the old bounded sample. Step 5 can drop that part once promotion copies
only the manifest.

## Takeaway

- The scope of a gate is set by what the copy step after it will move, not
  by what the current run produced. Narrow the gate only in the same change
  that narrows the copy, or after it.
- When a migration plan orders "gate reads X" before "copy moves only X",
  keep the old coverage for everything outside X until the copy step lands,
  and write a test that pins it. Here that test is a held run's leftover
  outside the manifest that still causes a HOLD.
