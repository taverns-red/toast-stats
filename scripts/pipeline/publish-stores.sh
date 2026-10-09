#!/usr/bin/env bash
# Push GCS-backed stores from the runner cache, fail-closed (#1722, plan S1-2).
#
# Usage: scripts/pipeline/publish-stores.sh <bucket> <store>...
#   <store>: time-series | club-trends | club-race | district-awards-history
# Env:   GCLOUD     the gcloud binary (default `gcloud`; tests use a shim, D10)
#        CACHE_DIR  the runner cache (default ./cache)
#
# The push half of sync → upsert → save → push (R9):
#   1. every requested directory store must exist on disk: one that was never
#      synced has nothing accumulated in it, and pushing it is the #1111 class;
#   2. the double-encoding check runs over all of them BEFORE any push: a file
#      that is still gzip would get another layer from the -Z upload (#1702);
#   3. directory stores are rsynced up (internal state, no CDN headers);
#      district-awards-history is copied if the run produced one (#333);
#   4. time-series is then re-uploaded with `-Z` and CDN headers, because the
#      frontend reads it from the CDN. (E2-1 folds 3 and 4 into one upload.)
# Any transfer error fails the script.
#
# Exit codes: 0 ok · 1 refused or a transfer failed · 2 usage
set -euo pipefail

usage() {
  echo "usage: publish-stores.sh <bucket> <store>..." >&2
  exit 2
}

BUCKET="${1:-}"
[ -n "${BUCKET}" ] && [ "$#" -ge 2 ] || usage
shift

GCLOUD="${GCLOUD:-gcloud}"
CACHE_DIR="${CACHE_DIR:-./cache}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"

dirs=()
for store in "$@"; do
  case "${store}" in
    time-series | club-trends | club-race)
      if [ ! -d "${CACHE_DIR}/${store}" ]; then
        echo "::error::publish-stores: ${CACHE_DIR}/${store} does not exist; it was never synced, so pushing it would overwrite the accumulated store (#1722)" >&2
        exit 1
      fi
      dirs+=("${CACHE_DIR}/${store}")
      ;;
    district-awards-history) ;;
    *)
      echo "::error::publish-stores: unknown store '${store}'" >&2
      exit 2
      ;;
  esac
done

if [ "${#dirs[@]}" -gt 0 ]; then
  "${TSX}" "${REPO}/scripts/store-encoding.ts" check "${dirs[@]}"
fi

has_files() { [ -n "$(find "$1" -type f -print -quit)" ]; }

for store in "$@"; do
  if [ "${store}" = "district-awards-history" ]; then
    if [ -f "${CACHE_DIR}/district-awards-history.json" ]; then
      "${GCLOUD}" storage cp "${CACHE_DIR}/district-awards-history.json" \
        "gs://${BUCKET}/district-awards-history.json"
    else
      echo "publish-stores: no district-awards-history.json produced; nothing to push" >&2
    fi
    continue
  fi

  if ! has_files "${CACHE_DIR}/${store}"; then
    echo "publish-stores: ${store} is empty; nothing to push" >&2
    continue
  fi
  "${GCLOUD}" storage rsync -r "${CACHE_DIR}/${store}/" "gs://${BUCKET}/${store}/"

  if [ "${store}" = "time-series" ]; then
    # CDN-served overlay (mutable, short cache). `gcloud storage` parallelises
    # by default, so there is no `-m`.
    "${GCLOUD}" storage cp \
      --content-type="application/json" \
      --cache-control="public, max-age=3600" \
      -r -Z "${CACHE_DIR}"/time-series/* "gs://${BUCKET}/time-series/"
  fi
done
