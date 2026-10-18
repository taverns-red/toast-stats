/**
 * `time-series/regions/{programYear}.json` — region and world membership
 * series for one program year (#2127, follow-up to #1815).
 *
 * The rules this module holds (see the shared-contracts schema for the
 * shape):
 *
 * 1. **Derived from the district series.** A region's value at a date is
 *    the sum of its districts' `time-series/district_{id}/{PY}.json`
 *    `membership` at that date — the points the region districts table's
 *    sparklines draw. Recomputed whole from those files, so it needs no
 *    store of its own and no backfill for a year whose district series
 *    exist.
 * 2. **The program year's own regions** — the region-rollups rule
 *    ({@link resolveRegionMembership}). The world is Σ the districts the history
 *    places for the year: a district it does not place (the undistricted
 *    `U`, a renumbered id stamped onto an earlier year's date, #1465) is
 *    listed, not summed, so a stray series cannot inflate the world.
 * 3. **A gap is null, never 0** (#1671, #2042, #2070). A placed district
 *    with no point at a date makes every block containing it `null` there,
 *    and is listed in `uncountedDistricts` with the reason: a recorded
 *    source gap, no point, or no series for the year at all.
 *
 * Pure: no clock, no filesystem; byte-stable for the same inputs, so the
 * time-series publish plan re-uploads it only when a value changed.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import {
  REGION_MEMBERSHIP_SERIES_FORMAT,
  type DistrictRegionHistory,
  type RegionMembershipSeries,
  type RegionMembershipSeriesRegion,
  type RegionMembershipSeriesUncounted,
} from '@taverns-red/shared-contracts'
import { canonicalDistrictId } from './globalRollup.js'
import { resolveRegionMembership } from './regionRollups.js'

export interface RegionSeriesDistrictInput {
  readonly districtId: string
  readonly dataPoints: ReadonlyArray<{
    readonly date: string
    readonly membership: number
  }>
  /** Dates the district series records as #1671 source gaps (#2070). */
  readonly sourceGapDates?: readonly string[]
}

export interface RegionMembershipSeriesInput {
  readonly programYear: string
  /** One entry per `time-series/district_{id}/{PY}.json` on disk. */
  readonly districts: readonly RegionSeriesDistrictInput[]
  /** null when the pipeline had no history to read. */
  readonly regionHistory: DistrictRegionHistory | null
  /** Why the history is null, when the caller knows better than "absent". */
  readonly regionHistoryNote?: string
}

export const SOURCE_GAP_REASON =
  "source gap: its club report was TI's HTML error page (#1671)"
export const NO_POINT_REASON = 'no data point for this date'
export const NO_SERIES_REASON = 'no series for this program year'

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Member {
  readonly districtId: string
  readonly region: string
  /** date → membership; null = no series for the year at all. */
  readonly points: ReadonlyMap<string, number> | null
  readonly gaps: ReadonlySet<string>
}

/**
 * Every district the history places in a region for `programYear`, as the
 * history spells its id, with that region. Empty without usable regions.
 */
function placedDistricts(
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

export function buildRegionMembershipSeries(
  input: RegionMembershipSeriesInput
): RegionMembershipSeries {
  const { programYear } = input
  const membership = resolveRegionMembership(
    input.regionHistory,
    programYear,
    input.regionHistoryNote
  )

  // One series per canonical district id; the first (by id) wins.
  const series = new Map<string, RegionSeriesDistrictInput>()
  for (const d of [...input.districts].sort((a, b) =>
    byString(a.districtId, b.districtId)
  )) {
    const key = canonicalDistrictId(d.districtId)
    if (!series.has(key)) series.set(key, d)
  }

  const base = {
    _format: REGION_MEMBERSHIP_SERIES_FORMAT,
    programYear,
    regionMembership: membership.membership,
    regionMembershipNote: membership.note,
  }
  if (!membership.regionOf) {
    return {
      ...base,
      dates: [],
      world: { districts: 0, membership: [] },
      regions: null,
      unassignedDistricts: [],
      uncountedDistricts: [],
    }
  }

  const placedKeys = new Set<string>()
  const members: Member[] = []
  for (const placed of placedDistricts(input.regionHistory, programYear)) {
    const key = canonicalDistrictId(placed.districtId)
    if (placedKeys.has(key)) continue
    placedKeys.add(key)
    const own = series.get(key)
    members.push({
      districtId: own?.districtId ?? placed.districtId,
      region: placed.region,
      points: own
        ? new Map(own.dataPoints.map(p => [p.date, p.membership]))
        : null,
      gaps: new Set(own?.sourceGapDates ?? []),
    })
  }
  members.sort((a, b) => byString(a.districtId, b.districtId))

  const unassignedDistricts = [...series.entries()]
    .filter(([key]) => !placedKeys.has(key))
    .map(([, d]) => d.districtId)
    .sort(byString)

  const dates = [
    ...new Set(members.flatMap(m => (m.points ? [...m.points.keys()] : []))),
  ].sort(byString)

  // Who is uncounted, at which dates, and why.
  const uncountedDistricts: RegionMembershipSeriesUncounted[] = []
  for (const m of members) {
    const missing = dates.filter(d => !m.points?.has(d))
    if (missing.length === 0) continue
    if (!m.points) {
      uncountedDistricts.push({
        districtId: m.districtId,
        reason: NO_SERIES_REASON,
        dates: missing,
      })
      continue
    }
    const gap = missing.filter(d => m.gaps.has(d))
    const none = missing.filter(d => !m.gaps.has(d))
    if (gap.length > 0)
      uncountedDistricts.push({
        districtId: m.districtId,
        reason: SOURCE_GAP_REASON,
        dates: gap,
      })
    if (none.length > 0)
      uncountedDistricts.push({
        districtId: m.districtId,
        reason: NO_POINT_REASON,
        dates: none,
      })
  }

  // Σ per date; null where any member has no point (never summed as 0).
  const sumOver = (group: readonly Member[]): Array<number | null> =>
    dates.map(date => {
      let total = 0
      for (const m of group) {
        const value = m.points?.get(date)
        if (value === undefined) return null
        total += value
      }
      return total
    })

  const byRegion = new Map<string, Member[]>()
  for (const m of members)
    byRegion.set(m.region, [...(byRegion.get(m.region) ?? []), m])
  const regions: Record<string, RegionMembershipSeriesRegion> = {}
  for (const region of [...byRegion.keys()].sort(byString)) {
    const group = byRegion.get(region)!
    regions[region] = {
      districtIds: group.map(m => m.districtId),
      membership: sumOver(group),
    }
  }

  return {
    ...base,
    dates,
    world: { districts: members.length, membership: sumOver(members) },
    regions,
    unassignedDistricts,
    uncountedDistricts,
  }
}
