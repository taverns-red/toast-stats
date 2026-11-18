---
date: 2026-10-21
tier: lesson
category: lesson
summary: When a re-derivation can record an entity as absent, an upload-only publish keeps the entity's old objects; the run must remove them and record the removal for promotion
tags: [data-pipeline, promotion, snapshots, silent-failure, run-manifest]
---

# An additive publish keeps what the run now records as absent

**Date:** 2026-10-21
**Issue:** #2232 (follow-up to #2038, #2070, #1671)

## What happened

Since #2036 a rebuild records a #1671 gap district (TI's HTML error page as
the club report) in `metadata.json` as failed, and writes no files for it.
But the rebuild uploads only the files it wrote, and scoped promotion copies
only the run manifest. Neither path ever removes anything. So district U's
`district_U.json` and 0-member analytics from an earlier build stayed on four
June-30 dates, in staging and in prod. The date's own metadata said U failed,
and a 0 was still being served next to it. Every gate passed, because the
gates read what the run wrote, and the stale files were not among them.

## The takeaway

If a re-derivation can conclude "this entity is not here for this date", an
add-only publish cannot express that conclusion. The run has to remove the
entity's old objects. A one-off prune (#2038) cleans up what has already gone
wrong, but it does not stop the next build from leaving stale objects behind.

Derive the downstream removal from state, not from a log of what this run
removed. The first fix (PR #2233, first version) carried staging removals to
prod through a per-run `removed.jsonl`. Review found that a held date, a
failed copy, a re-run, or a `skip_promotion` proof followed by a promote
would each lose the removal for good. Deriving it at promote time from the
date's own metadata, plus what staging lacks, converges on every one of those
paths.

Scope it narrowly:
- only the reason that proves absence (the #1671 gap), not every failure;
- only the objects the re-derivation itself produces, never a sibling
  dataset it cannot regenerate (the reports sidecar holds real TI data);
- only while the target's copy is provably junk (0 clubs), so a gate
  override can never turn it into a deletion of real data.
