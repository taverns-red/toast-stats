---
date: 2026-06-11
tier: lesson
summary: The same authority verdict can clear a reversible action but not an irreversible one: scale fail-closed thresholds to reversibility
tags: [data-pipeline, gcs, collector-cli, verification, process]
legacy_id: "161"
---

# Lesson 161 — The same authority verdict can clear a reversible action but not an irreversible one: scale fail-closed thresholds to reversibility

**Date:** 2026-06-11
**Issue:** #1131 (epic #1102 Sprint 1 — prune protects metadata-less dates)
**PR:** _(record on merge)_

## What happened

The sprint reused the #1129 fail-closed authority chain (metadata.json →
registry) to protect metadata-less raw-csv dates from prune. The subtlety:
for the live `raw-csv/2026-02-13`, the registry's verdict is a decided
**non-closing** (the #1128-corrected registry says 2026-01 closed on
2026-02-05) — and for the rebuild's _publish_ decision, that verdict is
sufficient to act under the raw date. Mirroring that rule in prune would
have **deleted** the dir the sprint existed to protect.

The resolution wasn't a different authority — it was a different
_threshold_: publish-under-raw-date is correctable (re-publish, remap,
re-scrape), deletion is not. So prune's rule became "no metadata.json →
never deletable", with the registry only refining the reason/remap, while
the rebuild keeps acting on the registry's non-closing verdict.

The live-listing dry-run then showed the issue's stated blast radius was a
~110× lower bound: 112 of 191 staging raw-csv dates lack metadata.json —
including the entire restored 2017–2021 closing archive (rescrape-historical
wrote no metadata.json for them). A prune run on main would have deleted
110 dirs, not 1.

## The transferable principle

**When one authority chain feeds multiple consumers, each consumer's
fail-closed threshold must scale to the reversibility of ITS action — a
verdict strong enough to publish under is not automatically strong enough to
delete under.** And before shipping any destructive-path change, dry-run
against the live listing: an issue's named victim is a lower bound, because
the same gap (here: metadata-less dirs) usually has a population, not an
instance.

## How to apply

- For each consumer of a shared verdict (publish / promote / delete /
  overwrite), ask "what does it cost to be wrong here, and can we undo it?"
  — and let the irreversible consumers demand strictly more proof.
- A dry-run mode that reports per-item decisions (`classifications` with
  `keep` + `reason`) is what makes the live-listing audit cheap; build it
  before the destructive path, not after.
- A skeleton cache (dir names + metadata only, no payloads) is enough to
  drive a real classification dry-run against a live bucket listing in
  seconds.

## Related

- [[158-a-fail-closed-chain-is-only-as-honest-as-its-writers-a-persisted-default-reads-as-a-decision]]
  — the chain this sprint reused; its writer-side hole is why metadata-less
  populations exist at all.
- [[154-synthetic-fixtures-validate-the-code-only-a-captured-real-pair-validates-the-policy]]
  — the live-data discipline the staging dry-run applied to a destructive
  path.
- `packages/collector-cli/src/services/PruneService.ts`
  (`classifyMetadataLessDate`), `scripts/lib/pruneGcsDeletions.ts`.
