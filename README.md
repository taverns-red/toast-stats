# Toastmasters District Statistics Visualizer

A data visualization platform for Toastmasters district leaders to track performance metrics, compare districts globally, and make data-driven decisions.

**Live site:** [ts.taverns.red](https://ts.taverns.red)

**Brand:** Red Taverns Brand v1.0 — token source of truth is [`taverns-red/ops:docs/brand/`](https://github.com/taverns-red/ops/blob/main/docs/brand/). The product is part of the [Red Taverns](https://taverns.red) branded house, accent color `--rt-stats` (#D4873F). UI chrome migration to brand v1.0 is tracked at [#339](https://github.com/taverns-red/toast-stats/issues/339) and gated on the Toast Stats / Tally rename decision ([`ops#37`](https://github.com/taverns-red/ops/issues/37)).

## Project Structure

This is a monorepo containing:

- `frontend/` - React + TypeScript + Vite application (the entire user-facing product)
- `packages/collector-cli/` - Standalone CLI tool that scrapes, transforms, and computes analytics
- `packages/analytics-core/` - Shared analytics computation library
- `packages/shared-contracts/` - Data contracts (types + Zod schemas) between packages
- `packages/mcp-server/` - Thin local read-only MCP server over the public snapshot CDN (`@taverns-red/toast-stats-mcp`, ADR-008)

> **No backend server.** The Express API was decommissioned — all data is pre-computed by the
> collector-cli pipeline, stored as static JSON in GCS, and served directly to the SPA via
> Cloud CDN. There is nothing to run between the CDN and the browser.

## Prerequisites

- Node.js 20+ and npm

## Getting Started

### Installation

Install all workspace dependencies:

```bash
npm install
```

### Configuration

1. Copy the example frontend environment file:

```bash
cp frontend/.env.example frontend/.env
```

2. Update the environment variables in the `.env` file as needed.

#### Cache Configuration

The collector-cli uses a unified cache configuration system. Set the `CACHE_DIR` environment variable to configure where scraped data is cached during a pipeline run:

```bash
# Development (relative path)
CACHE_DIR=./cache

# Production (absolute path)
CACHE_DIR=/var/cache/toastmasters
```

For detailed cache configuration examples for different deployment scenarios, see [docs/CACHE_CONFIGURATION.md](./docs/CACHE_CONFIGURATION.md).

### Development

Run the frontend dev server:

```bash
npm run dev:frontend
```

The frontend will be available at `http://localhost:3000`. In development it reads pre-computed
snapshots straight from the public CDN — there is no local API server to run.

### Building for Production

Build the frontend (TypeScript check + Vite build):

```bash
npm run build:frontend
```

### Code Quality

Format code with Prettier:

```bash
npm run format
```

Lint code:

```bash
npm run lint
```

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- TailwindCSS
- React Router
- TanStack Query (React Query) — data fetching + caching from the CDN
- Recharts

### Data Pipeline (collector-cli)

- Node.js + TypeScript
- Commander (CLI)
- csv-parse (Toastmasters CSV parsing)
- Zod for runtime validation
- `@google-cloud/storage` (GCS reads/writes)

### Shared Packages

- `@taverns-red/shared-contracts` - TypeScript types and Zod schemas shared across all packages
- `@taverns-red/analytics-core` - Analytics computation engine (membership, club health, distinguished, leadership)

## Data Source

The application fetches data from the public Toastmasters dashboards at https://dashboards.toastmasters.org.

### Architecture Overview

The system separates data acquisition from data serving — there is no API server in the request path:

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Collector CLI  │────▶│  GCS buckets │────▶│  Cloud CDN   │────▶│  React SPA   │
│ (GitHub Actions)│     │ (static JSON)│     │ cdn.taverns… │     │  (browser)   │
└─────────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

1. **Collector CLI** (`packages/collector-cli/`): runs in scheduled GitHub Actions, scrapes the Toastmasters dashboard, transforms data, computes analytics, and uploads pre-computed snapshots/analytics as static JSON to GCS.
2. **Cloud CDN** serves that static JSON directly to the SPA — no backend, no computation at request time.

This architecture enables:

- Independent scheduling of scraping operations
- Infinite read scaling (the CDN serves immutable static files)
- Scraping failures never affect data serving
- Easier testing and maintenance

See [docs/architecture.md](./docs/architecture.md) and [docs/data-pipeline-flow.md](./docs/data-pipeline-flow.md) for the full data flow, including the staging→prod promotion model.

### Running the Collector

```bash
# Scrape all configured districts for today
npm run collector-cli -- scrape

# Scrape for a specific date
npm run collector-cli -- scrape --date 2025-01-10

# Scrape specific districts
npm run collector-cli -- scrape --districts 57,58,59

# Check cache status
npm run collector-cli -- status
```

The collector-cli writes its output to GCS; the frontend reads the published snapshots from the
CDN. For local frontend development you do not run the collector — the dev server fetches the
live public snapshots directly.

## Features

### Global Rankings

- Composite scoring system (Borda count) across all districts worldwide
- Region-level filtering and historical rank progression charts
- Scoring methodology breakdown with per-metric rankings

### District Overview

- Performance target cards with recognition-level thresholds (Distinguished → Smedley)
- World rank, region rank, and percentile for each metric
- Club health categorization (thriving / vulnerable / intervention required)
- Distinguished club projection and progress tracking
- DAP/DDP (Distinguished Area/Division Program) recognition panels

### Analytics

- Leadership effectiveness scores by division (weighted Health/Growth/DCP)
- Top growth clubs and DCP goal analysis
- Membership and payments trend charts with year-over-year comparison

### Club Detail

- Per-club membership trend graphs with historical data
- DCP goal progress, health score, and risk factors
- Division and area performance comparison

### Data & Export

- CSV export of district analytics
- Program year and date-specific snapshot selection
- Pre-computed analytics pipeline for fast page loads

## Project History

This project has evolved through multiple phases of development. Completed specifications have been archived in `.kiro/specs-archive/` for historical reference.

**Recent Completions (February 2026):**

- **remove-backend-backfill**: Removed all backfill code, redirecting to collector-cli
- **v8-heap-configuration**: V8 heap memory management for production stability
- **gcp-storage-migration**: Storage abstraction with GCP Firestore and Cloud Storage
- **openapi-documentation**: Comprehensive OpenAPI 3.0 specification
- **shared-data-contracts**: Shared TypeScript types and Zod schemas between packages

**Infrastructure & Architecture:**

- **collector-cli-separation**: Standalone scraping CLI tool
- **data-computation-separation**: Backend as read-only API, all computation in collector-cli
- **data-refresh-architecture**: Snapshot-based data architecture
- **raw-csv-cache-system**: CSV caching infrastructure

See `.kiro/specs-archive/README.md` for the complete list of 83 archived specifications.

## Deployment

For production deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

Production architecture:

- **Frontend**: Firebase Hosting (static SPA, `ts.taverns.red`)
- **Data**: GCS buckets — staging (`toast-stats-data-staging`) and production (`toast-stats-data-ca`) — served via Cloud CDN (`cdn.taverns.red`). No Cloud Run, no Firestore.

### CI/CD Pipeline

The project uses GitHub Actions for continuous integration and deployment:

- **CI** (`ci.yml`): Runs on every push — typecheck, lint, and test across all workspaces
- **Deploy** (`deploy.yml`): Builds the frontend and deploys it to Firebase Hosting
- **PR Preview** (`pr-preview.yml`): On every PR that touches `frontend/**`, `packages/{shared-contracts,analytics-core}/**`, or Firebase config, deploys a temporary Firebase Hosting preview channel and posts the live URL as a PR comment
- **Data Pipeline** (`data-pipeline.yml`): Scheduled scraping + analytics computation into staging, gated promotion to production

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for pre-deployment verification steps.

## Testing

Run tests:

```bash
# All tests
npm test

# Individual workspaces
npm run test:frontend
npm run test:analytics-core
npm run test:collector-cli
npm run test:shared-contracts
npm run test:mcp-server

# Coverage report
npm run test:coverage
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
