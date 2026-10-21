#!/usr/bin/env bash
# Completeness gate: promoted dates have their reports in prod (#2144).
#
# Usage: scripts/pipeline/check-report-sidecars.sh <staging> <prod> <dates>
#
# <dates> is the comma-separated list a run promoted. For each, list both
# buckets' snapshots/<date>/ (one level, names only) and FAIL if staging
# holds a district_<id>_reports.json or reports-rollups.json that prod does
# not: the date is live without the reports its pages read (on 2026-10-17 a
# rebuild promoted 2026-10-16 with none of its 94 sidecars). A date without
# reports in staging is complete. Read-only; runs after the promote-reports
# job's manifest promote (#1767), which is what should have closed every gap.
#
# Env: GCLOUD (default `gcloud`), GITHUB_STEP_SUMMARY (optional).
# Exit codes: 0 complete · 1 a date is incomplete or a listing failed ·
#             2 usage
set -euo pipefail

usage() {
  echo "usage: check-report-sidecars.sh <staging> <prod> <date>[,<date>...]" >&2
  exit 2
}

STAGING="${1:-}"
PROD="${2:-}"
DATES="${3:-}"
[ -n "${STAGING}" ] && [ -n "${PROD}" ] && [ -n "${DATES}" ] || usage
[ "${STAGING}" != "${PROD}" ] || usage
[[ "${DATES}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}(,[0-9]{4}-[0-9]{2}-[0-9]{2})*$ ]] || usage
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

# Report objects directly under gs://<bucket>/snapshots/<date>/. An empty or
# missing directory is none; any other failure fails.
reports() {
  local bucket="$1" date="$2" out="$3" err="${WORK}/ls.err"
  if "${GCLOUD}" storage ls "gs://${bucket}/snapshots/${date}/" >"${WORK}/ls.txt" 2>"${err}"; then
    sed -n -E "s#^gs://${bucket}/snapshots/${date}/(district_[A-Za-z0-9]*_reports\.json|reports-rollups\.json)\$#\1#p" \
      "${WORK}/ls.txt" | LC_ALL=C sort >"${out}"
    return 0
  fi
  if grep -q 'matched no objects' "${err}"; then
    : >"${out}"
    return 0
  fi
  cat "${err}" >&2
  echo "::error::check-report-sidecars: could not list gs://${bucket}/snapshots/${date}/" >&2
  return 1
}

CHECKED=0
INCOMPLETE=()
while IFS= read -r date; do
  reports "${STAGING}" "${date}" "${WORK}/stg.txt"
  reports "${PROD}" "${date}" "${WORK}/prod.txt"
  CHECKED=$((CHECKED + 1))
  LC_ALL=C comm -23 "${WORK}/stg.txt" "${WORK}/prod.txt" >"${WORK}/missing.txt"
  [ -s "${WORK}/missing.txt" ] || continue
  n="$(wc -l <"${WORK}/missing.txt" | tr -d ' ')"
  echo "::error::Promoted ${date} is live without ${n} report object(s) staging holds (#2144): $(head -5 "${WORK}/missing.txt" | paste -sd ' ' -)" >&2
  INCOMPLETE+=("${date}")
done < <(tr ',' '\n' <<<"${DATES}" | LC_ALL=C sort -u)

if [ "${#INCOMPLETE[@]}" -gt 0 ]; then
  summary "- ❌ Report completeness gate (#2144): **${INCOMPLETE[*]}** promoted without the reports staging holds"
  exit 1
fi
summary "- ✅ Report completeness gate (#2144): prod has every report staging holds for the ${CHECKED} promoted date(s)"
