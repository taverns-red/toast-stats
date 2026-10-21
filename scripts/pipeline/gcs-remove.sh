#!/usr/bin/env bash
# Remove objects from the run's staging bucket AND log each removal (#2232).
#
# Usage: scripts/pipeline/gcs-remove.sh <stage> <gs://$GCS_BUCKET/object>...
#
# The removal twin of gcs-upload.sh. Appends one line per object to
# $RUN_REMOVALS_FILE BEFORE the removal (so a removal that fails part way
# is still on record):
#   {"path":"snapshots/2018-06-30/district_U.json","date":"2018-06-30",
#    "stage":"<stage>"}
# then runs `gcloud storage rm <url>...`. The workflow publishes the file to
# runs/<github_run_id>/removed.jsonl as an audit log. Nothing reads it back:
# scoped promotion converges prod from bucket state (scripts/lib/gapRemoval.ts).
#
# Refuses (exit 2, nothing removed or logged): RUN_REMOVALS_FILE or
# GCS_BUCKET unset; a URL outside gs://$GCS_BUCKET (an allowlist: prod is
# written by the gated promote step only, #1755); a URL that is not one
# exact object (no wildcard, no prefix).
#
# Env: GCLOUD (default `gcloud`), GCS_BUCKET (required: the run bucket),
#      RUN_REMOVALS_FILE (required).
set -euo pipefail

STAGE="${1:-}"
if [ -z "${STAGE}" ] || [ "$#" -lt 2 ]; then
  echo "usage: gcs-remove.sh <stage> <gs://bucket/object>..." >&2
  exit 2
fi
shift

if [ -z "${RUN_REMOVALS_FILE:-}" ]; then
  echo "::error::gcs-remove: RUN_REMOVALS_FILE is not set; refusing an unlogged removal (#2232)" >&2
  exit 2
fi
if [ -z "${GCS_BUCKET:-}" ]; then
  echo "::error::gcs-remove: GCS_BUCKET is not set; refusing to guess the run bucket" >&2
  exit 2
fi

for url in "$@"; do
  if [[ "${url}" != "gs://${GCS_BUCKET}/"?* ]]; then
    echo "::error::gcs-remove: '${url}' is not the run bucket (gs://${GCS_BUCKET}/); refusing" >&2
    exit 2
  fi
  if [[ "${url}" == *'*'* || "${url}" == *'?'* || "${url}" == *'['* || "${url}" == */ ]]; then
    echo "::error::gcs-remove: '${url}' is not one exact object" >&2
    exit 2
  fi
done

mkdir -p "$(dirname "${RUN_REMOVALS_FILE}")"
for url in "$@"; do
  printf '%s\n' "${url#"gs://${GCS_BUCKET}/"}"
done | jq -Rc --arg stage "${STAGE}" '
  {path: .,
   date: ((capture("^(snapshots|raw-csv|raw-fac)/(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})/").d) // null),
   stage: $stage}' >>"${RUN_REMOVALS_FILE}"

GCLOUD="${GCLOUD:-gcloud}"
"${GCLOUD}" storage rm "$@"
