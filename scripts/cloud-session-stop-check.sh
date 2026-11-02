#!/usr/bin/env bash
# Stop hook for Claude Code cloud sessions (#2454): warn about an unpushed
# branch. Same logic and messages as Ron's global Stop hook, which cloud
# sessions don't load. Local sessions already run the global hook, so this
# does nothing unless CLAUDE_CODE_REMOTE=true.
[[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] || exit 0

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
branch=$(git symbolic-ref --short -q HEAD) || exit 0
if ! git rev-parse --abbrev-ref "@{upstream}" >/dev/null 2>&1; then
  printf '{"systemMessage":"⚠️  git: %s has no upstream — did you forget to push?"}' "$branch"
  exit 0
fi
counts=$(git rev-list --left-right --count "HEAD...@{upstream}" 2>/dev/null) || exit 0
ahead=$(echo "$counts" | awk '{print $1}')
behind=$(echo "$counts" | awk '{print $2}')
if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
  printf '{"systemMessage":"⚠️  git: %s is %s ahead, %s behind upstream"}' "$branch" "$ahead" "$behind"
elif [ "$ahead" -gt 0 ]; then
  printf '{"systemMessage":"⚠️  git: %s has %s unpushed commit(s)"}' "$branch" "$ahead"
elif [ "$behind" -gt 0 ]; then
  printf '{"systemMessage":"⚠️  git: %s is %s commit(s) behind upstream"}' "$branch" "$behind"
fi
exit 0
