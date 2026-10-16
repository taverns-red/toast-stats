#!/usr/bin/env bash
# Build snapshots/<date>/reports-rollups.json in STAGING (#2012, the
# remainder of #1799).
#
# Usage: scripts/pipeline/build-reports-rollups.sh <bucket> <YYYY-MM-DD>
#
# Daily calls it in the education-rollup job, after place-reports lands the
# date's sidecars. It reads, from <bucket>, single objects of ONE date only:
#   - snapshots/<date>/district_*_reports.json — the placed sidecars (none:
#     nothing to roll up, nothing written, exit 0);
#   - snapshots/<date>/all-districts-rankings.json — names the date's
#     districts, so a district without a sidecar reads null, not 0;
#   - config/district-region-history.json (#1820) — the logical date's PY's
#     regions; absent ⇒ regions null with the reason.
# A listing or transfer ERROR fails closed with nothing uploaded.
#
# Output: gs://<bucket>/snapshots/<date>/reports-rollups.json, -Z with the
# snapshot headers, written beside the sidecars through gcs-upload.sh, so it
# is recorded in the run manifest (#1762, ADR-015 P5). It reaches prod only
# by promotion with its date; this script never writes prod (#1755).
#
# Env:   GCLOUD     the gcloud binary (default `gcloud`; tests use a shim, D10)
#        RUN_MANIFEST_FILE  required: the upload is recorded in it
#        TSX        tsx binary (default: the repo's node_modules/.bin/tsx)
#        GITHUB_STEP_SUMMARY  counts and size are appended here
#
# Output: stdout is ONE JSON line, the builder's summary (R4).
# Exit codes: 0 built and uploaded, or no sidecars at the date ·
#             1 a listing, build or transfer error · 2 usage
set -euo pipefail

BUCKET="${1:-}"
DATE="${2:-}"
if [ -z "${BUCKET}" ] || [ "$#" -ne 2 ] || ! [[ "${DATE}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "usage: build-reports-rollups.sh <bucket> <YYYY-MM-DD>" >&2
  exit 2
fi

GCLOUD="${GCLOUD:-gcloud}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"
BUILDER="${REPO}/scripts/build-reports-rollups.ts"
SNAP="gs://${BUCKET}/snapshots/${DATE}"
NO_MATCH='matched no objects|Did not find existing container'

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup EXIT

# 1. The date's sidecars: "none there" (exit 0, nothing written) is told
#    apart from a real listing error (fail closed).
if ! "${GCLOUD}" storage ls "${SNAP}/district_*_reports.json" >"${WORK}/ls.out" 2>"${WORK}/ls.err"; then
  if grep -Eq "${NO_MATCH}" "${WORK}/ls.err"; then
    echo "::notice::build-reports-rollups: no district_*_reports.json at ${DATE}; nothing to roll up" >&2
    echo "- **Reports rollups** (#2012): no sidecars at \`${DATE}\`, nothing written" >>"${SUMMARY}"
    echo '{"snapshotDate":"'"${DATE}"'","sidecars":0,"written":false}'
    exit 0
  fi
  cat "${WORK}/ls.err" >&2
  echo "::error::build-reports-rollups: could not list ${SNAP}/district_*_reports.json" >&2
  exit 1
fi

mkdir -p "${WORK}/reports"
"${GCLOUD}" storage cp "${SNAP}/district_*_reports.json" "${WORK}/reports/"
"${GCLOUD}" storage cp "${SNAP}/all-districts-rankings.json" "${WORK}/"

# 2. Each PY's own regions; without them, no region blocks.
if ! "${GCLOUD}" storage cp "gs://${BUCKET}/config/district-region-history.json" \
  "${WORK}/" 2>"${WORK}/cp.err"; then
  if ! grep -Eq "${NO_MATCH}" "${WORK}/cp.err"; then
    cat "${WORK}/cp.err" >&2
    echo "::error::build-reports-rollups: could not read config/district-region-history.json" >&2
    exit 1
  fi
  echo "::warning::build-reports-rollups: no config/district-region-history.json; region blocks are null this run" >&2
fi

mkdir -p "${WORK}/out"
"${TSX}" "${BUILDER}" build \
  --date "${DATE}" \
  --reports "${WORK}/reports" \
  --rankings "${WORK}/all-districts-rankings.json" \
  --region-history "${WORK}/district-region-history.json" \
  --out "${WORK}/out/reports-rollups.json" >"${WORK}/summary.json"

# 3. Upload beside the sidecars, through the wrapper (run manifest).
export GCLOUD
bash "${REPO}/scripts/pipeline/gcs-upload.sh" reports-rollups cp \
  --content-type="application/json" \
  --cache-control="public, max-age=3600, must-revalidate" \
  -Z \
  "${WORK}/out/reports-rollups.json" "${SNAP}/"

jq -r '
  "- **Reports rollups** (#2012): `snapshots/\(.snapshotDate)/reports-rollups.json`, " +
  "\(.sidecars) sidecars for \(.districts) districts (\(.districtsWithoutReports) without reports), " +
  "\(.regions // "no") regions; \(.rawBytes) B raw, \(.gzipBytes) B gzip"' \
  "${WORK}/summary.json" >>"${SUMMARY}"
cat "${WORK}/summary.json"
