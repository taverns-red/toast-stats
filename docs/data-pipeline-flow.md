# Data Pipeline Flow — Toast Stats

**Last updated:** April 5, 2026

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

| Mode       | Trigger          | Behavior                                             |
| ---------- | ---------------- | ---------------------------------------------------- |
| `daily`    | Scheduled (cron) | Scrapes today's data, processes single date          |
| `rebuild`  | Manual dispatch  | Re-processes specific dates from existing raw-csv    |
| `rescrape` | Manual dispatch  | Re-downloads CSVs for specific dates, then processes |
| `prune`    | Manual dispatch  | Reduces to one snapshot per month per program year   |

---

## GCS Bucket Structure

**Bucket:** `gs://toast-stats-data-ca/`

```
toast-stats-data-ca/
├── raw-csv/{YYYY-MM-DD}/                  # Input: raw CSV from Toastmasters
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

## GCS Update Order

When manually fixing GCS data:

1. Fix `raw-csv/{date}/metadata.json` if closing period was misdetected
2. Delete stale `snapshots/{date}/` directories
3. Run pipeline rebuild (transform + compute) for affected dates
4. Manifests are regenerated automatically by the pipeline
5. Wait for CDN cache expiry (1hr for analytics, 5min for manifests)
