/**
 * config/district-snapshot-index.json builders (#309, #1279, #1428; moved
 * out of inline `node -e` by #1743, plan P3-3).
 *
 * Two paths, as in the workflow's "Update district-snapshot-index" step:
 * - snapshotIndexFromListing: rebuild/prune/rescrape regenerate the index
 *   from a `gcloud storage ls snapshots/* /district_*.json` listing, so it
 *   lists only dates whose district files still exist;
 * - mergeSnapshotIndex: daily adds today's snapshot date to the existing
 *   index for each scraped district.
 *
 * Ported verbatim; __tests__/goldenParity.test.ts pins the bytes against the
 * original inline code.
 */

export interface BuiltIndex {
  json: string
  /** The summary line the inline script printed. */
  summary: string
}

type Districts = Record<string, string[]>

/**
 * `district_(\w+)` also matches an underscore, so without the
 * /^[A-Z0-9]+$/i guard the district_61_reports.json sidecar enters the index
 * as a phantom district "61_reports" (#1428). Same rule as
 * DISTRICT_SNAPSHOT_OBJECT_PATTERN in shared-contracts'
 * src/naming/snapshotFileNames.ts. Do not drop the guard.
 */
const DISTRICT_OBJECT = /snapshots\/(\d{4}-\d{2}-\d{2})\/district_(\w+)\.json$/
const DISTRICT_ID = /^[A-Z0-9]+$/i
const SNAPSHOT_DATE = /snapshots\/(\d{4}-\d{2}-\d{2})\//

export function snapshotIndexFromListing(
  listingText: string,
  generatedAt: string
): BuiltIndex {
  const lines = listingText.trim().split('\n').filter(Boolean)
  const index: Districts = {}
  for (const line of lines) {
    const match = line.match(DISTRICT_OBJECT)
    if (match && match[1] && match[2] && DISTRICT_ID.test(match[2])) {
      const [, date, id] = match
      if (!index[id]) index[id] = []
      if (!index[id].includes(date)) index[id].push(date)
    }
  }
  for (const id of Object.keys(index)) index[id].sort()
  const dates = [
    ...new Set(lines.map(l => l.match(SNAPSHOT_DATE)?.[1]).filter(Boolean)),
  ]
  const out = { generatedAt, districts: index }
  return {
    json: JSON.stringify(out, null, 2),
    summary:
      'Generated snapshot index: ' +
      Object.keys(index).length +
      ' districts, ' +
      dates.length +
      ' dates',
  }
}

/**
 * Merge `date` into the existing index for every id in the comma-separated
 * `districtList`. Accepts the legacy flat format (`{ "61": [...] }`) and
 * always writes the nested one. Uses the snapshot date after the
 * closing-period remap, not the raw scrape date (#309) — the caller passes it.
 */
export function mergeSnapshotIndex(
  existingText: string,
  date: string,
  districtList: string,
  generatedAt: string
): BuiltIndex {
  const raw = JSON.parse(existingText)
  // Normalize: old flat format → new nested format
  const districts: Districts =
    raw.districts &&
    typeof raw.districts === 'object' &&
    !Array.isArray(raw.districts)
      ? raw.districts
      : raw
  for (const id of districtList.split(',').map(d => d.trim())) {
    const dateSet = new Set(districts[id] || [])
    dateSet.add(date)
    districts[id] = [...dateSet].sort()
  }
  // Always write new nested format
  const out = { generatedAt, districts }
  return {
    json: JSON.stringify(out, null, 2),
    summary:
      'Updated index for ' +
      Object.keys(districts).length +
      ' districts with date ' +
      date,
  }
}
