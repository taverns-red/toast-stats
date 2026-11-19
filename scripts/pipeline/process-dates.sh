#!/usr/bin/env bash
# The per-date loop shared by every data mode (#1742, plan P3-1; daily
# since #1765, ADR-015 step 7, P1).
#
# Usage: scripts/pipeline/process-dates.sh <bucket> <mode> [<date>...]
#   <mode>: daily | rebuild | rescrape | rescrape-historical
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
#   3a. raw      daily: rsync raw-csv/<date>/ down from staging first, as
#                the daily always has, so a re-run of a date reuses its
#                stored raw unless FORCE is true (the scrape then re-fetches,
#                #1771). Best effort: a date staging has never seen is
#                scraped fresh.
#   3b. hydrate  rescrape: rsync raw-csv/<date>/ and snapshots/<date>/ (with
#                analytics/) down from staging, so the date-level artifacts
#                are computed over the date's whole district set, not just
#                $DISTRICTS (#1756, ADR-015 P3). Best effort: the CLI refuses
#                the date-level artifacts it cannot cover. Hydrated files left
#                byte-identical are not uploaded again (stage 10). Runs
#                for DISTRICTS=discover too, as it did for the full
#                first-date list before #1766.
#   3c. baseline every mode (#1614): for a date in April to July, copy
#                snapshots/{Y}-03-31/all-districts-rankings.json to
#                baselines/march-close/{Y}-03-31.json (plain JSON, never under
#                snapshots/) for the transform's retention-award join. A
#                transient error is retried (MARCH_CLOSE_ATTEMPTS). After the
#                remap (5b), a date whose logical month is April to June is
#                counted present or absent (no March close: logged, the date
#                goes on); a failed copy of an existing object fails the date
#                (nothing of it uploaded) and the run goes on. Outside the window the copy
#                is dropped and not counted. See pull_march_close.
#   4. transform rebuild, rescrape-historical: collector-cli transform
#                --date <source> --force (FORCE_ARGS, always set: see FORCE).
#                rescrape: collector-cli scrape --date <date> --transform
#                with --districts $DISTRICTS, or --discover-districts when
#                DISTRICTS=discover (the date's own set, #1766), which
#                requests the date's own as-of
#                and fails rather than store another day's data (#1669). A
#                failed scrape's leftovers are dropped so nothing publishes.
#                daily: collector-cli scrape --date <date> --transform
#                --districts $DISTRICTS (--force only when FORCE is true).
#                Its exit code alone does not fail the date: a partial
#                scrape (some districts failed, a #1671 gap) publishes what
#                it wrote, as the daily always has (its `| tee` dropped the
#                code). A scrape that wrote no snapshot fails the date. The
#                scrape counts go to the summary.
#   5. remap     the transform can write a different date than it was given
#                (a close lands on its month-end, #193): the date it actually
#                wrote is the one guarded, computed and uploaded.
#   6. guard     never publish over a remote close (#1621,
#                scripts/guard-snapshot-upload.ts). Exit 3 is the guard
#                working: REFUSED. Any other non-zero (unreadable GCS): FAILED.
#   7. enrich    daily: fetch Find-A-Club live and persist it to raw-fac/
#                <actual>/ (scripts/pipeline/daily-fac-fetch.sh, both
#                non-blocking), then merge it, filling a district the fetch
#                missed from the last persisted raw-fac/ before the date
#                (scripts/pipeline/daily-fac-merge.sh, #1770, D-10). A
#                failed merge or unreadable raw-fac/ FAILS the date.
#                The other modes: the daily Find-A-Club fetch persisted under
#                raw-fac/<actual>/ (ADR-015 P2, #1758) is pulled and
#                merged into the snapshots with collector-cli
#                merge-find-a-club, so a re-derived date keeps the daily's
#                enrichment. No raw-fac for the date does NOT mean the date
#                was never enriched (#2237): raw-fac persistence began
#                2026-10-11, but every daily since 2026-05-15 merged FAC
#                without persisting it. So the date's existing staging
#                snapshot (snapshots/<actual>/district_*.json) is read and,
#                where it is enriched, its FAC fields are carried onto the
#                rebuild (collector-cli carry-forward-find-a-club: the
#                carried text re-scrubbed as a fresh FAC parse would,
#                prospectives the rebuild now lists dropped) and the date
#                counted as carried forward. Only a date with no staging
#                snapshot, or whose staging snapshot is not enriched (before
#                2026-05-15, or already stripped: as of 2026-10-22 most of
#                05-15..10-08 was, by earlier rebuilds), is processed
#                unenriched and counted. An unreadable raw-fac or staging
#                snapshot, a failed merge, a failed carry-forward, or an
#                enriched staging snapshot that carried nothing FAILS the
#                date: an unenriched upload over an enriched date is the D-1
#                strip.
#   8. compute   first the prior year, in every mode (#1769, D-8): best
#                effort, snapshots/<actual - 1y>/district_*.json, the date
#                compute-analytics reads for YoY (findPreviousProgramYearDate,
#                the year minus one), so it is keyed on the date the
#                transform WROTE. None: YoY is omitted (dataAvailable:
#                false) and the date is counted. Also best effort, the
#                snapshots/<Y>-06-30/suspended-clubs.json of the three
#                program years before the date's, for
#                reinstatable-clubs.json (#3007); download errors, not
#                missing files, are counted in the summary.
#                Then collector-cli
#                compute-analytics. A failure is counted, but
#                the snapshots still upload (#1708); its JSON feeds the store
#                counters either way. daily: computes the $DISTRICTS list,
#                and a failed compute FAILS the date, nothing uploaded, as
#                the daily always has (its step failed before the upload).
#   9. validate  scripts/validate-snapshots.ts on the date's directory
#                (#1125, D-9): the merge rewrites snapshots in place, so the
#                final files are checked against shared-contracts. A
#                violation FAILS the date: nothing of it is uploaded.
#   9b. revision daily only (#2475): a closing collection (remapped onto
#                its month end) is also kept as a write-once reconciliation
#                revision. Staging's revisions/index.json is hydrated (R2,
#                R9) and, while staging's month end is still the pre-close
#                in-month view, its district files too, for revision 0;
#                then collector-cli record-revision. Any failure here is a
#                warning: no revision is uploaded, the month end still is.
#  10. upload    snapshots/<date>/*.json, analytics/*.json and
#                clubs-by-region/*.json (#1800), `-Z` with the CDN headers;
#                then the 9b revision files and revisions/index.json last
#                (R15), and the local revisions/ is removed. An upload error aborts the loop (exit 1), as the
#                inline loop's `set -e` did: the step fails before any store
#                push. rescrape then rsyncs the re-collected raw-csv/<date>/
#                up, replacing the old copy, and so does daily (raw-csv/
#                <date>/ is keyed by the collection date, not the snapshot
#                date). Every object uploaded is
#                recorded in the run manifest (gcs-upload.sh, #1762).
#  10b. remove   rebuild only (#2232): each #1671 gap district the date's
#                metadata.json records loses its earlier transform objects
#                in staging (district_<id>.json, analytics/district_<id>_*;
#                never the reports sidecar), while they are the 0-club
#                junk — the transform wrote none, and an upload only adds.
#                Logged in the removals file (gcs-remove.sh); scoped
#                promotion converges prod from the same state. See
#                remove_gap_districts.
#  11. cleanup   the date's raw, snapshot, hydrated and prior-year
#                directories, so no later step reads a rebuilt date as
#                "latest" (#295, #1670).
#                rescrape-historical keeps its raw: the next step uploads it.
#                daily keeps the raw and snapshot of a date it published:
#                the workflow's CDN-manifest step reads the local latest
#                snapshot and its rankings, as it always has.
# After the loop, once per run:
#  12. identity  scripts/pipeline/build-identity-history.sh <bucket> (#1782):
#                the club-district history from the club-race store, to
#                config/club-district-history/, and the district → region
#                history (#1820) to config/district-region-history.json;
#                both are promoted with the run. A failure is a warning and a
#                summary line, never a failed run: the previous copies stand.
#                daily: only when the date published (a failed daily never
#                reached it before).
#  13. education scripts/pipeline/build-education-rollup.sh <bucket> (#1801):
#                the education rollup from the ledger history, the staged
#                reports and the region history step 12 just wrote, to
#                staging derived/education-rollup/ (never promoted until
#                #1763). Same failure posture as step 12. daily: skipped;
#                the `education-rollup` job builds it after `place-reports`
#                has written the date's reports (#2028).
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
#                          comma-separated id list, the same for every date.
#                          daily: required, an id list only: the workflow
#                          resolves it once, with the program year (#1284),
#                          and the FAC fetch and compute take it too
#   DISTRICTS_SOURCE       daily: `discovered` (DISTRICTS is the date's whole
#                          set) or `manual` (a dispatch's subset). Anything
#                          but `discovered`, unset included, records revision
#                          0 only, never the closing revision (#2475, #2483
#                          fix 4): a subset month end is partial, and a
#                          revision is write-once.
#   DATE_RESULTS_FILE      optional: one JSON line per date is appended,
#                          {"date":D,"actual":A|null,"outcome":O}, A the
#                          date the transform wrote (post-remap), O one of
#                          published | compute-failed | refused | failed.
#                          The daily caller reads its raw and snapshot date
#                          from it
#   DAILY_FAC_FETCH        daily FAC fetch command (default: bash
#                          scripts/pipeline/daily-fac-fetch.sh)
#   DAILY_FAC_MERGE        daily FAC merge command (default: bash
#                          scripts/pipeline/daily-fac-merge.sh)
#   FORCE                  the `force` dispatch input: "true", "false" or ""
#                          (a scheduled run); anything else is a usage error.
#                          `force` means one thing in every mode: re-fetch and
#                          re-derive even if cached (#1771, ADR-015 P7).
#                          rebuild, rescrape and rescrape-historical ARE
#                          re-derivations, so they are forced whatever FORCE
#                          says (transform/scrape --force, compute
#                          --force-analytics). daily is forced only when
#                          FORCE is true: otherwise its scrape reuses the
#                          raw-csv stage 3a pulled. The effective value is
#                          logged. Decided once, in FORCE_ARGS below.
#   GITHUB_STEP_SUMMARY    date counts and store counters are appended here
#   RUN_MANIFEST_FILE      required by any upload: every object uploaded is
#                          appended (scripts/pipeline/gcs-upload.sh, #1762);
#                          the completeness gate takes its dates from it
#   RUN_REMOVALS_FILE      required by any removal (stage 10b): every object
#                          removed is appended (gcs-remove.sh, #2232); an
#                          audit log, never read back
#   PLAN_GAP_REMOVALS      gap removal planner, rebuild only (default: tsx
#                          plan-gap-removals.ts)
#   MARCH_CLOSE_ATTEMPTS   copies of the March close tried before a window
#                          date fails (default 3, #1614)
#   MARCH_CLOSE_RETRY_DELAY seconds between those tries (default 5)
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
  daily)
    # One list, resolved once by the workflow with the program year (#1284):
    # the scrape, the FAC fetch and compute all take it. R17: `discover` and
    # empty are usage errors here, never a second discovery.
    if [ "${DISTRICTS:-}" != "discover" ] &&
      [[ "${DISTRICTS:-}" =~ ^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$ ]]; then
      DISTRICT_ARGS=(--districts "${DISTRICTS}")
    else
      echo "::error::process-dates: daily needs DISTRICTS (comma-separated ids, resolved by the workflow), got '${DISTRICTS:-}'" >&2
      exit 2
    fi
    ;;
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

# The one force decision (#1771). R17: an explicit case per mode.
# FORCE_ARGS goes to the scrape/transform, COMPUTE_FORCE_ARGS to compute.
case "${MODE}" in
  rebuild | rescrape | rescrape-historical)
    FORCE_ARGS=(--force)
    COMPUTE_FORCE_ARGS=(--force-analytics)
    echo "process-dates: force=always for ${MODE} (FORCE='${FORCE:-}')" >&2
    ;;
  daily)
    if [ "${FORCE:-}" = "true" ]; then
      FORCE_ARGS=(--force)
      COMPUTE_FORCE_ARGS=(--force-analytics)
      echo "process-dates: force=true for daily (FORCE='${FORCE}')" >&2
    else
      FORCE_ARGS=()
      COMPUTE_FORCE_ARGS=()
      echo "process-dates: force=false for daily (FORCE='${FORCE:-}')" >&2
    fi
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
# #2695: raw-fac/ is read from the private raw-source bucket, not staging.
# shellcheck source=raw-source-config.sh
source "${REPO}/scripts/pipeline/raw-source-config.sh"

read -r -a COLLECTOR <<<"${COLLECTOR_CLI:-npx collector-cli}"
read -r -a RESOLVE <<<"${RESOLVE_REBUILD_SOURCE:-${TSX} ${REPO}/scripts/resolve-rebuild-source.ts}"
read -r -a GUARD <<<"${GUARD_SNAPSHOT_UPLOAD:-${TSX} ${REPO}/scripts/guard-snapshot-upload.ts}"
read -r -a VALIDATE <<<"${VALIDATE_SNAPSHOTS:-${TSX} ${REPO}/scripts/validate-snapshots.ts}"
read -r -a IDENTITY <<<"${BUILD_IDENTITY_HISTORY:-bash ${REPO}/scripts/pipeline/build-identity-history.sh}"
read -r -a EDUCATION <<<"${BUILD_EDUCATION_ROLLUP:-bash ${REPO}/scripts/pipeline/build-education-rollup.sh}"
read -r -a PLAN_GAP <<<"${PLAN_GAP_REMOVALS:-${TSX} ${REPO}/scripts/plan-gap-removals.ts}"
read -r -a ROLLUPS <<<"${BUILD_REPORTS_ROLLUPS:-bash ${REPO}/scripts/pipeline/build-reports-rollups.sh}"
read -r -a FAC_FETCH <<<"${DAILY_FAC_FETCH:-bash ${REPO}/scripts/pipeline/daily-fac-fetch.sh}"
read -r -a FAC_MERGE <<<"${DAILY_FAC_MERGE:-bash ${REPO}/scripts/pipeline/daily-fac-merge.sh}"
# Every upload goes through the wrapper, so it lands in the run manifest.
export GCLOUD
UPLOAD=(bash "${REPO}/scripts/pipeline/gcs-upload.sh" "process-dates:${MODE}")
# rebuild re-derives dates staging already holds: skip the objects whose
# stored md5 and headers already match (#2566, scripts/pipeline/gcs-upload.sh).
# Still recorded in the manifest. Other modes upload what they just collected.
case "${MODE}" in
  rebuild) export GCS_UPLOAD_SKIP_UNCHANGED=true ;;
  daily | rescrape | rescrape-historical) ;;
esac
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
CARRIED=0
UNENRICHED=0
YOY_PRESENT=0
YOY_ABSENT=0
HYDRATED=""
PREV=""
PREV_SUSPENDED=""
SUSPENDED_PULL_ERRORS=0
ACTUAL=""
RESULTS="${DATE_RESULTS_FILE:-/dev/null}"
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

# The last day of the program year $2 years before the one $1 falls in
# ($2 = 1, the default: the previous one). July-December of Y ->
# (Y+1-$2)-06-30, January-June of Y -> (Y-$2)-06-30. Keyed on the snapshot
# (logical) date, as compute-analytics keys it (#1284).
previous_py_end() {
  local year="$((10#${1:0:4}))" month="$((10#${1:5:2}))" back="${2:-1}"
  if [ "${month}" -ge 7 ]; then year=$((year + 1)); fi
  printf '%04d-06-30\n' "$((year - back))"
}

# Pull snapshots/<June 30>/suspended-clubs.json of each of the three program
# years before $1's, for compute's reinstatable-clubs.json (#3007). A club
# suspended on Mar 31 leaves the date's own list on Jul 1 but stays
# suspended until Oct 1 (the previous year's list). Its closure then stays
# in the four-period window until Sep 30 two years later, and only its own
# year's list still dates it (the older lists, #3064 review F2). Best
# effort, one file per year. A missing file is expected. Any other error is
# a warning, counted in SUSPENDED_PULL_ERRORS for the summary (#3064 review
# N1). Directories this call creates are listed in PREV_SUSPENDED and
# removed by cleanup_date. One can be the YoY directory of a 06-30 date
# (PREV), which cleanup removes anyway. Any other existing directory is used
# as it is.
pull_previous_suspended() {
  local back end dir err
  for back in 1 2 3; do
    end="$(previous_py_end "$1" "${back}")"
    dir="${SNAPSHOTS}/${end}"
    if [ -d "${dir}" ] && [ "${end}" != "${PREV}" ]; then continue; fi
    if [ ! -d "${dir}" ]; then
      mkdir -p "${dir}"
      PREV_SUSPENDED="${PREV_SUSPENDED} ${end}"
    fi
    err="$(mktemp)"
    if "${GCLOUD}" storage cp \
      "gs://${BUCKET}/snapshots/${end}/suspended-clubs.json" \
      "${dir}/" 2>"${err}"; then
      :
    elif grep -q 'matched no objects' "${err}"; then
      echo "No snapshots/${end}/suspended-clubs.json; reinstatable-clubs.json for $1 may be unknown or miss clubs (#3007)"
    else
      cat "${err}" >&2
      echo "::warning::Could not download snapshots/${end}/suspended-clubs.json (an error, not a missing file); reinstatable-clubs.json for $1 may be unknown or miss clubs (#3007)"
      SUSPENDED_PULL_ERRORS=$((SUSPENDED_PULL_ERRORS + 1))
    fi
    rm -f "${err}"
  done
  return 0
}

# March-close baseline (#1614): the President's Membership Retention Award
# reads the March-close rankings for a logical date in April to June. The
# transform reads $CACHE_DIR/baselines/march-close/{Y}-03-31.json; never
# under snapshots/, where the remap below would take it for transform output.
#
# The logical date is only known after the remap (stage 5), so the pull runs
# before the transform for every date that COULD land in the window (a
# collection in April to July: a July collection can be the June close), and
# check_march_close decides on the remapped date.
#
# Reliable, not best effort: a baseline present on one run and absent on the
# next is an absent -> present change that holds the daily for review. A
# transient failure is retried; a missing object is logged and the date goes
# on (the award shows baseline-missing); an object that exists but will not
# copy fails the date for a window date, before anything of it is uploaded.
MARCH_CLOSE_DIR="${CACHE_DIR}/baselines/march-close"
MARCH_CLOSE_ATTEMPTS="${MARCH_CLOSE_ATTEMPTS:-3}"
MARCH_CLOSE_RETRY_DELAY="${MARCH_CLOSE_RETRY_DELAY:-5}"
MARCH_CLOSE_PRESENT=0
MARCH_CLOSE_ABSENT=0
MARCH_CLOSE_FAILED=0
BASELINE=""
BASELINE_YEAR=""

march_close_summary() {
  echo "- **March-close baseline (#1614)**: ${MARCH_CLOSE_PRESENT} present, ${MARCH_CLOSE_ABSENT} absent, ${MARCH_CLOSE_FAILED} failed"
}

# Sets BASELINE to present | absent | failed, or "" when the date cannot be
# in the window (nothing pulled). The live object is stored gzip-encoded:
# gcloud >= 576 inflates it on download, and a copy that is still gzip is
# inflated here, so the file on disk is always plain JSON (checked with jq).
pull_march_close() {
  local date="$1" month="${1:5:2}" attempt=1 tmp err
  BASELINE=""
  BASELINE_YEAR="${date:0:4}"
  case "${month}" in
    04 | 05 | 06 | 07) ;;
    *) return 0 ;; # the logical month cannot be April to June
  esac
  local src="gs://${BUCKET}/snapshots/${BASELINE_YEAR}-03-31/all-districts-rankings.json"
  local dest="${MARCH_CLOSE_DIR}/${BASELINE_YEAR}-03-31.json"
  tmp="${WORK}/march-close.json"
  err="${WORK}/march-close.err"
  mkdir -p "${MARCH_CLOSE_DIR}"
  rm -f "${dest}"
  while :; do
    rm -f "${tmp}"
    if "${GCLOUD}" storage cp "${src}" "${tmp}" 2>"${err}"; then
      if [ "$(head -c 2 "${tmp}" | od -An -tx1 | tr -d ' \n')" = "1f8b" ]; then
        gzip -dc <"${tmp}" >"${tmp}.plain" 2>/dev/null || : >"${tmp}.plain"
        mv "${tmp}.plain" "${tmp}"
      fi
      # The shape validateAllDistrictsRankings needs at the top level.
      if jq -e 'type == "object" and (.rankings | type == "array")' \
        "${tmp}" >/dev/null 2>&1; then
        mv "${tmp}" "${dest}"
        echo "March close ${BASELINE_YEAR}-03-31 copied to ${dest}"
        BASELINE=present
        return 0
      fi
      echo "The March close copy from ${src} is not a rankings file (attempt ${attempt})" >"${err}"
    elif grep -q 'matched no objects' "${err}"; then
      echo "No March close at ${src}; the retention award shows baseline-missing for ${date}"
      BASELINE=absent
      return 0
    fi
    cat "${err}"
    if [ "${attempt}" -ge "${MARCH_CLOSE_ATTEMPTS}" ]; then
      rm -f "${tmp}"
      BASELINE=failed
      return 0
    fi
    attempt=$((attempt + 1))
    echo "Retrying the March close copy (attempt ${attempt} of ${MARCH_CLOSE_ATTEMPTS})..."
    sleep "${MARCH_CLOSE_RETRY_DELAY}"
  done
}

# After the remap: count the pull when <actual> is in April to June. Returns
# 1 when the date must fail (its copy failed, or it was not pulled); the
# caller cleans up and moves to the next date, as for ENRICH=failed.
# Outside the window the copy is removed and nothing is counted.
check_march_close() {
  local actual="$1"
  case "${actual:5:2}" in
    04 | 05 | 06) ;;
    *)
      rm -f "${MARCH_CLOSE_DIR}/${BASELINE_YEAR}-03-31.json"
      return 0
      ;;
  esac
  local year="${actual:0:4}" status="${BASELINE}"
  # No pull for a window date, or one for another year: a remap the pull did
  # not foresee.
  if [ -z "${status}" ] || [ "${year}" != "${BASELINE_YEAR}" ]; then
    status=not-pulled
  fi
  case "${status}" in
    present) MARCH_CLOSE_PRESENT=$((MARCH_CLOSE_PRESENT + 1)) ;;
    absent) MARCH_CLOSE_ABSENT=$((MARCH_CLOSE_ABSENT + 1)) ;;
    failed)
      MARCH_CLOSE_FAILED=$((MARCH_CLOSE_FAILED + 1))
      echo "::error::process-dates: the March close ${year}-03-31 exists but could not be copied for ${actual}; not publishing ${actual} without the retention baseline (#1614)"
      return 1
      ;;
    *)
      MARCH_CLOSE_FAILED=$((MARCH_CLOSE_FAILED + 1))
      echo "::error::process-dates: the March close ${year}-03-31 was not pulled for ${actual}; not publishing ${actual} without the retention baseline (#1614)"
      return 1
      ;;
  esac
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

# 9b (#2475): record the closing month end <actual>, collected <as_of>, as a
# reconciliation revision. Hydrates staging's index (absent = the month's
# first revision; any other read failure records nothing, so a fresh index
# never overwrites staging's) and, while staging's month end is still the
# in-month view (its metadata is not closing data), that copy for revision
# 0. The CLI's result lists the files it wrote; upload_revisions sends them.
record_revision() {
  local actual="$1" as_of="$2"
  local rev="${SNAPSHOTS}/${actual}/revisions" prior="${WORK}/revision-prior"
  local src="gs://${BUCKET}/snapshots/${actual}" err="${WORK}/revision.err"
  local prior_args=()
  rm -rf "${rev}" "${prior}"
  mkdir -p "${rev}" "${prior}"
  if ! "${GCLOUD}" storage cp "${src}/revisions/index.json" \
    "${rev}/index.json" 2>"${err}"; then
    if ! grep -q 'matched no objects' "${err}"; then
      cat "${err}"
      echo "::warning::Could not read staging's snapshots/${actual}/revisions/index.json; no revision recorded for ${as_of} (#2475)"
      rm -rf "${rev}"
      return 0
    fi
    echo "No revision index for ${actual} in staging: ${as_of} is its first revision"
  fi
  if "${GCLOUD}" storage cp "${src}/metadata.json" \
    "${prior}/metadata.json" 2>"${err}"; then
    # R17 (#2483 fix 3): a metadata.json that does not parse is neither
    # in-month nor closing. It is a lost revision 0, said out loud.
    local prior_state
    prior_state="$(jq -r 'if type != "object" then "unparseable"
      elif .isClosingPeriodData == true then "closing"
      else "in-month" end' "${prior}/metadata.json" 2>/dev/null)" ||
      prior_state=unparseable
    case "${prior_state}" in
      in-month)
        if ! "${GCLOUD}" storage cp "${src}/district_*.json" "${prior}/" 2>"${err}"; then
          cat "${err}"
          echo "::warning::Could not read staging's in-month ${actual} for revision 0; no revision recorded for ${as_of} (#2475)"
          rm -rf "${rev}"
          return 0
        fi
        prior_args=(--prior-snapshot "${prior}")
        ;;
      closing) ;; # already a close: revision 0 was the first close's to take
      *)
        echo "::warning::Staging's snapshots/${actual}/metadata.json is not JSON; revision 0 of ${actual} cannot be taken, recording ${as_of} alone (#2475)"
        ;;
    esac
  elif ! grep -q 'matched no objects' "${err}"; then
    cat "${err}"
    echo "::warning::Could not read staging's snapshots/${actual}/metadata.json; no revision recorded for ${as_of} (#2475)"
    rm -rf "${rev}"
    return 0
  fi
  # A subset of the districts is a partial month end: revision 0 only.
  # R17: anything but `discovered` is treated as a subset (fails safe).
  local zero_only=()
  case "${DISTRICTS_SOURCE:-}" in
    discovered) ;;
    manual)
      echo "Manual district subset: recording revision 0 of ${actual} only, not ${as_of}"
      zero_only=(--revision-zero-only)
      ;;
    *)
      echo "::warning::DISTRICTS_SOURCE is '${DISTRICTS_SOURCE:-}', not discovered or manual; treating the districts as a subset, so ${as_of} is not recorded as a revision (#2475)"
      zero_only=(--revision-zero-only)
      ;;
  esac
  if ! "${COLLECTOR[@]}" record-revision --date "${actual}" --as-of "${as_of}" \
    "${prior_args[@]+"${prior_args[@]}"}" "${zero_only[@]+"${zero_only[@]}"}" \
    >"${WORK}/revision.json"; then
    cat "${WORK}/revision.json"
    echo "::warning::record-revision failed for ${actual} as of ${as_of}; no revision uploaded (#2475)"
    rm -rf "${rev}" "${WORK}/revision.json"
    return 0
  fi
  cat "${WORK}/revision.json"
  # A refused closing revision (a partial close, a manual subset) is a
  # warning, so a gap that persists across the close is seen (#2483). A
  # rerun of an already-recorded day is expected and stays a notice.
  if jq -e '.recorded == false and (.refused // "" | test("already recorded") | not)' \
    "${WORK}/revision.json" >/dev/null; then
    echo "::warning::Closing revision ${as_of} of ${actual} not recorded: $(jq -r '.refused' "${WORK}/revision.json") (#2475)"
  fi
  if jq -e '.revisionZero == "failed"' "${WORK}/revision.json" >/dev/null; then
    echo "::warning::Revision 0 of ${actual} could not be taken: $(jq -r '.revisionZeroError' "${WORK}/revision.json") (#2475)"
  fi
  echo "- **Reconciliation revision** (${actual} as of ${as_of}): $(jq -r 'if .recorded then "recorded (revision 0: \(.revisionZero))" else "not recorded: \(.refused)" end' "${WORK}/revision.json")" >>"${SUMMARY}"
}

# Upload what record_revision wrote: each revision directory's district
# files, then revisions/index.json last (R15: the index never names a
# revision staging does not hold). Warn-only (#2483 fix 1): a failed
# revision upload must not fail the daily or skip its later steps (the
# raw-csv upload), so it is never under `set -e`; a failed file upload
# uploads no index. Write-once in staging (#2483 fix 6): the local check
# ran on an emptied disk, so every revisions/<asOf>/ is listed first, and a
# directory staging already holds (or cannot list) uploads nothing at all;
# the files then go up with --no-clobber. Then the local revisions/ goes,
# so the steps after the loop see the month end as before.
upload_revisions() {
  local actual="$1" result="${WORK}/revision.json" as_of ok=1
  local dir="${SNAPSHOTS}/${actual}" files=() dirs=()
  local dst="gs://${BUCKET}/snapshots/${actual}/revisions"
  local err="${WORK}/revision-ls.err"
  if [ -s "${result}" ]; then
    while IFS= read -r as_of; do dirs+=("${as_of}"); done < <(
      jq -r '.written[] | select(test("^revisions/[0-9]{4}-[0-9]{2}-[0-9]{2}/")) | split("/")[1]' "${result}" | LC_ALL=C sort -u
    )
    for as_of in "${dirs[@]+"${dirs[@]}"}"; do
      if "${GCLOUD}" storage ls "${dst}/${as_of}/" >/dev/null 2>"${err}"; then
        echo "::warning::snapshots/${actual}/revisions/${as_of}/ is already in staging, though its index does not list it; revisions are write-once, so no revision of ${actual} is uploaded (#2475)"
        ok=0
        break
      elif ! grep -q 'matched no objects' "${err}"; then
        cat "${err}"
        echo "::warning::Could not list staging's snapshots/${actual}/revisions/${as_of}/; no revision of ${actual} is uploaded (#2475)"
        ok=0
        break
      fi
    done
    if [ "${ok}" = 1 ]; then
      for as_of in "${dirs[@]+"${dirs[@]}"}"; do
        files=()
        while IFS= read -r rel; do files+=("${dir}/${rel}"); done < <(
          jq -r --arg a "${as_of}" \
            '.written[] | select(startswith("revisions/\($a)/"))' "${result}"
        )
        echo "Uploading snapshots/${actual}/revisions/${as_of}/ (${#files[@]} files)..."
        if ! "${UPLOAD[@]}" cp \
          --content-type="application/json" \
          --cache-control="public, max-age=3600, must-revalidate" \
          --no-clobber \
          -Z \
          "${files[@]}" \
          "${dst}/${as_of}/"; then
          echo "::warning::Could not upload revision ${as_of} of ${actual}; its index is not uploaded (#2475)"
          ok=0
          break
        fi
      done
    fi
    if [ "${ok}" = 1 ] &&
      jq -e '.written | index("revisions/index.json")' "${result}" >/dev/null; then
      if ! "${UPLOAD[@]}" cp \
        --content-type="application/json" \
        --cache-control="public, max-age=3600, must-revalidate" \
        -Z \
        "${dir}/revisions/index.json" \
        "${dst}/"; then
        echo "::warning::Could not upload the revision index of ${actual}; staging keeps its earlier index (#2475)"
      fi
    fi
  fi
  rm -rf "${dir}/revisions" "${result}"
  return 0
}

# rebuild (#2232): remove from staging the earlier per-date objects of each
# #1671 gap district — failed with an `<id>: Skipped: ` reason in the
# date's own metadata.json. The transform wrote nothing for it and uploads
# only add, so its objects from an earlier build survive: a 0-member
# analytics file on a date whose metadata says the district failed. What
# goes is decided by scripts/plan-gap-removals.ts (scripts/lib/gapRemoval.ts):
# only `district_<id>.json` and `analytics/district_<id>_*.json` (never the
# reports sidecar), only while staging's district file is the 0-club junk,
# never a file this run wrote. Analytics first, the district file last.
# gcs-remove.sh records each removal (an audit log). Prod is converged by
# scoped promotion from the same state, not from that log. A cheap local
# check first, so a date without a gap spawns nothing. A read or removal
# error aborts the loop, like an upload error.
remove_gap_districts() {
  local actual="$1" meta="${SNAPSHOTS}/$1/metadata.json" ids urls url
  local analytics=() files=()
  [ -f "${meta}" ] || return 0
  ids="$(jq -r '. as $m
    | ((($m.failedDistricts // []) - ($m.successfulDistricts // [])) | .[] | strings)
    | select(. as $id | ($m.errors // []) | any(strings | startswith($id + ": Skipped: ")))' \
    "${meta}" 2>/dev/null)" || ids=""
  [ -n "${ids}" ] || return 0
  urls="$("${PLAN_GAP[@]}" "${BUCKET}" "${actual}" "${SNAPSHOTS}/${actual}")"
  while IFS= read -r url; do
    case "${url}" in
      "") ;;
      */analytics/*) analytics+=("${url}") ;;
      *) files+=("${url}") ;;
    esac
  done <<<"${urls}"
  if [ "${#analytics[@]}" -eq 0 ] && [ "${#files[@]}" -eq 0 ]; then return 0; fi
  echo "Removing $((${#analytics[@]} + ${#files[@]})) earlier object(s) of #1671 gap district(s) $(echo "${ids}" | paste -sd, -) from snapshots/${actual}/ (#2232)..."
  if [ "${#analytics[@]}" -gt 0 ]; then "${REMOVE[@]}" "${analytics[@]}"; fi
  if [ "${#files[@]}" -gt 0 ]; then "${REMOVE[@]}" "${files[@]}"; fi
}

# No raw-fac for <date> (#2237): carry the FAC fields of the date's existing
# staging snapshot onto the rebuild. Sets ENRICH to carried | unenriched |
# failed. A staging snapshot that cannot be read is not "never enriched":
# the date fails rather than risk stripping it.
carry_forward_fac() {
  local actual="$1" prior="${WORK}/prior-snapshot/$1"
  local err="${WORK}/prior-snapshot-cp.err" out="${WORK}/carry-forward.json"
  local src="gs://${BUCKET}/snapshots/${actual}" what="staging snapshots/${actual}/"
  ENRICH=failed
  mkdir -p "${prior}"
  if ! "${GCLOUD}" storage cp "${src}/district_*.json" \
    "${prior}/" >/dev/null 2>"${err}"; then
    rm -rf "${prior}"
    if grep -q 'matched no objects' "${err}"; then
      echo "No raw-fac/${actual}/ and no staging snapshot of it; ${actual} is processed unenriched"
      ENRICH=unenriched
      return 0
    fi
    cat "${err}"
    echo "::warning::Could not read ${what} to carry its Find-A-Club fields forward; not publishing ${actual} unenriched"
    return 0
  fi
  if ! "${COLLECTOR[@]}" carry-forward-find-a-club --from-dir "${prior}" \
    --snapshot-dir "${SNAPSHOTS}/${actual}" --verbose >"${out}"; then
    echo "::warning::Find-A-Club carry-forward failed for ${actual}; nothing uploaded for it"
    rm -rf "${prior}"
    return 0
  fi
  rm -rf "${prior}"
  # R17, one case per result: carried onto some district | staging enriched
  # but nothing carried (every district already merged: not a carry, and
  # never published as one) | staging not enriched | unreadable.
  if jq -e '.carried > 0' "${out}" >/dev/null 2>&1; then
    echo "No raw-fac/${actual}/; carried its Find-A-Club fields forward from ${what} ($(jq -c '{priorEnriched, carried, rowsCarried, alreadyEnriched}' "${out}"))"
    ENRICH=carried
  elif jq -e '.priorEnriched > 0' "${out}" >/dev/null 2>&1; then
    echo "::warning::${what} is enriched but no Find-A-Club field was carried ($(jq -c '{priorEnriched, carried, alreadyEnriched}' "${out}")); nothing uploaded for it"
  elif jq -e '.priorEnriched == 0' "${out}" >/dev/null 2>&1; then
    echo "No raw-fac/${actual}/ and its staging snapshot is not enriched; ${actual} is processed unenriched"
    ENRICH=unenriched
  else
    echo "::warning::Unreadable carry-forward result for ${actual}; nothing uploaded for it"
  fi
  return 0
}

# daily (#1765): fetch Find-A-Club live and persist it (non-blocking), then
# merge it with the persisted fallback (fail-closed). Sets ENRICH to
# enriched | failed.
enrich_daily() {
  local actual="$1"
  ENRICH=failed
  if ! "${FAC_FETCH[@]}" "${BUCKET}" "${actual}" "${DISTRICTS}" >/dev/null; then
    echo "::warning::The Find-A-Club fetch for ${actual} did not run; the merge falls back to the last persisted raw-fac/"
  fi
  if "${FAC_MERGE[@]}" "${BUCKET}" "${actual}" >"${WORK}/fac-merge.json"; then
    ENRICH=enriched
  else
    echo "::warning::Find-A-Club merge failed for ${actual}; nothing uploaded for it"
  fi
  return 0
}

# Merge the persisted Find-A-Club fetch for <date> into its snapshots, if
# daily persisted one; otherwise carry_forward_fac. Sets ENRICH to enriched
# | carried | unenriched | failed.
enrich_snapshot() {
  local actual="$1" fac="${WORK}/raw-fac/$1" err="${WORK}/raw-fac-ls.err"
  ENRICH=failed
  if ! "${GCLOUD}" storage ls "gs://${RAW_SOURCE_BUCKET}/raw-fac/${actual}/**" \
    >/dev/null 2>"${err}"; then
    if grep -q 'matched no objects' "${err}"; then
      carry_forward_fac "${actual}"
      return 0
    fi
    cat "${err}"
    echo "::warning::Could not list raw-fac/${actual}/; not publishing ${actual} unenriched"
    return 0
  fi
  mkdir -p "${fac}"
  if ! "${GCLOUD}" storage rsync -r "gs://${RAW_SOURCE_BUCKET}/raw-fac/${actual}/" "${fac}/"; then
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
  PREV_SUSPENDED=""
  ACTUAL=""
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

  # 3a. raw (daily) — the stored raw of the date, which the scrape reuses
  # unless forced (#1771).
  if [ "${MODE}" = "daily" ]; then
    mkdir -p "${RAW}/${date}"
    if ! "${GCLOUD}" storage rsync -r \
      "gs://${BUCKET}/raw-csv/${date}/" "${RAW}/${date}/"; then
      echo "No existing raw-csv for ${date} in staging (first run); the scrape fetches it"
    fi
    echo "- **CSV files restored** (raw-csv/${date}/): $(find "${RAW}/${date}" -name '*.csv' | wc -l | tr -d ' ')" >>"${SUMMARY}"
  fi

  # 3b. hydrate (rescrape) — before `before`, so a hydrated date directory
  # is not mistaken for the transform's output by the remap below.
  if [ "${MODE}" = "rescrape" ]; then
    hydrate "${date}"
  fi
  before="$(snapshot_dates)"

  # 3c. March-close baseline (#1614), read by the transform.
  pull_march_close "${date}"

  # 4. transform
  if [ "${MODE}" = "daily" ]; then
    echo "Scraping and transforming ${date}..."
    local scrape_status=0 scraped
    "${COLLECTOR[@]}" scrape --date "${date}" --transform \
      "${FORCE_ARGS[@]+"${FORCE_ARGS[@]}"}" --verbose "${DISTRICT_ARGS[@]}" \
      >"${WORK}/scrape.json" || scrape_status=$?
    cat "${WORK}/scrape.json"
    {
      echo "## 📥 Scrape Results"
      echo "- **Date**: ${date}"
      jq -r '"- **Districts succeeded**: \(.districts.succeeded)",
        "- **Districts failed**: \(.districts.failed)"' "${WORK}/scrape.json" 2>/dev/null ||
        echo "- ⚠️ the scrape printed no summary (exit ${scrape_status})"
    } >>"${SUMMARY}"
    scraped="$(comm -13 <(echo "${before}") <(snapshot_dates) | head -1)"
    if [ -z "${scraped}" ] || [ ! -f "${SNAPSHOTS}/${scraped}/metadata.json" ]; then
      echo "::warning::Scrape/transform of ${date} wrote no snapshot (exit ${scrape_status}); nothing uploaded for it"
      if [ -n "${scraped}" ]; then rm -rf "${SNAPSHOTS:?}/${scraped}"; fi
      cleanup_date "${source}" "" "${prev}"
      return 0
    fi
    if [ "${scrape_status}" -ne 0 ]; then
      echo "::warning::scrape exited ${scrape_status} for ${date} (some districts failed); publishing what it wrote, as the daily always has"
    fi
  elif [ "${MODE}" = "rescrape" ]; then
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
  ACTUAL="${actual}"

  # 5b. March-close baseline check, on the logical (remapped) date. A failed
  # check fails the date (OUTCOME stays failed), not the run.
  if ! check_march_close "${actual}"; then
    cleanup_date "${source}" "${actual}" "${prev}"
    return 0
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
  case "${MODE}" in
    daily) enrich_daily "${actual}" ;;
    rebuild | rescrape | rescrape-historical) enrich_snapshot "${actual}" ;;
  esac
  case "${ENRICH}" in
    enriched) ENRICHED=$((ENRICHED + 1)) ;;
    carried) CARRIED=$((CARRIED + 1)) ;;
    unenriched) UNENRICHED=$((UNENRICHED + 1)) ;;
    *)
      cleanup_date "${source}" "${actual}" "${prev}"
      return 0
      ;;
  esac

  # 8. compute, with the prior year it reads for YoY (#1769)
  pull_prior_year "${actual}"
  prev="${PREV}"
  pull_previous_suspended "${actual}"
  echo "Computing analytics for ${actual}..."
  local compute_ok=1 compute_districts=()
  if [ "${MODE}" = "daily" ]; then compute_districts=("${DISTRICT_ARGS[@]}"); fi
  if ! "${COLLECTOR[@]}" compute-analytics --date "${actual}" \
    "${COMPUTE_FORCE_ARGS[@]+"${COMPUTE_FORCE_ARGS[@]}"}" --verbose \
    "${compute_districts[@]+"${compute_districts[@]}"}" >"${COMPUTE_JSON}"; then
    echo "::warning::Compute failed for ${actual}"
    compute_ok=0
  fi
  jq -c . "${COMPUTE_JSON}" >>"${COUNTERS_JSONL}" ||
    echo "::warning::No compute JSON for ${actual}; the counters omit it"
  # R17: daily fails the date on a failed compute, nothing uploaded (its
  # compute step failed the run before the upload); the re-derivations
  # upload and count it (#1708).
  case "${MODE}" in
    daily)
      if [ "${compute_ok}" = 0 ]; then
        echo "::warning::Not publishing ${actual}: compute failed (daily)"
        cleanup_date "${source}" "${actual}" "${prev}"
        return 0
      fi
      ;;
    rebuild | rescrape | rescrape-historical) ;;
  esac

  # 9. validate
  if ! "${VALIDATE[@]}" "${SNAPSHOTS}/${actual}"; then
    echo "::warning::Snapshot schema gate failed for ${actual}; nothing uploaded for it"
    cleanup_date "${source}" "${actual}" "${prev}"
    return 0
  fi

  # 9b. revision (#2475) — daily only (R17). A collection the transform
  # remapped (actual != date) is a closing one; a date it kept has no
  # revision. The other modes re-derive and must not rewrite a revision.
  rm -f "${WORK}/revision.json"
  case "${MODE}" in
    daily)
      if [ "${actual}" != "${date}" ]; then
        record_revision "${actual}" "${date}"
      fi
      ;;
    rebuild | rescrape | rescrape-historical) ;;
  esac

  # 10. upload
  if [ -d "${SNAPSHOTS}/${actual}" ]; then
    upload_snapshot "${actual}"
    upload_revisions "${actual}"
    # 10b. remove — rebuild only (#2232). R17: the other modes keep what
    # staging holds for districts they did not re-derive.
    case "${MODE}" in
      rebuild) remove_gap_districts "${actual}" ;;
      rescrape | rescrape-historical | daily) ;;
    esac
    PUBLISHED_DATES+=("${actual}")
    if [ "${compute_ok}" = 1 ]; then OUTCOME=published; else OUTCOME=compute-failed; fi
  else
    echo "::warning::No snapshot directory found for ${date} (expected ${actual})"
  fi
  case "${MODE}" in
    rescrape | daily)
      if [ -d "${RAW}/${date}" ]; then
        echo "Uploading raw-csv/${date}/..."
        "${UPLOAD[@]}" rsync -r "${RAW}/${date}/" "gs://${BUCKET}/raw-csv/${date}/"
      fi
      ;;
    rebuild | rescrape-historical) ;;
  esac

  # 11. cleanup. daily keeps the raw and snapshot it published: the
  # workflow's CDN-manifest step reads the local latest snapshot.
  case "${MODE}" in
    daily) cleanup_date "" "" "${prev}" ;;
    rebuild | rescrape | rescrape-historical)
      cleanup_date "${source}" "${actual}" "${prev}"
      ;;
  esac
}

cleanup_date() {
  local source="$1" actual="$2" prev="$3"
  # rescrape-historical's raw belongs to the step after this one.
  if [ -n "${source}" ] && [ "${MODE}" != "rescrape-historical" ]; then
    rm -rf "${RAW:?}/${source}"
  fi
  if [ -n "${actual}" ]; then rm -rf "${SNAPSHOTS:?}/${actual}"; fi
  if [ -n "${prev}" ]; then rm -rf "${SNAPSHOTS:?}/${prev}"; fi
  if [ -n "${HYDRATED}" ]; then rm -rf "${SNAPSHOTS:?}/${HYDRATED}"; fi
  local dir
  for dir in ${PREV_SUSPENDED}; do rm -rf "${SNAPSHOTS:?}/${dir}"; done
  rm -rf "${MARCH_CLOSE_DIR:?}"
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
  jq -nc --arg d "${date}" --arg a "${ACTUAL}" --arg o "${OUTCOME}" \
    '{date: $d, actual: (if $a == "" then null else $a end), outcome: $o}' \
    >>"${RESULTS}"
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

# 12. identity — once, after every date is uploaded (#1782). R17: daily
# builds it only when its date published.
IDENTITY_STATUS=built
case "${MODE}" in
  daily) [ "${SUCCEEDED}" -gt 0 ] || IDENTITY_STATUS="skipped (no date published)" ;;
  rebuild | rescrape | rescrape-historical) ;;
esac
if [ "${IDENTITY_STATUS}" = built ] && ! "${IDENTITY[@]}" "${BUCKET}"; then
  echo "::warning::Identity histories were not rebuilt (#1782, #1820); the previous copies stand"
  IDENTITY_STATUS="FAILED (see the step log)"
fi

# 13. education — once, after the identity histories (#1801): it reads the
# region history step 12 just wrote. R17: daily never builds it here; it
# reads the newest reports, which `place-reports` writes later (#2028).
case "${MODE}" in
  daily)
    EDUCATION_STATUS="skipped (the education-rollup job builds it, #2028)"
    ;;
  rebuild | rescrape | rescrape-historical)
    EDUCATION_STATUS=built
    if ! "${EDUCATION[@]}" "${BUCKET}"; then
      echo "::warning::Education rollup was not rebuilt (#1801); the previous derived/ copy stands"
      EDUCATION_STATUS="FAILED (see the step log)"
    fi
    ;;
esac

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
  case "${MODE}" in
    daily) echo "- **Dates enriched (today's fetch, else the last persisted raw-fac)**: ${ENRICHED}" ;;
    *) echo "- **Dates enriched from raw-fac**: ${ENRICHED}" ;;
  esac
  echo "- **Dates carried forward from their staged snapshot (no raw-fac)**: ${CARRIED}"
  echo "- **Dates unenriched (no raw-fac)**: ${UNENRICHED}"
  echo "- **Dates with a prior-year snapshot (YoY)**: ${YOY_PRESENT}"
  echo "- **Dates without one (no YoY)**: ${YOY_ABSENT}"
  echo "- **Earlier suspended lists that failed to download (#3007)**: ${SUSPENDED_PULL_ERRORS}"
  march_close_summary
  echo "- **Identity histories**: ${IDENTITY_STATUS}"
  echo "- **Education rollup**: ${EDUCATION_STATUS}"
  jq -rs -f "${REPO}/scripts/compute-counters.jq" "${COUNTERS_JSONL}"
} >>"${SUMMARY}"

printf '{"succeeded":%d,"refused":%d,"failed":%d}\n' \
  "${SUCCEEDED}" "${REFUSED}" "${FAILED}" >&3
