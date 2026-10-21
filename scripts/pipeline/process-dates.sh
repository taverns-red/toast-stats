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
#   3. prev-year moved into stage 8 (#1769): it is keyed on the date the
#                transform wrote, and every mode pulls it.
#   3b. hydrate  rescrape: rsync raw-csv/<date>/ and snapshots/<date>/ (with
#                analytics/) down from staging, so the date-level artifacts
#                are computed over the date's whole district set, not just
#                $DISTRICTS (#1756, ADR-015 P3). Best effort: the CLI refuses
#                the date-level artifacts it cannot cover. Hydrated files left
#                byte-identical are not uploaded again (stage 10). Runs
#                for DISTRICTS=discover too, as it did for the full
#                first-date list before #1766.
#   4. transform rebuild, rescrape-historical: collector-cli transform
#                --date <source> --force (FORCE_ARGS, always set: see FORCE).
#                rescrape: collector-cli scrape --date <date> --transform
#                with --districts $DISTRICTS, or --discover-districts when
#                DISTRICTS=discover (the date's own set, #1766), which
#                requests the date's own as-of
#                and fails rather than store another day's data (#1669). A
#                failed scrape's leftovers are dropped so nothing publishes.
#   5. remap     the transform can write a different date than it was given
#                (a close lands on its month-end, #193): the date it actually
#                wrote is the one guarded, computed and uploaded.
#   6. guard     never publish over a remote close (#1621,
#                scripts/guard-snapshot-upload.ts). Exit 3 is the guard
#                working: REFUSED. Any other non-zero (unreadable GCS): FAILED.
#   7. enrich    the daily Find-A-Club fetch persisted under
#                raw-fac/<actual>/ (ADR-015 P2, #1758) is pulled and
#                merged into the snapshots with collector-cli
#                merge-find-a-club, so a re-derived date keeps the daily's
#                enrichment. No raw-fac for the date (historical dates, FAC
#                started 2026-05-15): processed unenriched and counted. An
#                unreadable raw-fac or a failed merge FAILS the date: an
#                unenriched upload over an enriched date is the D-1 strip.
#   8. compute   first the prior year, in every mode (#1769, D-8): best
#                effort, snapshots/<actual - 1y>/district_*.json, the date
#                compute-analytics reads for YoY (findPreviousProgramYearDate,
#                the year minus one), so it is keyed on the date the
#                transform WROTE. None: YoY is omitted (dataAvailable:
#                false) and the date is counted. Then collector-cli
#                compute-analytics. A failure is counted, but
#                the snapshots still upload (#1708); its JSON feeds the store
#                counters either way.
#   9. validate  scripts/validate-snapshots.ts on the date's directory
#                (#1125, D-9): the merge rewrites snapshots in place, so the
#                final files are checked against shared-contracts. A
#                violation FAILS the date: nothing of it is uploaded.
#  10. upload    snapshots/<date>/*.json, analytics/*.json and
#                clubs-by-region/*.json (#1800), `-Z` with the CDN headers. An upload error aborts the loop (exit 1), as the
#                inline loop's `set -e` did: the step fails before any store
#                push. rescrape then rsyncs the re-collected raw-csv/<date>/
#                up, replacing the old copy. Every object uploaded is
#                recorded in the run manifest (gcs-upload.sh, #1762).
#  10b. remove   rebuild only (#2232): each district the date's metadata.json
#                records as failed (not also successful) loses its earlier
#                per-date objects in staging — the transform wrote none, and
#                an upload only adds. Recorded in the removals file
#                (gcs-remove.sh); scoped promotion removes them from prod
#                with the date. See remove_failed_districts.
#  11. cleanup   the date's raw, snapshot, hydrated and prior-year
#                directories, so no later step reads a rebuilt date as
#                "latest" (#295, #1670).
#                rescrape-historical keeps its raw: the next step uploads it.
# After the loop, once per run:
#  12. identity  scripts/pipeline/build-identity-history.sh <bucket> (#1782):
#                the club-district history from the club-race store, to
#                config/club-district-history/, and the district → region
#                history (#1820) to config/district-region-history.json;
#                both are promoted with the run. Daily runs the same script, so no mode builds it
#                differently (ADR-015 P1). A failure is a warning and a
#                summary line, never a failed run: the previous copies stand.
#  13. education scripts/pipeline/build-education-rollup.sh <bucket> (#1801):
#                the education rollup from the ledger history, the staged
#                reports and the region history step 12 just wrote, to
#                staging derived/education-rollup/ (never promoted until
#                #1763). Same failure posture as step 12.
#  14. rollups   rebuild only: scripts/pipeline/build-reports-rollups.sh
#                <bucket> <date> (#2012, #2202) for each date this run
#                published (post-remap, in order, once each), after step 12
#                rewrote the region history it reads. It writes
#                snapshots/<date>/reports-rollups.json through gcs-upload.sh,
#                so the object is in the run manifest and goes through the
#                content and completeness gates and promotion with its date.
#                A date without report sidecars writes nothing and is counted
#                as skipped (never an empty rollup); a failure is a warning
#                and a count, never a failed run. The daily builds its own
#                date in the `education-rollup` job instead.
# The GCS-backed stores (time-series, club-trends, club-race, awards history)
# are NOT handled here: the caller pulls them with sync-stores.sh before and
# pushes them with publish-stores.sh after, then runs
# scripts/partial-failure-gate.sh with the failed count (#1708, D7). The
# caller also pulls config/district-region-history.json
# (`sync-stores.sh district-region-history`, #1799): step 8's compute reads
# it from ${CACHE_DIR}/config/ for each date's region-rollups.json, using the
# history as it stood when the run started (step 12 rewrites it after the
# loop).
#
# Env:
#   GCLOUD                 gcloud binary (default `gcloud`; tests use a shim)
#   CACHE_DIR              runner cache (default ./cache); exported for the CLI
#   COLLECTOR_CLI          collector-cli command (default `npx collector-cli`)
#   RESOLVE_REBUILD_SOURCE resolver command (default: tsx resolve-rebuild-source.ts)
#   GUARD_SNAPSHOT_UPLOAD  guard command (default: tsx guard-snapshot-upload.ts)
#   VALIDATE_SNAPSHOTS     schema gate command (default: tsx validate-snapshots.ts)
#   BUILD_IDENTITY_HISTORY identity build command (default: bash
#                          scripts/pipeline/build-identity-history.sh)
#   BUILD_EDUCATION_ROLLUP education rollup command (default: bash
#                          scripts/pipeline/build-education-rollup.sh)
#   BUILD_REPORTS_ROLLUPS  reports rollups command, rebuild only (default:
#                          bash scripts/pipeline/build-reports-rollups.sh)
#   DISTRICTS              rescrape: required. `discover` scrapes, per date,
#                          the districts that date's own districtsummary lists
#                          (scrape --discover-districts, #1766); otherwise a
#                          comma-separated id list, the same for every date
#   FORCE                  the `force` dispatch input: "true", "false" or ""
#                          (a scheduled run); anything else is a usage error.
#                          `force` means one thing in every mode: re-fetch and
#                          re-derive even if cached (#1771, ADR-015 P7). Every
#                          mode here IS a re-derivation, so all three are
#                          forced whatever FORCE says (transform/scrape
#                          --force, compute --force-analytics); the effective
#                          value is logged. Decided once, in FORCE_ARGS below.
#   GITHUB_STEP_SUMMARY    date counts and store counters are appended here
#   RUN_MANIFEST_FILE      required by any upload: every object uploaded is
#                          appended (scripts/pipeline/gcs-upload.sh, #1762);
#                          the completeness gate takes its dates from it
#   RUN_REMOVALS_FILE      required by any removal (stage 10b): every object
#                          removed is appended (gcs-remove.sh, #2232)
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
    # `discover`: each date scrapes the districts its own districtsummary
    # lists (#1766, D-7). A list: those districts, hydrated (#1756). Empty is
    # a usage error, never an implied discover (R17).
    if [ "${DISTRICTS:-}" = "discover" ]; then
      DISTRICT_ARGS=(--discover-districts)
    elif [[ "${DISTRICTS:-}" =~ ^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$ ]]; then
      DISTRICT_ARGS=(--districts "${DISTRICTS}")
    else
      echo "::error::process-dates: rescrape needs DISTRICTS ('discover' or comma-separated ids), got '${DISTRICTS:-}'" >&2
      exit 2
    fi
    ;;
  *)
    echo "::error::process-dates: unknown mode '${MODE}'" >&2
    exit 2
    ;;
esac

case "${FORCE:-}" in
  true | false | "") ;;
  *)
    echo "::error::process-dates: FORCE must be true, false or empty (the force input), got '${FORCE}'" >&2
    exit 2
    ;;
esac

# The one force decision (#1771). R17: an explicit case per mode, even though
# today every mode lands on the same answer.
case "${MODE}" in
  rebuild | rescrape | rescrape-historical)
    FORCE_ARGS=(--force)
    echo "process-dates: force=always for ${MODE} (FORCE='${FORCE:-}')" >&2
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
read -r -a VALIDATE <<<"${VALIDATE_SNAPSHOTS:-${TSX} ${REPO}/scripts/validate-snapshots.ts}"
read -r -a IDENTITY <<<"${BUILD_IDENTITY_HISTORY:-bash ${REPO}/scripts/pipeline/build-identity-history.sh}"
read -r -a EDUCATION <<<"${BUILD_EDUCATION_ROLLUP:-bash ${REPO}/scripts/pipeline/build-education-rollup.sh}"
read -r -a ROLLUPS <<<"${BUILD_REPORTS_ROLLUPS:-bash ${REPO}/scripts/pipeline/build-reports-rollups.sh}"
# Every upload goes through the wrapper, so it lands in the run manifest.
export GCLOUD
UPLOAD=(bash "${REPO}/scripts/pipeline/gcs-upload.sh" "process-dates:${MODE}")
# Every removal goes through its twin, so it lands in the removals file (#2232).
REMOVE=(bash "${REPO}/scripts/pipeline/gcs-remove.sh" "process-dates:${MODE}")

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
ENRICHED=0
UNENRICHED=0
YOY_PRESENT=0
YOY_ABSENT=0
HYDRATED=""
PREV=""
# Snapshot dates this run uploaded (post-remap), for step 14.
PUBLISHED_DATES=()

# The snapshot date directories present in the cache, one per line, sorted.
snapshot_dates() {
  [ -d "${SNAPSHOTS}" ] || return 0
  find "${SNAPSHOTS}" -mindepth 1 -maxdepth 1 -type d -name '????-??-??' \
    -exec basename {} \; | LC_ALL=C sort
}

# The date compute-analytics reads for YoY: the year minus one, month and
# day kept (analytics-core findPreviousProgramYearDate). Calendar arithmetic
# (`date -d '- 1 year'`) would disagree with it on 02-29.
prior_year() {
  printf '%04d%s\n' "$((10#${1:0:4} - 1))" "${1:4}"
}

# Pull snapshots/<prior year of $1>/district_*.json for compute's YoY, best
# effort, and count the date in YOY_PRESENT or YOY_ABSENT. Sets PREV to the
# directory's date when this call created it, so cleanup removes it.
pull_prior_year() {
  local prior
  prior="$(prior_year "$1")"
  if [ ! -d "${SNAPSHOTS}/${prior}" ]; then
    mkdir -p "${SNAPSHOTS}/${prior}"
    PREV="${prior}"
    "${GCLOUD}" storage cp \
      "gs://${BUCKET}/snapshots/${prior}/district_*.json" \
      "${SNAPSHOTS}/${prior}/" 2>/dev/null || true
  fi
  if [ -n "$(find "${SNAPSHOTS}/${prior}" -name 'district_*.json' | head -1)" ]; then
    YOY_PRESENT=$((YOY_PRESENT + 1))
  else
    echo "No prior-year snapshot for ${prior}; YoY omitted for $1"
    YOY_ABSENT=$((YOY_ABSENT + 1))
  fi
  return 0
}

# The *.json files under $1 as `cksum` lines with ./-relative paths, sorted.
json_cksums() {
  (cd "$1" && find . -type f -name '*.json' -exec cksum {} + | LC_ALL=C sort)
}

# rescrape: pull the date's other districts from staging before the scrape
# (#1756, ADR-015 P3) — raw-csv/<date>/ for the transform's per-district
# counts, snapshots/<date>/ (district files + analytics/) for the date-level
# rollups — so they are computed from the whole district set, the subset
# re-derived. A date staging has never seen cannot be hydrated; the CLI then
# refuses the date-level artifacts it cannot cover, never writes defaults.
# HYDRATED names the snapshot directory created here, for cleanup.
hydrate() {
  local date="$1"
  mkdir -p "${RAW}/${date}"
  if ! "${GCLOUD}" storage rsync -r \
    "gs://${BUCKET}/raw-csv/${date}/" "${RAW}/${date}/"; then
    echo "::warning::Could not hydrate raw-csv/${date}/ from staging; date-level artifacts are refused unless the scrape covers every district"
  fi
  if [ ! -d "${SNAPSHOTS}/${date}" ]; then
    mkdir -p "${SNAPSHOTS}/${date}"
    HYDRATED="${date}"
    if ! "${GCLOUD}" storage rsync -r \
      "gs://${BUCKET}/snapshots/${date}/" "${SNAPSHOTS}/${date}/"; then
      echo "::warning::Could not hydrate snapshots/${date}/ from staging; date-level artifacts are refused unless the scrape covers every district"
    fi
    json_cksums "${SNAPSHOTS}/${date}" >"${WORK}/hydrated.cksum"
  fi
}

# Upload snapshots/<actual>/ — the files this run wrote or changed. A file
# hydrated from staging and left byte-identical is not uploaded again, so a
# subset run never rewrites another district's object (I-2).
upload_snapshot() {
  local actual="$1" dir="${SNAPSHOTS}/$1"
  local top=() analytics=() shards=() rel
  : >"${WORK}/before.cksum"
  if [ "${actual}" = "${HYDRATED}" ]; then
    cp "${WORK}/hydrated.cksum" "${WORK}/before.cksum"
  fi
  while IFS= read -r rel; do
    case "${rel}" in
      ./analytics/*.json) analytics+=("${dir}/${rel#./}") ;;
      ./clubs-by-region/*.json) shards+=("${dir}/${rel#./}") ;;
      ./*/*) ;;
      *) top+=("${dir}/${rel#./}") ;;
    esac
  done < <(json_cksums "${dir}" | LC_ALL=C comm -13 "${WORK}/before.cksum" - |
    awk '{print $3}')
  echo "Uploading snapshots/${actual}/ (${#top[@]} files, ${#analytics[@]} analytics, ${#shards[@]} club shards)..."
  if [ "${#top[@]}" -gt 0 ]; then
    "${UPLOAD[@]}" cp \
      --content-type="application/json" \
      --cache-control="public, max-age=3600, must-revalidate" \
      -Z \
      "${top[@]}" \
      "gs://${BUCKET}/snapshots/${actual}/"
  fi
  if [ "${#analytics[@]}" -gt 0 ]; then
    "${UPLOAD[@]}" cp \
      --content-type="application/json" \
      --cache-control="public, max-age=3600, must-revalidate" \
      -Z \
      "${analytics[@]}" \
      "gs://${BUCKET}/snapshots/${actual}/analytics/"
  fi
  # Per-region club shards + world file (#1800).
  if [ "${#shards[@]}" -gt 0 ]; then
    "${UPLOAD[@]}" cp \
      --content-type="application/json" \
      --cache-control="public, max-age=3600, must-revalidate" \
      -Z \
      "${shards[@]}" \
      "gs://${BUCKET}/snapshots/${actual}/clubs-by-region/"
  fi
}

# rebuild (#2232): remove from staging the per-date objects of each district
# the date's own metadata.json records as failed (failedDistricts, not also
# successfulDistricts: a #1671 gap or a failed transform). The transform
# wrote nothing for such a district and uploads only add, so without this
# its objects from an earlier build survive — a 0-member analytics file on
# a date whose metadata says the district failed. Only per-district objects
# (`district_<id>[_kind].json`, top level or analytics/) are removed, of
# exactly those ids, and never one this run wrote. gcs-remove.sh records
# each in the removals file, and scoped promotion removes the same objects
# from prod with the date. A listing or removal error aborts the loop, like
# an upload error: a stale object must not survive unreported.
remove_failed_districts() {
  local actual="$1" meta="${SNAPSHOTS}/$1/metadata.json" ids listing url rel
  local stale=()
  if [ ! -f "${meta}" ] ||
    ! ids="$(jq -r '((.failedDistricts // []) - (.successfulDistricts // []))[]
      | strings | select(test("^[A-Za-z0-9]+$"))' "${meta}")"; then
    echo "::warning::No readable metadata.json for ${actual}; its failed districts' earlier objects were not checked (#2232)"
    return 0
  fi
  [ -n "${ids}" ] || return 0
  listing="$("${GCLOUD}" storage ls "gs://${BUCKET}/snapshots/${actual}/**")"
  while IFS= read -r url; do
    rel="${url#"gs://${BUCKET}/snapshots/${actual}/"}"
    [[ "${rel}" =~ ^(analytics/)?district_([A-Za-z0-9]+)(_[a-z-]+)?\.json$ ]] || continue
    grep -qxF "${BASH_REMATCH[2]}" <<<"${ids}" || continue
    [ -e "${SNAPSHOTS}/${actual}/${rel}" ] && continue
    stale+=("${url}")
  done <<<"${listing}"
  [ "${#stale[@]}" -gt 0 ] || return 0
  echo "Removing ${#stale[@]} earlier object(s) of failed district(s) $(echo "${ids}" | paste -sd, -) from snapshots/${actual}/ (#2232)..."
  "${REMOVE[@]}" "${stale[@]}"
}

# Merge the persisted Find-A-Club fetch for <date> into its snapshots, if
# daily persisted one. Sets ENRICH to enriched | unenriched | failed.
enrich_snapshot() {
  local actual="$1" fac="${WORK}/raw-fac/$1" err="${WORK}/raw-fac-ls.err"
  ENRICH=failed
  if ! "${GCLOUD}" storage ls "gs://${BUCKET}/raw-fac/${actual}/**" \
    >/dev/null 2>"${err}"; then
    if grep -q 'matched no objects' "${err}"; then
      echo "No raw-fac/${actual}/; ${actual} is processed unenriched"
      ENRICH=unenriched
      return 0
    fi
    cat "${err}"
    echo "::warning::Could not list raw-fac/${actual}/; not publishing ${actual} unenriched"
    return 0
  fi
  mkdir -p "${fac}"
  if ! "${GCLOUD}" storage rsync -r "gs://${BUCKET}/raw-fac/${actual}/" "${fac}/"; then
    echo "::warning::Could not download raw-fac/${actual}/; not publishing ${actual} unenriched"
    rm -rf "${fac}"
    return 0
  fi
  echo "Merging raw-fac/${actual}/ into snapshots/${actual}/..."
  if "${COLLECTOR[@]}" merge-find-a-club --fac-dir "${fac}" \
    --snapshot-dir "${SNAPSHOTS}/${actual}" --verbose; then
    ENRICH=enriched
  else
    echo "::warning::Find-A-Club merge failed for ${actual}; nothing uploaded for it"
  fi
  rm -rf "${fac}"
  return 0
}

# Process one date. Sets OUTCOME to published | compute-failed | refused |
# failed. Called as a plain command so `set -e` stays armed for the uploads.
process_one() {
  local date="$1"
  local source prev before actual guard_status
  OUTCOME=failed
  HYDRATED=""
  PREV=""
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

  # 3b. hydrate (rescrape) — before `before`, so a hydrated date directory
  # is not mistaken for the transform's output by the remap below.
  if [ "${MODE}" = "rescrape" ]; then
    hydrate "${date}"
  fi
  before="$(snapshot_dates)"

  # 4. transform
  if [ "${MODE}" = "rescrape" ]; then
    echo "Scraping and transforming ${date}..."
    if ! "${COLLECTOR[@]}" scrape --date "${date}" --transform "${FORCE_ARGS[@]}" \
      --verbose "${DISTRICT_ARGS[@]}"; then
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
    if ! "${COLLECTOR[@]}" transform --date "${source}" "${FORCE_ARGS[@]}" --verbose; then
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

  # 7. enrich
  enrich_snapshot "${actual}"
  case "${ENRICH}" in
    enriched) ENRICHED=$((ENRICHED + 1)) ;;
    unenriched) UNENRICHED=$((UNENRICHED + 1)) ;;
    *)
      cleanup_date "${source}" "${actual}" "${prev}"
      return 0
      ;;
  esac

  # 8. compute, with the prior year it reads for YoY (#1769)
  pull_prior_year "${actual}"
  prev="${PREV}"
  echo "Computing analytics for ${actual}..."
  local compute_ok=1
  if ! "${COLLECTOR[@]}" compute-analytics --date "${actual}" \
    --force-analytics --verbose >"${COMPUTE_JSON}"; then
    echo "::warning::Compute failed for ${actual}"
    compute_ok=0
  fi
  jq -c . "${COMPUTE_JSON}" >>"${COUNTERS_JSONL}" ||
    echo "::warning::No compute JSON for ${actual}; the counters omit it"

  # 9. validate
  if ! "${VALIDATE[@]}" "${SNAPSHOTS}/${actual}"; then
    echo "::warning::Snapshot schema gate failed for ${actual}; nothing uploaded for it"
    cleanup_date "${source}" "${actual}" "${prev}"
    return 0
  fi

  # 10. upload
  if [ -d "${SNAPSHOTS}/${actual}" ]; then
    upload_snapshot "${actual}"
    # 10b. remove — rebuild only (#2232). R17: the other modes keep what
    # staging holds for districts they did not re-derive.
    case "${MODE}" in
      rebuild) remove_failed_districts "${actual}" ;;
      rescrape | rescrape-historical) ;;
    esac
    PUBLISHED_DATES+=("${actual}")
    if [ "${compute_ok}" = 1 ]; then OUTCOME=published; else OUTCOME=compute-failed; fi
  else
    echo "::warning::No snapshot directory found for ${date} (expected ${actual})"
  fi
  if [ "${MODE}" = "rescrape" ] && [ -d "${RAW}/${date}" ]; then
    echo "Uploading raw-csv/${date}/..."
    "${UPLOAD[@]}" rsync -r "${RAW}/${date}/" "gs://${BUCKET}/raw-csv/${date}/"
  fi

  # 11. cleanup
  cleanup_date "${source}" "${actual}" "${prev}"
}

cleanup_date() {
  local source="$1" actual="$2" prev="$3"
  # rescrape-historical's raw belongs to the step after this one.
  if [ "${MODE}" != "rescrape-historical" ]; then rm -rf "${RAW:?}/${source}"; fi
  if [ -n "${actual}" ]; then rm -rf "${SNAPSHOTS:?}/${actual}"; fi
  if [ -n "${prev}" ]; then rm -rf "${SNAPSHOTS:?}/${prev}"; fi
  if [ -n "${HYDRATED}" ]; then rm -rf "${SNAPSHOTS:?}/${HYDRATED}"; fi
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

# 12. identity — once, after every date is uploaded (#1782).
IDENTITY_STATUS=built
if ! "${IDENTITY[@]}" "${BUCKET}"; then
  echo "::warning::Identity histories were not rebuilt (#1782, #1820); the previous copies stand"
  IDENTITY_STATUS="FAILED (see the step log)"
fi

# 13. education — once, after the identity histories (#1801): it reads the
# region history step 12 just wrote.
EDUCATION_STATUS=built
if ! "${EDUCATION[@]}" "${BUCKET}"; then
  echo "::warning::Education rollup was not rebuilt (#1801); the previous derived/ copy stands"
  EDUCATION_STATUS="FAILED (see the step log)"
fi

# 14. rollups — rebuild only, once per published date, after step 12 (#2202).
if [ "${MODE}" = "rebuild" ]; then
  ROLLUPS_BUILT=0
  ROLLUPS_SKIPPED=0
  ROLLUPS_FAILED=0
  ROLLUPS_OUT="${WORK}/reports-rollups.json"
  for d in $(printf '%s\n' "${PUBLISHED_DATES[@]}" | awk 'NF && !seen[$0]++'); do
    if ! "${ROLLUPS[@]}" "${BUCKET}" "${d}" >"${ROLLUPS_OUT}"; then
      echo "::warning::Reports rollups were not built for ${d} (#2012); the date keeps any previous reports-rollups.json"
      ROLLUPS_FAILED=$((ROLLUPS_FAILED + 1))
    elif tail -n 1 "${ROLLUPS_OUT}" | jq -e '.written == false' >/dev/null 2>&1; then
      ROLLUPS_SKIPPED=$((ROLLUPS_SKIPPED + 1))
    else
      ROLLUPS_BUILT=$((ROLLUPS_BUILT + 1))
    fi
  done
  echo "Reports rollups: ${ROLLUPS_BUILT} built, ${ROLLUPS_FAILED} failed"
  echo "Reports rollups: ${ROLLUPS_SKIPPED} date(s) without report sidecars, skipped"
  echo "- **Reports rollups** (#2012): ${ROLLUPS_BUILT} built, ${ROLLUPS_SKIPPED} skipped (no sidecars), ${ROLLUPS_FAILED} failed" >>"${SUMMARY}"
fi

{
  echo "- **Dates succeeded**: ${SUCCEEDED}"
  echo "- **Refused by the upload guard**: ${REFUSED}"
  echo "- **Dates failed**: ${FAILED}"
  echo "- **Dates enriched from raw-fac**: ${ENRICHED}"
  echo "- **Dates unenriched (no raw-fac)**: ${UNENRICHED}"
  echo "- **Dates with a prior-year snapshot (YoY)**: ${YOY_PRESENT}"
  echo "- **Dates without one (no YoY)**: ${YOY_ABSENT}"
  echo "- **Identity histories**: ${IDENTITY_STATUS}"
  echo "- **Education rollup**: ${EDUCATION_STATUS}"
  jq -rs -f "${REPO}/scripts/compute-counters.jq" "${COUNTERS_JSONL}"
} >>"${SUMMARY}"

printf '{"succeeded":%d,"refused":%d,"failed":%d}\n' \
  "${SUCCEEDED}" "${REFUSED}" "${FAILED}" >&3
