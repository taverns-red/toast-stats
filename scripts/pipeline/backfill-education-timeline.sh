#!/usr/bin/env bash
# One-off build of a program year's education timeline from staging (#2591,
# epic #2590). The daily run only APPENDS the day's date to the timeline
# (build-education-rollup.sh); this builds the whole year from the per-date
# `district_<id>_reports.json` snapshots, and sets the prior-year ghost.
#
# Usage: scripts/pipeline/backfill-education-timeline.sh <bucket> <PY> [--upload]
#        e.g. backfill-education-timeline.sh toast-stats-data-staging 2026-2027
#
# Reads (staging, single prefixes, never a tree copy):
#   - snapshots/*/all-districts-rankings.json — a LISTING only, for the
#     snapshot dates; the dates inside <PY> (by directory date) are kept;
#   - snapshots/<date>/district_*_reports.json — one date at a time, folded
#     and deleted, so local disk holds one date (a few MB), not a year;
#   - config/district-region-history.json — that PY's own regions;
#   - the prior-year ghost, in this order (first that exists):
#       1. derived/education-timeline/<PY-1>/*.json  (day grain);
#       2. the prior PY's own per-date reports, folded the same way into a
#          scratch timeline (day grain);
#       3. raw-education-ledger/<PY-1>/district_*.json (month grain; the
#          staging-only ledger history ends at 2018-19);
#       4. none: `prior` stays null (not available, never a zero line).
# A date with no reports is absent, never zero.
#
# Writes: <OUT_DIR>/<PY>/<entity>.json, one file per entity: world.json,
# region-<n>.json, district-<id>.json (default ./.routine-tmp/education-timeline).
# WITHOUT --upload the bucket is only read. With --upload, those files are
# written to STAGING through gcs-upload.sh (recorded in RUN_MANIFEST_FILE,
# which --upload requires), in one `cp` (about 150 small objects):
#   gs://<bucket>/derived/education-timeline/<PY>/<entity>.json
# The next daily build-education-rollup.sh run finds them, names the PY in the
# rollup index and the promote-reports job promotes them with the rollup.
# derived/ is never a promoted prefix: this script cannot write prod (#1755).
#
# Env:   GCLOUD   the gcloud binary (default `gcloud`; tests use a shim, D10)
#        TSX      tsx binary (default: the repo's node_modules/.bin/tsx)
#        OUT_DIR  where the result is written
#        BATCH    dates folded per CLI call (default 15)
#        RUN_MANIFEST_FILE  required with --upload
#        GITHUB_STEP_SUMMARY  one line is appended here
#
# Output: stdout is ONE JSON line (R4); logs go to stderr.
# Exit codes: 0 built (and uploaded) · 1 a listing, build or transfer error ·
#             2 usage
set -euo pipefail

BUCKET="${1:-}"
PY="${2:-}"
UPLOAD=0
if [ "$#" -eq 3 ] && [ "${3}" = "--upload" ]; then
  UPLOAD=1
elif [ "$#" -ne 2 ]; then
  BUCKET=""
fi
if [ -z "${BUCKET}" ] || ! [[ "${PY}" =~ ^[0-9]{4}-[0-9]{4}$ ]]; then
  echo "usage: backfill-education-timeline.sh <bucket> <PY e.g. 2026-2027> [--upload]" >&2
  exit 2
fi
START="${PY%-*}"
if [ "$((START + 1))" -ne "${PY#*-}" ]; then
  echo "usage: <PY> must be consecutive years, e.g. 2026-2027" >&2
  exit 2
fi
PRIOR="$((START - 1))-${START}"

GCLOUD="${GCLOUD:-${GCLOUD_BIN:-gcloud}}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"
CLI="${REPO}/scripts/build-education-timeline.ts"
OUT_DIR="${OUT_DIR:-${REPO}/.routine-tmp/education-timeline}"
BATCH="${BATCH:-15}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
NO_MATCH='matched no objects|Did not find existing container'

if [ "${UPLOAD}" -eq 1 ] && [ -z "${RUN_MANIFEST_FILE:-}" ]; then
  echo "::error::backfill-education-timeline: --upload needs RUN_MANIFEST_FILE (an unrecorded write is invisible to the gates)" >&2
  exit 2
fi

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
  echo "::error::backfill-education-timeline: could not list $1" >&2
  exit 1
}

# 1. The snapshot dates (a listing of the rankings files; every date has one).
set +e
list "gs://${BUCKET}/snapshots/*/all-districts-rankings.json"
rc=$?
set -e
if [ "${rc}" -ne 0 ]; then
  echo "::error::backfill-education-timeline: no staged all-districts-rankings.json; no snapshot dates" >&2
  exit 1
fi
sed -n -E 's#^gs://[^/]+/snapshots/([0-9]{4}-[0-9]{2}-[0-9]{2})/all-districts-rankings\.json$#\1#p' \
  "${WORK}/ls.out" | LC_ALL=C sort -u >"${WORK}/dates.all"

# 2. The region history (each PY's own regions); without it, no region series.
REGIONS="${WORK}/district-region-history.json"
if ! "${GCLOUD}" storage cp "gs://${BUCKET}/config/district-region-history.json" \
  "${WORK}/" 2>"${WORK}/cp.err"; then
  if ! grep -Eq "${NO_MATCH}" "${WORK}/cp.err"; then
    cat "${WORK}/cp.err" >&2
    echo "::error::backfill-education-timeline: could not read config/district-region-history.json" >&2
    exit 1
  fi
  echo "::warning::backfill-education-timeline: no config/district-region-history.json; no region series" >&2
fi

# fold_year <PY> <outdir>: fold the PY's dates, a batch at a time, into the
# directory of entity files. Returns 1 when no date of the PY had reports
# (nothing is written).
fold_year() {
  local py="$1" out="$2" start lo hi date n=0 pending=0
  start="${py%-*}"
  lo="${start}-07-01"
  hi="$((start + 1))-06-30"
  local root="${WORK}/reports-${py}"
  rm -rf "${root}"
  mkdir -p "${root}"
  local started=0
  rm -rf "${out}"
  flush() {
    [ "${pending}" -gt 0 ] || return 0
    local existing=()
    [ "${started}" -eq 0 ] || existing=(--existing "${out}")
    "${TSX}" "${CLI}" fold --py "${py}" --region-history "${REGIONS}" \
      --reports-root "${root}" ${existing[@]+"${existing[@]}"} --out "${out}" >/dev/null
    started=1
    rm -rf "${root}"
    mkdir -p "${root}"
    pending=0
  }
  while IFS= read -r date; do
    [ -n "${date}" ] || continue
    if [[ "${date}" < "${lo}" || "${date}" > "${hi}" ]]; then
      continue
    fi
    set +e
    list "gs://${BUCKET}/snapshots/${date}/district_*_reports.json"
    rc=$?
    set -e
    [ "${rc}" -eq 0 ] || continue # no reports that date: absent, never zero
    mkdir -p "${root}/${date}"
    "${GCLOUD}" storage cp \
      "gs://${BUCKET}/snapshots/${date}/district_*_reports.json" "${root}/${date}/"
    pending=$((pending + 1))
    n=$((n + 1))
    if [ "${pending}" -ge "${BATCH}" ]; then
      flush
    fi
  done <"${WORK}/dates.all"
  flush
  [ "${n}" -gt 0 ] || return 1
  return 0
}

RESULT="${OUT_DIR}/${PY}"
BUILT="${WORK}/built-${PY}"
mkdir -p "${OUT_DIR}"
if ! fold_year "${PY}" "${BUILT}"; then
  echo "::error::backfill-education-timeline: no snapshot date in ${PY} has reports; nothing to build" >&2
  exit 1
fi

# 3. The prior-year ghost: the first source that exists.
PRIOR_ARGS=()
set +e
list "gs://${BUCKET}/derived/education-timeline/${PRIOR}/*.json"
rc=$?
set -e
if [ "${rc}" -eq 0 ]; then
  mkdir -p "${WORK}/prior"
  "${GCLOUD}" storage cp "gs://${BUCKET}/derived/education-timeline/${PRIOR}/*.json" "${WORK}/prior/"
  PRIOR_ARGS=(--prior-timeline "${WORK}/prior")
elif fold_year "${PRIOR}" "${WORK}/prior"; then
  PRIOR_ARGS=(--prior-timeline "${WORK}/prior")
else
  set +e
  list "gs://${BUCKET}/raw-education-ledger/${PRIOR}/*"
  rc=$?
  set -e
  if [ "${rc}" -eq 0 ]; then
    mkdir -p "${WORK}/ledger"
    "${GCLOUD}" storage cp \
      "gs://${BUCKET}/raw-education-ledger/${PRIOR}/district_*.json" "${WORK}/ledger/"
    PRIOR_ARGS=(--prior-ledger "${WORK}/ledger")
  fi
fi
rm -rf "${RESULT}"
"${TSX}" "${CLI}" ghost --py "${PY}" --region-history "${REGIONS}" \
  --existing "${BUILT}" ${PRIOR_ARGS[@]+"${PRIOR_ARGS[@]}"} --out "${RESULT}" \
  >"${WORK}/ghost.json"

# 4. Upload only when asked: the entity files, to staging, recorded in the
#    manifest.
if [ "${UPLOAD}" -eq 1 ]; then
  export GCLOUD
  bash "${REPO}/scripts/pipeline/gcs-upload.sh" education-rollup cp \
    --content-type="application/json" "${RESULT}"/*.json \
    "gs://${BUCKET}/derived/education-timeline/${PY}/"
fi

FILES="$(find "${RESULT}" -maxdepth 1 -type f -name '*.json' | wc -l | tr -d ' ')"
jq -c --argjson uploaded "${UPLOAD}" --arg out "${RESULT}" --argjson files "${FILES}" \
  '. + {uploaded: ($uploaded == 1), out: $out, files: $files}' "${WORK}/ghost.json" |
  tee "${WORK}/summary.json"
jq -r '"- **Education timeline backfill** (#2591): \(.programYear), ghost \(.grain // "none") (\(.source // "n/a")), " +
  (if .uploaded then "uploaded \(.files) file(s) to staging derived/education-timeline/<PY>/" else "built locally, nothing uploaded" end)' \
  "${WORK}/summary.json" >>"${SUMMARY}"
