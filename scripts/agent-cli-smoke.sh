#!/usr/bin/env bash
# agent-cli real-repo smoke (#2418) -- the drift guard from the issue: a
# subcommand that "runs fine but quietly does the wrong thing" fails here.
#
# Runs every subcommand's --help, then one real READ-ONLY call per
# subcommand against taverns-red/toast-stats and the live site, asserting
# the shape and the known facts of fixed historical objects (PR #2416 is
# merged; its preview comment stays, its channel is gone). Needs network and
# GH_TOKEN with actions/checks/pull-requests read. CI only: the unit suite
# (npm run test:scripts) never touches the network.
set -euo pipefail

CLI=./bin/agent-cli
REPO=taverns-red/toast-stats

fail() {
  echo "::error::agent-cli smoke: $*"
  exit 1
}

# run <cmd...>: capture stdout in OUT and the exit code in RC.
run() {
  set +e
  OUT=$("$@")
  RC=$?
  set -e
  echo "--- $* (exit $RC)" >&2
}

check() { # check <jq filter> <what>
  jq -e "$1" >/dev/null <<<"$OUT" || {
    echo "$OUT" | head -c 2000 >&2
    fail "$2"
  }
}

$CLI --help >/dev/null || fail "--help exited non-zero"
for sub in ci-wait main-status job-log live-version preview-url worktree-audit; do
  help=$($CLI "$sub" --help) || fail "$sub --help exited non-zero"
  grep -q -- '--json' <<<"$help" || fail "$sub --help does not document --json"
done

run $CLI main-status --json
[ "$RC" -le 2 ] || fail "main-status exited $RC"
check '(.sha | test("^[0-9a-f]{40}$")) and (.state | IN("green","red","pending"))' \
  "main-status: bad sha/state"
check '(.workflows | length > 0) and all(.workflows[]; .url | startswith("https://github.com/"))' \
  "main-status: no workflow runs on main's head"

run $CLI preview-url 2416 --json
[ "$RC" -eq 1 ] || fail "preview-url 2416 (merged) should exit 1, got $RC"
check '(.url | test("^https://staging-toast-stats--pr-2416-[a-z0-9]+\\.web\\.app$")) and .prState == "MERGED" and .live == false' \
  "preview-url: PR 2416's sticky comment did not parse as a removed channel"

run $CLI ci-wait 2416 --once --allow-cancelled --json
[ "$RC" -eq 0 ] || fail "ci-wait 2416 --once --allow-cancelled should pass, got $RC"
check '.outcome == "pass" and .summary.total > 0 and .summary.pending == 0' \
  "ci-wait: PR 2416's finished checks did not summarise as a pass"

run $CLI live-version --json
[ "$RC" -le 1 ] || fail "live-version exited $RC"
check '(.version | test("^v[0-9]+\\.[0-9]+\\.[0-9]+$")) and (.entry | startswith("/assets/index-")) and (.assets | length > 0)' \
  "live-version: no version/entry read from https://ts.taverns.red"

# Job logs expire, so use the newest failed run rather than a fixed id.
RUN_ID=$(gh run list --repo "$REPO" --status failure --limit 1 --json databaseId -q '.[0].databaseId // empty')
if [ -n "$RUN_ID" ]; then
  run $CLI job-log "$RUN_ID" --json
  [ "$RC" -eq 0 ] || fail "job-log $RUN_ID exited $RC"
  check 'length > 0 and all(.[]; (.job.id > 0) and (.errors | type == "array"))' \
    "job-log: run $RUN_ID gave no job report"
  check 'all(.[]; all(.errors[]; test("\u001b") | not))' "job-log: ANSI left in output"
else
  echo "job-log: no failed run in $REPO to read; skipped" >&2
fi

run $CLI worktree-audit --json
[ "$RC" -eq 0 ] || fail "worktree-audit exited $RC"
check 'length >= 1 and .[0].primary == true and .[0].safeToRemove == false' \
  "worktree-audit: primary checkout not reported as KEEP"

echo "agent-cli smoke: all subcommands ok" >&2
