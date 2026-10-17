#!/usr/bin/env bash
# Carry report sidecars that never reached prod (#1763, ADR-015 step 5).
#
# Usage: scripts/pipeline/carry-report-sidecars.sh <staging> <prod> [<days>]
#
# `place-reports` writes snapshots/<date>/district_<id>_reports.json to
# staging after the pipeline job has promoted, and mirrors them to prod
# only when that run promoted the date. Until #1763 the whole-prefix rsync
# swept up the rest the next promoting run: the sidecars of a run that
# held. Scoped promotion copies only the run manifest, which never lists
# them, so without this step a held day's reports would stay staging-only
# for good.
#
# For each of the newest <days> (default 7) dates in PROD's v1/dates.json,
# so only dates whose own snapshot already passed its gates and promoted:
#   1. list both buckets' snapshots/<date>/ (one level, names only);
#   2. copy each district_<id>_reports.json staging has and prod lacks,
#      bucket to bucket (a server-side rewrite: the -Z gzip layer and the
#      CDN headers arrive as placed).
# Additive: a sidecar prod already holds is never touched (a re-placed one
# goes through the mirror step of its own run), and nothing is deleted.
# Dates prod does not index are skipped, so a carry never creates a date
# directory the promoter would then count as present in prod.
#
# Env: GCLOUD (default `gcloud`), GITHUB_STEP_SUMMARY (optional).
# Exit codes: 0 done (including nothing to carry) · 1 a read or copy failed ·
#             2 usage
set -euo pipefail

usage() {
  echo "usage: carry-report-sidecars.sh <staging> <prod> [<days>]" >&2
  exit 2
}

STAGING="${1:-}"
PROD="${2:-}"
DAYS="${3:-7}"
[ -n "${STAGING}" ] && [ -n "${PROD}" ] || usage
[[ "${DAYS}" =~ ^[1-9][0-9]*$ ]] || usage
[ "${STAGING}" != "${PROD}" ] || usage
GCLOUD="${GCLOUD:-gcloud}"

summary() {
  echo "$1" >&2
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$1" >>"${GITHUB_STEP_SUMMARY}"
  fi
  return 0
}

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

if ! "${GCLOUD}" storage cat "gs://${PROD}/v1/dates.json" >"${WORK}/dates.json"; then
  echo "::error::carry-report-sidecars: could not read gs://${PROD}/v1/dates.json" >&2
  exit 1
fi
if ! jq -r --argjson n "${DAYS}" \
  '.dates | if type == "array" then . else error("no dates[]") end
   | map(select(type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")))
   | sort | .[-$n:][]' \
  "${WORK}/dates.json" >"${WORK}/recent.txt"; then
  echo "::error::carry-report-sidecars: prod v1/dates.json has no usable dates[]" >&2
  exit 1
fi

# Names of the report sidecars directly under gs://<bucket>/snapshots/<date>/.
# An empty or missing directory is no sidecars; any other failure fails.
sidecars() {
  local bucket="$1" date="$2" out="$3" err="${WORK}/ls.err"
  if "${GCLOUD}" storage ls "gs://${bucket}/snapshots/${date}/" >"${WORK}/ls.txt" 2>"${err}"; then
    sed -n "s#^gs://${bucket}/snapshots/${date}/\(district_[A-Za-z0-9]*_reports\.json\)\$#\1#p" \
      "${WORK}/ls.txt" | LC_ALL=C sort >"${out}"
    return 0
  fi
  if grep -q 'matched no objects' "${err}"; then
    : >"${out}"
    return 0
  fi
  cat "${err}" >&2
  echo "::error::carry-report-sidecars: could not list gs://${bucket}/snapshots/${date}/" >&2
  return 1
}

CARRIED=0
CARRIED_DATES=()
while IFS= read -r date; do
  sidecars "${STAGING}" "${date}" "${WORK}/stg.txt"
  sidecars "${PROD}" "${date}" "${WORK}/prod.txt"
  missing=()
  while IFS= read -r name; do
    missing+=("gs://${STAGING}/snapshots/${date}/${name}")
  done < <(LC_ALL=C comm -23 "${WORK}/stg.txt" "${WORK}/prod.txt")
  [ "${#missing[@]}" -gt 0 ] || continue
  echo "Carrying ${#missing[@]} report sidecar(s) for ${date} into prod" >&2
  "${GCLOUD}" storage cp "${missing[@]}" "gs://${PROD}/snapshots/${date}/"
  CARRIED=$((CARRIED + ${#missing[@]}))
  CARRIED_DATES+=("${date}")
done <"${WORK}/recent.txt"

if [ "${CARRIED}" -gt 0 ]; then
  summary "- 📎 Carried **${CARRIED}** report sidecar(s) staging → prod for ${CARRIED_DATES[*]} (#1763)"
else
  summary "- 📎 No report sidecars to carry: prod has every one staging holds for its newest ${DAYS} date(s) (#1763)"
fi
