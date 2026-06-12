# Sprint 4 (#1102) — #1175: prune skeleton sync (listings + metadata.json only)

## Problem

`[prune] Sync all data from GCS` (data-pipeline.yml:998) does a full-content
`gsutil -m rsync -r` of raw-csv/ + snapshots/. Post-#1147 the bucket no longer
fits on a GitHub runner (dry-run v2 died at 62 min: `No space left on device`).
Classification needs only: raw-csv date-dir SET + each date's metadata.json.

## Evidence from code reading

- `PruneService.classifyAll()` reads `cacheDir/raw-csv` dir names only;
  `classifyDate()` reads only `raw-csv/<date>/metadata.json`. CSV payloads and
  `cache/snapshots` contents are never read for classification.
- Destructive-prune local deletions use `fs.rm(..., force: true)` — absent
  snapshot payloads are harmless.
- Post-prune manifest steps (latest/dates/rankings/rank-history, snapshot
  index, club-index, divisions-areas) all read from GCS or fall back to GCS
  when the local cache is empty (rebuild mode already exercises this path).
- #1131 constraint: a metadata-less date dir must still be SEEN. GCS prefixes
  appear in `gsutil ls` iff ≥1 object exists, so materializing dirs from the
  listing preserves exactly the protection population.

## Design (thin-glue, Lesson 107)

1. **`scripts/lib/pruneSkeletonSync.ts`** (pure, unit-tested):
   - `datesFromGcsListing(lines)` — parse `gsutil ls gs://…/raw-csv/` output →
     sorted unique date-dir names; ignore non-date prefixes and bare files.
   - `planSkeletonDirs(rawListing, snapshotListing)` — fail-closed: throws if
     the raw-csv listing parses to zero dates (an empty listing on a populated
     bucket means the ls failed — proceeding would classify nothing and mask).
   - `RAW_CSV_METADATA_ONLY_EXCLUDE` — `gsutil rsync -x` Python-regex that
     excludes everything except `<date>` (bare dir path, so local traversal
     pruning can't skip the dir) and `<date>/metadata.json`.
2. **`scripts/prune-skeleton-sync.ts`** (runner): reads listing files, mkdirs
   all date dirs under `--cache-dir`, prints JSON summary to stdout (R4:
   logs → stderr). `--print-exclude-regex` prints the constant for the
   workflow's rsync overlay (one source of truth, no drift).
3. **PruneService contract test**: same fixture in full shape (CSV payloads
   present) vs skeleton shape (dirs + metadata.json only, incl. one
   metadata-less dir, empty snapshots dirs) → identical classifications.
   Pins "classification reads nothing the skeleton omits".
4. **Workflow**: replace step 1's two rsyncs with: `gsutil ls` raw + snapshots
   → skeleton script → `gsutil -m rsync -r -x "$(…--print-exclude-regex)"`
   metadata overlay. Report dir counts + `du -sh ./cache` (the <1GB AC).
   Revert prune from the 240-min timeout branch (line 99, undoes #1176's
   mitigation per AC "timeout can return to 30 min").

## Acceptance-criteria mapping

| AC                                 | How                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failing test first                 | new lib's tests red before implementation; PruneService skeleton-shape test is the named fixture test                                                                                                                        |
| listings+metadata only, <5 min     | 2 `gsutil ls` + 1 rsync over ~190 small objects                                                                                                                                                                              |
| dry-run report identical           | fixture equivalence test (full vs skeleton shape) + live local skeleton dry-run against staging in evidence; full-sync comparison run is physically impossible on runner (disk) — code-proof per AC wording "where testable" |
| timeout back to 30 min             | line-99 revert in same PR                                                                                                                                                                                                    |
| peak disk <1 GB (operator comment) | metadata.json ~1–2 KB × ~190 dirs ≪ 1 GB; du in step summary                                                                                                                                                                 |

## Risks

- `gsutil rsync -x` directory-traversal exclusion: regex must NOT match bare
  `<date>` dir paths or the dir gets pruned from traversal with metadata.json
  inside. Covered by unit tests on the constant.
- Workflow `if:` conditions untouched (Lesson 161 boolean-input trap — not in
  scope, already normalized via steps.mode outputs).
