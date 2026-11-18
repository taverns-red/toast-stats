#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions (#2454).
#
# Committed in .claude/settings.json, so it also fires in local sessions:
# it must do nothing there. A cloud VM starts from a fresh clone, so this
# installs dependencies and builds the workspace packages whose gitignored
# dist/ the typecheck and unit tests import (R16). The build list mirrors
# the "Build dependency packages" step of .github/workflows/ci.yml.
#
# Idempotent: npm ci and tsc rebuilds are safe to repeat on resume.
# No secrets, no Playwright: browser smokes run in CI against the preview.
set -euo pipefail

[[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] || exit 0

root="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$root" ]]; then
  root="$(git rev-parse --show-toplevel)"
fi
cd "$root"

step() {
  echo "cloud-session-setup: npm $*" >&2
  if ! npm "$@" >&2; then
    echo "cloud-session-setup: FAILED: npm $*" >&2
    exit 1
  fi
}

step ci
step run build:shared-contracts
step run build:analytics-core
step run build:collector-cli
step run build:mcp-server

# Tools the VM image lacks (#2467). Each is skipped when already present.
#
# yamllint: the pre-commit hook runs `npm run lint:yaml`. pip --user puts it
# in ~/.local/bin, which the VM already has on PATH.
if ! command -v yamllint >/dev/null 2>&1; then
  echo "cloud-session-setup: pip install --user yamllint" >&2
  if ! pip install --user --quiet yamllint >&2; then
    echo "cloud-session-setup: FAILED: pip install --user yamllint" >&2
    exit 1
  fi
fi

echo "cloud-session-setup: ready" >&2
