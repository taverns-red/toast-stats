#!/usr/bin/env bash
# Remove objects from staging AND record each removal (#2232).
#
# Usage: scripts/pipeline/gcs-remove.sh <stage> <gs://staging/object>...
#
# The removal twin of gcs-upload.sh. Runs `gcloud storage rm <url>...`
# exactly as given, then appends one line per object to $RUN_REMOVALS_FILE:
#   {"path":"snapshots/2018-06-30/district_U.json","date":"2018-06-30",
#    "stage":"<stage>"}
# The workflow publishes the file to runs/<github_run_id>/removed.jsonl, and
# scoped promotion (scripts/lib/manifestPromotion.ts) removes the same
# objects from prod with their date: prod is never written here.
#
# Refuses (exit 2, nothing removed): RUN_REMOVALS_FILE unset (an unrecorded
# removal would never reach prod); a URL that is not one exact staging
# object (no wildcard, no prefix); a production URL (#1755).
# A failed removal records nothing and exits with gcloud's status.
#
# Env: GCLOUD (default `gcloud`), RUN_REMOVALS_FILE (required),
#      GCS_BUCKET_PRODUCTION (refused).
set -euo pipefail

STAGE="${1:-}"
if [ -z "${STAGE}" ] || [ "$#" -lt 2 ]; then
  echo "usage: gcs-remove.sh <stage> <gs://bucket/object>..." >&2
  exit 2
fi
shift

if [ -z "${RUN_REMOVALS_FILE:-}" ]; then
  echo "::error::gcs-remove: RUN_REMOVALS_FILE is not set; refusing an unrecorded removal (#2232)" >&2
  exit 2
fi

for url in "$@"; do
  if [[ "${url}" != gs://*/?* ]] || [[ "${url}" == *'*'* ]] ||
    [[ "${url}" == *'?'* ]] || [[ "${url}" == *'['* ]] || [[ "${url}" == */ ]]; then
    echo "::error::gcs-remove: '${url}' is not one exact bucket object" >&2
    exit 2
  fi
  b="${url#gs://}"
  b="${b%%/*}"
  if [ "${b}" = "toast-stats-data-ca" ] ||
    { [ -n "${GCS_BUCKET_PRODUCTION:-}" ] && [ "${b}" = "${GCS_BUCKET_PRODUCTION}" ]; }; then
    echo "::error::gcs-remove: refusing a production object (${url}); prod is written by the gated promote step only" >&2
    exit 2
  fi
done

GCLOUD="${GCLOUD:-gcloud}"
"${GCLOUD}" storage rm "$@"

mkdir -p "$(dirname "${RUN_REMOVALS_FILE}")"
for url in "$@"; do
  p="${url#gs://}"
  printf '%s\n' "${p#*/}"
done | jq -Rc --arg stage "${STAGE}" '
  {path: .,
   date: ((capture("^(snapshots|raw-csv|raw-fac)/(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})/").d) // null),
   stage: $stage}' >>"${RUN_REMOVALS_FILE}"
