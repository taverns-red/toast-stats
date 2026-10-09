#!/usr/bin/env bash
# Pull GCS-backed stores into the runner cache, fail-closed (#1722, plan S1-2).
#
# Usage: scripts/pipeline/sync-stores.sh <bucket> <store>...
#   <store>: time-series | club-trends | club-race | district-awards-history
# Env:   GCLOUD     the gcloud binary (default `gcloud`; tests point it at a
#                   shim over a temp dir, decision D10)
#        CACHE_DIR  the runner cache (default ./cache)
#        GITHUB_STEP_SUMMARY  per-store counts are appended here
#
# Stores follow sync → upsert → save → push (R9). A store that loads empty
# when it is not empty remotely is pushed back over the accumulated copy (the
# #1111 class), so the ONLY tolerated empty result is an empty remote (first
# run). For each directory store:
#   1. list the remote. "matched no objects" is a first run; any other error
#      (auth, transport, missing bucket) fails;
#   2. rsync it down. Any error fails (this used to end in `|| true`);
#   3. require at least as many local files as the listing returned;
#   4. normalise on disk: peel every gzip layer and require JSON (#1702).
#      gcloud 568 leaves Content-Encoding: gzip bytes as stored; 588 (the D1
#      pin) inflates one layer. Peeling to plain JSON is right under both.
# district-awards-history delegates to scripts/pull-awards-history.sh (#1704)
# and is normalised the same way.
#
# Exit codes: 0 ok · 1 a store could not be pulled or is corrupt · 2 usage
set -euo pipefail

usage() {
  echo "usage: sync-stores.sh <bucket> <store>..." >&2
  exit 2
}

BUCKET="${1:-}"
[ -n "${BUCKET}" ] && [ "$#" -ge 2 ] || usage
shift

GCLOUD="${GCLOUD:-gcloud}"
CACHE_DIR="${CACHE_DIR:-./cache}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"

for store in "$@"; do
  case "${store}" in
    time-series | club-trends | club-race | district-awards-history) ;;
    *)
      echo "::error::sync-stores: unknown store '${store}'" >&2
      exit 2
      ;;
  esac
done

normalize() {
  "${TSX}" "${REPO}/scripts/store-encoding.ts" normalize "$@"
}

sync_awards() {
  local dest="${CACHE_DIR}/district-awards-history.json"
  GCLOUD="${GCLOUD}" bash "${REPO}/scripts/pull-awards-history.sh" \
    "${BUCKET}" "${dest}"
  normalize "${dest}"
  if [ -f "${dest}" ]; then
    echo "- **district-awards-history**: pulled" >>"${SUMMARY}"
  else
    echo "- **district-awards-history**: none yet (first run)" >>"${SUMMARY}"
  fi
}

sync_dir() {
  local store="$1"
  local src="gs://${BUCKET}/${store}/"
  local dest="${CACHE_DIR}/${store}"
  local err listing remote local_count
  err="$(mktemp)"
  mkdir -p "${dest}"

  if ! listing="$("${GCLOUD}" storage ls "${src}**" 2>"${err}")"; then
    # Text printed by `gcloud storage ls` for an empty prefix (SDK 583.0.0).
    if grep -q 'matched no objects' "${err}"; then
      rm -f "${err}"
      echo "No ${src} objects yet (first run); ${store} starts empty" >&2
      echo "- **${store} files**: 0 (remote empty, first run)" >>"${SUMMARY}"
      return 0
    fi
    cat "${err}" >&2
    rm -f "${err}"
    echo "::error::Failed to list ${src}; refusing to run on an empty ${store} store (#1722)" >&2
    exit 1
  fi
  rm -f "${err}"
  # Objects only: a name ending in "/" is a folder placeholder.
  remote="$(grep -c '[^/]$' <<<"${listing}" || true)"

  if ! "${GCLOUD}" storage rsync -r "${src}" "${dest}/"; then
    echo "::error::Failed to download ${src}; refusing to run on a partial ${store} store (#1722)" >&2
    exit 1
  fi

  local_count="$(find "${dest}" -type f | wc -l | tr -d ' ')"
  if [ "${local_count}" -lt "${remote}" ]; then
    echo "::error::${store}: ${local_count} files on disk but ${remote} objects in ${src} (#1722)" >&2
    exit 1
  fi

  normalize "${dest}"
  echo "${store}: ${local_count} files (remote ${remote})" >&2
  echo "- **${store} files**: ${local_count} (remote ${remote})" >>"${SUMMARY}"
}

for store in "$@"; do
  if [ "${store}" = "district-awards-history" ]; then
    sync_awards
  else
    sync_dir "${store}"
  fi
done
