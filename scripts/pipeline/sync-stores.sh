#!/usr/bin/env bash
# Pull GCS-backed stores into the runner cache, fail-closed (#1722, plan S1-2).
#
# Usage: scripts/pipeline/sync-stores.sh <bucket> <store>...
#   <store>: time-series | club-trends | club-race | district-awards-history
#            | district-region-history | closed-club-names
#            | legacy-suspension-deadlines
# Env:   GCLOUD     the gcloud binary (default `gcloud`; tests point it at a
#                   shim over a temp dir, decision D10)
#        CACHE_DIR  the runner cache (default ./cache)
#        GITHUB_STEP_SUMMARY  per-store counts and MB on disk are appended here
#        CLUB_TRENDS_PROGRAM_YEARS
#                   optional (#1728, E2-2): space- or comma-separated
#                   `YYYY-YYYY` labels. club-trends then pulls only
#                   club-trends/{PY}/ for each, under the same contract as a
#                   whole store. Unset, empty or `all`: the whole store.
#                   Daily derives it from the resolved PY with
#                   scripts/club-trends-sync-scope.ts (#1284: July carries the
#                   prior PY). Pushing a partial pull is safe: publish rsyncs
#                   without deleting unmatched remote objects.
#                   Rebuild derives it from its dates input (#2102).
#                   Once club-trends is pulled, ${CACHE_DIR}/club-trends.scope
#                   names the PYs pulled (one per line) or `all`;
#                   publish-stores.sh refuses to push any other PY (#2102).
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
# district-region-history is a read-only INPUT, not a store (#1799):
# config/district-region-history.json, which build-identity-history.sh owns
# (#1820), lands at ${CACHE_DIR}/config/district-region-history.json for
# compute-analytics' region rollups. publish-stores.sh never pushes it. Not
# built yet ("matched no objects") is a warning and no file: compute then
# writes the rollups with regions null. Any other error fails.
#
# closed-club-names is the same kind of input (#3007):
# config/closed-club-names.json, also built by build-identity-history.sh,
# lands at ${CACHE_DIR}/config/closed-club-names.json for compute-analytics'
# reinstatable-clubs.json. Not built yet: a warning, and compute writes no
# reinstatable-clubs.json. It can be a day or more older than the date.
# Unlike the region history it is best effort: any other pull error is also
# a warning and no file, so it can't fail the run (#3064 review N4).
#
# legacy-suspension-deadlines is a third input of the same kind (#3103):
# config/legacy-suspension-deadlines.json gives the suspension deadline of
# clubs suspended before TI's suspend date reached our data. Best effort
# like closed-club-names: without it, closed clubs with no TI date are
# listed with no inactive period. Nothing pushes it back. The file was
# built once on 2026-11-20 by run 44803919564, and the workflow has since
# been removed (#3105).
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
    time-series | club-trends | club-race | district-awards-history | district-region-history | closed-club-names | legacy-suspension-deadlines) ;;
    *)
      echo "::error::sync-stores: unknown store '${store}'" >&2
      exit 2
      ;;
  esac
done

# Validate the club-trends scope before pulling anything: a label becomes a
# path segment, so only consecutive `YYYY-YYYY` is accepted.
CLUB_TRENDS_PYS=()
case "${CLUB_TRENDS_PROGRAM_YEARS:-all}" in
  all | "") ;;
  *)
    for py in ${CLUB_TRENDS_PROGRAM_YEARS//,/ }; do
      if [[ ! "${py}" =~ ^([0-9]{4})-([0-9]{4})$ ]] ||
        [ "$((10#${BASH_REMATCH[2]}))" -ne "$((10#${BASH_REMATCH[1]} + 1))" ]; then
        echo "::error::sync-stores: bad CLUB_TRENDS_PROGRAM_YEARS entry '${py}' (want YYYY-YYYY or all)" >&2
        exit 2
      fi
      CLUB_TRENDS_PYS+=("${py}")
    done
    ;;
esac

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

# Pull one read-only config/ input: <name> <what a missing file means>
# <issue> [best-effort]. With best-effort, a pull error other than "not
# built yet" is a warning and no file, not a failure.
sync_config_input() {
  local name="$1" missing="$2" issue="$3" best_effort="${4:-}"
  local src="gs://${BUCKET}/config/${name}.json"
  local dest="${CACHE_DIR}/config/${name}.json"
  local err
  err="$(mktemp)"
  mkdir -p "$(dirname "${dest}")"
  if "${GCLOUD}" storage cp "${src}" "${dest}" 2>"${err}"; then
    rm -f "${err}"
    normalize "${dest}"
    echo "- **${name}**: pulled" >>"${SUMMARY}"
    return 0
  fi
  if grep -q 'matched no objects' "${err}"; then
    rm -f "${err}" "${dest}"
    echo "::warning::No ${src} yet; ${missing} (${issue})" >&2
    echo "- **${name}**: none yet (${missing} this run)" >>"${SUMMARY}"
    return 0
  fi
  cat "${err}" >&2
  rm -f "${err}" "${dest}"
  if [ "${best_effort}" = "best-effort" ]; then
    echo "::warning::Failed to pull ${src}; ${missing} (${issue})" >&2
    echo "- **${name}**: failed to pull (${missing} this run)" >>"${SUMMARY}"
    return 0
  fi
  echo "::error::Failed to pull ${src} (${issue})" >&2
  exit 1
}

# Size of a directory in MB, one decimal (what the step summary reports).
mb_of() {
  du -sk "$1" | awk '{ printf "%.1f", $1 / 1024 }'
}

# Pull one prefix: a whole store (`time-series`) or one PY of it
# (`club-trends/2026-2027`). Each prefix gets the full fail-closed contract.
sync_dir() {
  local store="$1"
  local src="gs://${BUCKET}/${store}/"
  local dest="${CACHE_DIR}/${store}"
  local err listing remote local_count mb
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

  mb="$(mb_of "${dest}")"
  normalize "${dest}"
  echo "${store}: ${local_count} files (remote ${remote}), ${mb} MB" >&2
  echo "- **${store} files**: ${local_count} (remote ${remote}), ${mb} MB" >>"${SUMMARY}"
}

for store in "$@"; do
  if [ "${store}" = "district-awards-history" ]; then
    sync_awards
  elif [ "${store}" = "district-region-history" ]; then
    sync_config_input district-region-history "regions null" "#1799"
  elif [ "${store}" = "closed-club-names" ]; then
    sync_config_input closed-club-names "no reinstatable-clubs.json" "#3007" \
      best-effort
  elif [ "${store}" = "legacy-suspension-deadlines" ]; then
    sync_config_input legacy-suspension-deadlines \
      "closed clubs suspended before 2025-07-31 get no inactive period" \
      "#3103" best-effort
  elif [ "${store}" = "club-trends" ]; then
    rm -f "${CACHE_DIR}/club-trends.scope"
    if [ "${#CLUB_TRENDS_PYS[@]}" -gt 0 ]; then
      for py in "${CLUB_TRENDS_PYS[@]}"; do
        sync_dir "club-trends/${py}"
      done
      printf '%s\n' "${CLUB_TRENDS_PYS[@]}" >"${CACHE_DIR}/club-trends.scope"
    else
      sync_dir club-trends
      echo all >"${CACHE_DIR}/club-trends.scope"
    fi
  else
    sync_dir "${store}"
  fi
done
