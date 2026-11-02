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

fail() {
  echo "cloud-session-setup: FAILED: $*" >&2
  exit 1
}

# VM tooling (#2464). Bash builtins only, besides the tools themselves: the
# tests run this on a stub-only PATH.
#
# A case-folding locale: the image ships only C, C.utf8 and POSIX, and the
# lessons-index locale test (#1372) compares byte order against case folding.
has_en_us=no
while IFS= read -r name; do
  case "$name" in en_US.utf8 | en_US.UTF-8) has_en_us=yes ;; esac
done < <(locale -a 2>/dev/null || true)
if [[ "$has_en_us" == "no" ]]; then
  echo "cloud-session-setup: generating locale en_US.UTF-8" >&2
  localedef -i en_US -f UTF-8 en_US.UTF-8 >&2 || fail "locale en_US.UTF-8"
fi

# yamllint: the pre-commit hook runs `npm run lint:yaml`. A user install lands
# in ~/.local/bin, which the VM already has on PATH.
if ! command -v yamllint >/dev/null 2>&1; then
  echo "cloud-session-setup: installing yamllint" >&2
  python3 -m pip install --user yamllint >&2 || fail "pip install yamllint"
fi

step ci
step run build:shared-contracts
step run build:analytics-core
step run build:collector-cli
step run build:mcp-server

echo "cloud-session-setup: ready" >&2
