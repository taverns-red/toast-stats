#!/usr/bin/env bash
# Runner toolchain probe (#1740).
#
# data-pipeline.yml, deploy.yml and scripts/pipeline/*.sh call tools that come
# from the runner image, not from a setup action: coreutils (date, sort, du,
# wc, tr, mktemp), findutils (find, xargs), jq, gzip, awk. Ubuntu 26.04 ships
# jq 1.8 and makes `coreutils` a meta package that may resolve to the Rust
# uutils implementation (packages.ubuntu.com/resolute/coreutils). This probe
# runs in PR CI on the same runner label as the pipeline, executes the exact
# command forms the pipeline depends on with known inputs, and fails on any
# output that differs from the GNU behaviour those call sites were written
# against. A runner image bump is then proven by PR CI, not by the next daily.
#
# Linux runner only: BSD date on macOS has no `-d`.
set -euo pipefail

fail=0
check() {
  # check <label> <expected> <actual>
  if [ "$2" == "$3" ]; then
    echo "ok   $1 -> $3"
  else
    echo "::error::runner-toolchain-probe: $1: expected '$2', got '$3'"
    fail=1
  fi
}

echo "--- image"
grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release || true
echo "ImageVersion=${ImageVersion:-unknown}"
echo "--- implementations"
echo "date: $(readlink -f "$(command -v date)")"
ver() { { "$@" 2>&1 || true; } | head -1; }
ver date --version
ver sort --version
ver jq --version
ver gzip --version
ver xargs --version
ver find --version
ver awk -W version
ver bash --version
dpkg-query -W -f='${Package} ${Version}\n' \
  coreutils coreutils-from-gnu coreutils-from-uutils rust-coreutils \
  gnu-coreutils 2>/dev/null || true

echo "--- date (data-pipeline YoY + rescrape loops)"
DATE=2026-10-11
check 'date -d "X - 1 year"' 2025-10-11 "$(date -d "${DATE} - 1 year" +%Y-%m-%d)"
# GNU normalises Feb 29 minus a year to Mar 1. A different answer would move
# the YoY comparison date on leap days.
check 'date -d "leap - 1 year"' 2023-03-01 "$(date -d "2024-02-29 - 1 year" +%Y-%m-%d)"
check 'date -d "X + 1 day"' 2026-11-01 "$(date -d "2026-10-31 + 1 day" "+%Y-%m-%d")"
check 'date -d "X + 1 day" (year)' 2027-01-01 "$(date -d "2026-12-31 + 1 day" "+%Y-%m-%d")"
expected_yesterday="$(date -u -d "@$(($(date -u +%s) - 86400))" +%Y-%m-%d)"
check "date -u -d '1 day ago'" "${expected_yesterday}" "$(date -u -d '1 day ago' +%Y-%m-%d)"
check 'date -u +%Y-%m-%d_%H%M%S' 1 "$(date -u +%Y-%m-%d_%H%M%S | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$')"
check 'date -u +%Y-%m-%dT%H' 1 "$(date -u +%Y-%m-%dT%H | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$')"

echo "--- text tools"
check 'sort -u' "2026-01-02 2026-03-04" "$(printf '2026-03-04\n2026-01-02\n2026-03-04\n' | sort -u | tr '\n' ' ' | sed 's/ $//')"
check "wc -l | tr -d ' '" 3 "$(printf 'a\nb\nc\n' | wc -l | tr -d ' ')"
check "tr ',' '\\n'" "61 F U" "$(echo '61,F,U' | tr ',' '\n' | tr '\n' ' ' | sed 's/ $//')"
check 'head -1 / tail -1' "a c" "$(printf 'a\nb\nc\n' | head -1) $(printf 'a\nb\nc\n' | tail -1)"

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
check 'mktemp -d' 1 "$([ -d "${work}" ] && echo 1 || echo 0)"

echo "--- findutils"
mkdir -p "${work}/t"
for i in 1 2 3; do echo "{\"n\":${i}}" >"${work}/t/${i}.json"; done
check 'find -type f | wc -l' 3 "$(find "${work}/t" -type f | wc -l | tr -d ' ')"
check 'find -print -quit' 1 "$(find "${work}/t" -type f -print -quit | wc -l | tr -d ' ')"
# shellcheck disable=SC2016 # $0/$1 are expanded by the child sh, by design
check 'xargs -0 -n 2 -P' "a:1 b:2" "$(printf 'a\0001\000b\0002\000' | xargs -0 -n 2 -P 4 sh -c 'echo "$0:$1"' | sort | tr '\n' ' ' | sed 's/ $//')"
check 'xargs -P -I {}' "1 2 3" "$(printf '1\n2\n3\n' | xargs -P 16 -I {} bash -c 'echo {}' | sort | tr '\n' ' ' | sed 's/ $//')"
check "du -sk | awk printf" 1 "$(du -sk "${work}/t" | awk '{ printf "%.1f", $1 / 1024 }' | grep -cE '^[0-9]+\.[0-9]$')"

echo "--- gzip"
printf '{"a":1}' | gzip -c >"${work}/x.gz"
check 'gzip -t' ok "$(gzip -t "${work}/x.gz" && echo ok)"
check 'gzip -dc' '{"a":1}' "$(gzip -dc "${work}/x.gz")"

echo "--- jq (data-pipeline summaries)"
printf '%s\n' \
  '{"timeSeries":{"written":2,"failed":0},"clubTrends":{"written":5,"failed":1}}' \
  '{"timeSeries":{"written":3,"failed":1}}' >"${work}/c.jsonl"
check 'jq -rs -f compute-counters.jq' \
  "- **Time-series points**: 5 written, 1 failed|- **Club-trends stores**: 5 written, 1 failed|- **Club-race store**: 0 written, 0 failed" \
  "$(jq -rs -f "$(dirname "$0")/compute-counters.jq" "${work}/c.jsonl" | paste -sd'|' -)"
check "jq '.[0].number // empty'" 42 "$(echo '[{"number":42}]' | jq '.[0].number // empty')"
check "jq '.[0].number // empty' (none)" "" "$(echo '[]' | jq '.[0].number // empty')"
check "jq -r '.dates[]?'" "a b" "$(echo '{"dates":["a","b"]}' | jq -r '.dates[]?' | tr '\n' ' ' | sed 's/ $//')"
check "jq -r '.dates[]?' (missing)" "" "$(echo '{}' | jq -r '.dates[]?')"
check 'jq -c .' '{"a":[1,2]}' "$(echo '{ "a": [1, 2] }' | jq -c .)"

if [ "${fail}" -ne 0 ]; then
  echo "::error::runner-toolchain-probe: the runner image changed a command form the pipeline depends on (#1740)"
  exit 1
fi
echo "runner-toolchain-probe: all command forms match"
