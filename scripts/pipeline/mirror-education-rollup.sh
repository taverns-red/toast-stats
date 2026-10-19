#!/usr/bin/env bash
# Mirror the education rollup into prod (#1810, data from #1801; #1763).
#
# Usage: scripts/pipeline/mirror-education-rollup.sh <staging> <prod> [--if-changed]
#
# build-education-rollup.sh writes derived/education-rollup/{<PY>,index}.json
# to staging, every object recorded in the run manifest. The daily build runs
# in the `education-rollup` job, after the pipeline job promoted, and
# derived/ is not a promoted prefix, so the manifest promoter never copies
# it. This script is its one path to prod. Staging path == prod path, and the
# CDN serves derived/ like config/ (identity-stored, edge-compressed).
#
#   1. read staging's index.json; no index is nothing to mirror;
#   2. hold unless the reports date the rollup was read from (`asOf`) is a
#      date prod's v1/dates.json indexes: a rollup of a held day's reports
#      must not ship ahead of that day;
#   3. --if-changed (the place-reports carry): stop when prod's index is
#      byte-identical to staging's;
#   4. copy exactly the per-PY objects the index names, bucket to bucket
#      (a server-side rewrite: bytes and headers as built), then the index
#      LAST, so prod never names a year it does not hold (R15).
# Additive: nothing in prod is deleted, and nothing outside
# derived/education-rollup/ is written.
#
# Called by the education-rollup job (gated on this run promoting its
# snapshot date and skip_promotion off) and by carry-report-sidecars.sh with
# --if-changed (a held day's rollup, on a later run).
#
# Env: GCLOUD (default `gcloud`), GITHUB_STEP_SUMMARY (optional).
# Exit codes: 0 mirrored, held or nothing to do · 1 a read, contract or copy
#             failure · 2 usage
set -euo pipefail

usage() {
  echo "usage: mirror-education-rollup.sh <staging> <prod> [--if-changed]" >&2
  exit 2
}

STAGING="${1:-}"
PROD="${2:-}"
IF_CHANGED=0
[ -n "${STAGING}" ] && [ -n "${PROD}" ] || usage
[ "${STAGING}" != "${PROD}" ] || usage
if [ "$#" -eq 3 ]; then
  [ "$3" = "--if-changed" ] || usage
  IF_CHANGED=1
elif [ "$#" -ne 2 ]; then
  usage
fi
GCLOUD="${GCLOUD:-gcloud}"
PREFIX="derived/education-rollup"
NO_MATCH='matched no objects|No URLs matched'

summary() {
  echo "$1" >&2
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$1" >>"${GITHUB_STEP_SUMMARY}"
  fi
  return 0
}

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup EXIT

# `cat` an object: 0 read · 3 no such object · exit 1 on any other error.
read_object() {
  if "${GCLOUD}" storage cat "$1" >"$2" 2>"${WORK}/cat.err"; then
    return 0
  fi
  if grep -Eq "${NO_MATCH}" "${WORK}/cat.err"; then
    return 3
  fi
  cat "${WORK}/cat.err" >&2
  echo "::error::mirror-education-rollup: could not read $1" >&2
  exit 1
}

# 1. Staging's index.
set +e
read_object "gs://${STAGING}/${PREFIX}/index.json" "${WORK}/index.json"
rc=$?
set -e
if [ "${rc}" -ne 0 ]; then
  summary "- 🎓 No education rollup in staging; nothing to mirror (#1810)"
  exit 0
fi

# The objects it names: per-PY files directly under the prefix, nothing else.
if ! jq -r '.programYears | if type == "array" then .[].path else error("no programYears[]") end' \
  "${WORK}/index.json" >"${WORK}/paths.txt"; then
  echo "::error::mirror-education-rollup: staging index.json has no programYears[]" >&2
  exit 1
fi
while IFS= read -r p; do
  if ! [[ "${p}" =~ ^derived/education-rollup/[0-9]{4}-[0-9]{4}\.json$ ]]; then
    echo "::error::mirror-education-rollup: index names '${p}', outside ${PREFIX}/<PY>.json; refusing" >&2
    exit 1
  fi
done <"${WORK}/paths.txt"
AS_OF="$(jq -r '.asOf // empty' "${WORK}/index.json")"

# 2. Its reports date must be one prod indexes.
if ! "${GCLOUD}" storage cat "gs://${PROD}/v1/dates.json" >"${WORK}/dates.json"; then
  echo "::error::mirror-education-rollup: could not read gs://${PROD}/v1/dates.json" >&2
  exit 1
fi
if ! jq -e '.dates | type == "array"' "${WORK}/dates.json" >/dev/null; then
  echo "::error::mirror-education-rollup: prod v1/dates.json has no dates[]" >&2
  exit 1
fi
if [ -z "${AS_OF}" ] ||
  ! jq -e --arg d "${AS_OF}" '.dates | index($d) != null' "${WORK}/dates.json" >/dev/null; then
  summary "- 🎓 Education rollup not mirrored: its reports date (${AS_OF:-none}) is not a date prod indexes (#1810)"
  exit 0
fi

# 3. Nothing new for the carry.
if [ "${IF_CHANGED}" -eq 1 ]; then
  set +e
  read_object "gs://${PROD}/${PREFIX}/index.json" "${WORK}/prod-index.json"
  rc=$?
  set -e
  if [ "${rc}" -eq 0 ] && cmp -s "${WORK}/index.json" "${WORK}/prod-index.json"; then
    summary "- 🎓 Education rollup: prod already has staging's (as of ${AS_OF}) (#1810)"
    exit 0
  fi
fi

# 4. Years, then the index.
sources=()
while IFS= read -r p; do
  sources+=("gs://${STAGING}/${p}")
done <"${WORK}/paths.txt"
if [ "${#sources[@]}" -gt 0 ]; then
  "${GCLOUD}" storage cp "${sources[@]}" "gs://${PROD}/${PREFIX}/"
fi
"${GCLOUD}" storage cp "gs://${STAGING}/${PREFIX}/index.json" "gs://${PROD}/${PREFIX}/"
summary "- 🎓 Mirrored the education rollup (${#sources[@]} program years + index, reports as of ${AS_OF}) to \`prod:${PREFIX}/\` (#1810)"
