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
GH="/opt/homebrew/bin/gh"

LOG_DIR="${HOME}/Library/Logs/toast-stats"
mkdir -p "${LOG_DIR}"
LOG="${LOG_DIR}/daily-pipeline-trigger.log"

ts() { date "+%Y-%m-%dT%H:%M:%S%z"; }
log() { echo "[$(ts)] $*" | tee -a "${LOG}"; }

fail() {
  log "ERROR: $*"
  /usr/bin/osascript -e "display notification \"Daily pipeline trigger FAILED: $* (see ${LOG})\" with title \"Toast Stats\"" 2>/dev/null || true
  exit 1
}

[ -x "${GH}" ] || fail "gh not found/executable at ${GH}"

log "Triggering ${WORKFLOW} (mode=daily) on ${REPO}@${REF}"
if "${GH}" workflow run "${WORKFLOW}" --repo "${REPO}" --ref "${REF}" -f mode=daily >>"${LOG}" 2>&1; then
  log "Dispatch accepted."
else
  fail "gh workflow run exited non-zero"
fi
