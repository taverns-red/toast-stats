#!/usr/bin/env bash
# Build the education rollup and upload it to STAGING derived/ (#1801,
# epic #1781).
#
# Usage: scripts/pipeline/build-education-rollup.sh <bucket>
#
# One script for every mode (ADR-015 P1): daily calls it in the
# education-rollup job, after place-reports lands the day's reports (#2028),
# and scripts/pipeline/process-dates.sh (rebuild, rescrape,
# rescrape-historical) calls it once after its date loop. It derives only
# from persisted inputs in <bucket> (ADR-015 P2), all read before anything
# is uploaded:
#   - raw-education-ledger/<PY>/district_<id>.json — the ledger history
#     (#1802, 2003-04 → 2018-19), synced whole (~1,480 objects, ~180 MB)
#     into EDUCATION_LEDGER_DIR when set (#2102). The workflow restores that
#     directory from the Actions cache, so it is a SEED, never a source:
#     `rsync --checksums-only` re-downloads every file whose hash differs
#     from its object, files with no object are removed, and the result must
#     hold exactly the listed objects. An unchanged ledger downloads nothing.
#     Plain JSON (no -Z), so the hashes compare under gcloud 588;
#   - snapshots/<date>/district_*_reports.json — for every program year
#     without a ledger, the newest of its last 6 snapshot dates that has
#     reports (the archive backfill at each year-end, the daily feed for the
#     current PY). A PY's dates come from its logical (directory) date;
#   - snapshots/<date>/all-districts-rankings.json — each PY's last date,
#     which names the PY's districts so a missing file reads "not available";
#   - config/district-region-history.json (#1820) — each PY's own regions;
#   - derived/education-timeline/<PY>/*.json (#2591) — the education
#     timeline, one small object per entity (world, region-<n>, district-<id>).
#     The CURRENT PY's files are read (about 150 objects) so the day's reports
#     date is APPENDED to each; only the files whose data changed are written.
#     The previous PY's files are read too, but only while the current PY has
#     none (seeding its prior-year ghost). Every other PY contributes just its
#     world.json, to be named in the index. No history scan.
# Missing inputs degrade per row (a PY without reports is omitted and named
# in the index; no ledger or no region history is a warning); a listing or
# transfer ERROR fails closed with nothing uploaded.
#
# Output (plain JSON, no -Z; /region/:n/education reads it via the CDN):
#   gs://<bucket>/derived/education-rollup/<PY>.json   one per program year
#   gs://<bucket>/derived/education-rollup/index.json  last: it names them
#   gs://<bucket>/derived/education-timeline/<PY>/<entity>.json  the entity
#                                      files that changed (#2591), before the
#                                      index, which names every timeline PY
# derived/ is NOT a promoted prefix: this script only ever writes to
# <bucket> (the #1755 prod-write guard checks it). Prod gets the result from
# the promote-reports job, through the report-sidecar manifest and the
# content gate, once the rollup's reports date is in prod (#1810, #2222).
#
# Env:   GCLOUD     the gcloud binary (default `gcloud`; tests use a shim, D10)
#        EDUCATION_LEDGER_DIR  optional: the ledger seed directory (#2102);
#                   default a fresh temp directory (a full download)
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
TIMELINE_ROOT="derived/education-timeline"
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

# 1. The ledger history, whole, into the seed directory (#2102).
LEDGER="${EDUCATION_LEDGER_DIR:-${WORK}/ledger}"
mkdir -p "${LEDGER}"
set +e
list "gs://${BUCKET}/raw-education-ledger/**"
rc=$?
set -e
if [ "${rc}" -eq 0 ]; then
  sed -n -E 's#^gs://[^/]+/raw-education-ledger/(.*[^/])$#\1#p' "${WORK}/ls.out" |
    LC_ALL=C sort >"${WORK}/ledger.expected"
  "${GCLOUD}" storage rsync -r --checksums-only \
    "gs://${BUCKET}/raw-education-ledger/" "${LEDGER}/"
  # A seeded file with no object (a ledger file deleted or renamed since the
  # seed was saved) would be rolled up as if it were current: remove it.
  (cd "${LEDGER}" && find . -type f | sed 's#^\./##' | LC_ALL=C sort) >"${WORK}/ledger.local"
  while IFS= read -r stale; do
    rm -f "${LEDGER:?}/${stale}"
  done < <(LC_ALL=C comm -13 "${WORK}/ledger.expected" "${WORK}/ledger.local")
  find "${LEDGER}" -mindepth 1 -type d -empty -delete
  missing="$(LC_ALL=C comm -23 "${WORK}/ledger.expected" "${WORK}/ledger.local" | wc -l | tr -d ' ')"
  if [ "${missing}" -ne 0 ]; then
    echo "::error::build-education-rollup: ${missing} raw-education-ledger/ objects did not land in ${LEDGER}" >&2
    exit 1
  fi
else
  # No ledger in the bucket: a seed from an earlier one must not stand in.
  find "${LEDGER}" -mindepth 1 -delete
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
  "${TSX}" "${BUILDER}" plan --ledger "${LEDGER}" >"${WORK}/plan.tsv"

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

# 5. The education timeline files already published (#2591). The current PY
#    is the newest reports PY that had reports. A real listing error fails
#    closed; "none yet" is the first run. Read: the current PY's files; the
#    previous PY's while the current has none; any other PY's world.json.
CURRENT=""
for d in "${WORK}"/inputs/*/; do
  [ -f "${d}reports-date" ] || continue
  CURRENT="$(basename "${d}")"
done
TL_IN="${WORK}/timeline-in"
mkdir -p "${TL_IN}"
TL_ARGS=()
if [ -n "${CURRENT}" ]; then
  START="${CURRENT%-*}"
  PRIOR="$((START - 1))-${START}"
  set +e
  list "gs://${BUCKET}/${TIMELINE_ROOT}/**"
  rc=$?
  set -e
  : >"${WORK}/timeline.names"
  if [ "${rc}" -eq 0 ]; then
    sed -n -E "s#^gs://[^/]+/${TIMELINE_ROOT}/([0-9]{4}-[0-9]{4})/[^/]+\.json\$#\1#p" \
      "${WORK}/ls.out" | LC_ALL=C sort | uniq -c >"${WORK}/timeline.names"
  fi
  mkdir -p "${TL_IN}/${CURRENT}"
  if ! grep -q " ${CURRENT}\$" "${WORK}/timeline.names"; then
    # First run of the current PY: its prior-year ghost comes from last year's.
    if grep -q " ${PRIOR}\$" "${WORK}/timeline.names"; then
      mkdir -p "${TL_IN}/${PRIOR}"
      "${GCLOUD}" storage cp "gs://${BUCKET}/${TIMELINE_ROOT}/${PRIOR}/*.json" "${TL_IN}/${PRIOR}/"
    fi
  else
    "${GCLOUD}" storage cp "gs://${BUCKET}/${TIMELINE_ROOT}/${CURRENT}/*.json" "${TL_IN}/${CURRENT}/"
  fi
  while read -r _ other; do
    [ -n "${other}" ] || continue
    [ "${other}" != "${CURRENT}" ] || continue
    [ ! -d "${TL_IN}/${other}" ] || continue
    mkdir -p "${TL_IN}/${other}"
    "${GCLOUD}" storage cp "gs://${BUCKET}/${TIMELINE_ROOT}/${other}/world.json" "${TL_IN}/${other}/" 2>/dev/null || true
  done <"${WORK}/timeline.names"
  TL_ARGS=(--timeline-in "${TL_IN}" --timeline-current "${CURRENT}")
fi

"${TSX}" "${BUILDER}" build \
  ${TL_ARGS[@]+"${TL_ARGS[@]}"} \
  --ledger "${LEDGER}" \
  --inputs "${WORK}/inputs" \
  --region-history "${WORK}/district-region-history.json" \
  --out "${WORK}/out" >"${WORK}/summary.json"

# 6. Upload through the wrapper, so every object lands in the run manifest
#    (#1762, ADR-015 P5). Program years first, the index (which names them)
#    last. derived/ is outside PROMOTED_PREFIXES: recorded, never promoted.
export GCLOUD
UPLOAD=(bash "${REPO}/scripts/pipeline/gcs-upload.sh" education-rollup cp --content-type="application/json")
years=()
while IFS= read -r f; do
  years+=("${f}")
done < <(find "${WORK}/out" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9].json' | LC_ALL=C sort)
"${UPLOAD[@]}" "${years[@]}" "${DEST}"
# The timeline entity files this run changed (a PY prefix at a time), before
# the index that names them.
if [ -d "${WORK}/out/timeline" ]; then
  for pydir in "${WORK}"/out/timeline/*/; do
    [ -d "${pydir}" ] || continue
    entities=()
    while IFS= read -r f; do
      entities+=("${f}")
    done < <(find "${pydir}" -maxdepth 1 -type f -name '*.json' | LC_ALL=C sort)
    [ "${#entities[@]}" -gt 0 ] || continue
    "${UPLOAD[@]}" "${entities[@]}" "gs://${BUCKET}/${TIMELINE_ROOT}/$(basename "${pydir}")/"
  done
fi
"${UPLOAD[@]}" "${WORK}/out/index.json" "${DEST}"

jq -r '
  "- **Education rollup** (staging derived/, #1801): \(.programYears) program years (\(.first) → \(.last)), " +
  "\(.omitted) omitted, reports as of \(.asOf // "none"); \(.timelinesWritten // 0) timeline file(s) written (#2591); \(.rawBytes) B raw, \(.gzipBytes) B gzip " +
  "(largest object \(.maxGzipBytes) B gzip)"' \
  "${WORK}/summary.json" >>"${SUMMARY}"
cat "${WORK}/summary.json"
