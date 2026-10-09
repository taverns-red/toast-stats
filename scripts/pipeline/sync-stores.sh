#!/usr/bin/env bash
# Pull GCS-backed stores into the runner cache (#1722, plan S1-2).
#
# RED STAGE: today's inline daily bash, extracted verbatim. Downloads end in
# `|| true`, so a transport error is indistinguishable from a first run.
set -euo pipefail

BUCKET="${1:?usage: sync-stores.sh <bucket> <store>...}"
shift
GCLOUD="${GCLOUD:-gcloud}"
CACHE_DIR="${CACHE_DIR:-./cache}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"

for store in "$@"; do
  if [ "${store}" = "district-awards-history" ]; then
    bash "${REPO}/scripts/pull-awards-history.sh" "${BUCKET}" \
      "${CACHE_DIR}/district-awards-history.json"
    "${TSX}" "${REPO}/scripts/store-encoding.ts" normalize \
      "${CACHE_DIR}/district-awards-history.json"
    continue
  fi
  mkdir -p "${CACHE_DIR}/${store}"
  "${GCLOUD}" storage rsync -r "gs://${BUCKET}/${store}/" "${CACHE_DIR}/${store}/" 2>&1 || true
  "${TSX}" "${REPO}/scripts/store-encoding.ts" normalize "${CACHE_DIR}/${store}"
done
