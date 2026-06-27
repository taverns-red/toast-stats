# Collector CLI

Standalone command-line tool for scraping Toastmasters dashboard data and managing the pre-computed analytics pipeline.

## Overview

This package provides a standalone CLI tool that:

- Scrapes data from the Toastmasters dashboard
- Transforms raw CSV data into snapshot format
- Computes analytics from snapshots
- Uploads data to Google Cloud Storage

It operates independently from the backend application, enabling separate scheduling and management of data operations.

## Requirements

- Node.js >= 18.0.0
- Playwright (installed automatically)

## Installation

```bash
# From the repository root
npm install

# Build the package
npm run build:collector-cli
```

## Commands

### Scrape Command

Scrapes data from the Toastmasters dashboard and stores it in the Raw CSV Cache.

```bash
# Scrape all districts for today
collector-cli scrape

# Scrape for a specific date
collector-cli scrape --date 2025-01-10

# Scrape specific districts
collector-cli scrape --districts 57,58,59

# Force re-scrape even if cache exists
collector-cli scrape --force

# Enable verbose logging
collector-cli scrape --verbose

# Set custom timeout (in seconds)
collector-cli scrape --timeout 600

# Use alternative configuration file
collector-cli scrape --config /path/to/config.json

# Scrape and transform in one step
collector-cli scrape --transform
```

### Transform Command

Transforms raw CSV files into snapshot format for serving by the backend.

```bash
# Transform all available districts for today
collector-cli transform

# Transform for a specific date
collector-cli transform --date 2025-01-10

# Transform specific districts
collector-cli transform --districts 57,58,59

# Force re-transform even if snapshots exist
collector-cli transform --force

# Enable verbose logging
collector-cli transform --verbose
```

**Output Structure:**

```
CACHE_DIR/snapshots/{date}/
├── metadata.json           # Snapshot metadata
├── manifest.json           # List of district files with checksums
├── district_42.json        # District 42 snapshot data
├── district_57.json        # District 57 snapshot data
└── ...
```

### Compute Analytics Command

Computes analytics from existing snapshots using the same algorithms as the backend AnalyticsEngine.

```bash
# Compute analytics for today's snapshot
collector-cli compute-analytics

# Compute for a specific date
collector-cli compute-analytics --date 2025-01-10

# Compute for specific districts
collector-cli compute-analytics --districts 57,58,59

# Force re-compute even if analytics exist
collector-cli compute-analytics --force-analytics

# Enable verbose logging
collector-cli compute-analytics --verbose
```

**Output Structure:**

```
CACHE_DIR/snapshots/{date}/analytics/
├── manifest.json                    # Analytics manifest with checksums
├── district_42_analytics.json       # District 42 analytics
├── district_57_analytics.json       # District 57 analytics
└── ...
```

**Analytics File Contents:**
Each district analytics file contains:

- `membershipTrends`: Membership growth and trends
- `clubHealth`: Club health classifications and scores
- `distinguishedClubs`: Distinguished club tracking and projections
- `divisionAreaAnalytics`: Division and area performance metrics

### Upload Command

Uploads snapshots and analytics to Google Cloud Storage.

```bash
# Upload all available dates
collector-cli upload

# Upload a specific date
collector-cli upload --date 2025-01-10

# Incremental upload (only changed files)
collector-cli upload --incremental

# Dry run (show what would be uploaded)
collector-cli upload --dry-run

# Enable verbose logging
collector-cli upload --verbose
```

**Environment Variables:**

- `GCS_BUCKET`: Target GCS bucket (default: `toast-stats-data`)
- `GCS_PREFIX`: Object prefix in bucket (default: `snapshots`)
- `GCP_PROJECT_ID`: Google Cloud project ID (optional)

### Status Command

Checks cache status for a specific date.

```bash
# Check cache status for today
collector-cli status

# Check cache status for a specific date
collector-cli status --date 2025-01-10
```

## Exit Codes

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | All operations completed successfully                      |
| 1    | Some operations failed, others succeeded (partial failure) |
| 2    | All operations failed or fatal error occurred              |

## Output Format

All commands output a JSON summary to stdout on completion:

### Scrape Summary

```json
{
  "timestamp": "2025-01-11T12:00:00.000Z",
  "date": "2025-01-10",
  "status": "success",
  "districts": {
    "total": 10,
    "succeeded": 10,
    "failed": 0,
    "skipped": 0
  },
  "cache": {
    "directory": "./cache/raw-csv",
    "filesCreated": 40,
    "totalSize": 1234567
  },
  "errors": [],
  "duration_ms": 45000
}
```

### Transform Summary

```json
{
  "timestamp": "2025-01-11T12:00:00.000Z",
  "date": "2025-01-10",
  "status": "success",
  "districts": {
    "total": 10,
    "succeeded": 10,
    "failed": 0,
    "skipped": 0
  },
  "snapshots": {
    "directory": "./cache/snapshots/2025-01-10",
    "filesCreated": 12
  },
  "errors": [],
  "duration_ms": 5000
}
```

### Compute Analytics Summary

```json
{
  "timestamp": "2025-01-11T12:00:00.000Z",
  "date": "2025-01-10",
  "status": "success",
  "districts": {
    "total": 10,
    "succeeded": 10,
    "failed": 0,
    "skipped": 0
  },
  "analytics": {
    "directory": "./cache/snapshots/2025-01-10/analytics",
    "filesCreated": 11
  },
  "errors": [],
  "duration_ms": 3000
}
```

### Upload Summary

```json
{
  "timestamp": "2025-01-11T12:00:00.000Z",
  "dates": ["2025-01-10"],
  "status": "success",
  "dryRun": false,
  "files": {
    "total": 23,
    "uploaded": 23,
    "failed": 0,
    "skipped": 0
  },
  "destination": {
    "bucket": "toast-stats-data",
    "prefix": "snapshots"
  },
  "errors": [],
  "duration_ms": 8000
}
```

## Configuration

The CLI reads configuration from:

1. Environment variables
2. Configuration file (specified with `--config`)
3. Default district configuration from the backend

### Environment Variables

- `TOASTMASTERS_DASHBOARD_URL`: Base URL for the dashboard (default: https://dashboards.toastmasters.org)
- `CACHE_DIR`: Directory for storing cached data (default: ./cache)
- `GCS_BUCKET`: GCS bucket for uploads (default: toast-stats-data)
- `GCS_PREFIX`: GCS object prefix (default: snapshots)
- `GCP_PROJECT_ID`: Google Cloud project ID

## Architecture

This package is part of the pre-computed analytics pipeline:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Collector CLI Pipeline                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌───────────┐    ┌─────────────────┐    ┌────────┐│
│  │  scrape  │───▶│ transform │───▶│ compute-analytics│───▶│ upload ││
│  └──────────┘    └───────────┘    └─────────────────┘    └────────┘│
│       │               │                    │                  │     │
│       ▼               ▼                    ▼                  ▼     │
│  Raw CSV Cache   Snapshots          Analytics Files      GCS Bucket │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────┐
                        │      Backend        │
                        │ (serves pre-computed│
                        │     analytics)      │
                        └─────────────────────┘
```

### Data Flow

1. **Scrape**: Downloads CSV data from Toastmasters dashboard → Raw CSV Cache
2. **Transform**: Converts CSV to JSON snapshots → Snapshot files
3. **Compute Analytics**: Generates analytics from snapshots → Analytics files
4. **Upload**: Syncs local files to GCS → Cloud storage
5. **Backend**: Serves pre-computed analytics from local cache or GCS

### Shared Package

The `@taverns-red/analytics-core` package provides shared analytics computation logic used by both:

- `collector-cli` (for pre-computing analytics)
- `backend` (for validation and type definitions)

This ensures analytics computed by the CLI are identical to what the backend would compute.

## Development

```bash
# Run in development mode
npm run dev --workspace=@taverns-red/collector-cli

# Run tests
npm run test:collector-cli

# Type check
npm run typecheck --workspace=@taverns-red/collector-cli
```

## License

Private - Internal use only
