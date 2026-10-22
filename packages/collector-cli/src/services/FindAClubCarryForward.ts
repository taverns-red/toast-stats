/**
 * FindAClubCarryForward — re-applies the Find-A-Club enrichment a date's
 * existing snapshot already holds onto a re-derived copy of it (#2237).
 *
 * A rebuild re-transforms a date from its raw CSVs, which carry no FAC
 * fields; the per-date loop then merges the persisted raw-fac/<date>/. But
 * raw-fac persistence (#1758) began on 2026-10-11, and every date from
 * 2026-05-15 to 2026-10-10 was enriched by its daily with nothing persisted.
 * For those dates the existing snapshot is the only record of the
 * enrichment, so it is carried forward from there rather than stripped.
 *
 * Semantics:
 *
 *   - The rebuilt snapshot is the spine: rows are neither added nor removed,
 *     and every non-FAC field keeps its rebuilt value.
 *   - For each row of `clubPerformance[]` (keyed by `Club Number`) and
 *     `clubs[]` (keyed by `clubId`), both canonicalized with
 *     `normalizeClubId` (#1440), the FAC fields the prior row holds are
 *     copied over. A club the prior snapshot did not match gets nothing.
 *   - `data.prospectiveClubs` (the FAC-only clubs, #489) is copied whole.
 *   - Contact fields never come along (#2026).
 *   - A prior snapshot that is not enriched, or a rebuilt one that already
 *     is, is returned unchanged with `carried: 0`.
 *
 * Pure data, like FindAClubMerger: the CLI command handles the files.
 */

import {
  normalizeClubId,
  omitClubContactFields,
} from '@taverns-red/shared-contracts'
import {
  TI_CLUB_NUMBER_KEY,
  type DistrictSnapshot,
} from '../types/findAClub.js'

/**
 * The fields mergeFacIntoSnapshot writes onto both a `clubPerformance[]` row
 * and a `clubs[]` row. A test pins this against the merger's output.
 */
export const FAC_ROW_FIELDS: readonly string[] = [
  'charterDate',
  'coordinates',
  'meetsOnline',
  'address',
  'website',
  'facebookLink',
  'twitterLink',
  'meetingDay',
  'meetingTime',
  'allowsVirtualAttendance',
  'isProspective',
]

/** The fields the merger writes onto `clubs[]` rows only (#1789). */
export const FAC_PARSED_ONLY_FIELDS: readonly string[] = [
  'location',
  'meetingSchedule',
]

type Row = Record<string, unknown>

function dataOf(snapshot: unknown): Row | undefined {
  if (typeof snapshot !== 'object' || snapshot === null) return undefined
  const data = (snapshot as Row)['data']
  return typeof data === 'object' && data !== null ? (data as Row) : undefined
}

function rowsOf(data: Row | undefined, key: string): Row[] {
  const rows = data?.[key]
  return Array.isArray(rows)
    ? rows.filter((r): r is Row => typeof r === 'object' && r !== null)
    : []
}

/**
 * Whether a district snapshot carries a Find-A-Club merge: the merge always
 * writes `data.prospectiveClubs` (even empty), and a matched row carries at
 * least one FAC field.
 */
export function isFacEnriched(snapshot: unknown): boolean {
  const data = dataOf(snapshot)
  if (!data) return false
  if (Array.isArray(data['prospectiveClubs'])) return true
  return ['clubs', 'clubPerformance'].some(key =>
    rowsOf(data, key).some(row => FAC_ROW_FIELDS.some(f => f in row))
  )
}

/** The FAC fields of each prior row, by canonical club id. */
function facFieldsById(
  rows: Row[],
  idKey: string,
  fields: readonly string[]
): Map<string, Row> {
  const byId = new Map<string, Row>()
  for (const row of rows) {
    const id = normalizeClubId(row[idKey])
    if (!id) continue
    const picked: Row = {}
    for (const f of fields) if (f in row) picked[f] = row[f]
    if (Object.keys(picked).length > 0) byId.set(id, picked)
  }
  return byId
}

export interface CarryForwardResult {
  snapshot: DistrictSnapshot
  /** Rows (clubs[] plus clubPerformance[]) that received FAC fields. */
  carried: number
}

/**
 * Carry the FAC enrichment of `prior` (the date's existing snapshot) onto
 * `rebuilt` (the same date, re-derived).
 */
export function carryForwardFac(
  rebuilt: DistrictSnapshot,
  prior: DistrictSnapshot
): CarryForwardResult {
  if (!isFacEnriched(prior) || isFacEnriched(rebuilt)) {
    return { snapshot: rebuilt, carried: 0 }
  }
  const priorData = dataOf(prior)
  const rebuiltData = dataOf(rebuilt)
  if (!rebuiltData) return { snapshot: rebuilt, carried: 0 }

  let carried = 0
  const carry = (
    key: string,
    idKey: string,
    fields: readonly string[]
  ): unknown[] | undefined => {
    const rows = rebuiltData[key]
    if (!Array.isArray(rows)) return undefined
    const fac = facFieldsById(rowsOf(priorData, key), idKey, fields)
    return rows.map(raw => {
      if (typeof raw !== 'object' || raw === null) return raw
      const row = raw as Row
      const id = normalizeClubId(row[idKey])
      const picked = id ? fac.get(id) : undefined
      if (!picked) return omitClubContactFields(row)
      carried += 1
      return omitClubContactFields({ ...row, ...picked })
    })
  }

  const clubPerformance = carry(
    'clubPerformance',
    TI_CLUB_NUMBER_KEY,
    FAC_ROW_FIELDS
  )
  const clubs = carry('clubs', 'clubId', [
    ...FAC_ROW_FIELDS,
    ...FAC_PARSED_ONLY_FIELDS,
  ])
  const prospectiveClubs = priorData?.['prospectiveClubs']

  return {
    snapshot: {
      ...rebuilt,
      data: {
        ...rebuiltData,
        ...(clubPerformance !== undefined && { clubPerformance }),
        ...(clubs !== undefined && { clubs }),
        ...(Array.isArray(prospectiveClubs) && { prospectiveClubs }),
      },
    } as DistrictSnapshot,
    carried,
  }
}
