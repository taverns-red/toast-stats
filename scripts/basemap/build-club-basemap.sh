#!/usr/bin/env bash
# build-club-basemap.sh — world basemap plus street-level detail near clubs
# (#2084, ADR-016 follow-up).
#
# Builds one PMTiles archive from a Protomaps v4 daily build:
#   1. world z0..WORLD_MAXZOOM            (scripts/basemap/build-basemap.sh)
#   2. z(WORLD_MAXZOOM+1)..CLUB_MAXZOOM   over REGION, a GeoJSON
#      FeatureCollection of buffered club boxes
#      (scripts/build-club-regions.ts)
#   3. `pmtiles merge` of the two. The inputs are disjoint by zoom, which
#      merge requires; it copies the header centre and metadata from the
#      first input (the world file).
# Then `pmtiles verify`, and the size, sha256 and object name on stdout. It
# never writes to a bucket: the upload is the workflow's job
# (.github/workflows/basemap-build.yml, docs/runbooks/basemap.md).
#
# Usage:
#   scripts/basemap/build-club-basemap.sh <YYYYMMDD> <REGION.geojson> [WORLD_MAXZOOM] [OUT_DIR]
#   DRY_RUN=1 scripts/basemap/build-club-basemap.sh 20261015 regions.geojson
#     → both extract sizes from the CLI's own --dry-run, nothing downloaded
#
# Measured 2026-10-15 (build 20261015, 94 districts, 14,145 geocoded clubs):
#   world z0-10 3.8 GB · clubs z11-14, 8 km buffer (1,984 boxes) 7.0 GB
#   · clubs z11-14, 5 km buffer (2,363 boxes) 5.3 GB
# Free disk needed: about the world + clubs + merged sizes, plus slack.
set -euo pipefail

BUILD="${1:?usage: build-club-basemap.sh <YYYYMMDD> <REGION.geojson> [WORLD_MAXZOOM] [OUT_DIR]}"
REGION="${2:?usage: build-club-basemap.sh <YYYYMMDD> <REGION.geojson> [WORLD_MAXZOOM] [OUT_DIR]}"
WORLD_MAXZOOM="${3:-10}"
OUT_DIR="${4:-./basemap-build}"
CLUB_MAXZOOM="${CLUB_MAXZOOM:-14}" # override only for a tiny local test

if ! [[ "$BUILD" =~ ^[0-9]{8}$ ]]; then
  echo "build-club-basemap: BUILD must be YYYYMMDD, got '$BUILD'" >&2
  exit 2
fi
if ! [[ "$WORLD_MAXZOOM" =~ ^[0-9]+$ ]] || ((WORLD_MAXZOOM >= CLUB_MAXZOOM)); then
  echo "build-club-basemap: WORLD_MAXZOOM must be 0..$((CLUB_MAXZOOM - 1)), got '$WORLD_MAXZOOM'" >&2
  exit 2
fi
if ! [[ -s "$REGION" ]]; then
  echo "build-club-basemap: region file '$REGION' is missing or empty" >&2
  exit 2
fi
PMTILES="${PMTILES:-pmtiles}"
if ! command -v "$PMTILES" > /dev/null; then
  echo "build-club-basemap: the pmtiles CLI is not on PATH (github.com/protomaps/go-pmtiles/releases)" >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="https://build.protomaps.com/${BUILD}.pmtiles"
CLUB_MINZOOM=$((WORLD_MAXZOOM + 1))
NAME="world-z0-${WORLD_MAXZOOM}-clubs-z${CLUB_MAXZOOM}-${BUILD}.pmtiles"
echo "build-club-basemap: source ${SRC}, region ${REGION}" >&2

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "build-club-basemap: world z0-${WORLD_MAXZOOM}" >&2
  DRY_RUN=1 "$HERE/build-basemap.sh" "$BUILD" "$WORLD_MAXZOOM"
  echo "build-club-basemap: clubs z${CLUB_MINZOOM}-${CLUB_MAXZOOM}" >&2
  "$PMTILES" extract "$SRC" "/dev/null" --region="$REGION" \
    --minzoom="$CLUB_MINZOOM" --maxzoom="$CLUB_MAXZOOM" --dry-run 2>&1 |
    grep -E 'Region tiles|fetching|transferred' >&2
  exit 0
fi

mkdir -p "$OUT_DIR"
WORLD_JSON=$("$HERE/build-basemap.sh" "$BUILD" "$WORLD_MAXZOOM" "$OUT_DIR")
WORLD_FILE=$(echo "$WORLD_JSON" | sed -E 's/.*"file":"([^"]+)".*/\1/')
CLUBS_FILE="${OUT_DIR}/clubs-z${CLUB_MINZOOM}-${CLUB_MAXZOOM}-${BUILD}.pmtiles"
"$PMTILES" extract "$SRC" "$CLUBS_FILE" --region="$REGION" \
  --minzoom="$CLUB_MINZOOM" --maxzoom="$CLUB_MAXZOOM" >&2
"$PMTILES" verify "$CLUBS_FILE" >&2

OUT="${OUT_DIR}/${NAME}"
# World first: merge copies the header centre and metadata from input 1.
"$PMTILES" merge "$WORLD_FILE" "$CLUBS_FILE" "$OUT" >&2
"$PMTILES" verify "$OUT" >&2
rm -f "$WORLD_FILE" "$CLUBS_FILE"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
if command -v sha256sum > /dev/null; then
  SHA=$(sha256sum "$OUT" | cut -d' ' -f1) # Linux runner
else
  SHA=$(shasum -a 256 "$OUT" | cut -d' ' -f1) # macOS
fi
# Structured result on stdout (R4); everything else went to stderr.
printf '{"file":"%s","object":"basemap/protomaps-v4/%s","bytes":%s,"sha256":"%s"}\n' \
  "$OUT" "$NAME" "$BYTES" "$SHA"
