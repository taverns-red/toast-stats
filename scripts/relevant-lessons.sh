#!/usr/bin/env bash
# relevant-lessons.sh <issue-number> — resolve the MANDATORY lesson reading for a
# sprint session, and emit the catalog for the session to judge the rest from.
# Red Barkeep's three-tier taxonomy (#41/#42):
#
#   $LESSONS_DIR/rules/      — project invariants; ALWAYS loaded
#   $LESSONS_DIR/lessons/    — loaded when an operator-curated manifest names
#                              them; OTHERWISE the session judges relevance from
#                              the generated INDEX.md (emitted here). A small
#                              corpus (<= SMALL_CORPUS) is emitted whole — cheaper
#                              than judging. One newest-by-date lesson is emitted
#                              as a "recent change, be aware" floor (NOT relevance).
#   $LESSONS_DIR/incidents/  — ref-only; never auto-loaded, but IN the index so a
#                              session can pull one when an issue smells like a
#                              past incident.
#
# A manifest is a "## Relevant lessons" section in the issue body listing lesson
# filenames (one per line/bullet). The operator's curation wins; a manifested
# file that doesn't exist is a hard error (exit 3) so a sprint can't silently
# skip required context.
#
# Prints the resolved paths, one per line (de-duplicated, rules first). When the
# corpus is large it includes INDEX.md — the session reads it, judges which
# lessons are relevant to THIS sprint, reads those bodies, and logs its picks
# (see the bootstrap prompt). Selection is the session's job; this script only
# guarantees the must-reads + the catalog.
#
#   Env: LESSONS_DIR (default: tasks/lessons)
#        SMALL_CORPUS (default: 15) — at/under this many lessons, emit them all
#        ISSUE_BODY_FILE — read the issue title/labels/body from this file
#                          instead of calling gh (used by tests and offline runs)
set -euo pipefail

ISSUE="${1:?usage: relevant-lessons.sh <issue-number>}"
LESSONS_DIR="${LESSONS_DIR:-tasks/lessons}"

# Source of the issue text (manifest lives here).
if [[ -n "${ISSUE_BODY_FILE:-}" ]]; then
  body="$(cat "$ISSUE_BODY_FILE")"
else
  body="$(gh issue view "$ISSUE" --json title,labels,body \
            --jq '.title + "\n" + ([.labels[].name] | join(" ")) + "\n" + .body' 2>/dev/null || true)"
fi

emitted=" "
emit() {  # print a path once
  local f="$1"
  [[ "$emitted" == *" $f "* ]] && return 0
  printf '%s\n' "$f"
  emitted+="$f "
}

# 1 — rules/: always loaded
if [[ -d "$LESSONS_DIR/rules" ]]; then
  for f in "$LESSONS_DIR/rules"/*.md; do [[ -e "$f" ]] && emit "$f"; done
fi

# 2 — manifest: the "## Relevant lessons" section, if present. Operator-curated.
manifest="$(printf '%s\n' "$body" \
  | awk '/^##[[:space:]]+[Rr]elevant lessons/{f=1; next} /^##[[:space:]]/{f=0} f')"
missing=0
if [[ -n "${manifest//[[:space:]]/}" ]]; then
  # Resolve EVERY *.md name in the section (not just the first per line — a line
  # naming two lessons must not silently drop one; that's the exit-3 guard's job).
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    path=""
    for tier in lessons rules incidents; do
      [[ -f "$LESSONS_DIR/$tier/$name" ]] && { path="$LESSONS_DIR/$tier/$name"; break; }
    done
    if [[ -z "$path" ]]; then
      printf 'relevant-lessons: manifest lists a missing file: %s\n' "$name" >&2
      missing=1
    else
      emit "$path"
    fi
  done < <(grep -oE '[A-Za-z0-9._-]+\.md' <<<"$manifest")
fi

# 3 — discovery. The number is gone; relevance is session-judged from the index
#     (#42). Small corpus → emit all (cheaper than judging). Large corpus → emit
#     the INDEX.md catalog for the session to judge + the single newest-by-date
#     lesson as a recent-change floor.
fm() {  # read a scalar frontmatter value: fm <file> <key>
  awk -v k="$2" 'NR==1&&$0=="---"{f=1;next} f&&$0=="---"{exit} f&&index($0,k":")==1{v=$0;sub("^"k":[[:space:]]*","",v);print v;exit}' "$1"
}
SMALL_CORPUS="${SMALL_CORPUS:-15}"
if [[ -d "$LESSONS_DIR/lessons" ]]; then
  count=$(find "$LESSONS_DIR/lessons" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
  if (( count > 0 && count <= SMALL_CORPUS )); then
    # Small corpus: just read them all.
    while IFS= read -r f; do [[ -n "$f" ]] && emit "$f"; done \
      < <(find "$LESSONS_DIR/lessons" -maxdepth 1 -name '*.md' | sort)
  elif (( count > SMALL_CORPUS )); then
    # Large corpus: hand the session the catalog to judge from...
    [[ -f "$LESSONS_DIR/INDEX.md" ]] && emit "$LESSONS_DIR/INDEX.md"
    # ...plus the single newest lesson by frontmatter date (awareness floor).
    newest="$(while IFS= read -r f; do
                [[ -n "$f" ]] && printf '%s\t%s\n' "$(fm "$f" date)" "$f"
              done < <(find "$LESSONS_DIR/lessons" -maxdepth 1 -name '*.md') \
              | sort -r | head -1 | cut -f2-)"
    [[ -n "$newest" ]] && emit "$newest"
  fi
fi

# incidents/ is never auto-loaded, but it IS in INDEX.md — the session can pull a
# post-mortem when relevant.

[[ $missing -eq 0 ]] || exit 3
