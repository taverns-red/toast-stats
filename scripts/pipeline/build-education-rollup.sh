#!/usr/bin/env bash
# Build the education rollup and upload it to STAGING derived/ (#1801,
# epic #1781).
#
# Usage: scripts/pipeline/build-education-rollup.sh <bucket>
#
# One script for every mode (ADR-015 P1): daily calls it after the identity
# histories, and scripts/pipeline/process-dates.sh (rebuild, rescrape,
# rescrape-historical) calls it once after its date loop. It derives only
# from persisted inputs in <bucket> (ADR-015 P2), all read before anything
# is uploaded:
#   - raw-education-ledger/<PY>/district_<id>.json — the ledger history
#     (#1802, 2003-04 → 2018-19), synced whole (~1,480 objects, ~170 MB);
#   - snapshots/<date>/district_*_reports.json — for every program year
#     without a ledger, the newest of its last 6 snapshot dates that has
#     reports (the archive backfill at each year-end, the daily feed for the
#     current PY). A PY's dates come from its logical (directory) date;
#   - snapshots/<date>/all-districts-rankings.json — each PY's last date,
#     which names the PY's districts so a missing file reads "not available";
#   - config/district-region-history.json (#1820) — each PY's own regions.
# Missing inputs degrade per row (a PY without reports is omitted and named
# in the index; no ledger or no region history is a warning); a listing or
# transfer ERROR fails closed with nothing uploaded.
#
# Output (plain JSON, no -Z, nothing reads it through the CDN yet):
#   gs://<bucket>/derived/education-rollup/<PY>.json   one per program year
#   gs://<bucket>/derived/education-rollup/index.json  last: it names them
# derived/ is NOT a promoted prefix: until scoped promotion (#1763, ADR-015
# step 5) lists these files in the run manifest from a promoted prefix, they
# must never reach prod, so this script only ever writes to <bucket> (the
# #1755 prod-write guard checks it).
#
# Env:   GCLOUD     the gcloud binary (default `gcloud`; tests use a shim, D10)
#        RUN_MANIFEST_FILE  required: every upload is recorded in it
#                   (scripts/pipeline/gcs-upload.sh, #1762)
#        TSX        tsx binary (default: the repo's node_modules/.bin/tsx)
#        GITHUB_STEP_SUMMARY  counts and sizes are appended here
#
# Output: stdout is ONE JSON line, the builder's summary (R4).
# Exit codes: 0 built and uploaded · 1 a listing, build or transfer error ·
#             2 usage
set -euo pipefail

BUCKET="${1:-}"
if [ -z "${BUCKET}" ] || [ "$#" -ne 1 ]; then
  echo "usage: build-education-rollup.sh <bucket>" >&2
  exit 2
fi

GCLOUD="${GCLOUD:-gcloud}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"
BUILDER="${REPO}/scripts/build-education-rollup.ts"
DEST="gs://${BUCKET}/derived/education-rollup/"
NO_MATCH='matched no objects|Did not find existing container'

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup EXIT

# `ls`, telling "nothing there" (exit 3) from a real error (exit 1).
list() {
  if "${GCLOUD}" storage ls "$1" >"${WORK}/ls.out" 2>"${WORK}/ls.err"; then
    return 0
  fi
  if grep -Eq "${NO_MATCH}" "${WORK}/ls.err"; then
    return 3
  fi
  cat "${WORK}/ls.err" >&2
  echo "::error::build-education-rollup: could not list $1" >&2
  exit 1
}

# 1. The ledger history, whole.
mkdir -p "${WORK}/ledger"
set +e
list "gs://${BUCKET}/raw-education-ledger/"
rc=$?
set -e
if [ "${rc}" -eq 0 ]; then
  "${GCLOUD}" storage rsync -r "gs://${BUCKET}/raw-education-ledger/" "${WORK}/ledger/"
else
  echo "::warning::build-education-rollup: no raw-education-ledger/ in ${BUCKET}; the ledger years (2003-04 → 2018-19) are not rolled up" >&2
fi

# 2. The staged snapshot dates (every date has rankings), then the plan.
set +e
list "gs://${BUCKET}/snapshots/*/all-districts-rankings.json"
rc=$?
set -e
if [ "${rc}" -ne 0 ]; then
  echo "::error::build-education-rollup: no staged all-districts-rankings.json; no snapshot dates to read" >&2
  exit 1
fi
sed -n -E 's#^gs://[^/]+/snapshots/([0-9]{4}-[0-9]{2}-[0-9]{2})/all-districts-rankings\.json$#\1#p' \
  "${WORK}/ls.out" |
  "${TSX}" "${BUILDER}" plan --ledger "${WORK}/ledger" >"${WORK}/plan.tsv"

# 3. Per program year: its rankings, and for a reports PY the newest date
#    that has reports.
while IFS=$'\t' read -r PY SOURCE RANKINGS CANDIDATES; do
  [ -n "${PY}" ] || continue
  IN="${WORK}/inputs/${PY}"
  mkdir -p "${IN}"
  if [ "${RANKINGS}" != "-" ]; then
    "${GCLOUD}" storage cp \
      "gs://${BUCKET}/snapshots/${RANKINGS}/all-districts-rankings.json" "${IN}/"
  fi
  [ "${SOURCE}" = "reports" ] || continue
  [ "${CANDIDATES}" != "-" ] || continue
  IFS=',' read -r -a DATES <<<"${CANDIDATES}"
  for DATE in "${DATES[@]}"; do
    set +e
    list "gs://${BUCKET}/snapshots/${DATE}/district_*_reports.json"
    rc=$?
    set -e
    [ "${rc}" -eq 0 ] || continue
    mkdir -p "${IN}/reports"
    "${GCLOUD}" storage cp \
      "gs://${BUCKET}/snapshots/${DATE}/district_*_reports.json" "${IN}/reports/"
    printf '%s\n' "${DATE}" >"${IN}/reports-date"
    break
  done
done <"${WORK}/plan.tsv"

# 4. Each PY's own regions; without them, no region rollups.
if ! "${GCLOUD}" storage cp "gs://${BUCKET}/config/district-region-history.json" \
  "${WORK}/" 2>"${WORK}/cp.err"; then
  if ! grep -Eq "${NO_MATCH}" "${WORK}/cp.err"; then
    cat "${WORK}/cp.err" >&2
    echo "::error::build-education-rollup: could not read config/district-region-history.json" >&2
    exit 1
  fi
  echo "::warning::build-education-rollup: no config/district-region-history.json; region rollups are null this run" >&2
fi

"${TSX}" "${BUILDER}" build \
  --ledger "${WORK}/ledger" \
  --inputs "${WORK}/inputs" \
  --region-history "${WORK}/district-region-history.json" \
  --out "${WORK}/out" >"${WORK}/summary.json"

# 5. Upload through the wrapper, so every object lands in the run manifest
#    (#1762, ADR-015 P5). Program years first, the index (which names them)
#    last. derived/ is outside PROMOTED_PREFIXES: recorded, never promoted.
export GCLOUD
UPLOAD=(bash "${REPO}/scripts/pipeline/gcs-upload.sh" education-rollup cp --content-type="application/json")
years=()
while IFS= read -r f; do
  years+=("${f}")
done < <(find "${WORK}/out" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9].json' | LC_ALL=C sort)
"${UPLOAD[@]}" "${years[@]}" "${DEST}"
"${UPLOAD[@]}" "${WORK}/out/index.json" "${DEST}"

jq -r '
  "- **Education rollup** (staging derived/, #1801): \(.programYears) program years (\(.first) → \(.last)), " +
  "\(.omitted) omitted, reports as of \(.asOf // "none"); \(.rawBytes) B raw, \(.gzipBytes) B gzip " +
  "(largest object \(.maxGzipBytes) B gzip)"' \
  "${WORK}/summary.json" >>"${SUMMARY}"
cat "${WORK}/summary.json"
