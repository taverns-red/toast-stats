#!/usr/bin/env bash
# The per-date loop shared by the dispatch-only data modes (#1742, plan P3-1).
#
# Usage: scripts/pipeline/process-dates.sh <bucket> <mode> [<date>...]
#   <mode>: rebuild | rescrape | rescrape-historical
#   <date>: YYYY-MM-DD, processed in the order given. rescrape-historical
#           takes the raw dates the previous step downloaded into
#           $CACHE_DIR/raw-csv/ and leaves them there for its upload step.
#
# Each date goes through the same stages, one date at a time to stay inside
# the runner's disk (~14 GB free):
#   1. resolve   rebuild: a month-end is sourced from its month's closing raw
#                (#1608, scripts/resolve-rebuild-source.ts). Unresolvable:
#                the date fails closed rather than fall back to a pre-close raw.
#   2. raw       rebuild: rsync raw-csv/<source>/ down. A transfer error fails
#                the date (it used to end in `|| true` and transform whatever
#                had landed).
#   3. prev-year rebuild, rescrape-historical: best effort,
#                snapshots/<date - 1y>/district_*.json for YoY. (rescrape
#                never pulled it.)
#   4. transform rebuild, rescrape-historical: collector-cli transform
#                --date <source> --force.
#                rescrape: collector-cli scrape --date <date> --transform
#                --districts $DISTRICTS, which requests the date's own as-of
#                and fails rather than store another day's data (#1669). A
#                failed scrape's leftovers are dropped so nothing publishes.
#   5. remap     the transform can write a different date than it was given
#                (a close lands on its month-end, #193): the date it actually
#                wrote is the one guarded, computed and uploaded.
#   6. guard     never publish over a remote close (#1621,
#                scripts/guard-snapshot-upload.ts). Exit 3 is the guard
#                working: REFUSED. Any other non-zero (unreadable GCS): FAILED.
#   7. compute   collector-cli compute-analytics. A failure is counted, but
#                the snapshots still upload (#1708); its JSON feeds the store
#                counters either way.
#   8. upload    snapshots/<date>/*.json and analytics/*.json, `-Z` with the
#                CDN headers. An upload error aborts the loop (exit 1), as the
#                inline loop's `set -e` did: the step fails before any store
#                push. rescrape then rsyncs the re-collected raw-csv/<date>/
#                up, replacing the old copy.
#   9. cleanup   the date's raw, snapshot and prior-year directories, so no
#                later step reads a rebuilt date as "latest" (#295, #1670).
#                rescrape-historical keeps its raw: the next step uploads it.
# The GCS-backed stores (time-series, club-trends, club-race, awards history)
# are NOT handled here: the caller pulls them with sync-stores.sh before and
# pushes them with publish-stores.sh after, then runs
# scripts/partial-failure-gate.sh with the failed count (#1708, D7).
#
# Env:
#   GCLOUD                 gcloud binary (default `gcloud`; tests use a shim)
#   CACHE_DIR              runner cache (default ./cache); exported for the CLI
#   COLLECTOR_CLI          collector-cli command (default `npx collector-cli`)
#   RESOLVE_REBUILD_SOURCE resolver command (default: tsx resolve-rebuild-source.ts)
#   GUARD_SNAPSHOT_UPLOAD  guard command (default: tsx guard-snapshot-upload.ts)
#   DISTRICTS              rescrape: required, comma-separated district ids
#   GITHUB_STEP_SUMMARY    date counts and store counters are appended here
#
# Output: stdout is ONE JSON line, {"succeeded":N,"refused":N,"failed":N}
# (R4); everything else, including the CLI's own output, goes to stderr.
# Exit codes: 0 the loop finished (failed dates are in the counts) ·
#             1 an upload or an unexpected command failed · 2 usage
set -euo pipefail

usage() {
  echo "usage: process-dates.sh <bucket> <mode> [<date>...]" >&2
  exit 2
}

BUCKET="${1:-}"
MODE="${2:-}"
[ -n "${BUCKET}" ] && [ -n "${MODE}" ] || usage
shift 2

case "${MODE}" in
  rebuild | rescrape-historical) ;;
  rescrape)
    if [[ ! "${DISTRICTS:-}" =~ ^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$ ]]; then
      echo "::error::process-dates: rescrape needs DISTRICTS (comma-separated ids), got '${DISTRICTS:-}'" >&2
      exit 2
    fi
    ;;
  *)
    echo "::error::process-dates: unknown mode '${MODE}'" >&2
    exit 2
    ;;
esac

for date in "$@"; do
  if [[ ! "${date}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "::error::process-dates: bad date '${date}' (want YYYY-MM-DD)" >&2
    exit 2
  fi
done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSX="${TSX:-${REPO}/node_modules/.bin/tsx}"
GCLOUD="${GCLOUD:-gcloud}"
CACHE_DIR="${CACHE_DIR:-./cache}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
export CACHE_DIR
export GCS_BUCKET="${BUCKET}"

read -r -a COLLECTOR <<<"${COLLECTOR_CLI:-npx collector-cli}"
read -r -a RESOLVE <<<"${RESOLVE_REBUILD_SOURCE:-${TSX} ${REPO}/scripts/resolve-rebuild-source.ts}"
read -r -a GUARD <<<"${GUARD_SNAPSHOT_UPLOAD:-${TSX} ${REPO}/scripts/guard-snapshot-upload.ts}"

# stdout is reserved for the result line; fd 3 keeps it.
exec 3>&1 1>&2

SNAPSHOTS="${CACHE_DIR}/snapshots"
RAW="${CACHE_DIR}/raw-csv"
WORK="$(mktemp -d)"
COMPUTE_JSON="${WORK}/compute-analytics.json"
COUNTERS_JSONL="${WORK}/compute-counters.jsonl"
: >"${COUNTERS_JSONL}"
cleanup_work() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup_work EXIT

SUCCEEDED=0
FAILED=0
REFUSED=0

# The snapshot date directories present in the cache, one per line, sorted.
snapshot_dates() {
  [ -d "${SNAPSHOTS}" ] || return 0
  find "${SNAPSHOTS}" -mindepth 1 -maxdepth 1 -type d -name '????-??-??' \
    -exec basename {} \; | LC_ALL=C sort
}

# YYYY-MM-DD one year earlier (GNU date on the runner, BSD date locally).
prior_year() {
  date -d "$1 - 1 year" +%Y-%m-%d 2>/dev/null ||
    date -j -v-1y -f %Y-%m-%d "$1" +%Y-%m-%d 2>/dev/null ||
    true
}

upload_snapshot() {
  local actual="$1" dir="${SNAPSHOTS}/$1"
  local count
  count="$(find "${dir}" -name '*.json' | wc -l | tr -d ' ')"
  echo "Uploading snapshots/${actual}/ (${count} files)..."
  "${GCLOUD}" storage cp \
    --content-type="application/json" \
    --cache-control="public, max-age=3600, must-revalidate" \
    -Z \
    "${dir}"/*.json \
    "gs://${BUCKET}/snapshots/${actual}/"
  if [ -d "${dir}/analytics" ]; then
    "${GCLOUD}" storage cp \
      --content-type="application/json" \
      --cache-control="public, max-age=3600, must-revalidate" \
      -Z \
      "${dir}/analytics"/*.json \
      "gs://${BUCKET}/snapshots/${actual}/analytics/"
  fi
}

# Process one date. Sets OUTCOME to published | compute-failed | refused |
# failed. Called as a plain command so `set -e` stays armed for the uploads.
process_one() {
  local date="$1"
  local source prev before actual guard_status
  OUTCOME=failed
  source="${date}"
  prev=""

  # 1. resolve
  if [ "${MODE}" = "rebuild" ]; then
    if ! source="$("${RESOLVE[@]}" "${date}")"; then
      echo "::warning::Could not resolve rebuild source for ${date}; skipping"
      return 0
    fi
    if [ "${source}" != "${date}" ]; then
      echo "Month-end ${date} sourced from closing raw ${source}"
    fi
  fi

  # 2. raw
  if [ "${MODE}" = "rebuild" ]; then
    mkdir -p "${RAW}/${source}"
    if ! "${GCLOUD}" storage rsync -r \
      "gs://${BUCKET}/raw-csv/${source}/" "${RAW}/${source}/"; then
      echo "::warning::Could not download raw-csv/${source}/; skipping ${date}"
      rm -rf "${RAW:?}/${source}"
      return 0
    fi
  fi

  # 3. prev-year
  if [ "${MODE}" != "rescrape" ]; then
    prev="$(prior_year "${date}")"
  fi
  if [ -n "${prev}" ] && [ ! -d "${SNAPSHOTS}/${prev}" ]; then
    mkdir -p "${SNAPSHOTS}/${prev}"
    "${GCLOUD}" storage cp \
      "gs://${BUCKET}/snapshots/${prev}/district_*.json" \
      "${SNAPSHOTS}/${prev}/" 2>/dev/null ||
      echo "No prior-year snapshot for ${prev}; YoY omitted"
  fi
  before="$(snapshot_dates)"

  # 4. transform
  if [ "${MODE}" = "rescrape" ]; then
    echo "Scraping and transforming ${date}..."
    if ! "${COLLECTOR[@]}" scrape --date "${date}" --transform --force \
      --verbose --districts "${DISTRICTS}"; then
      echo "::warning::Scrape/transform failed for ${date}; nothing uploaded for it"
      local leftover
      for leftover in $(comm -13 <(echo "${before}") <(snapshot_dates)); do
        rm -rf "${SNAPSHOTS:?}/${leftover}"
      done
      cleanup_date "${source}" "" "${prev}"
      return 0
    fi
  else
    echo "Transforming ${source}..."
    if ! "${COLLECTOR[@]}" transform --date "${source}" --force --verbose; then
      echo "::warning::Transform failed for ${source}"
      cleanup_date "${source}" "" "${prev}"
      return 0
    fi
  fi

  # 5. remap
  actual="$(comm -13 <(echo "${before}") <(snapshot_dates) | head -1)"
  actual="${actual:-${date}}"
  if [ "${actual}" != "${date}" ]; then
    echo "Date remapped: ${date} → ${actual}"
  fi

  # 6. guard
  guard_status=0
  "${GUARD[@]}" "${actual}" "${SNAPSHOTS}" || guard_status=$?
  if [ "${guard_status}" -ne 0 ]; then
    echo "::warning::Not publishing ${actual}: upload guard exit ${guard_status} (3 = closing snapshot)"
    if [ "${guard_status}" -eq 3 ]; then
      OUTCOME=refused
    fi
    cleanup_date "${source}" "${actual}" "${prev}"
    return 0
  fi

  # 7. compute
  echo "Computing analytics for ${actual}..."
  local compute_ok=1
  if ! "${COLLECTOR[@]}" compute-analytics --date "${actual}" \
    --force-analytics --verbose >"${COMPUTE_JSON}"; then
    echo "::warning::Compute failed for ${actual}"
    compute_ok=0
  fi
  jq -c . "${COMPUTE_JSON}" >>"${COUNTERS_JSONL}" ||
    echo "::warning::No compute JSON for ${actual}; the counters omit it"

  # 8. upload
  if [ -d "${SNAPSHOTS}/${actual}" ]; then
    upload_snapshot "${actual}"
    if [ "${compute_ok}" = 1 ]; then OUTCOME=published; else OUTCOME=compute-failed; fi
  else
    echo "::warning::No snapshot directory found for ${date} (expected ${actual})"
  fi
  if [ "${MODE}" = "rescrape" ] && [ -d "${RAW}/${date}" ]; then
    echo "Uploading raw-csv/${date}/..."
    "${GCLOUD}" storage rsync -r "${RAW}/${date}/" "gs://${BUCKET}/raw-csv/${date}/"
  fi

  # 9. cleanup
  cleanup_date "${source}" "${actual}" "${prev}"
}

cleanup_date() {
  local source="$1" actual="$2" prev="$3"
  # rescrape-historical's raw belongs to the step after this one.
  if [ "${MODE}" != "rescrape-historical" ]; then rm -rf "${RAW:?}/${source}"; fi
  if [ -n "${actual}" ]; then rm -rf "${SNAPSHOTS:?}/${actual}"; fi
  if [ -n "${prev}" ]; then rm -rf "${SNAPSHOTS:?}/${prev}"; fi
  return 0
}

TOTAL="$#"
echo "- **Dates to process**: ${TOTAL}" >>"${SUMMARY}"
INDEX=0
for date in "$@"; do
  INDEX=$((INDEX + 1))
  echo ""
  echo "═══════════════════════════════════════"
  echo "[${INDEX}/${TOTAL}] ${MODE} ${date}"
  echo "═══════════════════════════════════════"
  process_one "${date}"
  case "${OUTCOME}" in
    published) SUCCEEDED=$((SUCCEEDED + 1)) ;;
    # Uploaded, so it is a published date, AND a failure for the gate.
    compute-failed)
      SUCCEEDED=$((SUCCEEDED + 1))
      FAILED=$((FAILED + 1))
      ;;
    refused) REFUSED=$((REFUSED + 1)) ;;
    failed) FAILED=$((FAILED + 1)) ;;
  esac
  if [ $((INDEX % 10)) -eq 0 ]; then
    echo "Disk usage after ${INDEX} dates: $(df -h . | tail -1 | awk '{print $3 " used / " $4 " free"}')"
  fi
done

{
  echo "- **Dates succeeded**: ${SUCCEEDED}"
  echo "- **Refused by the upload guard**: ${REFUSED}"
  echo "- **Dates failed**: ${FAILED}"
  jq -rs -f "${REPO}/scripts/compute-counters.jq" "${COUNTERS_JSONL}"
} >>"${SUMMARY}"

printf '{"succeeded":%d,"refused":%d,"failed":%d}\n' \
  "${SUCCEEDED}" "${REFUSED}" "${FAILED}" >&3
