#!/usr/bin/env bash
# Apply .github/rulesets/main.json to the live `Protect` ruleset (#1216).
#
# Branch protection is an OPERATOR action, never an automated one: a wrong
# ruleset locks everybody (including the sprint-runner) out of `main`. So this
# script defaults to --diff and does nothing until you pass --apply.
#
#   bash scripts/apply-main-ruleset.sh            # show live vs desired, exit 1 if drifted
#   bash scripts/apply-main-ruleset.sh --apply    # PUT the desired ruleset (idempotent)
#
# Recovery, if the gate ever wedges `main`: a repository admin can always edit
# or delete the ruleset (the API path below, or Settings -> Rules), because
# rulesets never restrict who may administer them. There are deliberately no
# `bypass_actors` -- adding one re-opens the exact hole #1216 closes.
set -euo pipefail

REPO="${REPO:-taverns-red/toast-stats}"
RULESET_NAME="Protect"
DESIRED_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.github/rulesets/main.json"

MODE="diff"
[[ "${1:-}" == "--apply" ]] && MODE="apply"

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# `.[] | select(...)` over the list, not a name filter server-side -- the
# rulesets endpoint has no name query.
RULESET_ID="$(gh api "repos/${REPO}/rulesets" \
  --jq ".[] | select(.name == \"${RULESET_NAME}\") | .id")"

if [[ -z "$RULESET_ID" ]]; then
  echo "No ruleset named '${RULESET_NAME}' on ${REPO}." >&2
  echo "Create it once with: gh api -X POST repos/${REPO}/rulesets --input ${DESIRED_FILE}" >&2
  exit 1
fi

# Compare only the fields we manage. The live payload also carries id/node_id/
# timestamps/_links, which are server-owned and must not appear in the diff.
MANAGED='{name, target, enforcement, bypass_actors, conditions, rules}'
LIVE="$(gh api "repos/${REPO}/rulesets/${RULESET_ID}" --jq "$MANAGED" | jq -S .)"
DESIRED="$(jq -S "$MANAGED" "$DESIRED_FILE")"

if [[ "$MODE" == "diff" ]]; then
  if [[ "$LIVE" == "$DESIRED" ]]; then
    echo "✅ ruleset ${RULESET_ID} (${RULESET_NAME}) matches ${DESIRED_FILE}"
    exit 0
  fi
  echo "❌ live ruleset ${RULESET_ID} differs from ${DESIRED_FILE}:"
  diff <(echo "$LIVE") <(echo "$DESIRED") || true
  echo
  echo "Re-run with --apply to make the live ruleset match."
  exit 1
fi

if [[ "$LIVE" == "$DESIRED" ]]; then
  echo "✅ already applied — nothing to do (idempotent)."
  exit 0
fi

echo "Applying ${DESIRED_FILE} to ruleset ${RULESET_ID} on ${REPO}…"
gh api -X PUT "repos/${REPO}/rulesets/${RULESET_ID}" --input "$DESIRED_FILE" >/dev/null
echo "✅ applied. Verify with: bash scripts/apply-main-ruleset.sh"
