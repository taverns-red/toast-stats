#!/usr/bin/env bash
# =============================================================================
# Firebase Hosting site provisioning (#1584)
# =============================================================================
#
# From 2026-10-15 Firebase no longer creates a default Hosting site when a
# project is created (or Firebase is added to a GCP project). A deploy into a
# project whose site is missing fails with `404 Site Not Found`. This script
# makes site creation explicit and repeatable: for every hosting deploy target
# declared in .firebaserc it
#
#   1. checks the site exists   (firebase hosting:sites:get)
#   2. creates it only if not   (firebase hosting:sites:create)
#   3. maps the deploy target   (firebase target:apply — local .firebaserc only)
#
# Running it again is a no-op. Only a definite "could not find site" creates a
# site; any other lookup error (auth, permissions, wrong project) aborts.
#
# Site ids are globally unique across Firebase, so a NEW project cannot reuse
# the current ids. Pass one --site per target for a new project; the default
# site id is usually the project id, but Firebase picks another if that
# subdomain is taken — check with `firebase hosting:sites:list` if unsure.
#
# Usage:
#   scripts/setup-hosting-sites.sh [--project <id>] [--site <target>=<siteId>]... [--dry-run]
#
#   --project   Firebase project id (default: .firebaserc projects.default)
#   --site      site id for a deploy target (overrides .firebaserc)
#   --dry-run   report what would be created/applied; change nothing
#
# Env: FIREBASERC — path to .firebaserc (default: repo root). Requires jq and
# an authenticated firebase-tools (`firebase login` or ADC).
#
# See docs/runbooks/new-environment.md for where this sits in a rebuild.
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIREBASERC="${FIREBASERC:-${REPO_ROOT}/.firebaserc}"

PROJECT=""
DRY_RUN=0
OVERRIDES=()

usage() {
  sed -n '24,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="${2:?--project needs a value}"
      shift 2
      ;;
    --site)
      [[ "${2:-}" == *=* ]] || {
        echo "--site expects <target>=<siteId>" >&2
        exit 2
      }
      OVERRIDES+=("$2")
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

command -v jq >/dev/null || {
  echo "jq is required" >&2
  exit 1
}
command -v firebase >/dev/null || {
  echo "firebase-tools is required (npm install -g firebase-tools)" >&2
  exit 1
}
[[ -f "$FIREBASERC" ]] || {
  echo "No .firebaserc at $FIREBASERC" >&2
  exit 1
}

TEMPLATE_PROJECT="$(jq -r '.projects.default // empty' "$FIREBASERC")"
[[ -n "$TEMPLATE_PROJECT" ]] || {
  echo ".firebaserc has no projects.default" >&2
  exit 1
}
PROJECT="${PROJECT:-$TEMPLATE_PROJECT}"

# Target names come from the default project's mapping — the set every
# environment must provide (production, staging, ...).
TARGETS=()
while IFS= read -r t; do
  [[ -n "$t" ]] && TARGETS+=("$t")
done < <(jq -r --arg p "$TEMPLATE_PROJECT" \
  '.targets[$p].hosting // {} | keys[]' "$FIREBASERC")
[[ ${#TARGETS[@]} -gt 0 ]] || {
  echo "No hosting targets for $TEMPLATE_PROJECT in $FIREBASERC" >&2
  exit 1
}

override_for() {
  local target="$1" kv
  for kv in ${OVERRIDES[@]+"${OVERRIDES[@]}"}; do
    if [[ "${kv%%=*}" == "$target" ]]; then
      echo "${kv#*=}"
      return 0
    fi
  done
  return 0
}

mapped_sites() {
  jq -r --arg p "$PROJECT" --arg t "$1" \
    '.targets[$p].hosting[$t] // [] | .[]' "$FIREBASERC"
}

# ── Resolve a site id for every target before touching anything ──────────
SITES=()
MISSING=()
for target in "${TARGETS[@]}"; do
  site="$(override_for "$target")"
  current="$(mapped_sites "$target" | paste -sd ' ' -)"
  if [[ -z "$site" ]]; then
    if [[ -n "$current" && "$current" != *" "* ]]; then
      site="$current"
    else
      MISSING+=("$target")
      continue
    fi
  fi
  if [[ -n "$current" && "$current" != "$site" ]]; then
    echo "Target '$target' in project '$PROJECT' is already mapped to '$current', not '$site'." >&2
    echo "Clear it first: firebase target:clear hosting $target --project $PROJECT" >&2
    exit 1
  fi
  SITES+=("$target=$site")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "No site id for target(s) ${MISSING[*]} in project '$PROJECT'." >&2
  echo "Site ids are globally unique — pass one per target, e.g.:" >&2
  for target in "${MISSING[@]}"; do
    echo "  --site ${target}=<siteId>" >&2
  done
  exit 2
fi

echo "Project: $PROJECT$([[ $DRY_RUN -eq 1 ]] && echo ' (dry run)')"

# ── Ensure each site exists, then its target mapping ──────────────────────
for entry in "${SITES[@]}"; do
  target="${entry%%=*}"
  site="${entry#*=}"

  if out="$(firebase hosting:sites:get "$site" --project "$PROJECT" --non-interactive 2>&1)"; then
    echo "✓ site $site exists (target $target)"
  elif grep -q 'could not find site' <<<"$out"; then
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "→ would create site $site (target $target)"
    else
      echo "→ creating site $site (target $target)"
      firebase hosting:sites:create "$site" --project "$PROJECT" --non-interactive
    fi
  else
    echo "Could not look up site '$site' in project '$PROJECT':" >&2
    echo "$out" >&2
    exit 1
  fi

  if [[ -z "$(mapped_sites "$target")" ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "→ would apply target $target → $site in $(basename "$FIREBASERC")"
    else
      echo "→ applying target $target → $site (commit the .firebaserc change)"
      (cd "$(dirname "$FIREBASERC")" &&
        firebase target:apply hosting "$target" "$site" --project "$PROJECT")
    fi
  else
    echo "✓ target $target → $site already in $(basename "$FIREBASERC")"
  fi
done

echo "Done."
