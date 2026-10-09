#!/usr/bin/env bash
# Push GCS-backed stores from the runner cache (#1722, plan S1-2).
#
# RED STAGE: today's inline daily bash, extracted verbatim.
set -euo pipefail

BUCKET="${1:?usage: publish-stores.sh <bucket> <store>...}"
shift
GCLOUD="${GCLOUD:-gcloud}"
CACHE_DIR="${CACHE_DIR:-./cache}"

for store in "$@"; do
  if [ "${store}" = "district-awards-history" ]; then
    if [ -f "${CACHE_DIR}/district-awards-history.json" ]; then
      "${GCLOUD}" storage cp "${CACHE_DIR}/district-awards-history.json" \
        "gs://${BUCKET}/district-awards-history.json"
    fi
    continue
  fi
  "${GCLOUD}" storage rsync -r "${CACHE_DIR}/${store}/" "gs://${BUCKET}/${store}/"
  if [ "${store}" = "time-series" ]; then
    "${GCLOUD}" storage cp \
      --content-type="application/json" \
      --cache-control="public, max-age=3600" \
      -r -Z "${CACHE_DIR}"/time-series/* "gs://${BUCKET}/time-series/"
  fi
done
