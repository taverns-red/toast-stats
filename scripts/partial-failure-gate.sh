#!/usr/bin/env bash
# Fail a per-date pipeline mode that had failures, unless the operator opted in
# to a partial run (#1708, plan S1-3, decision D7).
#
# Usage: scripts/partial-failure-gate.sh <mode> <failed-count>
# Env:   ALLOW_PARTIAL — the `allow_partial` dispatch input. Only the literal
#        "true" lets a run with failures continue; anything else (false, empty
#        on a cron run) fails it.
#
# Call it as the LAST command of the step, after the loop and the store
# pushes: per-date uploads are intended, so a failure must not abort the loop
# midway, but a failed step skips promotion (it has no `always()`).
#
# Exit codes: 0 — no failures, or failures allowed by ALLOW_PARTIAL
#             1 — failures and no ALLOW_PARTIAL
#             2 — usage error: the count is missing or not a number (fail
#                 closed: an unset step output must not read as "0 failed")
set -euo pipefail

MODE="${1:?usage: partial-failure-gate.sh <mode> <failed-count>}"
FAILED="${2:-}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

if ! [[ "${FAILED}" =~ ^[0-9]+$ ]]; then
  echo "::error::partial-failure-gate: ${MODE} reported no usable failure count ('${FAILED}'); failing closed"
  exit 2
fi

if [ "${FAILED}" -eq 0 ]; then
  echo "partial-failure-gate: ${MODE} had no failed dates" >&2
  exit 0
fi

if [ "${ALLOW_PARTIAL:-false}" = "true" ]; then
  echo "::warning::${FAILED} dates failed during ${MODE}; continuing because allow_partial=true"
  echo "- ⚠️ **${FAILED} failed dates allowed** (allow_partial=true)" >> "${SUMMARY}"
  exit 0
fi

echo "::error::${FAILED} dates failed during ${MODE}. The successful dates are uploaded to staging, but the run fails and does not promote. Re-run with allow_partial=true to promote a partial run on purpose."
echo "- ❌ **${FAILED} failed dates — run failed, not promoted** (re-run with allow_partial=true to override)" >> "${SUMMARY}"
exit 1
