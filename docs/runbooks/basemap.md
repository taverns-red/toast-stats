# Runbook: self-hosted basemap build and upload (operator-run)

- **Issue:** #1786. **Decision:** [ADR-016](../architecture-decisions/016-self-hosted-protomaps-basemap.md).
- **Who:** Ron. Only the manual workflow `.github/workflows/basemap-build.yml` writes `basemap/`. It never runs on a schedule or a push, and the data pipeline never touches `basemap/`.
- **When:** first upload, then only for a deliberate refresh (ADR-016 D5).
- **Where it runs:** on a GitHub runner, not a laptop. World z0–10 needs about 4.4 GB of free disk, and world z0–14 about 80 GB (§5). Ron decided this on 2026-10-12.

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

The workflow defaults to `dry_run=true` (#2084): it sizes the archive and checks the disk, then stops without downloading or writing anything. Run it once as a dry run, then again with `-f dry_run=false` to build and upload.

```bash
gh workflow run basemap-build.yml --repo taverns-red/toast-stats --ref main \
  -f build_date=20261011 -f maxzoom=10 -f target=staging -f dry_run=false
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
  -f build_date=20261011 -f maxzoom=10 -f target=prod-copy -f dry_run=false
```

With `dry_run=true` this target only checks the staging object's metadata.

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
OBJ=basemap/protomaps-v4/world-z0-14-20261015.pmtiles
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

Pick a new `build_date`. Change `BASEMAP_OBJECT_PATH` (and `BASEMAP_MAX_ZOOM` if the max zoom changes) in a PR, then run steps 1–2 with the new date. Delete the old object from both buckets one week after that PR deploys:

```bash
gcloud storage rm "gs://toast-stats-data-ca/<old>" "gs://toast-stats-data-staging/<old>"
```

## 5. World z0–14: street-level detail everywhere (#2084)

Ron chose this on 2026-10-15. It replaces z0–10, and he preferred it to a near-clubs merge: a z0–14 world file has no blank tiles away from clubs and no club-location list to keep current. Street names and POIs exist in the Protomaps v4 schema only at z12–14. The object is `basemap/protomaps-v4/world-z0-14-<YYYYMMDD>.pmtiles`, and the upload rules above apply unchanged.

**Size.** On 2026-10-15, `pmtiles extract https://build.protomaps.com/20261015.pmtiles /dev/null --maxzoom=14 --dry-run` (go-pmtiles 1.31.2) reported 58,786,221 tile entries and an archive size of 69 GB. That is about 64 GiB.

**Where it builds: the standard runner.**

- `pmtiles extract` writes its output with offset writes and then seeks back to write the header (`pmtiles/extract.go`). It therefore cannot stream to stdout or to GCS. A gcsfuse mount would stage the whole file on local disk anyway.
- The archive needs about 1.0× its size on local disk. The space check asks for 69 GB × 1.15 + 1 GB ≈ 80 GB.
- On run `38305058683` (2026-10-12), the `ubuntu-26.04` runner's 145 GB root volume had **109 GB free** after the "Free runner disk" step: `/mnt` and `$RUNNER_TEMP` each reported 115,983,052,800 bytes available. That covers the 80 GB.
- If a runner image ever ships with less free space, the sizing step stops before downloading, with "use a larger runner".
- The fallbacks, in order: (1) join `/mnt` and the root volume with LVM (`easimon/maximize-build-space`); (2) a GitHub larger runner, which needs an org admin to create it and costs about $0.032/min for 8 cores; (3) Cloud Build or a VM in our project, which needs new IAM and a disk. None of them is needed on today's evidence.
- **Cost:** $0. Standard runner minutes are free on this public repo, and Protomaps' host does not charge for the download.
- **Runtime:** estimated at **35–45 min**. Run `38305058683` built z0–10 in 54 s (about 70 MB/s) and uploaded 3.8 GB in 31 s (about 120 MB/s). At those rates z0–14 takes about 17 min to extract, about 5 min for sha256 and verify, and about 10 min to upload. The job timeout is 240 min, which covers four extract attempts.
- **Network faults:** z0–14 reads its whole 64 GB tile section in one range request (`fetching 58786221 tiles, 1 chunks, 1 requests`), and go-pmtiles 1.31.2 has no retry or resume. Run `38826110491` lost it twice: once to an HTTP/2 `INTERNAL_ERROR` at 42 GB, then to a TCP reset at 4 GB. `build-basemap.sh` now has two defences. First, extract reads through `scripts/basemap/range-proxy.mjs`, a local proxy that fetches the range in 256 MiB HTTP/1.1 segments and resumes a dropped segment from its last byte. It refuses an ETag change mid-read rather than splice two builds together. Second, an outer retry runs extract up to `PMTILES_EXTRACT_ATTEMPTS=4` times, with `PMTILES_EXTRACT_TIMEOUT=40m` per attempt, and deletes the partial file before each attempt. The workflow also sets `GODEBUG=http2client=0`, so go-pmtiles' own direct reads use HTTP/1.1. Set `BASEMAP_RANGE_PROXY=0` to read the source directly.
- **Storage:** 69 GB in each of two buckets, at Standard storage of about US$0.02–0.026 per GB-month, is about **US$3–3.6 a month**. Delete the old z0–10 object a week after the switch (step 4).

**CDN.** These were read-only checks on 2026-10-15, against the Cloud CDN caching docs:

- The backend bucket `toast-stats-cdn-backend` has `CACHE_ALL_STATIC`, `defaultTtl` 3600, `maxTtl` 86400, `clientTtl` 3600, `requestCoalescing` true, `serveWhileStale` 86400 and `compressionMode` AUTOMATIC.
- Cloud CDN caches objects up to **100 GiB** when the origin supports byte ranges. 64 GiB fits.
- It fills the cache in chunks of about 2 MiB (2,097,136 bytes), so only the chunks viewers touch are filled.
- The origin must answer with `Accept-Ranges: bytes`, a full `Content-Range` length and a strong `ETag`. GCS gives a non-composite object these, which is why parallel composite upload stays disabled.
- The upload's `max-age=86400` equals `maxTtl`, so a chunk lives up to a day and is then refilled on demand. Dynamic compression never applies: the object is `application/octet-stream`, carries `no-transform`, and is over 10 MiB.
- No CDN change is needed.

**Dispatch** (needs Ron's approval). Run the dry run first; it downloads and writes nothing:

```bash
gh workflow run basemap-build.yml --repo taverns-red/toast-stats --ref main \
  -f build_date=20261015 -f maxzoom=14 -f target=staging
# then, after reading the dry-run summary:
gh workflow run basemap-build.yml --repo taverns-red/toast-stats --ref main \
  -f build_date=20261015 -f maxzoom=14 -f target=staging -f dry_run=false
gh workflow run basemap-build.yml --repo taverns-red/toast-stats --ref main \
  -f build_date=20261015 -f maxzoom=14 -f target=prod-copy -f dry_run=false
```

Protomaps keeps daily builds for one week, so pick a current `build_date` (step 0).

**Switched (2026-10-15).** `basemap/protomaps-v4/world-z0-14-20261015.pmtiles` is on both buckets: 68,759,126,401 bytes, PMTiles v3, z0–14. `BASEMAP_OBJECT_PATH` names it, and `BASEMAP_MAX_ZOOM` (same file) must equal the `z0-<n>` in that name: it is the style source's `maxzoom`, and a unit test checks that the two agree. A later refresh changes both in one PR. It was verified on the PR preview at country, region, city and street zoom, at 375, 768 and 1280, in light and dark.

**After the switch deploys to prod:** wait one week (step 4), then delete `basemap/protomaps-v4/world-z0-10-20261011.pmtiles` from both buckets. That is a GCS write, so Ron runs it.

## Local build (diagnostics only)

`scripts/basemap/build-basemap.sh` also runs on a Mac with the pmtiles CLI on PATH, or with its path in `$PMTILES`. `DRY_RUN=1` prints the size without downloading anything. Built archives are never committed. The uploads above go through the workflow.
