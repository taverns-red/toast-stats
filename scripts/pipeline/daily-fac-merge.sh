#!/usr/bin/env bash
# Daily Find-A-Club merge with a persisted fallback (#1770, ADR-015 P1/P2,
# audit D-10).
#
# Usage: scripts/pipeline/daily-fac-merge.sh <bucket> <snapshot-date>
#
# Merges Find-A-Club enrichment into $CACHE_DIR/snapshots/<date>/ before
# compute. The FAC source for each district snapshot, in order:
#   1. fresh      $CACHE_DIR/find-a-club/<date>/district_<id>.json, what
#                 today's fetch-find-a-club wrote (it writes only the
#                 districts it fetched; an outage writes none).
#   2. fallback   the same file from the most recent persisted
#                 raw-fac/<d>/ in staging, d before <date> (#1758): the daily
#                 degrades to the last good FAC rather than to nothing.
#   3. none       the district is merged unenriched, counted and flagged
#                 (::warning:: and the step summary), so nothing ships
#                 unenriched silently. If prod already holds an enriched
#                 copy of the date, the completeness gate (#1761) holds it;
#                 a new daily date has no prod copy to compare against.
# The fallback files are merged, never persisted: raw-fac/<date>/ only ever
# holds what <date>'s own fetch returned.
#
# Fails closed (exit 1, the step fails before upload):
#   - raw-fac/ cannot be listed or the fallback cannot be downloaded (a GCS
#     error is not "no persisted FAC");
#   - merge-find-a-club fails (D7: a merge failure fails the date).
#
# Env:
#   GCLOUD               gcloud binary (default `gcloud`; tests use a shim)
#   CACHE_DIR            runner cache (default ./cache)
#   COLLECTOR_CLI        collector-cli command (default `npx collector-cli`)
#   GITHUB_STEP_SUMMARY  the source counts are appended here
#
# Output: stdout is ONE JSON line (R4),
#   {"districts":N,"fresh":N,"fallback":N,"fallbackDate":"D"|null,"unenriched":N}
# Exit codes: 0 merged (some districts may be unenriched, see the counts) ·
#             1 failed closed · 2 usage
set -euo pipefail

BUCKET="${1:-}"
DATE="${2:-}"
if [ -z "${BUCKET}" ] || [[ ! "${DATE}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "usage: daily-fac-merge.sh <bucket> <YYYY-MM-DD>" >&2
  exit 2
fi

GCLOUD="${GCLOUD:-gcloud}"
CACHE_DIR="${CACHE_DIR:-./cache}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
export CACHE_DIR
read -r -a COLLECTOR <<<"${COLLECTOR_CLI:-npx collector-cli}"

# stdout is reserved for the result line; fd 3 keeps it.
exec 3>&1 1>&2

SNAP_DIR="${CACHE_DIR}/snapshots/${DATE}"
FRESH="${CACHE_DIR}/find-a-club/${DATE}"
WORK="$(mktemp -d)"
cleanup_work() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup_work EXIT
MERGE_DIR="${WORK}/merge"
FALLBACK_DIR="${WORK}/fallback"
mkdir -p "${MERGE_DIR}"

if [ ! -d "${SNAP_DIR}" ]; then
  echo "::error::daily-fac-merge: no snapshot directory ${SNAP_DIR}"
  exit 1
fi

# The district ids of the date's snapshots, one per line.
mapfile -t IDS < <(find "${SNAP_DIR}" -maxdepth 1 -name 'district_*.json' \
  -exec basename {} .json \; | sed 's/^district_//' | LC_ALL=C sort)

FRESH_N=0
MISSING=()
for id in "${IDS[@]}"; do
  if [ -f "${FRESH}/district_${id}.json" ]; then
    cp "${FRESH}/district_${id}.json" "${MERGE_DIR}/"
    FRESH_N=$((FRESH_N + 1))
  else
    MISSING+=("${id}")
  fi
done

FALLBACK_N=0
FALLBACK_DATE=""
UNENRICHED=()
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "No fresh Find-A-Club for ${#MISSING[@]} district(s): ${MISSING[*]}"
  err="${WORK}/ls.err"
  if listing="$("${GCLOUD}" storage ls "gs://${BUCKET}/raw-fac/" 2>"${err}")"; then
    # The latest persisted date strictly before <date>: today's own
    # raw-fac/ (if the persist step ran) is the fresh copy already used.
    FALLBACK_DATE="$(printf '%s\n' "${listing}" |
      sed -n 's|^gs://[^/]*/raw-fac/\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)/.*$|\1|p' |
      LC_ALL=C sort -u | awk -v d="${DATE}" '$0 < d' | tail -1)"
  elif ! grep -q 'matched no objects' "${err}"; then
    cat "${err}"
    echo "::error::Could not list raw-fac/; not publishing ${DATE} unenriched"
    exit 1
  fi
  if [ -n "${FALLBACK_DATE}" ]; then
    mkdir -p "${FALLBACK_DIR}"
    if ! "${GCLOUD}" storage rsync -r \
      "gs://${BUCKET}/raw-fac/${FALLBACK_DATE}/" "${FALLBACK_DIR}/"; then
      echo "::error::Could not download raw-fac/${FALLBACK_DATE}/; not publishing ${DATE} unenriched"
      exit 1
    fi
  fi
  for id in "${MISSING[@]}"; do
    if [ -n "${FALLBACK_DATE}" ] && [ -f "${FALLBACK_DIR}/district_${id}.json" ]; then
      cp "${FALLBACK_DIR}/district_${id}.json" "${MERGE_DIR}/"
      FALLBACK_N=$((FALLBACK_N + 1))
    else
      UNENRICHED+=("${id}")
    fi
  done
fi

if [ "${FRESH_N}" -gt 0 ] || [ "${FALLBACK_N}" -gt 0 ]; then
  echo "Merging Find-A-Club into snapshots/${DATE}/ (${FRESH_N} fresh, ${FALLBACK_N} from raw-fac/${FALLBACK_DATE:-none}/)..."
  if ! "${COLLECTOR[@]}" merge-find-a-club --fac-dir "${MERGE_DIR}" \
    --snapshot-dir "${SNAP_DIR}" --verbose >"${WORK}/merge.json"; then
    cat "${WORK}/merge.json"
    echo "::error::Find-A-Club merge failed for ${DATE}; failing the date (D7)"
    exit 1
  fi
fi

if [ "${FALLBACK_N}" -gt 0 ]; then
  echo "::warning::Find-A-Club fetch incomplete for ${DATE}: ${FALLBACK_N} district(s) enriched from the persisted raw-fac/${FALLBACK_DATE}/ (#1770)"
fi
if [ "${#UNENRICHED[@]}" -gt 0 ]; then
  echo "::warning::${#UNENRICHED[@]} district(s) of ${DATE} have no Find-A-Club, fresh or persisted, and are published unenriched: ${UNENRICHED[*]} (#1770)"
fi

{
  echo "## 🔗 Find-A-Club Snapshot Merge (#429, #1770)"
  echo "- **Districts**: ${#IDS[@]}"
  echo "- **Fresh FAC (today’s fetch)**: ${FRESH_N}"
  echo "- **Fallback FAC (persisted raw-fac/${FALLBACK_DATE:-none}/)**: ${FALLBACK_N}"
  echo "- **Unenriched (no FAC at all)**: ${#UNENRICHED[@]}"
  if [ -s "${WORK}/merge.json" ]; then
    jq -r '"- **Clubs enriched** (matched): \(.totalMatched)",
      "- **Snapshot-only** (no FAC match — typically suspended; #490): \(.totalSnapshotOnly)",
      "- **FAC-only** (ATOs / prospective; #489): \(.totalFacOnly)"' \
      "${WORK}/merge.json"
  fi
} >>"${SUMMARY}"

if [ -n "${FALLBACK_DATE}" ] && [ "${FALLBACK_N}" -gt 0 ]; then
  fb="\"${FALLBACK_DATE}\""
else
  fb=null
fi
printf '{"districts":%d,"fresh":%d,"fallback":%d,"fallbackDate":%s,"unenriched":%d}\n' \
  "${#IDS[@]}" "${FRESH_N}" "${FALLBACK_N}" "${fb}" "${#UNENRICHED[@]}" >&3
