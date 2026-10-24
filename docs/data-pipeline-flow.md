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

| Mode                        | Trigger                                             | Behavior                                                                                           |
| --------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `daily`                     | Dispatch, fired by launchd at 05:00 America/Toronto | Scrapes yesterday's dashboard and processes that one date through `process-dates.sh daily` (#1765) |
| `rebuild`                   | Manual dispatch                                     | Re-processes specific dates from existing raw-csv                                                  |
| `rescrape`                  | Manual dispatch                                     | Re-downloads CSVs for specific dates, then processes                                               |
| `rescrape-historical`       | Manual dispatch                                     | Re-downloads ALL historical CSVs, then rebuilds                                                    |
| `prune`                     | Manual dispatch (quarterly cron not yet wired)      | Reduces to one snapshot per month per program year                                                 |
| `backfill-global-totals`    | Manual dispatch                                     | Builds `global-totals.json` for already-published dates, one at a time                             |
| `backfill-education-ledger` | Manual dispatch                                     | Fetches the education ledger history into staging only; no gates/promotion                         |

On `daily`, a manual `districts` override has its spaces dropped (`57, 58` → `57,58`) before it reaches the runner, which takes only a comma-separated id list (#2274).

#### `force` and `allow_partial` per mode (#1771, ADR-015 P7)

`force` means one thing in every mode: **re-fetch and re-derive even if cached**. Where a
mode re-derives by definition it is always forced, and `force` changes nothing. The per-date
runner (`scripts/pipeline/process-dates.sh`) receives the input as `FORCE`, validates it and
logs the effective value. `allow_partial` lets a run with failed dates go on to promotion; by
default any failed date fails the run, after its per-date uploads to staging stand
(`scripts/partial-failure-gate.sh`, #1708). Pinned by `dataPipelineForce.test.ts` and
`dataPipelinePartialFailure.test.ts` / `dataPipelineBackfillPartialGate.test.ts`.

| Mode                        | `force=true`                                                                                                                                                                                                                       | Failed dates                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `daily`                     | Passed to the runner as `FORCE`; only `true` forces: `scrape --force` re-fetches the dashboard CSVs instead of reusing the `raw-csv/{date}/` the runner pre-synced from staging, and compute runs with `--force-analytics` (#1765) | The date publishes or the step fails before any store push (refused by the upload guard, failed, or never written) |
| `rebuild`                   | Always forced in the runner (`transform --force`, `compute-analytics --force-analytics`); the raw is the stored `raw-csv/`, never re-fetched — that is the mode                                                                    | Gate; `allow_partial`                                                                                              |
| `rescrape`                  | Always forced in the runner (`scrape --transform --force`, `--force-analytics`)                                                                                                                                                    | Gate; `allow_partial`                                                                                              |
| `rescrape-historical`       | Always forced: `raw-csv/` is wiped and re-downloaded, then the runner transforms with `--force`                                                                                                                                    | Gate; `allow_partial`                                                                                              |
| `backfill-global-totals`    | Always forced: every date is rebuilt from the production archive; no staging copy is read back                                                                                                                                     | Gate; `allow_partial` (#1771). A run where no date built fails regardless                                          |
| `backfill-education-ledger` | `--force`: re-fetches PY/district pairs that already have a valid file resumed from staging                                                                                                                                        | Any failed PY fails the run (no promotion in this mode)                                                            |
| `prune`                     | Not used: prune neither fetches nor derives, so `force` is ignored                                                                                                                                                                 | n/a                                                                                                                |

The workflow has no `schedule:` trigger. GitHub's cron fires late or drops events, so the
daily run is dispatched by a launchd job on the operator Mac
(`gh workflow run data-pipeline.yml --ref main -f mode=daily`, #1242; see
[the runbook](runbooks/local-daily-pipeline-trigger.md)). The quarterly-prune cron is
operator-gated (#1148): the Determine-mode step already recognises its expression, but it is
not wired as a trigger.

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
│   ├── suspended-clubs.json               # Clubs suspended this PY, per district (#1953); absent = unknown
│   ├── global-club-race.json              # Worldwide race projection of club-race/ (#1556)
│   ├── region-rollups.json                # Region + world rollups of the district figures (#1799)
│   ├── meeting-times.json                 # Per-district weekday × start-hour meeting counts (#1814)
│   ├── clubs-by-region/                   # Per-region club shards for the region/world explorers (#1800)
│   │   ├── {region}.json                  # every club of one region (+ unassigned.json)
│   │   ├── world.json                     # per-region counts + top-50 seed rows (~6 KB gzip)
│   │   └── world-points.json              # one map point per located club, loaded lazily (~180 KB gzip)
│   ├── reports-rollups.json               # Region + world rollups of the daily-reports sidecars (#2012)
│   └── analytics/                         # Pre-computed analytics
│       ├── district_{id}_analytics.json   # incl. allClubs[] club trends
│       ├── district_{id}_performance-targets.json
│       └── manifest.json                  # written per-district files
│
├── time-series/district_{id}/             # Incremental time-series (per district)
│   ├── index-metadata.json
│   └── {YYYY}-{YYYY}.json                # One file per program year
├── time-series/regions/{YYYY}-{YYYY}.json # Region + world membership series, Σ the district series (#2127)
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

**Retired per-district analytics files (#1798).** Compute no longer writes
`district_{id}_{membership,clubhealth,membership-analytics,vulnerable-clubs,leadership-insights,distinguished-analytics,year-over-year,club-trends-index}.json`:
nothing read them, and the four that duplicated `analytics` (membership,
clubhealth, vulnerable-clubs, club-trends-index) were re-serialisations of it.
Dates written before #1798 still hold old copies in both buckets until a
separately approved cleanup. The date-completeness gate (#1761) ignores these
exact names (`packages/collector-cli/src/utils/retiredAnalyticsFiles.ts`), so a
rebuild of an already-promoted date is not held for lacking them.

---

## Store Contract (per prefix)

One row per prefix (#1741, plan P3-4). Every pipeline write goes to **staging**. "Promoted" means
the gated `Promote run manifest to production (#1763)` step copies the run's objects under the
prefix to prod (`PROMOTED_PREFIXES` in `scripts/lib/promotionContentGate.ts`, the promoter's
allow-list, pinned by a workflow contract test).
"Internal" means the prefix stays in staging.

**Encoding at rest:**

- **`-Z` JSON** is stored `Content-Encoding: gzip` and is served decompressed to browsers.
- **Plain** is uploaded without `-Z`.

**Store gates:**

- **Store sync** is `scripts/pipeline/sync-stores.sh`. It lists the prefix and fails closed on any error except an empty first run. It then requires the local file count to be at least the listed count, and peels gzip layers until the file is JSON (#1722, #1702).
- **Store publish** is `scripts/pipeline/publish-stores.sh`. It refuses a store that was never synced, runs the double-encoding check before any push, and fails on any transfer error.

| Prefix                                                                                                                                                                                                      | Encoding at rest                                                                                                                                                                                                   | Writers                                                                                                                                                                                                                                            | Readers                                                                                                                                                                                                                                            | Idempotency                                                                                                                                                                                                         | Rebuild rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Covering gate                                                                                                                                                                                                                                                                                                                                            | Promoted or internal                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raw-csv/{date}/`                                                                                                                                                                                           | Plain CSV plus `metadata.json` (`rsync`, no `-Z`)                                                                                                                                                                  | Daily, rescrape and rescrape-historical uploads. The operator fixes `metadata.json` by hand (staging only).                                                                                                                                        | Rebuild and rescrape transform (synced down, R2); prune skeleton sync                                                                                                                                                                              | Re-scraping a date overwrites its files                                                                                                                                                                             | Source of truth for every rebuild; prune keeps month-ends only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Prune scope guard `assertPruneDeletionScope` (#1132); closing-period detection                                                                                                                                                                                                                                                                           | Internal (never promoted)                                                                                                                                                                                                                               |
| `snapshots/{date}/` (district, rankings, manifest, `global-totals`, `global-club-race`, `region-rollups`, `meeting-times`, `clubs-by-region/`, `competitive-awards`, `district_{id}_reports`, `analytics/`) | `-Z` JSON, `max-age=3600, must-revalidate`                                                                                                                                                                         | Every mode's per-date upload; the backfill global-totals step; the reports job (stages under `incoming/`, places here)                                                                                                                             | Frontend; MCP server; pipeline (previous-year compare, CDN manifests, indexes, rank-history, value gate)                                                                                                                                           | Re-deriving a date overwrites its files. The date set only grows except under prune.                                                                                                                                | Re-derived from `raw-csv/` by rebuild. To force a clean rebuild, delete the staging date first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Upload guard (closing overwrite, exit 3); `validate-snapshots.ts` (`process-dates.sh` step 9 in every per-date mode, daily included since #1765: skips that date's upload, and a daily that published nothing fails the run; not run on the backfill-global-totals step or the reports job); count gate (#316); value gate (#1034); content gate (#1715) | Promoted (additive rsync). The reports job also copies its files to prod directly, but only when the same run promoted.                                                                                                                                 |
| `time-series/district_{id}/` (`index-metadata.json`, `{PY}.json`)                                                                                                                                           | `-Z` JSON, `max-age=3600`, `x-goog-meta-sha256` = sha256 of the uncompressed JSON (E2-1, #1731)                                                                                                                    | `compute-analytics` (`TimeSeriesIndexWriter`), published by store publish in every mode; uploaded only when the sha differs                                                                                                                        | Frontend Trends (`cdnTimeSeries.ts`); MCP server; CDN schema canary                                                                                                                                                                                | Upsert by date (a re-run replaces that date's point); points kept sorted                                                                                                                                            | Accumulates. Rebuilding a date adds or replaces one point. To reset, delete the staging file first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Store sync and store publish; content gate (schema, plus last-point regression against prod); CDN schema canary (#1710)                                                                                                                                                                                                                                  | Promoted. Unchanged objects keep their generation, so promotion skips them.                                                                                                                                                                             |
| `time-series/regions/{PY}.json` (#2127)                                                                                                                                                                     | `-Z` JSON, `max-age=3600`, sha metadata like the district series (compact: 8.2 KB raw / 3.2 KB gzip for 2026-27's 62 dates on 2026-10-16; 2025-26's 91 dates ~4.9 KB gzip)                                         | `compute-analytics` after the date's district points and source gaps, for the date's program year, in every mode that runs it; published by store publish with `time-series/` (changed bytes only) and recorded in the run manifest                | Frontend `/regions` leaderboard sparklines (one request per view instead of ~94 district series)                                                                                                                                                   | Rewritten whole from the district series each compute; byte-stable for the same inputs                                                                                                                              | Derived, not accumulated: Σ of the placed districts' `time-series/district_{id}/{PY}.json` membership per date, regions from `config/district-region-history.json` for the file's PY. A placed district with no point at a date (a #1671 `sourceGapDates` gap, no point, or no series) makes every block containing it `null` there and is listed in `uncountedDistricts`; a district the history does not place (U, a renumbered id stamped on an earlier year) is listed in `unassignedDistricts`, not summed. A PY's file appears on the first compute of a date in that PY; nothing to backfill for the current PY              | Schema validation in compute; content gate (`region-membership-series` kind: schema, served PY, every date in it and ascending, one region per district, world = Σ regions with null where a region is; always checked). No CDN canary until first promotion                                                                                             | Promoted (global object under `time-series/`)                                                                                                                                                                                                           |
| `club-trends/{PY}/district_{id}.json`                                                                                                                                                                       | Plain JSON (`rsync`, no `-Z`, no CDN headers)                                                                                                                                                                      | `compute-analytics` (`ClubTrendsStore`), published by store publish in every mode                                                                                                                                                                  | `compute-analytics` only. The frontend reads the per-snapshot `analytics` file's `allClubs`.                                                                                                                                                       | Upsert by date. Identity fields (name, division, area, base) come from the **latest** date. Clubs are saved in sorted key order. The same set of dates gives byte-identical output in any processing order (#1741). | Accumulates; a rebuild may walk dates in any order. Daily pulls only the resolved PY (E2-2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Store sync and store publish                                                                                                                                                                                                                                                                                                                             | **Internal** (E2-5, D3, #1738). Stale prod copies are left in place.                                                                                                                                                                                    |
| `club-race/{PY}/first-reached.json`                                                                                                                                                                         | Plain JSON (`rsync`, no `-Z`)                                                                                                                                                                                      | `compute-analytics` (`ClubRaceStore`), published by store publish in every mode                                                                                                                                                                    | `compute-analytics` only. The frontend reads the `snapshots/{date}/global-club-race.json` projection.                                                                                                                                              | Keeps the **earlier** of the stored and observed crossing date, so any order gives the same result                                                                                                                  | Accumulates. **Never reset**: it is the only place a daily crossing date survives prune.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Store sync and store publish                                                                                                                                                                                                                                                                                                                             | **Internal** (E2-5, D3, #1738). Stale prod copies are left in place.                                                                                                                                                                                    |
| `district-awards-history.json`                                                                                                                                                                              | Plain JSON (`cp`, no `-Z`)                                                                                                                                                                                         | `compute-analytics` (`DistrictAwardsHistoryStore`), published by store publish in every mode                                                                                                                                                       | `compute-analytics` only. It derives `snapshots/{date}/competitive-awards.json`.                                                                                                                                                                   | Upsert per district and program year; entries sorted by PY                                                                                                                                                          | Accumulates. Rebuilding a past snapshot upserts that year; later years already stored are ignored when scoring it (#1609).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Store sync (it runs `pull-awards-history.sh`, which reads before syncing (#1704), then normalises)                                                                                                                                                                                                                                                       | **Internal, staging only** (D4). No reader needs it in prod.                                                                                                                                                                                            |
| `v1/latest.json`, `v1/dates.json`, `v1/rankings.json`, `v1/global-history.json`                                                                                                                             | Plain JSON. `max-age=300` (`dates.json`: `max-age=900`)                                                                                                                                                            | CDN manifests and global-history steps, every run except a prune dry-run and `backfill-global-totals`                                                                                                                                              | Frontend; MCP server; pipeline (rebuild source, closing-date registry)                                                                                                                                                                             | Rewritten whole each run from the staging `snapshots/` listing                                                                                                                                                      | Derived from `snapshots/`; nothing to reset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Count gate (dates and ranked districts); content gate (`latest` kind, cross-checked against `dates.json`)                                                                                                                                                                                                                                                | Promoted                                                                                                                                                                                                                                                |
| `v1/rank-history/{districtId}.json`                                                                                                                                                                         | Plain JSON, `max-age=300`                                                                                                                                                                                          | CDN manifests step (`pull-rank-history.ts`, then a rewrite of every district)                                                                                                                                                                      | Frontend (`useRankHistory`, `useDistrictRankHistoryYears`)                                                                                                                                                                                         | Rewritten whole each run; output sorted and de-duplicated by date                                                                                                                                                   | **Derived (D5)**: rebuilt every run from the surviving `snapshots/*/all-districts-rankings.json`. After a prune, it has month-end resolution for the pruned months.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Fail-closed parallel pull (#1733); content gate (JSON parse)                                                                                                                                                                                                                                                                                             | Promoted                                                                                                                                                                                                                                                |
| `config/` (`district-snapshot-index.json`, `club-index.json`, `divisions-areas-index.json`)                                                                                                                 | Plain JSON, `max-age=300`                                                                                                                                                                                          | Snapshot-index step (merges on daily, regenerated from the listing on other modes); club-index and divisions-areas steps (built from the latest date's district files)                                                                             | Frontend (search, club pages, rank-history years); MCP server                                                                                                                                                                                      | Snapshot index: a daily merge is an upsert, other modes rewrite. The two latest-date indexes are rewritten whole.                                                                                                   | Derived from `snapshots/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `--expect` file-count guard on both latest-date indexes; content gate (`snapshot-index` kind); CDN schema canary                                                                                                                                                                                                                                         | Promoted                                                                                                                                                                                                                                                |
| `config/district-region-history.json` (#1820)                                                                                                                                                               | Plain JSON, `max-age=300` (~42 KB)                                                                                                                                                                                 | `scripts/pipeline/build-identity-history.sh` in every mode that publishes the club-race store (`process-dates.sh` step 12; daily since #1765, and only when its date published)                                                                    | `build-education-rollup.sh` (region rollups); `compute-analytics` for `snapshots/{date}/region-rollups.json`, pulled first by `sync-stores.sh district-region-history` (read-only, never pushed back, #1799); region pages once they read it       | Rewritten whole each run; deterministic bytes (order-independent fold)                                                                                                                                              | Folded from the `region` column of the first and last staged `snapshots/{date}/all-districts-rankings.json` of every program year (by logical date) back to 2016-17, so every run rebuilds every PY; nothing to backfill                                                                                                                                                                                                                                                                                                                                                                                                            | Contract validation in the builder; content gate (`district-region-history` kind: schema + at least one district, always checked)                                                                                                                                                                                                                        | Promoted (global object: held with any held date under scoped promotion)                                                                                                                                                                                |
| `snapshots/{date}/region-rollups.json` (#1799)                                                                                                                                                              | `-Z` JSON, `max-age=3600, must-revalidate` (one object per date: ~90–115 KB raw, ~7–9 KB gzip at 94–128 districts)                                                                                                 | `compute-analytics`, beside `global-totals.json`, in every mode that runs it (daily; `process-dates.sh` for rebuild, rescrape, rescrape-historical). Not written by backfill-global-totals                                                         | None yet. Consumers #1812, #1813, #1815 build against `packages/shared-contracts/src/__tests__/__fixtures__/recorded-region-rollups.json`                                                                                                          | Re-deriving a date overwrites it                                                                                                                                                                                    | Derived from the date's district files scoped by its own rankings, regions from `config/district-region-history.json` for the logical date's program year. A listed district without a file refuses it (ADR-015 P3); no history writes `regions: null` with the reason                                                                                                                                                                                                                                                                                                                                                              | Content gate (`region-rollups` kind: schema, served date and its program year, world = Σ districts, region = Σ its districts; always checked). No CDN canary until first promotion                                                                                                                                                                       | Promoted with its date                                                                                                                                                                                                                                  |
| `snapshots/{date}/meeting-times.json` (#1814)                                                                                                                                                               | `-Z` JSON, `max-age=3600, must-revalidate`, compact (one object per date: ~1.4 KB raw per district, est. ~190 KB raw / ~30 KB gzip at ~130 districts; the 4-district recorded fixture is 5.7 KB raw / 0.9 KB gzip) | `compute-analytics`, after `clubs-by-region/`, in every mode that runs it (daily; `process-dates.sh` for rebuild, rescrape, rescrape-historical). Not written by backfill-global-totals                                                            | Region and world meeting-time heatmaps (`/region/:n/meetings`, `/regions/meetings`); they read "not available yet" until a date has it. Consumers build against `packages/shared-contracts/src/__tests__/__fixtures__/recorded-meeting-times.json` | Re-deriving a date overwrites it; a refused re-derive removes the stale copy                                                                                                                                        | Same entity set and region membership as `region-rollups.json`; per district and mode (`all`, `in-person` incl. hybrid, `online` incl. hybrid) the district page's own counting rule (`countMeetingSlots`, shared-contracts) over the parsed `meetingSchedule[]` (#1789): distinct clubs per weekday × start hour in the club's local time, plus no-time and no-mode counts. Counts only: no club id, name, text or place. A listed district without a file refuses it (ADR-015 P3); no history writes `region: null` with the reason                                                                                               | Content gate (`meeting-times` kind: schema, served date and its program year, totals = Σ districts, every count ≤ the district's scheduled clubs, every mode cell ≤ the all-meetings cell; always checked). The contact strip validates rewrites against the schema. No CDN canary until first promotion                                                 | Promoted with its date                                                                                                                                                                                                                                  |
| `snapshots/{date}/reports-rollups.json` (#2012)                                                                                                                                                             | `-Z` JSON, `max-age=3600, must-revalidate` (one object per date: ~2 KB raw, ~0.5 KB gzip per district)                                                                                                             | `scripts/pipeline/build-reports-rollups.sh` in the daily `education-rollup` job, after `place-reports` lands the date's sidecars; recorded in the run manifest that job republishes. Not written by the other modes (they do not re-fetch reports) | None yet. Consumers build against `packages/shared-contracts/src/__tests__/__fixtures__/recorded-reports-rollups.json`                                                                                                                             | Re-running the job for a date overwrites it                                                                                                                                                                         | Derived from the date's `district_*_reports.json` scoped by its own rankings, regions from `config/district-region-history.json` for the logical date's program year. A listed district without a usable sidecar, or a sidecar without a section, is null in its row and every block above it; no sidecars at the date writes nothing; no history writes `regions: null` with the reason                                                                                                                                                                                                                                            | Content gate (`reports-rollups` kind: schema, served date and its program year, a district without reports null throughout, world = Σ districts, region = Σ its districts with the null rule; always checked). No CDN canary until first promotion                                                                                                       | Written after this run's promotion, so the `promote-reports` job content-gates and promotes it with the sidecars through the manifest promoter (#1767) when this run promoted the date; a held day's file is carried by a later run's `promote-reports` |
| `snapshots/{date}/clubs-by-region/` (`{region}.json`, `unassigned.json`, `world.json`, `world-points.json`) (#1800)                                                                                         | `-Z` JSON, `max-age=3600, must-revalidate`, compact (est. at 14.5k clubs: largest shard ~42 KB gzip / ~280 KB raw; `world.json` ~6 KB gzip; `world-points.json` ~180 KB gzip / ~540 KB raw)                        | `compute-analytics`, after `region-rollups.json`, in every mode that runs it (`process-dates.sh` for daily, rebuild, rescrape, rescrape-historical). Not written by backfill-global-totals                                                         | None yet. Consumers #1808, #1809 build against `packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json`                                                                                                                | Re-deriving a date rewrites the directory whole                                                                                                                                                                     | Same entity set, health/tier rule and region membership as `region-rollups.json`. A listed district without a file refuses every file (ADR-015 P3); no history writes only `world.json` (with `shards: null`) and `world-points.json` and the reason. Explorer fields only (strict rows: no contact, link or meeting field); clubs without coordinates (including Find-A-Club's `(0, 0)` ungeocoded sentinel, #2153 — one rule, `parseCoordinates` in shared-contracts; geocode outliers get no point at the FAC merge and fully online clubs are flagged `meetsOnline`, #2160) are rows with null `lat`/`lng`, counted as unmapped | Content gate (`clubs-by-region-shard`, `clubs-by-region-world` and `clubs-by-region-world-points` kinds: schema, served date/key and program year, counts = rows/points, shards sum to the world totals; always checked). No CDN canary until first promotion                                                                                            | Promoted with its date                                                                                                                                                                                                                                  |
| `config/club-district-history/` (`{NN}.json` ×100, `index.json`) (#1782)                                                                                                                                    | Plain JSON, `max-age=300` (~9.2 MB raw, ~1.1 MB gzip in all; largest shard ~96 KB raw)                                                                                                                             | `scripts/pipeline/build-identity-history.sh`, same modes and step as the region history; shards uploaded before the index                                                                                                                          | None yet (club pages for clubs that moved district, epic #1781)                                                                                                                                                                                    | Rewritten whole each run; deterministic bytes (order-independent fold). Clubs are never dropped, so a shard key never disappears                                                                                    | Folded from every `club-race/{PY}/first-reached.json` (2016-17 →) the run synced, so every run rebuilds every PY; nothing to backfill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Contract validation in the builder; content gate (`club-district-history-index`: schema, at least one club, every listed shard staged, no prod shard dropped; `club-district-history-shard`: schema, key matches path, clubs in the right shard; all always checked); CDN schema canary (index fresh, anchor shard 77 plus one random)                   | Promoted (global objects; scoped promotion copies the index in the entry phase, after its shards)                                                                                                                                                       |
| `config/charter-cohort-survival/district_{id}.json` (#2061)                                                                                                                                                 | Plain JSON, `max-age=300` (one per district the club history names; D61 ~1.7 KB gzip)                                                                                                                              | `scripts/pipeline/build-identity-history.sh`, same modes and step as the club-district history, uploaded after its index                                                                                                                           | `/district/:id/growth/survival` (#1817); falls back to folding the 100 history shards on a 404                                                                                                                                                     | Rewritten whole each run; deterministic bytes                                                                                                                                                                       | Folded from the club-district history the same run builds (the shared `buildCharterCohortSurvivalFile`, curves through every PY), so every run rebuilds every district; nothing to backfill                                                                                                                                                                                                                                                                                                                                                                                                                                         | Contract validation in the builder; content gate (`charter-cohort-survival`: schema, `districtId` matches the path, curves for every listed PY; every changed file, always checked)                                                                                                                                                                      | Promoted (global objects)                                                                                                                                                                                                                               |
| `config/charter-cohort-survival/region_{NN}.json`, `.../world.json` (#1818)                                                                                                                                 | Plain JSON, `max-age=300` (one per region the district-region history names, plus the world; ~1–2 KB gzip each)                                                                                                    | `scripts/pipeline/build-identity-history.sh`, written beside the district files and uploaded in the same transfer, after the club-history index                                                                                                    | `/region/:n/growth/survival`, `/regions/growth/survival` (#1818); a 404 reads "not available yet" (no browser fallback)                                                                                                                            | Rewritten whole each run; deterministic bytes                                                                                                                                                                       | Folded from the club-district history and the district-region history the same run builds (shared `buildCharterCohortSurvivalRollupFile`): a club is in a region's cohort when its district sat in that region in the club's charter PY; nothing to backfill                                                                                                                                                                                                                                                                                                                                                                        | Content gate (`charter-cohort-survival-rollup`: schema, scope matches the path, curves for every listed PY; every changed file, always checked)                                                                                                                                                                                                          | Promoted (global objects)                                                                                                                                                                                                                               |
| `runs/{github_run_id}/written.jsonl`                                                                                                                                                                        | Plain JSONL, one line per object: `path`, `sha256` of the uncompressed bytes (the E2-1 hash), `date`, `stage`                                                                                                      | `Publish run manifest` step, from the lines `scripts/pipeline/gcs-upload.sh` and `publish-stores.sh` append as they upload (#1762, ADR-015 P5)                                                                                                     | Content gate (reads every listed object under a promoted prefix, no sampling); completeness gate (its dates)                                                                                                                                       | Run-scoped; a re-run attempt of the same run id overwrites it                                                                                                                                                       | Not a store: derived, never read by a later run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `gcs-upload.sh` refuses an unset manifest; the gates fail closed on a missing or empty one; a workflow contract test forbids a staging upload that bypasses it                                                                                                                                                                                           | Internal. Prune deletes runs older than 90 days                                                                                                                                                                                                         |
| `derived/education-rollup/` (`{PY}.json`, `index.json`)                                                                                                                                                     | Plain JSON (`cp`, no `-Z`)                                                                                                                                                                                         | `scripts/pipeline/build-education-rollup.sh` in every mode (daily: the `education-rollup` job, after `place-reports` lands the day's reports, #2028; `process-dates.sh` step 13), after the identity histories (#1801)                             | `/region/:n/education` (#1810) through the CDN; #1807, #1811 build against `scripts/lib/__tests__/fixtures/education-rollup-output/`                                                                                                               | Rewritten whole each run from its inputs; deterministic bytes                                                                                                                                                       | Derived from `raw-education-ledger/` (2003-04 → 2018-19), each later PY's newest `snapshots/{date}/district_*_reports.json`, each PY's last rankings and `config/district-region-history.json`; nothing to reset                                                                                                                                                                                                                                                                                                                                                                                                                    | Contract validation of every input and output (`build-education-rollup.ts`); a listing or transfer error uploads nothing                                                                                                                                                                                                                                 | Promoted by `promote-reports` through the sidecar manifest, content-gated, when its reports date is in prod (#1810, #2222)                                                                                                                              |
| `incoming/daily-reports/{date}/`                                                                                                                                                                            | Plain JSON                                                                                                                                                                                                         | Reports job (stage step)                                                                                                                                                                                                                           | Reports job (place step)                                                                                                                                                                                                                           | Run-scoped; deleted at the end of every reports run                                                                                                                                                                 | Not a store; regenerated per run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Program-year agreement assert between the pipeline and reports jobs (#1284)                                                                                                                                                                                                                                                                              | Internal (transient)                                                                                                                                                                                                                                    |
| `metrics/deploys/`                                                                                                                                                                                          | Plain JSON                                                                                                                                                                                                         | `deploy.yml`, written directly to the **prod** bucket                                                                                                                                                                                              | No in-repo reader (DORA reporting)                                                                                                                                                                                                                 | One new object per deploy                                                                                                                                                                                           | Not a pipeline store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None                                                                                                                                                                                                                                                                                                                                                     | Prod only; outside the data pipeline                                                                                                                                                                                                                    |

---

## Staging → Production Promotion

Production is never written directly. Each run processes into **staging**; the gates then
decide what the promotion step copies to prod.

**Scoped promotion (#1763, ADR-015 P6) — the only promotion.** The whole-prefix rsync of `v1/`,
`snapshots/`, `time-series/` and `config/` is retired (PR 2 of #1763); no step rsyncs into prod
except the prune reconcile, until #1767. `scripts/promote-run-manifest.ts --execute`
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

**Find-A-Club continuity (#2239 AC3).** The completeness gate compares a date with prod's copy
of that date, so once prod is stripped it cannot see a FAC loss (#2237: 81 dates), and a daily's
new date has no prod copy at all. For every touched date from 2026-05-15 on (less the 39
known-unenriched dates in `FAC_KNOWN_UNENRICHED_DATES`, `scripts/lib/facContinuity.ts`), the
gate also samples staging's district files and holds the date when a district loses the FAC
merge (`data.prospectiveClubs`) or drops 10 points and 3 clubs of coordinates / address /
meeting coverage against the best of prod's copy and the 3 nearest earlier prod dates (from
prod's `v1/dates.json`; unreadable fails closed), or when fewer than half the sampled districts
are FAC-merged. That floor is what a stripped baseline cannot satisfy. A date that is
legitimately unenriched for good is added to the list in review; a one-off goes through
`allow_value_changes`.

**What reaches prod without being written by the run.** Only what the manifest lists is
promoted, so each class the rsync used to sweep up has its own route:

- `time-series/` files a held run left current in staging but stale in prod:
  `publish-stores.sh` lists prod (read-only) and records them as stage `publish-stores-carry`
  without re-uploading; they promote with the next run's globals.
- `district_*_reports.json` sidecars and `reports-rollups.json` (#2012), written after the
  promote by `place-reports` and `education-rollup`: both writers record them in the run
  manifest (`gcs-upload.sh`), and the `promote-reports` job (#1767, ADR-015 step 9) sends them
  through the same promoter. `scripts/plan-report-sidecars.ts` plans a sidecar manifest: the
  run's own sidecars, plus every sidecar staging holds and prod lacks for prod's newest 7
  indexed dates and the run's promoted dates (the carry). A date the run wrote and did not
  promote holds its sidecars. `promotion-content-gate.ts --manifest-only` then reads every
  object in it (the `district-reports` kind: `DistrictReportsDatasetSchema`, the district its
  path names, its logical date's program year, no link or email in place text). The gate is
  applied per date (#2227): `plan-report-sidecars.ts --apply-content-gate` drops every date
  with a refused sidecar from the manifest and adds it to the verdict (a gate that could not
  run holds every date), and `promote-run-manifest.ts --execute` copies the rest. A held date
  is listed in the step summary and files or refreshes its own `promotion-held` issue (title
  `🚫 Report sidecars held`, closed by a later clean sidecar promote; the pipeline job's alert
  steps leave it alone). The daily content gate does not sample a sidecar the run did not
  write: scoped promotion never copies one, so it is gated here, per date, instead of holding
  the whole daily promotion. No step writes them to prod directly.
- `derived/education-rollup/` (built after the promote, not a promoted prefix): the
  `promote-reports` planner writes staging's rollup to its own manifest
  (`scripts/lib/educationRollupPlan.ts`, #2222), gated and promoted by its own
  continue-on-error steps: a malformed index, a read error or a gate hold holds only the rollup
  (a warning and a summary line), never a report sidecar. It plans only the years staging's index names, then the
  index; held while its reports date (`asOf`) is not one prod indexes (a later run plans it
  again); nothing when prod's index is byte-identical. After the sidecars' per-date content hold,
  `plan-report-sidecars.ts --apply-rollup-hold` drops it when the sidecar verdict holds `asOf`
  (the run wrote that date and did not promote it, or one of its reports failed the gate), and
  when it cannot tell (no verdict, the content gate not applied): the rollup never ships ahead
  of the reports it was read from. A failed rollup step is an error annotation and a summary
  line, never a failed job. The content gate reads each object
  (`education-rollup-program-year`, `education-rollup-index`: the shared-contracts schemas, the
  PY its path names, every index row at its own year's path), and
  `promote-run-manifest.ts --execute --education-rollup` (its own step) copies the years, then
  the index last.
  The pipeline job's own promote never copies it. Same path in both buckets; the CDN serves it
  like `config/`. No step writes prod outside the promoter: `DIRECT_PROD_WRITE_EXEMPT`
  (`scripts/lib/prodWriteGuard.ts`) is empty.
- A held date's own `snapshots/<date>/` objects: never carried. Re-derive the date; it then
  promotes through its own gates. A promote that copied less than it planned files the
  `promotion-held` alert with the held dates and the globals' reason.
- Out-of-band staging rewrites (e.g. `contact-strip.yml` with `bucket=staging`) do not reach prod
  by themselves any more: run the tool on `bucket=prod` too.
- Every promoting run, in any mode (#2144): `promote-reports` carries exactly the run's promoted
  dates, however old, then fails the run if any of them is live without the report sidecars or
  `reports-rollups.json` staging holds (`scripts/pipeline/check-report-sidecars.sh`).

Every non-prune run prints the plan (`Plan scoped promotion (#1763)`, a dry run),
skip_promotion included. To preview a published manifest locally:
`gcloud storage cat gs://toast-stats-data-staging/runs/<id>/written.jsonl > /tmp/w.jsonl`, then
`RUN_MANIFEST_FILE=/tmp/w.jsonl GCS_BUCKET=toast-stats-data-staging GCS_BUCKET_PRODUCTION=toast-stats-data-ca npx tsx scripts/promote-run-manifest.ts --dry-run --assume-pass`.

**Pipeline-internal stores (#1738, decision D3).** `club-trends/` and `club-race/` are working
state for `compute-analytics`, not CDN products: no frontend or MCP code reads them (the frontend
reads club trends from the per-snapshot `analytics` file's `allClubs`, and the
`global-club-race.json` projection, instead). They
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

| Service                 | File                                                    | Purpose                                           |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| TransformService        | `collector-cli/src/services/TransformService.ts`        | CSV → snapshot JSON                               |
| AnalyticsComputeService | `collector-cli/src/services/AnalyticsComputeService.ts` | Snapshot → 10 analytics types                     |
| AnalyticsWriter         | `collector-cli/src/services/AnalyticsWriter.ts`         | Writes analytics JSON files                       |
| TimeSeriesIndexWriter   | `collector-cli/src/services/TimeSeriesIndexWriter.ts`   | Incremental time-series                           |
| ClubTrendsStore         | `collector-cli/src/services/ClubTrendsStore.ts`         | Incremental club trends                           |
| CDN service             | `frontend/src/services/cdn.ts`                          | Frontend CDN URL construction                     |
| FindAClubMerger         | `collector-cli/src/services/FindAClubMerger.ts`         | FAC enrichment → snapshot; club map point (#2160) |

### Club map point (#2160)

Whether a club gets `coordinates` is decided once, at the FAC merge, by
`resolveClubLocations` in `shared-contracts/src/geo/clubLocation.ts`, built on
`parseCoordinates` (#2153). It runs over the whole district's FAC response:

1. **Fully online** (`meetsOnlyOnline`) — a flag, not an unmap (split
   rollout, Ron 2026-10-19): `allowsVirtualAttendance === true` and every
   parsed `meetingSchedule[].mode` is `online` (the city text "Virtual" /
   "Online" decides only when no mode is known). The club gets
   `meetsOnline: true` and **keeps** its `coordinates`, `meetingDay`,
   `meetingTime` and `meetingSchedule`. The frontend hides online pins once
   its "Meets online" line and online-clubs chip ship. Hybrid clubs are not
   flagged.
2. **Geocode outlier** — unmapped: peers are the district's clubs with the
   same address country (groups under 5 are not judged). A point is dropped
   when it is farther from the group's median point than
   max(2,000 km, median + 5 × MAD) **and** has fewer than 3 peers within
   500 km (keeps District 2's Alaska). The club stays a row and counts as
   unmapped downstream (analytics `allClubs`, `clubs-by-region` shards).

Prod 2026-10-18: 161 outliers (28675595 among them) lose their point; 3,114
clubs are flagged fully online (1,176 hybrid are not). FAC has no meeting
timezone (`Address.TimeZone` is null). Rankings do not read coordinates, so
`all-districts-rankings.json` is unchanged. Published dates change on the next
daily or a rebuild.

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
