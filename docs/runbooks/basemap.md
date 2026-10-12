# Runbook: self-hosted basemap build and upload (operator-run)

- **Issue:** #1786. **Decision:** [ADR-016](../architecture-decisions/016-self-hosted-protomaps-basemap.md).
- **Who:** Ron. Only the manual workflow `.github/workflows/basemap-build.yml` writes `basemap/`. It never runs on a schedule or a push, and the data pipeline never touches `basemap/`.
- **When:** first upload, then only for a deliberate refresh (ADR-016 D5).
- **Where it runs:** on a GitHub runner, not a laptop. World z0–10 needs about 4.4 GB of free disk. Ron decided this on 2026-10-12.

## What it produces

There is one immutable object per refresh:

```text
basemap/protomaps-v4/world-z0-<maxzoom>-<YYYYMMDD>.pmtiles
```

It goes to both data buckets:

- staging `toast-stats-data-staging`, which PR previews read;
- prod `toast-stats-data-ca`, which `cdn.taverns.red` serves.

The frontend reads the object named in `BASEMAP_OBJECT_PATH` in `frontend/src/config/basemap.ts`. `build_date` and `maxzoom` must match that name.

## 0. Before dispatching

- The workflow must be on `main`. GitHub only dispatches `workflow_dispatch` workflows that exist on the default branch.
- The Protomaps build must still exist (Protomaps keeps daily builds for one week). This should return 200:

  ```bash
  curl -sI https://build.protomaps.com/20261011.pmtiles | head -1
  ```

  If it has expired, pick a current date. Then change `BASEMAP_OBJECT_PATH` to match, in a PR, before step 2.

- No data-pipeline run should be in progress. They share no paths, but this keeps the bucket activity readable:

  ```bash
  gh run list --workflow data-pipeline.yml --status in_progress
  ```

## 1. Build and upload to staging

```bash
gh workflow run basemap-build.yml --repo taverns-red/toast-stats --ref main \
  -f build_date=20261011 -f maxzoom=10 -f target=staging
gh run watch --repo taverns-red/toast-stats "$(gh run list --repo taverns-red/toast-stats \
  --workflow basemap-build.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

The job runs these steps, in order. It fails closed at each one:

1. Frees runner disk by removing toolchains it does not use.
2. Installs the pmtiles CLI, pinned to 1.31.2 and checked against its sha256.
3. Refuses if the object already exists.
4. Sizes the archive with the CLI's own dry-run and picks the runner volume with room for it. If none has room, it stops with "use a larger runner".
5. Builds the archive with `scripts/basemap/build-basemap.sh`, which runs `pmtiles verify`.
6. Uploads with:
   - `--no-clobber`;
   - `--content-type=application/octet-stream`;
   - `--cache-control="public, max-age=86400, no-transform"`;
   - no gzip;
   - parallel composite upload disabled.
7. Checks that:
   - the object's size equals the built bytes;
   - its metadata is as uploaded, with no `content_encoding` and no `component_count`;
   - a `Range: bytes=0-16383` read from `storage.googleapis.com` returns a `206` with no `content-encoding`.

The job summary records the object, source build, bytes, sha256 and GCS md5.

Then check a PR preview against the real staging object:

```bash
cd frontend && BASE_URL=<preview url> BASEMAP_LIVE=1 \
  npx playwright test --config playwright.config.ts e2e/basemap-375.smoke.ts
```

## 2. Copy to prod (server side)

```bash
gh workflow run basemap-build.yml --repo taverns-red/toast-stats --ref main \
  -f build_date=20261011 -f maxzoom=10 -f target=prod-copy
```

The job runs these steps:

1. Checks the staging object's metadata.
2. Runs `gcloud storage cp gs://toast-stats-data-staging/<obj> gs://toast-stats-data-ca/<obj>` with the same flags. The copy happens inside Google Cloud; nothing is re-uploaded.
3. Checks that the prod object's size and md5 equal staging's.
4. Reads `https://cdn.taverns.red/<obj>` twice with `Range` and `Origin: https://ts.taverns.red`. Each read must return:
   - `206`;
   - `content-range: bytes 0-16383/<size>`;
   - ACAO `https://ts.taverns.red`;
   - no `content-encoding`.

The upload rules, and why each one matters, are in the workflow header and ADR-016 D4. `scripts/lib/__tests__/basemapWorkflow.test.ts` guards them.

## 3. Spot-check by hand (optional, read-only)

```bash
OBJ=basemap/protomaps-v4/world-z0-10-20261011.pmtiles
gcloud storage objects describe "gs://toast-stats-data-ca/${OBJ}" \
  --format="yaml(size,content_type,cache_control,content_encoding,md5_hash,component_count)"
for _ in 1 2; do
  curl -s -o /dev/null -D - -H 'Range: bytes=0-16383' -H 'Accept-Encoding: gzip, br' \
    -H 'Origin: https://ts.taverns.red' "https://cdn.taverns.red/${OBJ}" |
    grep -iE '^HTTP|content-range|content-encoding|accept-ranges|etag|age:|access-control-allow-origin'
done
```

The second response should carry an `age:` header, which means a CDN hit.

## 4. Refresh later

Pick a new `build_date`. Change `BASEMAP_OBJECT_PATH` in a PR, then run steps 1–2 with the new date. Delete the old object from both buckets one week after that PR deploys:

```bash
gcloud storage rm "gs://toast-stats-data-ca/<old>" "gs://toast-stats-data-staging/<old>"
```

## Local build (diagnostics only)

`scripts/basemap/build-basemap.sh` also runs on a Mac with the pmtiles CLI on PATH, or with its path in `$PMTILES`. `DRY_RUN=1` prints the size without downloading anything. Built archives are never committed. The uploads above go through the workflow.
