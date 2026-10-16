#!/usr/bin/env bash
# build-basemap.sh — build the self-hosted world basemap archive (#1786, ADR-016).
#
# Extracts zoom 0..MAXZOOM of a Protomaps v4 daily planet build into one
# local PMTiles file, verifies it, and prints the size, the sha256 and the
# object name to upload. It never writes to a bucket: the upload is an
# operator step (docs/runbooks/basemap.md).
#
# Usage:
#   scripts/basemap/build-basemap.sh <YYYYMMDD> [MAXZOOM] [OUT_DIR]
#   scripts/basemap/build-basemap.sh 20261011            # world z0-10 → ./basemap-build
#   DRY_RUN=1 scripts/basemap/build-basemap.sh 20261011 12   # size only, no download
#
# Requires the official go-pmtiles CLI (>= 1.31) on PATH, or its path in $PMTILES:
#   https://github.com/protomaps/go-pmtiles/releases
# Protomaps keeps daily builds for one week (docs.protomaps.com/basemaps/downloads).
# Free disk needed: about 1.1x the archive size (world z0-10 ≈ 3.8 GB).
#
# Measured against the 2026-10-11 build (`--dry-run`, world extent):
#   z0-6 45 MB · z0-7 189 MB · z0-8 558 MB · z0-9 1.6 GB · z0-10 3.8 GB
#   z0-11 8.0 GB · z0-12 18 GB · z0-13 36 GB · z0-14 69 GB · planet z0-15 139 GB
set -euo pipefail

BUILD="${1:?usage: build-basemap.sh <YYYYMMDD> [MAXZOOM] [OUT_DIR]}"
MAXZOOM="${2:-10}"
OUT_DIR="${3:-./basemap-build}"

if ! [[ "$BUILD" =~ ^[0-9]{8}$ ]]; then
  echo "build-basemap: BUILD must be YYYYMMDD, got '$BUILD'" >&2
  exit 2
fi
if ! [[ "$MAXZOOM" =~ ^[0-9]+$ ]] || ((MAXZOOM > 15)); then
  echo "build-basemap: MAXZOOM must be 0..15, got '$MAXZOOM'" >&2
  exit 2
fi
PMTILES="${PMTILES:-pmtiles}"
if ! command -v "$PMTILES" > /dev/null; then
  echo "build-basemap: the pmtiles CLI is not on PATH (github.com/protomaps/go-pmtiles/releases)" >&2
  exit 2
fi

SRC="https://build.protomaps.com/${BUILD}.pmtiles"
NAME="world-z0-${MAXZOOM}-${BUILD}.pmtiles"
echo "build-basemap: source ${SRC}" >&2
echo "build-basemap: $("$PMTILES" version 2>&1 | head -1)" >&2

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  "$PMTILES" extract "$SRC" "/dev/null" --maxzoom="$MAXZOOM" --dry-run 2>&1 |
    grep -E 'fetching|transferred' >&2
  exit 0
fi

mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/${NAME}"

# Network resilience (#2084). go-pmtiles 1.31.2 has no retry or resume, and
# world z0-14 reads its whole 64 GB tile section in ONE range request, so a
# single dropped connection restarts it (run 38826110491: HTTP/2
# INTERNAL_ERROR at 42 GB, then a TCP reset at 4 GB). Two layers:
# 1. extract reads through scripts/basemap/range-proxy.mjs, which fetches each
#    range in bounded segments and resumes a dropped one from its last byte
#    (BASEMAP_RANGE_PROXY=0 reads the source directly);
# 2. an outer retry: up to PMTILES_EXTRACT_ATTEMPTS runs of extract, each
#    capped at PMTILES_EXTRACT_TIMEOUT (when `timeout` exists), with the
#    partial output deleted first. extract writes the header last, so a
#    partial file is never valid input to verify or upload.
ATTEMPTS="${PMTILES_EXTRACT_ATTEMPTS:-4}"
ATTEMPT_TIMEOUT="${PMTILES_EXTRACT_TIMEOUT:-40m}"
BACKOFF="${PMTILES_EXTRACT_BACKOFF_SECONDS:-30}"
SOURCE_BASE="${BASEMAP_SOURCE_BASE:-https://build.protomaps.com}"
if ! [[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "build-basemap: PMTILES_EXTRACT_ATTEMPTS must be >= 1, got '$ATTEMPTS'" >&2
  exit 2
fi

PROXY_PID=""
PROXY_OUT="${OUT_DIR}/.range-proxy.json"
cleanup() {
  if [[ -n "$PROXY_PID" ]]; then kill "$PROXY_PID" 2> /dev/null || true; fi
  rm -f "$PROXY_OUT"
  return 0 # R13
}
trap cleanup EXIT

EXTRACT_SRC="${SOURCE_BASE}/${BUILD}.pmtiles"
if [[ "${BASEMAP_RANGE_PROXY:-1}" != "0" ]]; then
  rm -f "$PROXY_OUT"
  node "$(dirname "$0")/range-proxy.mjs" "$SOURCE_BASE" > "$PROXY_OUT" &
  PROXY_PID=$!
  for _ in $(seq 1 100); do
    if [[ -s "$PROXY_OUT" ]]; then break; fi
    if ! kill -0 "$PROXY_PID" 2> /dev/null; then break; fi
    sleep 0.1
  done
  PROXY_URL=$(sed -nE 's/.*"url":"([^"]+)".*/\1/p' "$PROXY_OUT")
  if [[ -z "$PROXY_URL" ]]; then
    echo "build-basemap: the range proxy did not start" >&2
    exit 1
  fi
  EXTRACT_SRC="${PROXY_URL}/${BUILD}.pmtiles"
  echo "build-basemap: extract reads ${SOURCE_BASE} through ${PROXY_URL}" >&2
fi

TIMEOUT_CMD=()
if command -v timeout > /dev/null; then TIMEOUT_CMD=(timeout "$ATTEMPT_TIMEOUT"); fi

n=1
while :; do
  rm -f "$OUT"
  echo "build-basemap: extract attempt ${n}/${ATTEMPTS}" >&2
  if ${TIMEOUT_CMD[@]+"${TIMEOUT_CMD[@]}"} "$PMTILES" extract "$EXTRACT_SRC" "$OUT" --maxzoom="$MAXZOOM" >&2; then
    break
  fi
  echo "build-basemap: extract attempt ${n}/${ATTEMPTS} failed" >&2
  rm -f "$OUT"
  if ((n >= ATTEMPTS)); then
    echo "build-basemap: extract failed after ${ATTEMPTS} attempts" >&2
    exit 1
  fi
  WAIT=$((BACKOFF * (1 << (n - 1))))
  echo "build-basemap: retrying in ${WAIT}s" >&2
  sleep "$WAIT"
  n=$((n + 1))
done
"$PMTILES" verify "$OUT" >&2

BYTES=$(wc -c < "$OUT" | tr -d ' ')
if command -v sha256sum > /dev/null; then
  SHA=$(sha256sum "$OUT" | cut -d' ' -f1) # Linux runner
else
  SHA=$(shasum -a 256 "$OUT" | cut -d' ' -f1) # macOS
fi
# Structured result on stdout (R4); everything else went to stderr.
printf '{"file":"%s","object":"basemap/protomaps-v4/%s","bytes":%s,"sha256":"%s"}\n' \
  "$OUT" "$NAME" "$BYTES" "$SHA"
