#!/usr/bin/env bash
#
# Triggers the Toast Stats daily data pipeline on GitHub via workflow_dispatch.
#
# WHY THIS EXISTS (#1242): GitHub Actions `schedule:` triggers fire late or get
# dropped under load. The daily pipeline's value is on-time data freshness, so
# its cron was removed from .github/workflows/data-pipeline.yml and replaced by
# this script, invoked deterministically by a local launchd job at
# 05:00 America/Toronto (DST-aware via the Mac's local wall clock).
#
# launchd runs with a minimal environment and PATH, so everything is absolute.
# This is a LaunchAgent (runs as the logged-in user) so `gh` reads its token
# from the login keychain without prompting.
#
set -euo pipefail

REPO="taverns-red/toast-stats"
WORKFLOW="data-pipeline.yml"
REF="main"            # scheduled/dispatched workflows resolve from the default branch
# Overridable only so tests can stub them (#2496); launchd never sets these.
GH="${TRIGGER_GH:-/opt/homebrew/bin/gh}"
OSASCRIPT="${TRIGGER_OSASCRIPT:-/usr/bin/osascript}"

LOG_DIR="${HOME}/Library/Logs/toast-stats"
mkdir -p "${LOG_DIR}"
LOG="${LOG_DIR}/daily-pipeline-trigger.log"

ts() { date "+%Y-%m-%dT%H:%M:%S%z"; }
log() { echo "[$(ts)] $*" | tee -a "${LOG}"; }

fail() {
  log "ERROR: $*"
  "${OSASCRIPT}" -e "display notification \"Daily pipeline trigger FAILED: $* (see ${LOG})\" with title \"Toast Stats\"" 2>/dev/null || true
  exit 1
}

[ -x "${GH}" ] || fail "gh not found/executable at ${GH}"

# Retry + confirm (#2496). On 2026-11-04 one HTTP 500 from the dispatch API
# meant no daily run that day. Each attempt first checks whether a run already
# started since the trigger time (a 500 can arrive after GitHub accepted the
# dispatch), so a retry never starts a second run. After an accepted dispatch,
# poll until the run shows up. Delays between attempts default to ~15 min total.
read -r -a RETRY_DELAYS <<<"${TRIGGER_RETRY_DELAYS:-60 120 240 480}"
ATTEMPTS=$(( ${#RETRY_DELAYS[@]} + 1 ))
CONFIRM_POLLS="${TRIGGER_CONFIRM_POLLS:-6}"
CONFIRM_INTERVAL="${TRIGGER_CONFIRM_INTERVAL:-10}"

# A run counts if created at/after the trigger time, minus a minute of slack
# for clock skew between this Mac and GitHub.
SINCE_EPOCH=$(( $(date -u +%s) - 60 ))

# Prints the id of a workflow_dispatch run created since SINCE_EPOCH, or
# nothing. A failed lookup also prints nothing: re-dispatching risks an
# idempotent second run, while not dispatching risks a missed day.
started_run() {
  "${GH}" run list --repo "${REPO}" --workflow "${WORKFLOW}" \
    --event workflow_dispatch --limit 10 --json databaseId,createdAt \
    --jq "[.[] | select((.createdAt | fromdateiso8601) >= ${SINCE_EPOCH})] | .[0].databaseId // empty" \
    2>>"${LOG}" || log "WARN: gh run list failed; treating as no run yet" >&2
}

confirm_run() {
  local i id
  for ((i = 1; i <= CONFIRM_POLLS; i++)); do
    id=$(started_run)
    if [ -n "${id}" ]; then
      echo "${id}"
      return 0
    fi
    [ "${i}" -lt "${CONFIRM_POLLS}" ] && sleep "${CONFIRM_INTERVAL}"
  done
  return 1
}

log "Triggering ${WORKFLOW} (mode=daily) on ${REPO}@${REF}"
for ((attempt = 1; attempt <= ATTEMPTS; attempt++)); do
  if [ "${attempt}" -gt 1 ]; then
    delay="${RETRY_DELAYS[$((attempt - 2))]}"
    log "Waiting ${delay}s before attempt ${attempt}/${ATTEMPTS}"
    sleep "${delay}"
    run_id=$(started_run)
    if [ -n "${run_id}" ]; then
      log "Run ${run_id} started after an earlier attempt; not dispatching again."
      exit 0
    fi
  fi

  log "Dispatch attempt ${attempt}/${ATTEMPTS}"
  if "${GH}" workflow run "${WORKFLOW}" --repo "${REPO}" --ref "${REF}" -f mode=daily >>"${LOG}" 2>&1; then
    log "Dispatch accepted; confirming a run started."
    if run_id=$(confirm_run); then
      log "Run ${run_id} started."
      exit 0
    fi
    log "WARN: dispatch accepted but no run visible yet (attempt ${attempt}/${ATTEMPTS})"
  else
    log "WARN: gh workflow run exited non-zero (attempt ${attempt}/${ATTEMPTS} failed)"
  fi
done

fail "no data-pipeline run started after ${ATTEMPTS} dispatch attempts"
