#!/usr/bin/env bash
# PreToolUse hook for Claude Code cloud sessions (#2519, ops#242).
#
# Cloud workers act as `rservant` on GitHub, and the ADR 0019 guard
# (cdn-json-compat.yml) trusts `db-breaking-approved` when rservant applied
# it last. So a cloud agent must never apply, create, edit or remove that
# label. scripts/cloud-session-guard.mjs reads the tool call from stdin and
# exits 2 (block; stderr goes back to the model) for any path it can see.
#
# Committed in .claude/settings.json, so it also fires in local sessions,
# where Ron applies the label himself: it must do nothing there.
[[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] || exit 0

# Fail closed in the cloud: no node means no check, so refuse.
if ! command -v node >/dev/null 2>&1; then
  echo "cloud-session-guard: node not found, refusing the tool call. Ask Ron." >&2
  exit 2
fi
# Not exec: Claude Code blocks only on exit 2, so a checker that cannot run
# (missing file, syntax error, a throw, a kill) must not let the call through
# with its own status (#2542). 0 allows, 2 blocks, anything else blocks too.
node "$(dirname "${BASH_SOURCE[0]}")/cloud-session-guard.mjs"
status=$?
case "$status" in
  0 | 2) exit "$status" ;;
esac
echo "cloud-session-guard: the checker could not run (exit $status), so the tool call is refused. Ask Ron." >&2
exit 2
