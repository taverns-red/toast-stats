# Data Pipeline Flow — Toast Stats

**Last updated:** October 11, 2026

Complete data flow from Toastmasters dashboard scraping through GCS to Cloud CDN to the frontend SPA.

---

## Pipeline Order of Operations

```
1. Scrape        → raw-csv/{date}/district-{id}/*.csv
2. Sync stores   ← time-series/, club-trends/, club-race/ from GCS
3. Transform     → snapshots/{date}/district_{id}.json + manifest + rankings
4. Compute       → snapshots/{date}/analytics/district_{id}_{type}.json (10 types)
                   + updates time-series + club-trends + club-race stores
5. Upload        → GCS (raw-csv, snapshots, analytics, stores)
6. CDN manifests → v1/latest.json, v1/dates.json, v1/rankings.json
```

### Pipeline Modes

| Mode                  | Trigger                       | Behavior                                             |
| --------------------- | ----------------------------- | ---------------------------------------------------- |
| `daily`               | Scheduled (08:00 + 11:00 UTC) | Scrapes today's data, processes single date          |
| `rebuild`             | Manual dispatch               | Re-processes specific dates from existing raw-csv    |
| `rescrape`            | Manual dispatch               | Re-downloads CSVs for specific dates, then processes |
| `rescrape-historical` | Manual dispatch               | Re-downloads ALL historical CSVs, then rebuilds      |
| `prune`               | Manual + quarterly cron       | Reduces to one snapshot per month per program year   |

**Every mode writes to the staging bucket first.** A run never mutates production directly —
processed data is promoted staging → prod only after passing both promotion gates (see
[Staging → Production Promotion](#staging--production-promotion)).

---

## GCS Bucket Structure

There are **two** buckets with identical internal layout:

- **`gs://toast-stats-data-staging/`** (`GCS_BUCKET`) — every pipeline run writes here first.
- **`gs://toast-stats-data-ca/`** (`GCS_BUCKET_PRODUCTION`) — the CDN origin; written **only** by
  the gated promotion step. `raw-csv/` is staging-only (promotion never syncs it).

```
toast-stats-data-{staging|ca}/
├── raw-csv/{YYYY-MM-DD}/                  # Input: raw CSV from Toastmasters (staging only)
│   ├── all-districts.csv                  # All-districts summary
│   ├── district-{id}/                     # Per-district CSVs
│   │   ├── club-performance.csv
│   │   ├── division-performance.csv
│   │   └── district-performance.csv
│   └── metadata.json                      # isClosingPeriod, dataMonth, programYear
│
├── snapshots/{YYYY-MM-DD}/                # Processed snapshots
│   ├── district_{id}.json                 # Per-district snapshot
│   ├── metadata.json                      # Snapshot metadata
│   ├── manifest.json                      # District registry + checksums
│   ├── all-districts-rankings.json        # Cross-district rankings
│   ├── global-club-race.json              # Worldwide race projection of club-race/ (#1556)
│   └── analytics/                         # Pre-computed analytics
│       ├── district_{id}_analytics.json
│       ├── district_{id}_membership.json
│       ├── district_{id}_clubhealth.json
│       ├── district_{id}_membership-analytics.json
│       ├── district_{id}_vulnerable-clubs.json
│       ├── district_{id}_leadership-insights.json
│       ├── district_{id}_distinguished-analytics.json
│       ├── district_{id}_year-over-year.json
│       ├── district_{id}_performance-targets.json
│       └── district_{id}_club-trends-index.json
│
├── time-series/district_{id}/             # Incremental time-series (per district)
│   ├── index-metadata.json
│   └── {YYYY}-{YYYY}.json                # One file per program year
│
├── club-trends/{YYYY-YYYY}/              # INTERNAL: incremental club trends (per PY)
│   └── district_{id}.json                # All clubs for that district
│
├── club-race/{YYYY-YYYY}/                # INTERNAL: crossing-date store (#1556, per PY)
│   └── first-reached.json                # First snapshot date each club met each tier
│
├── district-awards-history.json           # INTERNAL: year-end summaries (#333; staging only, D4)
│
├── v1/                                    # CDN manifests (short TTL)
│   ├── latest.json                        # Latest snapshot date (5 min cache)
│   ├── dates.json                         # All available dates (15 min cache)
│   └── rankings.json                      # Global rankings (5 min cache)
│
└── metrics/deploys/                       # DORA deploy metrics
    └── {YYYY-MM-DD}_{HHMMSS}.json
```

---

## Store Contract (per prefix)

One row per prefix (#1741, plan P3-4). Every pipeline write goes to **staging**. "Promoted" means
the gated `Promote staging to production` step rsyncs the prefix to prod (`PROMOTED_PREFIXES` in
`scripts/lib/promotionContentGate.ts`, kept equal to the rsync calls by a workflow contract test).
"Internal" means the prefix stays in staging.

**Encoding at rest:**

- **`-Z` JSON** is stored `Content-Encoding: gzip` and is served decompressed to browsers.
- **Plain** is uploaded without `-Z`.

**Store gates:**

- **Store sync** is `scripts/pipeline/sync-stores.sh`. It lists the prefix and fails closed on any error except an empty first run. It then requires the local file count to be at least the listed count, and peels gzip layers until the file is JSON (#1722, #1702).
- **Store publish** is `scripts/pipeline/publish-stores.sh`. It refuses a store that was never synced, runs the double-encoding check before any push, and fails on any transfer error.

| Prefix                                                                                                                                               | Encoding at rest                                                                                              | Writers                                                                                                                                                                | Readers                                                                                                                | Idempotency                                                                                                                                                                                                         | Rebuild rule                                                                                                                                                                                                      | Covering gate                                                                                                                                                  | Promoted or internal                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `raw-csv/{date}/`                                                                                                                                    | Plain CSV plus `metadata.json` (`rsync`, no `-Z`)                                                             | Daily, rescrape and rescrape-historical uploads. The operator fixes `metadata.json` by hand (staging only).                                                            | Rebuild and rescrape transform (synced down, R2); prune skeleton sync                                                  | Re-scraping a date overwrites its files                                                                                                                                                                             | Source of truth for every rebuild; prune keeps month-ends only                                                                                                                                                    | Prune scope guard `assertPruneDeletionScope` (#1132); closing-period detection                                                                                 | Internal (never promoted)                                                                                               |
| `snapshots/{date}/` (district, rankings, manifest, `global-totals`, `global-club-race`, `competitive-awards`, `district_{id}_reports`, `analytics/`) | `-Z` JSON, `max-age=3600, must-revalidate`                                                                    | Every mode's per-date upload; the backfill global-totals step; the reports job (stages under `incoming/`, places here)                                                 | Frontend; MCP server; pipeline (previous-year compare, CDN manifests, indexes, rank-history, value gate)               | Re-deriving a date overwrites its files. The date set only grows except under prune.                                                                                                                                | Re-derived from `raw-csv/` by rebuild. To force a clean rebuild, delete the staging date first.                                                                                                                   | Upload guard (closing overwrite, exit 3); `validate-snapshots.ts` (daily); count gate (#316); value gate (#1034); content gate (#1715)                         | Promoted (additive rsync). The reports job also copies its files to prod directly, but only when the same run promoted. |
| `time-series/district_{id}/` (`index-metadata.json`, `{PY}.json`)                                                                                    | `-Z` JSON, `max-age=3600`, `x-goog-meta-sha256` = sha256 of the uncompressed JSON (E2-1, #1731)               | `compute-analytics` (`TimeSeriesIndexWriter`), published by store publish in every mode; uploaded only when the sha differs                                            | Frontend Trends (`cdnTimeSeries.ts`); MCP server; CDN schema canary                                                    | Upsert by date (a re-run replaces that date's point); points kept sorted                                                                                                                                            | Accumulates. Rebuilding a date adds or replaces one point. To reset, delete the staging file first.                                                                                                               | Store sync and store publish; content gate (schema, plus last-point regression against prod); CDN schema canary (#1710)                                        | Promoted. Unchanged objects keep their generation, so promotion skips them.                                             |
| `club-trends/{PY}/district_{id}.json`                                                                                                                | Plain JSON (`rsync`, no `-Z`, no CDN headers)                                                                 | `compute-analytics` (`ClubTrendsStore`), published by store publish in every mode                                                                                      | `compute-analytics` only. The frontend reads the per-snapshot `club-trends-index` projection.                          | Upsert by date. Identity fields (name, division, area, base) come from the **latest** date. Clubs are saved in sorted key order. The same set of dates gives byte-identical output in any processing order (#1741). | Accumulates; a rebuild may walk dates in any order. Daily pulls only the resolved PY (E2-2).                                                                                                                      | Store sync and store publish                                                                                                                                   | **Internal** (E2-5, D3, #1738). Stale prod copies are left in place.                                                    |
| `club-race/{PY}/first-reached.json`                                                                                                                  | Plain JSON (`rsync`, no `-Z`)                                                                                 | `compute-analytics` (`ClubRaceStore`), published by store publish in every mode                                                                                        | `compute-analytics` only. The frontend reads the `snapshots/{date}/global-club-race.json` projection.                  | Keeps the **earlier** of the stored and observed crossing date, so any order gives the same result                                                                                                                  | Accumulates. **Never reset**: it is the only place a daily crossing date survives prune.                                                                                                                          | Store sync and store publish                                                                                                                                   | **Internal** (E2-5, D3, #1738). Stale prod copies are left in place.                                                    |
| `district-awards-history.json`                                                                                                                       | Plain JSON (`cp`, no `-Z`)                                                                                    | `compute-analytics` (`DistrictAwardsHistoryStore`), published by store publish in every mode                                                                           | `compute-analytics` only. It derives `snapshots/{date}/competitive-awards.json`.                                       | Upsert per district and program year; entries sorted by PY                                                                                                                                                          | Accumulates. Rebuilding a past snapshot upserts that year; later years already stored are ignored when scoring it (#1609).                                                                                        | Store sync (it runs `pull-awards-history.sh`, which reads before syncing (#1704), then normalises)                                                             | **Internal, staging only** (D4). No reader needs it in prod.                                                            |
| `v1/latest.json`, `v1/dates.json`, `v1/rankings.json`, `v1/global-history.json`                                                                      | Plain JSON. `max-age=300` (`dates.json`: `max-age=900`)                                                       | CDN manifests and global-history steps, every run except a prune dry-run and `backfill-global-totals`                                                                  | Frontend; MCP server; pipeline (rebuild source, closing-date registry)                                                 | Rewritten whole each run from the staging `snapshots/` listing                                                                                                                                                      | Derived from `snapshots/`; nothing to reset                                                                                                                                                                       | Count gate (dates and ranked districts); content gate (`latest` kind, cross-checked against `dates.json`)                                                      | Promoted                                                                                                                |
| `v1/rank-history/{districtId}.json`                                                                                                                  | Plain JSON, `max-age=300`                                                                                     | CDN manifests step (`pull-rank-history.ts`, then a rewrite of every district)                                                                                          | Frontend (`useRankHistory`, `useDistrictRankHistoryYears`)                                                             | Rewritten whole each run; output sorted and de-duplicated by date                                                                                                                                                   | **Derived (D5)**: rebuilt every run from the surviving `snapshots/*/all-districts-rankings.json`. After a prune, it has month-end resolution for the pruned months.                                               | Fail-closed parallel pull (#1733); content gate (JSON parse)                                                                                                   | Promoted                                                                                                                |
| `config/` (`district-snapshot-index.json`, `club-index.json`, `divisions-areas-index.json`)                                                          | Plain JSON, `max-age=300`                                                                                     | Snapshot-index step (merges on daily, regenerated from the listing on other modes); club-index and divisions-areas steps (built from the latest date's district files) | Frontend (search, club pages, rank-history years); MCP server                                                          | Snapshot index: a daily merge is an upsert, other modes rewrite. The two latest-date indexes are rewritten whole.                                                                                                   | Derived from `snapshots/`                                                                                                                                                                                         | `--expect` file-count guard on both latest-date indexes; content gate (`snapshot-index` kind); CDN schema canary                                               | Promoted                                                                                                                |
| `runs/{github_run_id}/written.jsonl`                                                                                                                 | Plain JSONL, one line per object: `path`, `sha256` of the uncompressed bytes (the E2-1 hash), `date`, `stage` | `Publish run manifest` step, from the lines `scripts/pipeline/gcs-upload.sh` and `publish-stores.sh` append as they upload (#1762, ADR-015 P5)                         | Content gate (reads every listed object under a promoted prefix, no sampling); completeness gate (its dates)           | Run-scoped; a re-run attempt of the same run id overwrites it                                                                                                                                                       | Not a store: derived, never read by a later run                                                                                                                                                                   | `gcs-upload.sh` refuses an unset manifest; the gates fail closed on a missing or empty one; a workflow contract test forbids a staging upload that bypasses it | Internal. Prune deletes runs older than 90 days                                                                         |
| `derived/education-rollup/` (`{PY}.json`, `index.json`)                                                                                              | Plain JSON (`cp`, no `-Z`)                                                                                    | `scripts/pipeline/build-education-rollup.sh` in every mode (daily upload step; `process-dates.sh` step 13), after the identity histories (#1801)                       | None yet. Consumers #1793, #1807, #1810, #1811 build against `scripts/lib/__tests__/fixtures/education-rollup-output/` | Rewritten whole each run from its inputs; deterministic bytes                                                                                                                                                       | Derived from `raw-education-ledger/` (2003-04 → 2018-19), each later PY's newest `snapshots/{date}/district_*_reports.json`, each PY's last rankings and `derived/district-region-history.json`; nothing to reset | Contract validation of every input and output (`build-education-rollup.ts`); a listing or transfer error uploads nothing                                       | **Internal, staging only** until #1763 moves the writer under a promoted prefix                                         |
| `incoming/daily-reports/{date}/`                                                                                                                     | Plain JSON                                                                                                    | Reports job (stage step)                                                                                                                                               | Reports job (place step)                                                                                               | Run-scoped; deleted at the end of every reports run                                                                                                                                                                 | Not a store; regenerated per run                                                                                                                                                                                  | Program-year agreement assert between the pipeline and reports jobs (#1284)                                                                                    | Internal (transient)                                                                                                    |
| `metrics/deploys/`                                                                                                                                   | Plain JSON                                                                                                    | `deploy.yml`, written directly to the **prod** bucket                                                                                                                  | No in-repo reader (DORA reporting)                                                                                     | One new object per deploy                                                                                                                                                                                           | Not a pipeline store                                                                                                                                                                                              | None                                                                                                                                                           | Prod only; outside the data pipeline                                                                                    |

---

## Staging → Production Promotion

Production is never written directly. Each run processes into **staging**; a two-gate promotion
step then decides whether to `rsync` staging → prod (`v1/`, `snapshots/`, `time-series/`,
`config/` — additive, no `-d`).

**Scoped promotion (#1763, ADR-015 P6; `promotion_scope=manifest`, opt-in until the rsync
step is retired).** Instead of the four rsyncs, `scripts/promote-run-manifest.ts --execute`
copies exactly the objects in this run's manifest (`runs/<run_id>/written.jsonl`) that sit under
`PROMOTED_PREFIXES` — the set the content gate read. It uses server-side `gcloud storage cp`, so
bytes and headers arrive as staged. Rules (`scripts/lib/manifestPromotion.ts`):

- `snapshots/<date>/…` objects promote per date. A date held by the completeness gate stays
  out; the run's other dates still promote.
- `v1/`, `config/` and `time-series/` are global: they aggregate over every staged date. They
  hold when any date is held, and when staging's `v1/dates.json`/`latest.json` names a date that
  prod lacks and the run does not promote (re-derive that date to clear it).
- Order: dates → globals → `v1/dates.json` + `v1/latest.json` last. A failed copy stops the run
  before the next phase. Nothing in prod is deleted; a rename leaves the old object until a
  reconcile removes it.
- Never promoted: the stores, `raw-*/`, `derived/` and `runs/`. Staging path == prod path, so an
  identity artifact becomes promotable by being written under `config/` once it is gated.

Every non-prune run prints the plan (`Plan scoped promotion (#1763)`, a dry run) whatever the
scope, skip_promotion included. To preview a published manifest locally:
`gcloud storage cat gs://toast-stats-data-staging/runs/<id>/written.jsonl > /tmp/w.jsonl`, then
`RUN_MANIFEST_FILE=/tmp/w.jsonl GCS_BUCKET=toast-stats-data-staging GCS_BUCKET_PRODUCTION=toast-stats-data-ca npx tsx scripts/promote-run-manifest.ts --dry-run --assume-pass`.

**Pipeline-internal stores (#1738, decision D3).** `club-trends/` and `club-race/` are working
state for `compute-analytics`, not CDN products: no frontend or MCP code reads them (the frontend
reads the per-snapshot `club-trends-index` and `global-club-race.json` projections instead). They
live in staging only and are **not promoted**. Every mode uploads them with `gcloud storage rsync`
via `scripts/pipeline/publish-stores.sh` — no `-Z`, no CDN headers. The copies already in the prod
bucket from earlier promotions are left in place; deleting them is a separate decision.

The bucket-to-bucket rsync compares stored hashes, so it copies only objects whose bytes changed.
`time-series/` relies on that (#1731). `scripts/pipeline/publish-stores.sh` uploads a time-series
file to staging only when the sha256 of its uncompressed JSON differs from the object's
`x-goog-meta-sha256`. An unchanged object keeps its generation and hash, so promotion skips it.
Re-uploading it with `cp -Z` would give it a new crc32c, because `-Z` gzip is not byte-deterministic.

The gates:

1. **Count gate (#316)** — blocks if staging has _fewer_ ranked districts or _fewer_ dates than
   prod (a subtractive change). Catches accidental data loss.
2. **Value-diff gate (#1034)** — the count gate is blind to a re-derive that keeps the same
   dates/districts but changes the underlying _values_. This gate digests per-date district
   values over the staging∩prod overlap and **blocks unless the run is dispatched with
   `allow_value_changes=true`** after the operator reviews the diff. Fail-closed.

Promotion fires only when **both** gates pass. On a block, prod is left untouched and a
`promotion-held` alert issue is filed/refreshed (#1072) — a held promotion is a content-stale
state the freshness monitor (which only checks `latest.json`'s date) cannot see.

Full operator procedure for a reviewed re-derive:
[docs/runbooks/pipeline-rerun-2017-to-now.md](runbooks/pipeline-rerun-2017-to-now.md).

---

## Cache Strategies

| Path                                | Cache-Control                   | TTL    | Notes                   |
| ----------------------------------- | ------------------------------- | ------ | ----------------------- |
| `v1/latest.json`                    | `max-age=300`                   | 5 min  | Discovery endpoint      |
| `v1/dates.json`                     | `max-age=900`                   | 15 min | Date index              |
| `v1/rankings.json`                  | `max-age=300`                   | 5 min  | Global rankings         |
| `snapshots/{date}/*.json`           | `max-age=3600, must-revalidate` | 1 hr   | Immutable per date      |
| `snapshots/{date}/analytics/*.json` | `max-age=3600, must-revalidate` | 1 hr   | Immutable per date      |
| `time-series/**`                    | `max-age=3600`                  | 1 hr   | Mutable (updated daily) |

---

## Frontend Fetch Sequence

When a user opens a district page:

```
1. GET /v1/latest.json                                    → latestSnapshotDate
2. GET /snapshots/{date}/analytics/district_{id}_analytics.json  → clubs, health, DCP
3. GET /time-series/district_{id}/index-metadata.json     → available program years
4. GET /time-series/district_{id}/{YYYY}-{YYYY}.json      → membership/payment trends
5. GET /v1/rankings.json                                   → global district rankings
```

The frontend uses TanStack Query with 5-min stale time and 10-min GC.

---

## Key Services

| Service                 | File                                                    | Purpose                       |
| ----------------------- | ------------------------------------------------------- | ----------------------------- |
| TransformService        | `collector-cli/src/services/TransformService.ts`        | CSV → snapshot JSON           |
| AnalyticsComputeService | `collector-cli/src/services/AnalyticsComputeService.ts` | Snapshot → 10 analytics types |
| AnalyticsWriter         | `collector-cli/src/services/AnalyticsWriter.ts`         | Writes analytics JSON files   |
| TimeSeriesIndexWriter   | `collector-cli/src/services/TimeSeriesIndexWriter.ts`   | Incremental time-series       |
| ClubTrendsStore         | `collector-cli/src/services/ClubTrendsStore.ts`         | Incremental club trends       |
| CDN service             | `frontend/src/services/cdn.ts`                          | Frontend CDN URL construction |

---

## Closing Period Detection

When Toastmasters closes a month, CSVs fetched in early April still contain March data.
The CSV footer reads e.g., `"Month of Mar, As of 04/01/2026"`.

**Detection:** `parseClosingPeriodFromCsv()` in `collector-cli/src/utils/csvFooterParser.ts`
**Remapping:** Transform step maps `raw-csv/2026-04-01/` → `snapshots/2026-03-31/`
**Metadata:** `raw-csv/{date}/metadata.json` stores `isClosingPeriod` and `dataMonth`

---

## Incremental Stores

Time-series, club-trends and club-race are NOT regenerated each run — they accumulate data points.

**Pattern:** Sync from GCS → upsert today's data → save → push back to GCS.

This means a rebuild for a single date **adds** to the store rather than replacing it.
To reset a store, delete the GCS file before rebuilding.

**Club-race crossing store (#1556)** — `club-race/{PY}/first-reached.json` records the
first snapshot date each club met each Distinguished tier's requirements (plus the
observed date before it). Crossings are **sticky** (a later drop never revises them) and
the upsert keeps the **earlier** of stored/observed per crossing, so a rebuild walking
dates in any order is idempotent. Because the prune policy keeps only ~two snapshots a
month, this store is the only place a daily crossing date survives — do **not** reset it
to rebuild from surviving snapshots; that degrades every crossing to monthly resolution.
The tier held at a snapshot is `determineDistinguishedLevelAtSnapshot` (analytics-core):
confirmed April renewals for data months Jul–Mar, active members for Apr–Jun.

---

## Prune Retention Asymmetry (#1132)

Prune deletes **only** under `raw-csv/` and `snapshots/` (strictly dated
dirs). The accumulating stores — `time-series/`, `club-trends/`, `club-race/`
— are **retained at full daily resolution by design** (operator ruling,
2026-06-10): the trend surfaces are the product, and thinning them to
month-ends would be a visible regression for trivial storage savings. The
asymmetry is deliberate, not a gap.

`v1/rank-history/` is also never deleted by prune, but it is **derived, not
retained** (decision D5, #1741): every run rebuilds it from the surviving
`snapshots/*/all-districts-rankings.json`, so after a prune its pruned months
drop to month-end resolution. Persisting it as a store would add another
stateful layer to keep correct.

Enforcement is structural, not conventional:

- `scripts/lib/pruneGcsDeletions.ts` exports the
  `PRUNE_DELETABLE_LAYERS` allowlist; `assertPruneDeletionScope()` fails the
  workflow's delete step before any `gsutil rm` if a path outside
  `raw-csv/<date>` / `snapshots/<date>` is ever emitted.
- `PruneService` results (and the `collector-cli prune` JSON, dry-run and
  execute) carry a `layerScope` block naming the pruned and retained layers,
  so no report ever implies the derived layers were covered.

---

## Fixing Bad Data (staging-first — never mutate prod directly)

> **⚠️ Do not `gsutil rm` or `gsutil cp` against `toast-stats-data-ca` (prod) by hand.** Prod is
> only ever written by the promotion step, which is guarded by the count (#316) and value (#1034)
> gates. Editing prod directly bypasses those gates — the exact failure mode they exist to
> prevent. All fixes go through staging and the normal promotion path.

When a date's data is wrong (e.g. a misdetected closing period):

1. **Fix the input in staging.** Correct `raw-csv/{date}/metadata.json` in
   `gs://toast-stats-data-staging/` if the closing period was misdetected.
2. **Re-derive in staging via a workflow dispatch**, not by hand: run `data-pipeline.yml` with
   `mode=rebuild` and the affected `dates`. The rebuild reads staging `raw-csv/`, regenerates
   `snapshots/{date}/` + analytics + manifests, and writes them back to **staging**. (To force a
   clean rebuild of a date, delete the stale `snapshots/{date}/` in **staging** first.)
3. **Review the value diff.** The run's two gates compare staging vs prod and write the diff to
   the GitHub Step Summary. A re-derive that changes values will **block** promotion (correct) —
   inspect the `Changed` dates and confirm they match your intended fix.
4. **Promote the reviewed fix.** Re-dispatch with `allow_value_changes=true` once the diff is
   verified. Promotion runs only when both gates pass, then rsyncs staging → prod.
5. **Wait for CDN cache expiry** (1 hr for analytics/snapshots, 5–15 min for manifests).

If a count-gate block is unexpected (staging has _fewer_ dates than prod), re-seed staging from
prod first — see [the re-derive runbook §3](runbooks/pipeline-rerun-2017-to-now.md). Never
override a block by editing prod.
