/**
 * Global divisions/areas index builder (#1134, epic #1101).
 *
 * The daily Data Pipeline publishes config/divisions-areas-index.json — the
 * divisions/areas mirror of config/club-index.json — so omni-search (epic
 * #1101 Sprint 2) can resolve "District 61 Division C" / "Area 23" queries
 * to scoped routes without fetching every per-district snapshot.
 *
 * Shape note: areaIds are NOT district-unique. Many districts number areas
 * 01..NN within each division (live 2026-06-09: 1,094 cross-division areaId
 * collisions), so an area is identified by the (districtId, divisionId,
 * areaId) triple — areas nest under their division. Display names are not
 * carried: live data derives them as `Division {id}` / `Area {id}` with zero
 * deviations across all 128 districts, and the scoped routes
 * (/district/:districtId/division/:divId[/area/:areaId]) need only ids.
 *
 * Pure data-in/data-out (Lesson 107 pattern): the workflow step is thin glue
 * around scripts/build-divisions-areas-index.ts.
 */

export interface DivisionsAreasIndex {
  /** ISO timestamp the index was generated at. */
  generatedAt: string
  /** Snapshot date (YYYY-MM-DD) the index was built from. */
  snapshotDate: string
  /** Total division count across all districts. */
  totalDivisions: number
  /** Total area count across all districts. */
  totalAreas: number
  /** districtId → divisionId → sorted areaIds in that division. */
  districts: Record<string, Record<string, string[]>>
}

/** The two fields the index reads from a division/area entry. */
type IdRecord = { divisionId?: unknown; areaId?: unknown }

/**
 * Parse one district_*.json file's raw contents. Returns null for corrupt
 * JSON so the runner can skip the file (same policy as the club-index step).
 */
export function parseDistrictFile(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Build the global divisions/areas index from parsed district_*.json
 * payloads. Accepts both the collector wrapper ({ data: {...} }) and a bare
 * DistrictStatisticsFile. Payloads without a string districtId are skipped;
 * malformed division/area entries contribute nothing. Output is
 * permutation-invariant: keys are inserted sorted (JS then hoists
 * integer-like keys, deterministically) and area lists are sorted, so
 * successive daily uploads diff cleanly regardless of input file order.
 */
export function buildDivisionsAreasIndex(
  files: ReadonlyArray<unknown>,
  snapshotDate: string,
  generatedAt: string
): DivisionsAreasIndex {
  // districtId → divisionId → Set<areaId>
  const collected = new Map<string, Map<string, Set<string>>>()

  for (const file of files) {
    const payload = unwrap(file)
    if (payload === null) continue
    const districtId = stringField(payload, 'districtId')
    if (districtId === null) continue

    const divisions =
      collected.get(districtId) ?? new Map<string, Set<string>>()
    collected.set(districtId, divisions)

    for (const entry of recordArray(payload, 'divisions')) {
      const divisionId = idOf(entry, 'divisionId')
      if (divisionId === null) continue
      if (!divisions.has(divisionId)) divisions.set(divisionId, new Set())
    }

    // areas[] is the source of truth for membership: an area whose division
    // is missing from divisions[] still creates that division's key.
    for (const entry of recordArray(payload, 'areas')) {
      const divisionId = idOf(entry, 'divisionId')
      const areaId = idOf(entry, 'areaId')
      if (divisionId === null || areaId === null) continue
      const areas = divisions.get(divisionId) ?? new Set<string>()
      divisions.set(divisionId, areas)
      areas.add(areaId)
    }
  }

  const districts: DivisionsAreasIndex['districts'] = {}
  let totalDivisions = 0
  let totalAreas = 0
  for (const districtId of [...collected.keys()].sort()) {
    const divisions: Record<string, string[]> = {}
    const divisionMap = collected.get(districtId)!
    for (const divisionId of [...divisionMap.keys()].sort()) {
      const areas = [...divisionMap.get(divisionId)!].sort()
      divisions[divisionId] = areas
      totalDivisions++
      totalAreas += areas.length
    }
    districts[districtId] = divisions
  }

  return { generatedAt, snapshotDate, totalDivisions, totalAreas, districts }
}

/** Unwrap the collector envelope ({ data: {...} }) or pass a bare payload. */
function unwrap(file: unknown): Record<string, unknown> | null {
  if (typeof file !== 'object' || file === null) return null
  const obj = file as Record<string, unknown>
  const data = obj['data']
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>
  }
  return obj
}

function stringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function recordArray(obj: Record<string, unknown>, key: string): IdRecord[] {
  const value = obj[key]
  return Array.isArray(value) ? (value as IdRecord[]) : []
}

function idOf(entry: IdRecord, key: keyof IdRecord): string | null {
  if (typeof entry !== 'object' || entry === null) return null
  const value = entry[key]
  return typeof value === 'string' && value !== '' ? value : null
}
