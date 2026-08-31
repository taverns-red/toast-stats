/**
 * Global club → district index builder (#1469, originally #320).
 *
 * The daily Data Pipeline publishes config/club-index.json so a club that
 * moved districts in the 2026 reformation still resolves from its
 * old-district URL (#1441/#1445) instead of rendering "Club Not Found".
 *
 * This module exists because the generator used to be an inline `node -e`
 * block in .github/workflows/data-pipeline.yml — untestable, and carrying a
 * hand copy of normalizeClubId because "inline JS in YAML cannot import the
 * shared matcher". It shipped an index covering 2 of 94 districts (345 clubs
 * of ~14,355): `gsutil cp -I` silently consumed only the first two of its
 * stdin source URLs and exited 0, while the step discarded stderr with
 * `2>/dev/null` and the exit code with `|| true`. Nothing failed. The index
 * was simply wrong, and `Clubs indexed: 345` read as normal in every summary.
 *
 * Pure data-in/data-out (Lesson 107 pattern): the workflow step is thin glue
 * around scripts/build-club-index.ts. normalizeClubId is imported, not
 * copied — this is the ninth identity site #1440 unified.
 */

import { normalizeClubId } from '@taverns-red/shared-contracts'

/** One club-index entry: where this club currently lives. */
export interface ClubIndexEntry {
  districtId: string
  clubName: string
}

export interface ClubIndex {
  /** ISO timestamp the index was generated at. */
  generatedAt: string
  /** Snapshot date (YYYY-MM-DD) the index was built from. */
  snapshotDate: string
  /** Total clubs indexed across all districts. */
  totalClubs: number
  /** Canonical club id → entry. */
  clubs: Record<string, ClubIndexEntry>
}

/**
 * Parse one district_*.json file's raw contents. Returns null for corrupt
 * JSON so the runner can skip the file (same policy as the divisions/areas
 * index).
 */
export function parseDistrictFile(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Build the global club index from parsed district_*.json payloads. Accepts
 * both the collector wrapper ({ data: {...} }) and a bare
 * DistrictStatisticsFile. Payloads without a string districtId are skipped.
 *
 * Output is permutation-invariant: club keys are inserted sorted, so
 * successive daily uploads diff cleanly regardless of input file order.
 */
export function buildClubIndex(
  files: ReadonlyArray<unknown>,
  snapshotDate: string,
  generatedAt: string
): ClubIndex {
  const collected = new Map<string, ClubIndexEntry>()

  for (const file of files) {
    const payload = unwrap(file)
    if (payload === null) continue
    const districtId = stringProp(payload, 'districtId')
    if (districtId === null) continue

    for (const club of recordArray(payload, 'clubs')) {
      if (typeof club !== 'object' || club === null) continue
      const entry = club as Record<string, unknown>
      const clubId = normalizeClubId(entry['clubId'])
      if (clubId === '') continue
      const clubName = entry['clubName']
      collected.set(clubId, {
        districtId,
        clubName: typeof clubName === 'string' ? clubName : '',
      })
    }
  }

  const clubs: Record<string, ClubIndexEntry> = {}
  for (const clubId of [...collected.keys()].sort()) {
    clubs[clubId] = collected.get(clubId)!
  }

  return {
    generatedAt,
    snapshotDate,
    totalClubs: collected.size,
    clubs,
  }
}

/**
 * Unwrap the collector envelope ({ data: {...} }) or pass a bare payload.
 * A wrapper whose scrape failed carries districtId at the WRAPPER level with
 * data: null — returning the wrapper would index a phantom empty district,
 * so anything with a data key but no usable data object is skipped.
 */
function unwrap(file: unknown): Record<string, unknown> | null {
  if (typeof file !== 'object' || file === null) return null
  const obj = file as Record<string, unknown>
  if (!('data' in obj)) return obj
  const data = obj['data']
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)
    : null
}

/** Read a non-empty string property off an unknown value, else null. */
function stringProp(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null
  const prop = (value as Record<string, unknown>)[key]
  return typeof prop === 'string' && prop !== '' ? prop : null
}

function recordArray(obj: Record<string, unknown>, key: string): unknown[] {
  const value = obj[key]
  return Array.isArray(value) ? value : []
}
