# Data Pipeline Flow — Toast Stats

**Last updated:** June 13, 2026

Complete data flow from Toastmasters dashboard scraping through GCS to Cloud CDN to the frontend SPA.

---

## Pipeline Order of Operations

```
1. Scrape        → raw-csv/{date}/district-{id}/*.csv
2. Sync stores   ← time-series/, club-trends/ from GCS
3. Transform     → snapshots/{date}/district_{id}.json + manifest + rankings
4. Compute       → snapshots/{date}/analytics/district_{id}_{type}.json (10 types)
                   + updates time-series + club-trends stores
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
├── club-trends/{YYYY-YYYY}/              # Incremental club trends (per PY)
│   └── district_{id}.json                # All clubs for that district
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

## Staging → Production Promotion

Production is never written directly. Each run processes into **staging**; a two-gate promotion
step then decides whether to `rsync` staging → prod (`v1/`, `snapshots/`, `time-series/`,
`club-trends/`, `config/` — additive, no `-d`):

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

Time-series and club-trends are NOT regenerated each run — they accumulate data points.

**Pattern:** Sync from GCS → upsert today's data → save → push back to GCS.

This means a rebuild for a single date **adds** to the store rather than replacing it.
To reset a store, delete the GCS file before rebuilding.

---

## Prune Retention Asymmetry (#1132)

Prune deletes **only** under `raw-csv/` and `snapshots/` (strictly dated
dirs). The derived layers — `time-series/`, `club-trends/`,
`v1/rank-history/` — are **retained at full daily resolution by design**
(operator ruling, 2026-06-10): the trend surfaces are the product, and
thinning them to month-ends would be a visible regression for trivial
storage savings. The asymmetry is deliberate, not a gap.

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
