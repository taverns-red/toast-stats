#!/usr/bin/env bash
# sprint-runner-verify.sh — ground-truth verifiers (epic A, #22 / sprint #24).
#
# The liveness layer (sprint-runner-probes.sh / sprint-runner-liveness.sh)
# detects a *stuck or dead* session from the OUTSIDE. It does NOT stop a *live*
# session from asserting a state change that never happened — a fabricated
# "sprint shipped" sequence under tool-I/O desync. These helpers close that gap.
#
# Each assert_* does an INDEPENDENT, FRESH read of the real state and FAILS
# CLOSED: it returns 0 only when the claim is confirmed, and non-zero (with a
# reason on stderr) otherwise. A caller that wraps a ship/merge/CI claim in one
# of these is structurally unable to report success on phantom data.
#
# Contract (deliberately the INVERSE of the probes' always-return-0 idiom):
#   • return 0  — the claim is independently confirmed; echoes "OK" to stdout
#   • return 1  — the claim is NOT confirmed (fail closed); reason on stderr
#   • return 2  — bad usage (missing required argument)
# Never base a claim on a piped command whose exit code was masked — read the
# tool's own exit status directly (the desync trap these guard against).
#
# This file only DEFINES functions; sourcing it has no side effects.
# shellcheck shell=bash

# Strip one layer of surrounding double quotes. `gh --jq` emits raw scalar
# strings, but be robust to a build/version that JSON-encodes them ("OPEN") so an
# equality check like status == "completed" can't silently misfire.
_unquote() { local s="${1:-}"; s="${s#\"}"; s="${s%\"}"; printf '%s' "$s"; }

# assert_git_state <expected_commit> [remote_ref]
#   Fresh `git rev-parse HEAD` must match <expected_commit> (full sha or a
#   prefix). If <remote_ref> (e.g. origin/main) is given, the commit must also
#   be present on that ref — i.e. the push actually landed, not just a local
#   commit. Confirms a commit/push claim before it is reported.
assert_git_state() {
  local want="$1" remote_ref="${2:-}" head
  if [[ -z "$want" ]]; then
    echo "assert_git_state: no expected commit given" >&2
    return 2
  fi
  if ! head="$(git rev-parse HEAD 2>/dev/null)"; then
    echo "assert_git_state: 'git rev-parse HEAD' failed (no repo / detached?)" >&2
    return 1
  fi
  # Confirmed iff one sha is a prefix of the other (handles short vs full).
  if [[ "$head" != "$want"* && "$want" != "$head"* ]]; then
    echo "assert_git_state: HEAD $head does not match expected $want" >&2
    return 1
  fi
  if [[ -n "$remote_ref" ]]; then
    if ! git merge-base --is-ancestor "$head" "$remote_ref" 2>/dev/null; then
      echo "assert_git_state: $head is not present on $remote_ref (push not confirmed)" >&2
      return 1
    fi
  fi
  echo "OK"
  return 0
}

# assert_pr_merged <pr_number>
#   Confirms a PR is merged via the AUTHORITATIVE `mergedAt` timestamp — NOT the
#   `merged` field, which does not exist on `gh pr view --json` output and
#   silently returns empty (the classic false-read trap, CLAUDE.md Git note).
#   Re-queries ONCE before reporting not-merged, to ride out a lagged read.
assert_pr_merged() {
  local pr="$1" merged_at attempt state
  if [[ -z "$pr" ]]; then
    echo "assert_pr_merged: no PR number given" >&2
    return 2
  fi
  for attempt in 1 2; do
    merged_at="$(_unquote "$(gh pr view "$pr" --json mergedAt --jq '.mergedAt' 2>/dev/null)")"
    if [[ -n "$merged_at" && "$merged_at" != "null" ]]; then
      echo "OK"
      return 0
    fi
  done
  state="$(_unquote "$(gh pr view "$pr" --json state --jq '.state' 2>/dev/null)")"
  echo "assert_pr_merged: PR #$pr not merged (mergedAt=${merged_at:-empty}, state=${state:-unknown})" >&2
  return 1
}

# assert_ci_green <branch>
#   Confirms CI is green via a FRESH `gh run list` read of the latest run for the
#   branch — never trusting a prior buffer. The run must be completed AND have
#   concluded success; an in-progress or failed run fails closed.
assert_ci_green() {
  local ref="$1" status conclusion
  if [[ -z "$ref" ]]; then
    echo "assert_ci_green: no branch given" >&2
    return 2
  fi
  status="$(_unquote "$(gh run list --branch "$ref" --limit 1 --json status --jq '.[0].status' 2>/dev/null)")"
  if [[ "$status" != "completed" ]]; then
    echo "assert_ci_green: latest run for $ref is not completed (status=${status:-none})" >&2
    return 1
  fi
  conclusion="$(_unquote "$(gh run list --branch "$ref" --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null)")"
  if [[ "$conclusion" != "success" ]]; then
    echo "assert_ci_green: latest run for $ref concluded '${conclusion:-none}', not success" >&2
    return 1
  fi
  echo "OK"
  return 0
}

# ── Desync tripwire (#27) ─────────────────────────────────────────────────────
# Cheap guard against tool-I/O desync: the caller generates a token out-of-band,
# emits a uniquely-framed sentinel embedding it (`desync_emit`), captures the
# output through the same channel, and confirms it round-tripped intact
# (`desync_verify`). A mismatch means the channel garbled/lagged the output —
# treat it as UNTRUSTED for this tick: stop, log the desync, and don't trust any
# state assertion made through it. The framing is distinctive so a partial/
# duplicated buffer can't accidentally satisfy it.

desync_expected() { printf '__RB_SENTINEL__ %s __RB_SENTINEL__' "$1"; }

# desync_emit <token> — print the framed sentinel for <token>.
desync_emit() { desync_expected "$1"; }

# desync_verify <token> <captured> — 0 if <captured> contains the intact sentinel
# for <token>; non-zero (channel untrusted) otherwise.
desync_verify() {
  local token="$1" captured="${2:-}" want
  if [[ -z "$token" ]]; then
    echo "desync_verify: no token given" >&2
    return 2
  fi
  want="$(desync_expected "$token")"
  if [[ "$captured" == *"$want"* ]]; then
    echo "OK"
    return 0
  fi
  echo "desync_verify: sentinel for token '$token' did not round-trip — tool-I/O channel untrusted this tick" >&2
  return 1
}
