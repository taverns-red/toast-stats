# Deployment Guide

## Architecture

Toast Stats is a CDN-served analytics platform with no backend server.

```
Toastmasters Dashboard  →  Data Pipeline (GitHub Actions)  →  GCS + Cloud CDN  →  React SPA (Firebase Hosting)
```

- **Frontend**: Static React SPA deployed to Firebase Hosting
- **Data**: Pre-computed JSON served via Google Cloud CDN from GCS
- **Pipeline**: GitHub Actions workflow scrapes data daily, transforms it, and uploads to GCS

## Prerequisites

- Node.js 26+ and npm (the published `@taverns-red/toast-stats-mcp` supports Node 22+)
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud SDK (`gcloud`) for GCS bucket management
- GCP project with billing enabled

## Deploy Frontend

```bash
npm run build:frontend
firebase deploy --only hosting
```

The deploy workflow (`.github/workflows/deploy.yml`) runs automatically on merge to `main`.

## Data Pipeline

The pipeline runs daily via `.github/workflows/data-pipeline.yml`:

1. **Scrape** — Downloads CSVs from Toastmasters dashboard via HTTP
2. **Transform** — Converts raw CSVs to typed snapshots
3. **Compute Analytics** — Generates rankings, time-series, club trends
4. **Upload** — Pushes JSON files to GCS, served via Cloud CDN at `cdn.taverns.red`

### Manual Pipeline Run

```bash
# Trigger via GitHub Actions
gh workflow run data-pipeline.yml

# Or run collector-cli locally (requires GCS auth)
gcloud auth application-default login
npm run collector-cli -- scrape
npm run collector-cli -- transform
npm run collector-cli -- compute-analytics
```

## Environment

| Variable            | Where             | Purpose                                           |
| ------------------- | ----------------- | ------------------------------------------------- |
| `VITE_CDN_BASE_URL` | Frontend build    | CDN base URL (default: `https://cdn.taverns.red`) |
| `GCS_BUCKET`        | Pipeline workflow | GCS bucket for data storage                       |
| `GCP_PROJECT_ID`    | Deploy workflow   | GCP project for Firebase + GCS                    |

## CDN Cache Policy

| Content          | Cache-Control                   | Notes                       |
| ---------------- | ------------------------------- | --------------------------- |
| JS/CSS bundles   | `immutable, max-age=31536000`   | Content-addressed filenames |
| Snapshot JSON    | `max-age=3600, must-revalidate` | Mutable, updated daily      |
| `v1/latest.json` | `max-age=3600, must-revalidate` | Pipeline manifest           |
