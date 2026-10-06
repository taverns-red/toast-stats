#!/usr/bin/env bash
# =============================================================================
# Preflight: does the Firebase Hosting site behind a deploy target exist? (#1585)
# =============================================================================
#
# From 2026-10-15 Firebase no longer creates a default Hosting site for new
# projects, and a deploy into a project without its site fails with a generic
# `404 Site Not Found`. deploy.yml and pr-preview.yml run this first so that
# case fails fast with an actionable error instead.
#
# The site id is resolved from .firebaserc (targets.<project>.hosting.<target>)
# so the check follows the target mapping rather than a hard-coded id.
#
# Outcomes:
#   site exists                → exit 0
#   site definitely missing    → ::error::, exit 1
#   no mapping in .firebaserc  → ::error::, exit 1
#   any other lookup error     → ::warning::, exit 0 (the deploy step surfaces
#                                the real error; this check adds no new failure)
#
# It never creates a site: provisioning stays an explicit operator step
# (scripts/setup-hosting-sites.sh, #1584).
#
# Usage: PROJECT=<project-id> scripts/check-hosting-site.sh <target>
# Env:   FIREBASERC — path to .firebaserc (default: repo root)
# =============================================================================

set -euo pipefail

TARGET="${1:?usage: PROJECT=<project-id> $0 <target>}"
PROJECT="${PROJECT:?PROJECT must be set to the Firebase project id}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIREBASERC="${FIREBASERC:-${REPO_ROOT}/.firebaserc}"
FIX="Provision it with scripts/setup-hosting-sites.sh (see docs/runbooks/new-environment.md)."

SITE="$(jq -r --arg p "$PROJECT" --arg t "$TARGET" \
  '.targets[$p].hosting[$t][0] // empty' "$FIREBASERC")"
if [[ -z "$SITE" ]]; then
  echo "::error::No Firebase Hosting site is mapped to target '$TARGET' for project '$PROJECT' in .firebaserc. $FIX"
  exit 1
fi

if out="$(firebase hosting:sites:get "$SITE" --project "$PROJECT" --non-interactive 2>&1)"; then
  echo "Firebase Hosting site '$SITE' (target '$TARGET') exists in project '$PROJECT'."
  exit 0
fi

if grep -q 'could not find site' <<<"$out"; then
  echo "::error::Firebase Hosting site '$SITE' not found in project '$PROJECT'. New projects no longer get a default site (Firebase change, 2026-10-15). $FIX"
  exit 1
fi

echo "$out"
echo "::warning::Could not verify Firebase Hosting site '$SITE' in project '$PROJECT'; continuing so the deploy step reports the underlying error."
exit 0
