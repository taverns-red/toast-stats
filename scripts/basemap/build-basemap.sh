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
"$PMTILES" extract "$SRC" "$OUT" --maxzoom="$MAXZOOM" >&2
"$PMTILES" verify "$OUT" >&2

BYTES=$(wc -c < "$OUT" | tr -d ' ')
SHA=$(shasum -a 256 "$OUT" | cut -d' ' -f1)
# Structured result on stdout (R4); everything else went to stderr.
printf '{"file":"%s","object":"basemap/protomaps-v4/%s","bytes":%s,"sha256":"%s"}\n' \
  "$OUT" "$NAME" "$BYTES" "$SHA"
