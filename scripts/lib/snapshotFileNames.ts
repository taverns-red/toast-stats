/**
 * Canonical district-snapshot file naming (#1428).
 *
 * ONE place decides what `district_<id>.json` means. Four call sites used to
 * carry their own copy of the assumption — three loose prefix matches and one
 * hard gate — and every copy also matched the daily-reports sidecar
 * `snapshots/{date}/district_{id}_reports.json` that
 * `collector-cli fetch-daily-reports` writes into the SAME directory:
 *
 *   /^district_(.+)\.json$/.exec('district_61_reports.json')[1] === '61_reports'
 *
 * Consequences: the publish gate (scripts/validate-snapshots.ts) parsed a
 * `DistrictReportsDataset` against `PerDistrictDataSchema` and failed the
 * whole daily run; the snapshot index gained a phantom district `61_reports`
 * (`\w` includes `_`); the divisions/areas builder logged a misleading
 * "Skipping corrupt file" every run.
 *
 * The fix is the PATTERN, not a `_reports` special case: a district id may
 * not contain `_` (or `.`), so ANY future sidecar — `district_61_foo.json` —
 * is excluded too.
 *
 * The id is NOT numeric-only: `F` and `U` exist, and the 2026 reformation
 * assigned ids in the 201–231 range. `[^_.]+` keeps all of them.
 *
 * Pure string logic, no I/O — callers read the files.
 */

/** District id: one or more chars, none of them `_` or `.`. */
const DISTRICT_ID = '[^_.]+'

/** Base file name of a per-district snapshot, e.g. `district_61.json`. */
export const DISTRICT_SNAPSHOT_FILE_PATTERN = new RegExp(
  `^district_(${DISTRICT_ID})\\.json$`
)

/** GCS object name, e.g. `snapshots/2026-08-20/district_61.json`. */
export const DISTRICT_SNAPSHOT_OBJECT_PATTERN = new RegExp(
  `^snapshots/(\\d{4}-\\d{2}-\\d{2})/district_(${DISTRICT_ID})\\.json$`
)

/**
 * True for a per-district snapshot file name — and ONLY that. Sidecars
 * (`district_61_reports.json`) and non-district files (`metadata.json`) are
 * excluded.
 */
export function isDistrictSnapshotFile(fileName: string): boolean {
  return DISTRICT_SNAPSHOT_FILE_PATTERN.test(fileName)
}

/** District id from a snapshot file name, or null when it isn't one. */
export function districtIdFromSnapshotFileName(
  fileName: string
): string | null {
  return DISTRICT_SNAPSHOT_FILE_PATTERN.exec(fileName)?.[1] ?? null
}

/** A snapshot object name resolved to its date + district. */
export interface DistrictSnapshotObject {
  snapshotDate: string
  districtId: string
}

/**
 * Parse a `snapshots/{date}/district_{id}.json` object name. Returns null for
 * anything else — other prefixes, sidecars, config objects.
 */
export function parseDistrictSnapshotObjectName(
  objectName: string
): DistrictSnapshotObject | null {
  const match = DISTRICT_SNAPSHOT_OBJECT_PATTERN.exec(objectName)
  if (!match) return null
  return { snapshotDate: match[1]!, districtId: match[2]! }
}

/** districtId → sorted unique snapshot dates, plus the files that fed it. */
export interface DistrictSnapshotDateIndex {
  districts: Record<string, string[]>
  /** Number of object names that parsed as district snapshots. */
  fileCount: number
}

/**
 * Aggregate snapshot object names into the `district-snapshot-index.json`
 * shape the frontend fetches. Non-matching names — including
 * `district_{id}_reports.json` — contribute nothing, so no phantom
 * `61_reports` district can reach the index.
 */
export function indexDistrictSnapshotObjects(
  objectNames: Iterable<string>
): DistrictSnapshotDateIndex {
  const dates: Record<string, Set<string>> = {}
  let fileCount = 0

  for (const name of objectNames) {
    const parsed = parseDistrictSnapshotObjectName(name)
    if (!parsed) continue
    const existing = dates[parsed.districtId] ?? new Set<string>()
    existing.add(parsed.snapshotDate)
    dates[parsed.districtId] = existing
    fileCount++
  }

  const districts: Record<string, string[]> = {}
  for (const [districtId, set] of Object.entries(dates)) {
    districts[districtId] = [...set].sort()
  }

  return { districts, fileCount }
}
