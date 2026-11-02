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

# A case-folding locale: lessonsIndexLocale.test.ts compares the lessons
# INDEX under byte order (C) and under one that folds case. The image ships
# only C, C.utf8 and POSIX, but has the en_US source data and localedef.
has_case_folding_locale() {
  local line
  while IFS= read -r line; do
    case "$line" in
      en_US.utf8 | en_US.UTF-8 | en_US.utf-8 | en_US.UTF8) return 0 ;;
    esac
  done < <(locale -a 2>/dev/null || true)
  return 1
}
if ! has_case_folding_locale; then
  echo "cloud-session-setup: localedef en_US.UTF-8" >&2
  if ! localedef -i en_US -f UTF-8 en_US.UTF-8 >&2; then
    echo "cloud-session-setup: FAILED: localedef en_US.UTF-8" >&2
    exit 1
  fi
fi

echo "cloud-session-setup: ready" >&2
