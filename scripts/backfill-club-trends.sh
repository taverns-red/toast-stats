#!/usr/bin/env bash
# backfill-club-trends.sh — Recompute club-trends-index with dense data for the program year
#
# Downloads all program-year snapshots from GCS, runs compute-analytics with
# the enrichment logic (which reads all local snapshots to build dense per-club
# membershipTrend and dcpGoalsTrend), then uploads the recomputed analytics.
#
# Usage: ./scripts/backfill-club-trends.sh [LATEST_DATE]
#   LATEST_DATE: defaults to the latest snapshot date in GCS

set -euo pipefail

GCS_BUCKET="toast-stats-data-ca"
CACHE_DIR="${CACHE_DIR:-./cache}"
DISTRICTS=(109 117 20 42 61 86)

# -------------------------------------------------------------------
# 1. Determine the latest snapshot date
# -------------------------------------------------------------------
if [ -n "${1:-}" ]; then
  LATEST_DATE="$1"
else
  echo "Discovering latest snapshot date from GCS..."
  LATEST_DATE=$(gcloud storage ls "gs://${GCS_BUCKET}/snapshots/" 2>/dev/null \
    | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' \
    | sort -r \
    | awk 'NR==1' || true)  # drain input, not head -1 (#1667)
  if [ -z "$LATEST_DATE" ]; then
    echo "ERROR: Could not discover latest snapshot date"
    exit 1
  fi
fi

echo "=== Club Trends Dense Backfill ==="
echo "Latest date: ${LATEST_DATE}"

# -------------------------------------------------------------------
# 2. Calculate program year boundaries (July 1 – June 30)
# -------------------------------------------------------------------
# macOS date -j -f (BSD) or GNU date -d
YEAR=$(echo "$LATEST_DATE" | cut -d'-' -f1)
MONTH=$(echo "$LATEST_DATE" | cut -d'-' -f2)

if [ "$MONTH" -ge 7 ]; then
  PY_START="${YEAR}-07-01"
else
  PY_START="$((YEAR - 1))-07-01"
fi

echo "Program year start: ${PY_START}"
echo ""

# -------------------------------------------------------------------
# 3. List all program-year snapshot dates with data from GCS
# -------------------------------------------------------------------
echo "📋 Step 1: Listing program-year snapshot dates from GCS..."
ALL_DATES=$(gcloud storage ls "gs://${GCS_BUCKET}/snapshots/" 2>/dev/null \
  | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' \
  | sort || true)

PY_DATES=()
while IFS= read -r d; do
  [ -z "$d" ] && continue
  if [[ "$d" > "$PY_START" || "$d" == "$PY_START" ]] && [[ "$d" < "$LATEST_DATE" || "$d" == "$LATEST_DATE" ]]; then
    PY_DATES+=("$d")
  fi
done <<< "$ALL_DATES"

echo "  Found ${#PY_DATES[@]} program-year snapshot dates"
echo "  Range: ${PY_DATES[0]} → ${PY_DATES[${#PY_DATES[@]}-1]}"
echo ""

# -------------------------------------------------------------------
# 4. Download all program-year snapshots (+ previous year for YoY)
# -------------------------------------------------------------------
echo "📥 Step 2: Downloading program-year snapshots..."
DOWNLOADED=0
SKIPPED=0
for SNAP_DATE in "${PY_DATES[@]}"; do
  mkdir -p "${CACHE_DIR}/snapshots/${SNAP_DATE}"
  for D in "${DISTRICTS[@]}"; do
    DEST="${CACHE_DIR}/snapshots/${SNAP_DATE}/district_${D}.json"
    if [ -f "$DEST" ]; then
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
    SRC="gs://${GCS_BUCKET}/snapshots/${SNAP_DATE}/district_${D}.json"
    if gcloud storage cp "$SRC" "$DEST" 2>/dev/null; then
      DOWNLOADED=$((DOWNLOADED + 1))
    fi
  done
done
echo "  Downloaded: ${DOWNLOADED}, Already local: ${SKIPPED}"

# Also grab previous year snapshot for YoY
PREV_YEAR_DATE=$(date -v-1y -j -f "%Y-%m-%d" "${LATEST_DATE}" +%Y-%m-%d 2>/dev/null || \
                 date -d "${LATEST_DATE} - 1 year" +%Y-%m-%d)
echo "  YoY previous year: ${PREV_YEAR_DATE}"
mkdir -p "${CACHE_DIR}/snapshots/${PREV_YEAR_DATE}"
for D in "${DISTRICTS[@]}"; do
  DEST="${CACHE_DIR}/snapshots/${PREV_YEAR_DATE}/district_${D}.json"
  if [ ! -f "$DEST" ]; then
    SRC="gs://${GCS_BUCKET}/snapshots/${PREV_YEAR_DATE}/district_${D}.json"
    gcloud storage cp "$SRC" "$DEST" 2>/dev/null || true
  fi
done

# Download rankings if needed
RANKINGS_DEST="${CACHE_DIR}/snapshots/${LATEST_DATE}/all-districts-rankings.json"
if [ ! -f "$RANKINGS_DEST" ]; then
  gcloud storage cp \
    "gs://${GCS_BUCKET}/snapshots/${LATEST_DATE}/all-districts-rankings.json" \
    "$RANKINGS_DEST" 2>/dev/null || echo "  ⚠ all-districts-rankings.json not found"
fi
echo ""

# -------------------------------------------------------------------
# 5. Recompute analytics for the latest date (enrichment reads all local snapshots)
# -------------------------------------------------------------------
echo "🔄 Step 3: Recomputing analytics with dense club trends..."
DISTRICT_LIST=$(IFS=,; echo "${DISTRICTS[*]}")
npx collector-cli compute-analytics \
  --date "${LATEST_DATE}" \
  --districts "${DISTRICT_LIST}" \
  --force-analytics \
  --verbose

echo ""

# -------------------------------------------------------------------
# 6. Upload recomputed analytics to GCS
# -------------------------------------------------------------------
echo "📤 Step 4: Uploading recomputed analytics to GCS..."
ANALYTICS_DIR="${CACHE_DIR}/snapshots/${LATEST_DATE}/analytics"
if [ -d "$ANALYTICS_DIR" ]; then
  gcloud storage rsync -r \
    "$ANALYTICS_DIR" \
    "gs://${GCS_BUCKET}/snapshots/${LATEST_DATE}/analytics/"
  echo "  ✓ Analytics synced to GCS"
else
  echo "  ✗ No analytics directory found at ${ANALYTICS_DIR}"
  exit 1
fi
echo ""

# -------------------------------------------------------------------
# 7. Verify dense club trends
# -------------------------------------------------------------------
echo "🔍 Step 5: Verifying club trends density..."
for D in "${DISTRICTS[@]}"; do
  CTI_FILE="${ANALYTICS_DIR}/district_${D}_club-trends-index.json"
  if [ -f "$CTI_FILE" ]; then
    # Count data points for the first club
    POINTS=$(python3 -c "
import json
with open('${CTI_FILE}') as f:
    data = json.load(f)
clubs = data.get('data', {}).get('clubs', data.get('clubs', {}))
if clubs:
    first_club = list(clubs.values())[0]
    trend = first_club.get('membershipTrend', [])
    print(len(trend))
else:
    print(0)
")
    echo "  District ${D}: ${POINTS} data points per club (was 2)"
  else
    echo "  District ${D}: ✗ club-trends-index not found"
  fi
done

echo ""
echo "✅ Backfill complete!"
echo "   The club modal should now show dense membership and DCP goal trends."
