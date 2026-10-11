#!/usr/bin/env bash
# Build the identity histories and upload them to STAGING derived/ (#1782,
# #1820; epic #1781).
#
# Usage: scripts/pipeline/build-identity-history.sh <bucket>
#
# One script for every mode (ADR-015 P1): daily calls it after its upload,
# and scripts/pipeline/process-dates.sh (rebuild, rescrape,
# rescrape-historical) calls it once after its date loop. It derives only
# from persisted inputs (ADR-015 P2):
#   - club-district history ← $CACHE_DIR/club-race/{PY}/first-reached.json,
#     the store the caller synced with sync-stores.sh and compute-analytics
#     upserted (the copy publish-stores.sh pushes);
#   - district → region history ← the `region` column of the staged
#     snapshots/<date>/all-districts-rankings.json, read for the first and
#     last snapshot of every program year (~22 single-file reads). The run's
#     own dates are already uploaded when this runs.
#
# Output (plain JSON, no -Z, nothing reads it through the CDN yet):
#   gs://<bucket>/derived/club-district-history/{NN,index}.json
#   gs://<bucket>/derived/district-region-history.json
# derived/ is NOT a promoted prefix: until scoped promotion (#1763, ADR-015
# step 5) lists the files in the run manifest, they must never reach prod,
# so this script only ever writes to <bucket> (the #1755 prod-write guard
# checks it). After #1763 they move under config/ and are promoted from the
# manifest. All inputs are read and both histories built before anything is
# uploaded; shards go up before index.json, which names them. Clubs are
# never dropped from the history, so a shard key never disappears.
#
# Env:   GCLOUD     the gcloud binary (default `gcloud`; tests use a shim, D10)
#        RUN_MANIFEST_FILE  required: every upload is recorded in it
#                   (scripts/pipeline/gcs-upload.sh, #1762)
#        CACHE_DIR  the runner cache (default ./cache)
#        TSX        tsx binary (default: the repo's node_modules/.bin/tsx)
#        GITHUB_STEP_SUMMARY  counts and sizes are appended here
#
# Output: stdout is ONE JSON line, the builder's summary (R4).
# Exit codes: 0 built and uploaded · 1 a missing input (no club-race store,
#             no staged rankings), a build error or a transfer error · 2 usage
set -euo pipefail

BUCKET="${1:-}"
if [ -z "${BUCKET}" ] || [ "$#" -ne 1 ]; then
  echo "usage: build-identity-history.sh <bucket>" >&2
  exit 2
fi

GCLOUD="${GCLOUD:-gcloud}"
CACHE_DIR="${CACHE_DIR:-./cache}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"
BUILDER="${REPO}/scripts/build-identity-history.ts"
DERIVED="gs://${BUCKET}/derived/"

if [ ! -d "${CACHE_DIR}/club-race" ]; then
  echo "::error::build-identity-history: ${CACHE_DIR}/club-race does not exist; the club-race store was never synced (R2)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup EXIT

# Region inputs: list every staged rankings file, keep the first and last
# date of each program year, download those. Fail closed on a listing error.
if ! "${GCLOUD}" storage ls \
  "gs://${BUCKET}/snapshots/*/all-districts-rankings.json" \
  >"${WORK}/rankings.ls" 2>"${WORK}/rankings.err"; then
  cat "${WORK}/rankings.err" >&2
  echo "::error::build-identity-history: could not list staged all-districts-rankings.json; no region history" >&2
  exit 1
fi
sed -n -E 's#^gs://[^/]+/snapshots/([0-9]{4}-[0-9]{2}-[0-9]{2})/all-districts-rankings\.json$#\1#p' \
  "${WORK}/rankings.ls" |
  "${TSX}" "${BUILDER}" select-region-dates >"${WORK}/region-dates"
while IFS= read -r date; do
  mkdir -p "${WORK}/rankings/${date}"
  "${GCLOUD}" storage cp \
    "gs://${BUCKET}/snapshots/${date}/all-districts-rankings.json" \
    "${WORK}/rankings/${date}/"
done <"${WORK}/region-dates"

"${TSX}" "${BUILDER}" build \
  --club-race "${CACHE_DIR}/club-race" \
  --rankings "${WORK}/rankings" \
  --out "${WORK}/out" >"${WORK}/summary.json"

OUT="${WORK}/out/club-district-history"
shards=()
while IFS= read -r f; do
  shards+=("${f}")
done < <(find "${OUT}" -maxdepth 1 -type f -name '[0-9][0-9].json' | LC_ALL=C sort)

# Through the wrapper, so every object lands in the run manifest (#1762,
# ADR-015 P5). derived/ is outside PROMOTED_PREFIXES: recorded as written,
# never read by the content gate, never promoted.
export GCLOUD
UPLOAD=(bash "${REPO}/scripts/pipeline/gcs-upload.sh" identity cp --content-type="application/json")
if [ "${#shards[@]}" -gt 0 ]; then
  "${UPLOAD[@]}" "${shards[@]}" "${DERIVED}club-district-history/"
fi
"${UPLOAD[@]}" "${OUT}/index.json" "${DERIVED}club-district-history/"
"${UPLOAD[@]}" "${WORK}/out/district-region-history.json" "${DERIVED}"

jq -r '
  (.clubDistrictHistory |
    "- **Club-district history** (staging derived/, #1782): \(.clubs) clubs, \(.shards) shards, \(.duplicates) duplicates; " +
    "\(.rawBytes) B raw, \(.gzipBytes) B gzip (largest shard \(.maxShardGzipBytes) B gzip)"),
  (.districtRegionHistory |
    "- **District-region history** (staging derived/, #1820): \(.districts) districts, \(.programYears) PYs from \(.sourceDates) snapshots, \(.conflicts) conflicts; " +
    "\(.rawBytes) B raw, \(.gzipBytes) B gzip")' \
  "${WORK}/summary.json" >>"${SUMMARY}"
cat "${WORK}/summary.json"
