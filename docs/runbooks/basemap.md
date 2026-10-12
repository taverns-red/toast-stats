# Runbook: self-hosted basemap build and upload (operator-run)

- **Issue:** #1786. **Decision:** [ADR-016](../architecture-decisions/016-self-hosted-protomaps-basemap.md).
- **Who:** Ron. No workflow writes `basemap/`, and the data pipeline never touches it.
- **When:** first upload, then only for a deliberate refresh (ADR-016 D5).

## What it produces

There is one immutable object per refresh:

```text
basemap/protomaps-v4/world-z0-10-<YYYYMMDD>.pmtiles
```

It goes to both data buckets:

- staging `toast-stats-data-staging`, which PR previews read;
- prod `toast-stats-data-ca`, which `cdn.taverns.red` serves.

The frontend reads the object named in `BASEMAP_OBJECT_PATH` in `frontend/src/config/basemap.ts`.

## 0. Prerequisites

- The official CLI, go-pmtiles ≥ 1.31, from github.com/protomaps/go-pmtiles/releases (`pmtiles version`).
- About **4.2 GB of free disk** for world z0–10. Check with `df -h .`.
- A Protomaps daily build from the last 7 days. Check that it exists with `curl -sI https://build.protomaps.com/<YYYYMMDD>.pmtiles`, which should return 200.

## 1. Build (local, read-only against Protomaps)

```bash
DRY_RUN=1 scripts/basemap/build-basemap.sh 20261011 10      # expect "archive size of 3.8 GB"
scripts/basemap/build-basemap.sh 20261011 10 ./basemap-build
# stdout: {"file":"./basemap-build/world-z0-10-20261011.pmtiles","object":"basemap/protomaps-v4/world-z0-10-20261011.pmtiles","bytes":…,"sha256":"…"}
```

`pmtiles verify` runs inside the script. Keep the printed `bytes` and `sha256` for the PR.

## 2. Upload to staging, then copy to prod

Three rules for these commands:

- **Never** pass `-Z`/`--gzip-local` or set `Content-Encoding`. GCS would then ignore `Range` and serve the whole object.
- **Never** use parallel composite upload. The CDN needs a strong `ETag`.
- `no-transform` keeps Cloud CDN's AUTOMATIC compression off the object.

```bash
OBJ=basemap/protomaps-v4/world-z0-10-20261011.pmtiles

CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False \
gcloud storage cp ./basemap-build/world-z0-10-20261011.pmtiles \
  "gs://toast-stats-data-staging/${OBJ}" \
  --content-type=application/octet-stream \
  --cache-control="public, max-age=86400, no-transform"

CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False \
gcloud storage cp "gs://toast-stats-data-staging/${OBJ}" \
  "gs://toast-stats-data-ca/${OBJ}" \
  --content-type=application/octet-stream \
  --cache-control="public, max-age=86400, no-transform"
```

The second command copies bucket to bucket inside Google Cloud, so nothing is uploaded from the laptop twice.

## 3. Verify (read-only)

```bash
gcloud storage objects describe "gs://toast-stats-data-ca/${OBJ}" \
  --format="yaml(size,content_type,cache_control,content_encoding,md5_hash,component_count)"
# expect: size = the build's bytes, content_type application/octet-stream,
#         cache_control "public, max-age=86400, no-transform",
#         no content_encoding, md5_hash present, no component_count

for i in 1 2; do
  curl -s -o /dev/null -D - -H 'Range: bytes=0-16383' -H 'Accept-Encoding: gzip, br' \
    -H 'Origin: https://ts.taverns.red' "https://cdn.taverns.red/${OBJ}" |
    grep -iE '^HTTP|content-range|content-length|content-encoding|accept-ranges|etag|age:|access-control-allow-origin'
done
# expect both times: HTTP/2 206 · content-range: bytes 0-16383/<size> · content-length: 16384
#   · accept-ranges: bytes · a quoted ETag · access-control-allow-origin: https://ts.taverns.red
#   · NO content-encoding. The second response should carry an `age:` header (a CDN hit).

curl -s -o /dev/null -D - -H 'Range: bytes=0-16383' \
  "https://storage.googleapis.com/toast-stats-data-staging/${OBJ}" | grep -iE '^HTTP|content-range'
```

Then run the 375 smoke against a PR preview and the live object:

```bash
cd frontend && BASE_URL=<preview url> BASEMAP_LIVE=1 \
  npx playwright test --config playwright.config.ts e2e/basemap-375.smoke.ts
```

## 4. Refresh later

Build a new dated object (steps 1–3). Then open a PR that changes `BASEMAP_OBJECT_PATH`. Delete the old object from both buckets one week after that PR deploys:

```bash
gcloud storage rm "gs://toast-stats-data-ca/<old>" "gs://toast-stats-data-staging/<old>"
```

## Clean up

Delete `./basemap-build/` after step 3. Built archives are never committed.
