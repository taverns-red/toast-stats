#!/usr/bin/env bash
# Read the run's prod removal record from staging (#2856). Read-only.
#
# Usage: scripts/pipeline/read-prod-removals.sh <staging-bucket> <run-id> <out-file>
#
# The promoter writes one line per prod object or prefix it removes on purpose
# (a prune reconcile's date prefixes, a #2232 gap district's objects) and the
# workflow publishes the file next to the run manifest:
#   runs/<run-id>/prod-removed-a<attempt>.jsonl          (the pipeline job's promote)
#   runs/<run-id>/prod-removed-reports-a<attempt>.jsonl  (the promote-reports job's)
# One object per attempt, so a re-run of failed jobs does not replace an
# earlier record (#2903). Runs before that used prod-removed.jsonl and
# prod-removed-reports.jsonl. This concatenates every object matching
# runs/<run-id>/prod-removed*.jsonl into <out-file> (empty when none exists:
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
# The one line a listing prints when nothing matches (scripts/lib/dataRestorePlan.ts).
MATCHED_NO_OBJECTS='ERROR: (gcloud.storage.ls) One or more URLs matched no objects.'

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
: >"${TMP}/all"

# Every record of the run, whatever the attempt (#2903): a re-run of failed
# jobs publishes a new object per attempt rather than replacing the last.
if "${GCLOUD}" storage ls "gs://${BUCKET}/runs/${RUN}/prod-removed*.jsonl" \
  >"${TMP}/urls" 2>"${TMP}/err"; then
  :
elif [ "$(grep -v '^[[:space:]]*$' "${TMP}/err")" = "${MATCHED_NO_OBJECTS}" ]; then
  # Exactly this line and nothing else (MATCHED_NO_OBJECTS in
  # scripts/lib/dataRestorePlan.ts): any other stderr, even beside it, is an
  # error that must stop the plan. This match is stricter than
  # checkListingErrors in dataRestorePlan.ts (no trimming of the line), which
  # fails closed: a line that differs by whitespace stops the plan.
  : >"${TMP}/urls"
  echo "no prod removal record for run ${RUN}: nothing was recorded" >&2
else
  cat "${TMP}/err" >&2
  echo "could not list the prod removal records of run ${RUN}" >&2
  rm -f "${OUT}"
  exit 1
fi

while IFS= read -r url; do
  [ -n "${url}" ] || continue
  if "${GCLOUD}" storage cat "${url}" >"${TMP}/one" 2>"${TMP}/err"; then
    cat "${TMP}/one" >>"${TMP}/all"
    # A record without a final newline must not run into the next file's line.
    [ -s "${TMP}/one" ] && [ -n "$(tail -c 1 "${TMP}/one")" ] && echo >>"${TMP}/all"
  else
    # An object the listing just returned that cannot be read is unreadable,
    # never absent.
    cat "${TMP}/err" >&2
    echo "could not read ${url}" >&2
    rm -f "${OUT}"
    exit 1
  fi
done <"${TMP}/urls"

mkdir -p "$(dirname "${OUT}")"
cp "${TMP}/all" "${OUT}"
echo "read the prod removal record for run ${RUN}: $(grep -c . "${OUT}" || true) line(s)" >&2
