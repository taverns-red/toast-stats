# Architecture — Toast Stats

**Last updated:** June 2026

---

## System Overview

Toast Stats is a CDN-served analytics platform for Toastmasters district leadership. It has no backend server — all data is pre-computed and served as static JSON via Google Cloud CDN.

```
┌──────────────┐     ┌───────────────────┐     ┌─────────────┐     ┌──────────┐
│  Toastmasters │     │   Data Pipeline    │     │  Google     │     │ React    │
│  Dashboard    │────▶│   (GitHub Actions) │────▶│  Cloud CDN  │────▶│ SPA      │
│  (export.aspx)│     │                   │     │  (GCS)      │     │ (Vite)   │
└──────────────┘     └───────────────────┘     └─────────────┘     └──────────┘
```

## Monorepo Workspaces

| Workspace          | Path                         | Purpose                                                                              | Dependencies                           |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| `frontend`         | `frontend/`                  | React SPA (Vite, React 19)                                                           | shared-contracts                       |
| `collector-cli`    | `packages/collector-cli/`    | Data pipeline CLI                                                                    | analytics-core, shared-contracts       |
| `analytics-core`   | `packages/analytics-core/`   | Transformation + analytics computation                                               | shared-contracts                       |
| `shared-contracts` | `packages/shared-contracts/` | Zod schemas, types, validators                                                       | (none)                                 |
| `mcp-server`       | `packages/mcp-server/`       | Read-only MCP server over the snapshot CDN (`@taverns-red/toast-stats-mcp`, ADR-008) | shared-contracts (build-time, inlined) |

### Dependency Direction

```
frontend ──▶ shared-contracts
collector-cli ──▶ analytics-core ──▶ shared-contracts
```

No circular dependencies. `shared-contracts` is the foundation.

---

## Data Pipeline Architecture

The pipeline runs as a GitHub Actions workflow (`data-pipeline.yml`) with 5 modes:

| Mode                  | Trigger                                                  | What It Does                                                         |
| --------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `daily`               | Cron (08:00 UTC, backup 11:00 UTC)                       | Scrape today → transform → compute → upload to staging               |
| `rebuild`             | Manual                                                   | Re-process historical dates from GCS raw-csv (no re-scrape)          |
| `rescrape`            | Manual                                                   | Re-collect CSVs from dashboard for specific dates/program year       |
| `rescrape-historical` | Manual                                                   | Re-download ALL historical CSVs (4-segment URL format), then rebuild |
| `prune`               | Manual + cron (06:00 UTC on the 25th of Feb/May/Aug/Nov) | Remove non-month-end snapshots to reduce storage                     |

The two daily crons are deliberate: the 11:00 UTC run is a backup that absorbs GitHub's
occasionally-dropped scheduled events (#753). Every write lands in **staging** first; a gated
promotion copies it to production (see [Staging → Production Promotion](#staging--production-promotion)).

### Data Flow (daily)

```
1. Discover districts   → curl export.aspx?report=districtsummary
2. Scrape per-district  → collector-cli scrape --date --transform
3. Compute analytics    → collector-cli compute-analytics --date
4. Upload to GCS        → gsutil cp snapshots/ + analytics/
5. Generate manifests   → v1/latest.json, v1/dates.json, v1/rankings.json
```

### Storage Layout (same layout in both buckets)

There are **two** GCS buckets with the same internal layout:

- **`toast-stats-data-staging`** (`GCS_BUCKET`) — every pipeline run writes here first.
- **`toast-stats-data-ca`** (`GCS_BUCKET_PRODUCTION`) — the CDN origin; only the gated promotion writes here.

```
gs://toast-stats-data-{staging|ca}/
├── raw-csv/{YYYY-MM-DD}/                  # staging-only; promotion never syncs raw-csv
│   ├── all-districts.csv
│   ├── district-{id}/
│   │   ├── club-performance.csv
│   │   ├── division-performance.csv
│   │   └── district-performance.csv
│   └── metadata.json
├── snapshots/{YYYY-MM-DD}/
│   ├── district_{id}.json
│   ├── all-districts-rankings.json
│   └── analytics/
│       ├── district_{id}_analytics.json
│       ├── district_{id}_club-trends-index.json
│       └── district_{id}_performance-targets.json
├── time-series/district_{id}/{year}.json
├── club-trends/district_{id}.json
└── v1/
    ├── latest.json        (5-min cache)
    ├── dates.json         (15-min cache)
    └── rankings.json      (1-hr cache)
```

### Staging → Production Promotion

The pipeline never writes production directly. After a run finishes processing into **staging**,
two gates decide whether staging is promoted to production (`gsutil rsync` of `v1/`, `snapshots/`,
`time-series/`, `club-trends/`, `config/` — additive, no `-d`):

1. **Count gate (#316)** — additive guard. Blocks promotion if staging has _fewer_ ranked
   districts or _fewer_ dates than production (a subtractive change).
2. **Value-diff gate (#1034)** — value guard. The count gate is blind to a re-derive that keeps
   the same dates/districts but changes the underlying _values_. This gate digests per-date
   district values over the overlap set and **blocks unless the operator dispatches with
   `allow_value_changes=true`** after reviewing the diff. Fail-closed: any error → no promote.

Both gates must pass (`promote && value_promote`). When a gate blocks, production is left
untouched and a `promotion-held` alert issue is filed/refreshed (#1072) so stale-prod can't
persist unnoticed. Full operator procedure: [docs/data-pipeline-flow.md](data-pipeline-flow.md)
and [docs/runbooks/pipeline-rerun-2017-to-now.md](runbooks/pipeline-rerun-2017-to-now.md).

---

## Frontend Architecture

### Stack

- **React 19** + **Vite** (dev server + build)
- **React Router** (client-side routing)
- **React Query** (data fetching + caching)
- **Recharts** (charts)
- **Vanilla CSS** with design token system

### Routing

All pages are code-split via `React.lazy()`. The district detail surface is a set of **routed
subpages** (Overview · Clubs · Divisions · Trends · Analytics · Rankings), not a tab strip
(epic #674) — deep-linkable and back-button friendly. Selected routes:

```
/                                              → DistrictsPage (global rankings table)
/district/:districtId                          → DistrictDetailPage (Overview hub)
/district/:districtId/{clubs,divisions,rankings,trends,analytics,changes}
/district/:districtId/division/:divId          → DivisionPage
/district/:districtId/division/:divId/area/:areaId → AreaPage
/district/:districtId/club/:clubId             → ClubDetailPage
/regions, /region/:n                           → Regions overview + region page
/history, /methodology, /awards, /mcp          → static + MCP install page
(root errorElement)                            → branded 404 / error boundary (#1010)
```

### Data Fetching Pattern

All data comes from CDN. No API server.

```typescript
// Pattern: CDN fetch → React Query cache
const { data } = useQuery({
  queryKey: ['analytics', districtId, date],
  queryFn: () => fetchCdnDistrictAnalytics(districtId, date),
})
```

CDN URL structure: `https://cdn.taverns.red/snapshots/{date}/district_{id}_analytics.json`

### Key Hooks

| Hook                    | CDN Source                                              | Purpose                   |
| ----------------------- | ------------------------------------------------------- | ------------------------- |
| `useGlobalRankings`     | `v1/rankings.json`                                      | Landing page rankings     |
| `useDistrictAnalytics`  | `snapshots/{date}/analytics/*`                          | District detail analytics |
| `useTimeSeries`         | `time-series/district_{id}/{year}.json`                 | Membership/payment trends |
| `useClubs`              | `snapshots/{date}/district_{id}.json`                   | Club-level data           |
| `usePerformanceTargets` | `snapshots/{date}/analytics/*_performance-targets.json` | Rank targets              |

---

## Analytics Pipeline (analytics-core)

### Transformation

`DataTransformer` converts raw CSV → structured district snapshot JSON:

- Parses Toastmasters CSV format (with "As of" date headers)
- Extracts club, division, and district performance data
- Normalizes field names and types

### Computation Modules

| Module                             | Computes                                       |
| ---------------------------------- | ---------------------------------------------- |
| `MembershipAnalyticsModule`        | Growth rates, top growth clubs, trends         |
| `ClubHealthAnalyticsModule`        | Health classification (Thriving/Vulnerable/IR) |
| `DistinguishedClubAnalyticsModule` | DCP goal analysis, projections                 |
| `LeadershipAnalyticsModule`        | Leadership effectiveness scores                |
| `DivisionAreaAnalyticsModule`      | Division/Area performance metrics              |
| `AreaDivisionRecognitionModule`    | DAP/DDP eligibility tracking                   |

### Ranking System

`BordaCountRankingCalculator` ranks districts across 3 metrics (membership, payments, DCP) using a Borda count algorithm — each metric ranks independently, then scores are summed for a fair composite rank.

---

## Infrastructure

| Service                              | Purpose                      | Config                                |
| ------------------------------------ | ---------------------------- | ------------------------------------- |
| **GCS** (`toast-stats-data-staging`) | Pipeline write target        | Workload Identity Federation          |
| **GCS** (`toast-stats-data-ca`)      | Production data + CDN origin | Promotion target (gated)              |
| **Cloud CDN** (`cdn.taverns.red`)    | Serves all data to frontend  | Immutable cache for snapshots         |
| **Firebase Hosting**                 | Hosts the React SPA          | `ts.taverns.red` (`deploy.yml`)       |
| **GitHub Actions**                   | Data pipeline + deploy       | WIF auth, 240-min timeout for rebuild |

### Authentication

GitHub Actions authenticates to GCP via Workload Identity Federation (no service account keys). Setup: `scripts/setup-wif.sh`.

---

## Key Design Decisions

See [product-spec.md](product-spec.md) for the decision table. ADRs for significant changes go in `docs/architecture-decisions/`.
