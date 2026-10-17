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
#   1b. club-trends: when sync-stores.sh pulled only some PYs, it left
#      ${CACHE_DIR}/club-trends.scope naming them. A local PY outside it was
#      written but never pulled, and its rsync would put the run's few points
#      over the accumulated PY (#1111 class, #2102), so nothing is pushed;
#   2. the double-encoding check runs over all of them BEFORE any push: a file
#      that is still gzip would get another layer from the -Z upload (#1702);
#   3. club-trends and club-race are rsynced up (internal state, no CDN
#      headers); district-awards-history is copied if the run produced one
#      (#333);
#   4. time-series has ONE upload path (#1731, plan E2-1): the frontend reads
#      it from the CDN, so each file goes up with `-Z`, the CDN headers and
#      `x-goog-meta-sha256` = sha256 of its uncompressed JSON. A file is
#      uploaded only when that sha (or a header) differs from the live
#      object's. `cp -Z` gzip is not byte-deterministic, so re-uploading
#      unchanged content used to give every object a new crc32c each run and
#      the promotion rsync re-copied all of them; skipped objects now keep
#      their generation and hash, so promotion skips them too.
#   5. every object pushed is appended to $RUN_MANIFEST_FILE (required) with
#      the sha256 of its uncompressed bytes (#1762, ADR-015 P5);
#   6. with GCS_BUCKET_PRODUCTION set, prod's time-series/ is listed too
#      (read-only): a file current in staging but stale or missing in prod
#      — one a held run uploaded — is appended to the manifest as stage
#      `publish-stores-carry` without being re-uploaded. Promotion copies
#      only the manifest (#1763), so without this it would never reach prod.
# Any listing or transfer error fails the script.
#
# Env (time-series): PUBLISH_PARALLEL  concurrent uploads (default 16)
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
# Every push is recorded in the run manifest (#1762): the time-series plan
# carries the sha256 it uploads with; the rest go through gcs-upload.sh.
UPLOAD=(bash "${REPO}/scripts/pipeline/gcs-upload.sh" publish-stores)
if [ -z "${RUN_MANIFEST_FILE:-}" ]; then
  echo "::error::publish-stores: RUN_MANIFEST_FILE is not set; refusing unrecorded pushes (#1762)" >&2
  exit 2
fi

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

# 1b. club-trends holds only the PYs the sync pulled (#2102).
SCOPE_FILE="${CACHE_DIR}/club-trends.scope"
for store in "$@"; do
  [ "${store}" = "club-trends" ] && [ -f "${SCOPE_FILE}" ] || continue
  grep -qx 'all' "${SCOPE_FILE}" && continue
  unpulled=()
  while IFS= read -r entry; do
    grep -qxF "${entry}" "${SCOPE_FILE}" || unpulled+=("club-trends/${entry}")
  done < <(find "${CACHE_DIR}/club-trends" -mindepth 1 -maxdepth 1 -exec basename {} \; | LC_ALL=C sort)
  if [ "${#unpulled[@]}" -gt 0 ]; then
    echo "::error::publish-stores: ${unpulled[*]} written but never pulled (pulled: $(paste -sd' ' "${SCOPE_FILE}")); pushing would overwrite the accumulated PY, so nothing is pushed (#2102, #1111)" >&2
    exit 1
  fi
done

if [ "${#dirs[@]}" -gt 0 ]; then
  "${TSX}" "${REPO}/scripts/store-encoding.ts" check "${dirs[@]}"
fi

has_files() { [ -n "$(find "$1" -type f -print -quit)" ]; }

summary() {
  echo "$1" >&2
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$1" >>"${GITHUB_STEP_SUMMARY}"
  fi
  return 0
}

# One upload path for time-series: changed files only, with sha metadata.
publish_time_series() {
  local work listing plan total uploads
  work="$(mktemp -d)"
  listing="${work}/listing.json"
  plan="${work}/plan"

  # Fail closed: on a missing bucket gcloud prints `[]` but exits 1, so the
  # exit status decides, never the output.
  if ! "${GCLOUD}" storage objects list "gs://${BUCKET}/time-series/**" \
    --format=json >"${listing}"; then
    echo "::error::publish-stores: could not list gs://${BUCKET}/time-series/; refusing to publish (#1731)" >&2
    rm -rf "${work}"
    return 1
  fi
  # #1763: also list prod (read-only) so the files a held run left current
  # in staging but stale in prod are recorded for the scoped promote.
  local carry_args=()
  if [ -n "${GCS_BUCKET_PRODUCTION:-}" ]; then
    if ! "${GCLOUD}" storage objects list "gs://${GCS_BUCKET_PRODUCTION}/time-series/**" \
      --format=json >"${work}/prod-listing.json"; then
      echo "::error::publish-stores: could not list gs://${GCS_BUCKET_PRODUCTION}/time-series/; refusing to publish (#1763)" >&2
      rm -rf "${work}"
      return 1
    fi
    carry_args=("${work}/prod-listing.json" "${work}/carry")
  fi
  "${TSX}" "${REPO}/scripts/time-series-publish-plan.ts" \
    "${CACHE_DIR}/time-series" "${listing}" "time-series/" \
    ${carry_args[@]+"${carry_args[@]}"} >"${plan}"

  total="$(find "${CACHE_DIR}/time-series" -type f | wc -l | tr -d ' ')"
  uploads=$(($(tr -cd '\0' <"${plan}" | wc -c) / 2))

  if [ "${uploads}" -gt 0 ]; then
    # xargs exits non-zero (123) if any upload fails; set -e then fails us.
    # The inner script expands $1/$2 and the exported vars itself.
    # shellcheck disable=SC2016
    xargs -0 -n 2 -P "${PUBLISH_PARALLEL:-16}" \
      bash -c '"${GCLOUD}" storage cp \
        --content-type="application/json" \
        --cache-control="public, max-age=3600" \
        --custom-metadata="sha256=$1" \
        -Z "${CACHE_DIR}/time-series/$2" "gs://${BUCKET}/time-series/$2"' _ \
      <"${plan}"
    # Record them with the sha they were uploaded with (#1762): the
    # manifest's hash and E2-1's are the same hash.
    mkdir -p "$(dirname "${RUN_MANIFEST_FILE}")"
    tr '\0' '\n' <"${plan}" | paste - - |
      jq -Rc '
        split("\t") as [$sha, $rel]
        | {path: ("time-series/" + $rel), sha256: $sha, date: null,
           stage: "publish-stores"}' >>"${RUN_MANIFEST_FILE}"
  fi
  local carried=0 carry_note=""
  if [ -s "${work}/carry" ]; then
    carried=$(($(tr -cd '\0' <"${work}/carry" | wc -c) / 2))
    mkdir -p "$(dirname "${RUN_MANIFEST_FILE}")"
    tr '\0' '\n' <"${work}/carry" | paste - - |
      jq -Rc '
        split("\t") as [$sha, $rel]
        | {path: ("time-series/" + $rel), sha256: $sha, date: null,
           stage: "publish-stores-carry"}' >>"${RUN_MANIFEST_FILE}"
  fi
  if [ "${#carry_args[@]}" -gt 0 ]; then
    carry_note=", ${carried} carried for promotion (current in staging, stale in prod, #1763)"
  fi
  rm -rf "${work}"
  summary "time-series publish: ${uploads} uploaded, $((total - uploads)) unchanged${carry_note}"
}
export GCLOUD CACHE_DIR BUCKET

for store in "$@"; do
  if [ "${store}" = "district-awards-history" ]; then
    if [ -f "${CACHE_DIR}/district-awards-history.json" ]; then
      "${UPLOAD[@]}" cp "${CACHE_DIR}/district-awards-history.json" \
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
  if [ "${store}" = "time-series" ]; then
    publish_time_series
  else
    "${UPLOAD[@]}" rsync -r "${CACHE_DIR}/${store}/" "gs://${BUCKET}/${store}/"
  fi
done
