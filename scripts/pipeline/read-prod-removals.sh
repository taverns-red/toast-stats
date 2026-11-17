#!/usr/bin/env bash
# Read the run's prod removal record from staging (#2856). Read-only.
#
# Usage: scripts/pipeline/read-prod-removals.sh <staging-bucket> <run-id> <out-file>
#
# The promoter writes one line per prod object or prefix it removes on purpose
# (a prune reconcile's date prefixes, a #2232 gap district's objects) and the
# workflow publishes the file next to the run manifest:
#   runs/<run-id>/prod-removed.jsonl          (the pipeline job's promote)
#   runs/<run-id>/prod-removed-reports.jsonl  (the promote-reports job's)
# This concatenates whichever exist into <out-file> (empty when neither does:
# a run that removed nothing from prod publishes nothing).
#
# Absent is told from unreadable by gcloud's own "matched no objects" message
# and nothing else. Any other failure exits 1 and writes no usable file: a
# record read as empty would turn a deliberate removal into an unexplained,
# restorable one, so the plan must stop instead.
#
# Env: GCLOUD (default `gcloud`).
# Exit codes: 0 read (possibly empty) - 1 a record exists and could not be read - 2 usage
set -euo pipefail

BUCKET="${1:-}"
RUN="${2:-}"
OUT="${3:-}"
[ -n "${BUCKET}" ] && [ -n "${RUN}" ] && [ -n "${OUT}" ] || {
  echo "usage: read-prod-removals.sh <staging-bucket> <run-id> <out-file>" >&2
  exit 2
}
GCLOUD="${GCLOUD:-gcloud}"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
: >"${TMP}/all"

for name in prod-removed.jsonl prod-removed-reports.jsonl; do
  url="gs://${BUCKET}/runs/${RUN}/${name}"
  if "${GCLOUD}" storage cat "${url}" >"${TMP}/one" 2>"${TMP}/err"; then
    cat "${TMP}/one" >>"${TMP}/all"
    # A record without a final newline must not run into the next file's line.
    [ -s "${TMP}/one" ] && [ -n "$(tail -c 1 "${TMP}/one")" ] && echo >>"${TMP}/all"
  elif grep -q 'matched no objects' "${TMP}/err"; then
    echo "no ${name} for run ${RUN}: nothing was recorded" >&2
  else
    cat "${TMP}/err" >&2
    echo "could not read ${url}" >&2
    rm -f "${OUT}"
    exit 1
  fi
done

mkdir -p "$(dirname "${OUT}")"
cp "${TMP}/all" "${OUT}"
echo "read the prod removal record for run ${RUN}: $(grep -c . "${OUT}" || true) line(s)" >&2
