#!/usr/bin/env bash
# List what the restore planner reads (#2537, epic #2492). Read-only.
#
# Usage: scripts/pipeline/list-restore-candidates.sh <outdir> <paths-file>
#
# <paths-file> holds object names, one per line (the in-scope objects of the
# run manifest). Writes, in <outdir>, the four files plan-data-restore.ts
# takes: live.json and soft.json (`gcloud storage ls [--soft-deleted] --json`
# of the production objects) and live.err and soft.err (the stderr of those
# same calls). A listing that failed is NOT hidden here: the planner reads the
# stderr files and refuses the whole plan on any line that is not gcloud's
# "matched no objects" (a missing soft-deleted copy would make an overwritten
# object look new and get deleted). A call may exit non-zero for that benign
# message, so this script does not stop on it; any other non-zero exit adds
# a line to the errors file.
#
# Env: PROD_BUCKET (required), GCLOUD (default `gcloud`).
# Exit codes: 0 listed (judge the files, not the code) - 2 usage
set -euo pipefail

OUT="${1:-}"
PATHS="${2:-}"
[ -n "${OUT}" ] && [ -f "${PATHS}" ] && [ -n "${PROD_BUCKET:-}" ] || {
  echo "usage: PROD_BUCKET=<bucket> list-restore-candidates.sh <outdir> <paths-file>" >&2
  exit 2
}
GCLOUD="${GCLOUD:-gcloud}"
mkdir -p "${OUT}"

URLS=()
while IFS= read -r p; do
  [ -n "${p}" ] && URLS+=("gs://${PROD_BUCKET}/${p}")
done <"${PATHS}"
[ "${#URLS[@]}" -gt 0 ] || {
  echo "no objects to list" >&2
  exit 2
}

# gcloud exits 1 for "matched no objects", which the planner accepts. Any
# other failure, or exit 1 without that line (killed part way, no stderr),
# gets a line of its own, so the planner refuses rather than read a shorter
# listing (listRestoreCandidates.test.ts).
NONE='ERROR: (gcloud.storage.ls) One or more URLs matched no objects.'
list() {
  local name="$1" rc=0
  shift
  "${GCLOUD}" storage ls "$@" --json "${URLS[@]}" >"${OUT}/${name}.json" 2>"${OUT}/${name}.err" || rc=$?
  if [ "${rc}" -ne 0 ] && { [ "${rc}" -ne 1 ] || ! grep -qxF "${NONE}" "${OUT}/${name}.err"; }; then
    echo "ERROR: list-restore-candidates: gcloud storage ls exited ${rc}" >>"${OUT}/${name}.err"
  fi
}
list live
list soft --soft-deleted
echo "listed ${#URLS[@]} object name(s) into ${OUT}" >&2
