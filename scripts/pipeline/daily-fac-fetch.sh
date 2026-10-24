#!/usr/bin/env bash
# The daily Find-A-Club fetch and its persistence (#430, #1758, #1770).
#
# Usage: scripts/pipeline/daily-fac-fetch.sh <bucket> <snapshot-date> <districts>
#
# Stage 7 of scripts/pipeline/process-dates.sh in daily mode (#1765), before
# scripts/pipeline/daily-fac-merge.sh. Both used to be inline daily steps.
#   1. fetch    collector-cli fetch-find-a-club --districts <districts>
#               --include-undistricted, comparing against the date's snapshot
#               directory. It hits TI's public, unauthenticated endpoint,
#               which can fail, rate-limit or change at any time, so it is
#               non-blocking: it writes $CACHE_DIR/find-a-club/<date>/ for
#               the districts it fetched, and the merge fills the rest from
#               the last persisted raw-fac/ (#1770). The counts and the top
#               five districts by ATO/prospective surplus go to the summary.
#   2. persist  $CACHE_DIR/find-a-club/<date>/ to staging raw-fac/<date>/
#               (ADR-015 P2, #1758), so a re-derivation of the date can merge
#               it back. Plain JSON (no -Z), staging only, never promoted,
#               through gcs-upload.sh so it is in the run manifest. Persists
#               whatever the fetch wrote, a partial fetch included: raw-fac/
#               <date>/ holds exactly what <date>'s fetch returned, never a
#               fallback. Non-blocking: a failure is a warning (a
#               re-derivation of the date then carries its FAC forward from
#               the staged snapshot, #2237).
#
# Env:
#   GCLOUD               gcloud binary (default `gcloud`; tests use a shim)
#   CACHE_DIR            runner cache (default ./cache)
#   COLLECTOR_CLI        collector-cli command (default `npx collector-cli`)
#   RUN_MANIFEST_FILE    required by the persist (gcs-upload.sh, #1762)
#   GITHUB_STEP_SUMMARY  the fetch counts are appended here
#
# Output: stdout is ONE JSON line (R4), {"fetched":N,"persisted":N}.
# Exit codes: 0 always once the arguments are valid (the merge is the
#             fail-closed stage) · 2 usage
set -euo pipefail

BUCKET="${1:-}"
DATE="${2:-}"
DISTRICTS="${3:-}"
if [ -z "${BUCKET}" ] || [[ ! "${DATE}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] ||
  [[ ! "${DISTRICTS}" =~ ^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$ ]]; then
  echo "usage: daily-fac-fetch.sh <bucket> <YYYY-MM-DD> <id,id,...>" >&2
  exit 2
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE_DIR="${CACHE_DIR:-./cache}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
export CACHE_DIR
read -r -a COLLECTOR <<<"${COLLECTOR_CLI:-npx collector-cli}"

# stdout is reserved for the result line; fd 3 keeps it.
exec 3>&1 1>&2

FRESH="${CACHE_DIR}/find-a-club/${DATE}"
WORK="$(mktemp -d)"
cleanup_work() {
  rm -rf "${WORK}"
  return 0
}
trap cleanup_work EXIT
OUT="${WORK}/fac-output.json"

# 1. fetch
echo "Fetching Find-A-Club for ${DATE}..."
status=0
"${COLLECTOR[@]}" fetch-find-a-club --districts "${DISTRICTS}" \
  --include-undistricted --verbose --date "${DATE}" \
  --compare-snapshot-dir "${CACHE_DIR}/snapshots/${DATE}" >"${OUT}" || status=$?
cat "${OUT}"
if [ "${status}" -ne 0 ]; then
  echo "::warning::fetch-find-a-club exited ${status} for ${DATE}; the merge fills what it missed from the last persisted raw-fac/ (#1770)"
fi
if jq -e . "${OUT}" >/dev/null 2>&1; then
  {
    echo "## 🔍 Find-A-Club Enrichment (#430)"
    jq -r '"- **Districts succeeded**: \(.succeeded)",
      "- **Districts failed**: \(.failed)",
      "- **FAC clubs total**: \(.totalClubs)",
      "- **Snapshot clubs total**: \(.compare.totalSnapshotClubs // "n/a")",
      "- **Extra in FAC** (ATO / prospective): \(.compare.totalExtraInFac // "n/a")"' "${OUT}"
    echo ""
    echo "### Top 5 districts by ATO/prospective surplus"
    echo ""
    echo "| District | FAC | Snapshot | Extra |"
    echo "|----------|-----|----------|-------|"
    jq -r '.results
      | map(select(.extraInFac != null))
      | sort_by(.extraInFac)
      | reverse
      | .[0:5][]
      | "| \(.districtId) | \(.clubCount) | \(.snapshotClubCount) | \(if .extraInFac > 0 then "+" else "" end)\(.extraInFac) |"' \
      "${OUT}"
  } >>"${SUMMARY}"
else
  echo "::warning::fetch-find-a-club printed no summary for ${DATE}"
  echo "## 🔍 Find-A-Club Enrichment (#430)" >>"${SUMMARY}"
  echo "- ⚠️ the fetch printed no summary (exit ${status})" >>"${SUMMARY}"
fi

# 2. persist. The CLI creates ${FRESH} before it fetches, so a missing
# folder means it died earlier (npx, config): count it as nothing fetched,
# say so, and still print the result line (#2274). Without the check, the
# find in the substitution fails under pipefail and aborts the script.
if [ -d "${FRESH}" ]; then
  FETCHED="$(find "${FRESH}" -name 'district_*.json' | wc -l | tr -d ' ')"
else
  echo "::warning::The Find-A-Club fetch created no output folder for ${DATE} (${FRESH}); it died before fetching"
  FETCHED=0
fi
PERSISTED=0
if [ "${FETCHED}" -eq 0 ]; then
  echo "::warning::The Find-A-Club fetch wrote nothing for ${DATE}; nothing to persist"
  echo "- **Raw FAC persisted**: 0 files (the fetch wrote none)" >>"${SUMMARY}"
elif bash "${REPO}/scripts/pipeline/gcs-upload.sh" daily-raw-fac rsync -r \
  "${FRESH}/" "gs://${BUCKET}/raw-fac/${DATE}/"; then
  PERSISTED="${FETCHED}"
  echo "- **Raw FAC persisted**: ${FETCHED} files → raw-fac/${DATE}/" >>"${SUMMARY}"
else
  echo "::warning::Could not persist raw-fac/${DATE}/; a re-derivation of ${DATE} carries its FAC forward from the staged snapshot instead (#2237)"
  echo "- ⚠️ **Raw FAC persisted**: failed (${FETCHED} files fetched)" >>"${SUMMARY}"
fi

printf '{"fetched":%d,"persisted":%d}\n' "${FETCHED}" "${PERSISTED}" >&3
