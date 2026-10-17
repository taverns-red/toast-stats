/**
 * The one region-membership rule (#1799, #1820), shared by the region
 * rollups and the region membership series (#2127): a district's region is
 * `config/district-region-history.json`'s `byProgramYear` for the program
 * year in question, looked up on the canonical district id. No history, or
 * a history that has not reached the year, means no regions — with the
 * reason — never a guessed assignment.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import {
  REGION_ROLLUPS_REGION_SOURCE,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import { canonicalDistrictId } from './globalRollup.js'

export interface RegionMembership {
  /** District id → its region for the year, null when not placed. */
  readonly regionOf: ((districtId: string) => string | null) | null
  /** Why `regionOf` is null; null when regions are available. */
  readonly note: string | null
  /** Where the regions came from; null when they are not available. */
  readonly source: {
    readonly source: typeof REGION_ROLLUPS_REGION_SOURCE
    readonly asOf: string
    readonly programYear: string
  } | null
}

export function regionMembershipFor(
  history: DistrictRegionHistory | null,
  programYear: string,
  /** Why the history is null, when the caller knows better than "absent". */
  historyNote?: string
): RegionMembership {
  if (!history) {
    return {
      regionOf: null,
      note:
        historyNote ??
        `no ${REGION_ROLLUPS_REGION_SOURCE} was available to this run; region membership is unknown`,
      source: null,
    }
  }
  if (!history.programYears.includes(programYear)) {
    return {
      regionOf: null,
      note: `${REGION_ROLLUPS_REGION_SOURCE} (asOf ${history.asOf}) has no ${programYear} membership yet`,
      source: null,
    }
  }
  const byKey = new Map(
    Object.entries(history.districts).map(([id, entry]) => [
      canonicalDistrictId(id),
      entry,
    ])
  )
  return {
    regionOf: id =>
      byKey.get(canonicalDistrictId(id))?.byProgramYear[programYear] ?? null,
    note: null,
    source: {
      source: REGION_ROLLUPS_REGION_SOURCE,
      asOf: history.asOf,
      programYear,
    },
  }
}

/**
 * Every district the history places in a region for `programYear`, as the
 * history spells its id, with that region. Empty without usable regions.
 */
export function placedDistricts(
  history: DistrictRegionHistory | null,
  programYear: string
): Array<{ districtId: string; region: string }> {
  if (!history || !history.programYears.includes(programYear)) return []
  const placed: Array<{ districtId: string; region: string }> = []
  for (const [districtId, entry] of Object.entries(history.districts)) {
    const region = entry.byProgramYear[programYear]
    if (region) placed.push({ districtId, region })
  }
  return placed
}
