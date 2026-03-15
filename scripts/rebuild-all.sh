#!/usr/bin/env bash
# rebuild-all.sh — Transform all raw CSVs → snapshots → analytics
#
# Runs the full local pipeline over every date found in cache/raw-csv/.
# After running, use `gsutil -m rsync -r ./cache gs://toast-stats-data/` to sync.
#
# Usage:
#   ./scripts/rebuild-all.sh              # all dates
#   ./scripts/rebuild-all.sh --since 2025-01-01  # dates >= 2025-01-01
#   ./scripts/rebuild-all.sh --dry-run    # just list dates, don't process

set -euo pipefail

CACHE_DIR="${CACHE_DIR:-./cache}"
RAW_CSV_DIR="$CACHE_DIR/raw-csv"
CLI_DIR="packages/collector-cli"
SINCE=""
DRY_RUN=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --since) SINCE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --verbose|-v) VERBOSE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Discover all dates from raw-csv directory
if [[ ! -d "$RAW_CSV_DIR" ]]; then
  echo "❌ No raw-csv directory found at $RAW_CSV_DIR"
  exit 1
fi

DATES=()
for dir in "$RAW_CSV_DIR"/*/; do
  date=$(basename "$dir")
  # Filter by --since if provided
  if [[ -n "$SINCE" && "$date" < "$SINCE" ]]; then
    continue
  fi
  DATES+=("$date")
done

# Sort dates chronologically
IFS=$'\n' DATES=($(sort <<<"${DATES[*]}")); unset IFS

echo "📋 Found ${#DATES[@]} dates to process"
if [[ ${#DATES[@]} -eq 0 ]]; then
  echo "Nothing to do."
  exit 0
fi

echo "   First: ${DATES[0]}"
echo "   Last:  ${DATES[${#DATES[@]}-1]}"
echo ""

if $DRY_RUN; then
  echo "🔍 Dry run — dates that would be processed:"
  printf '  %s\n' "${DATES[@]}"
  exit 0
fi

# Phase 1: Transform raw CSVs → snapshots
echo "═══════════════════════════════════════════"
echo "📦 Phase 1: Transform (raw CSV → snapshots)"
echo "═══════════════════════════════════════════"
TRANSFORM_OK=0
TRANSFORM_FAIL=0



echo ""
echo "  ✅ Transformed: $TRANSFORM_OK  ⚠️ Failed: $TRANSFORM_FAIL"
echo ""

# Phase 2: Compute analytics
echo "═══════════════════════════════════════════"
echo "📊 Phase 2: Compute Analytics"
echo "═══════════════════════════════════════════"
ANALYTICS_OK=0
ANALYTICS_FAIL=0

for i in "${!DATES[@]}"; do
  date="${DATES[$i]}"
  n=$((i + 1))
  echo -n "  [$n/${#DATES[@]}] $date ... "

  # Clean tsx temp files every 100 dates to prevent ENOSPC
  if (( n % 100 == 0 )); then
    find /var/folders -maxdepth 4 -type d -name 'tsx-*' -exec rm -rf {} + 2>/dev/null || true
  fi

  VERBOSE_FLAG=""
  if $VERBOSE; then VERBOSE_FLAG="--verbose"; fi

  if output=$(npx tsx src/index.ts compute-analytics --date "$date" $VERBOSE_FLAG 2>&1); then
    echo "✓"
    ((ANALYTICS_OK++))
  else
    echo "⚠️  failed"
    ((ANALYTICS_FAIL++))
    if $VERBOSE; then echo "$output" | tail -5; fi
  fi
done

echo ""
echo "  ✅ Analytics: $ANALYTICS_OK  ⚠️ Failed: $ANALYTICS_FAIL"
echo ""

# Summary
echo "═══════════════════════════════════════════"
echo "✅ Pipeline complete"
echo "═══════════════════════════════════════════"
echo "  Dates processed: ${#DATES[@]}"
echo "  Transform:  $TRANSFORM_OK ok, $TRANSFORM_FAIL failed"
echo "  Analytics:  $ANALYTICS_OK ok, $ANALYTICS_FAIL failed"
echo ""
echo "Next step — sync to GCS:"
echo "  gsutil -m rsync -r -d $CACHE_DIR/snapshots gs://toast-stats-data/snapshots"
