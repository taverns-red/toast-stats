/**
 * District → region history fold (#1820, epic #1781).
 *
 * Folds the `region` column of `snapshots/<date>/all-districts-rankings.json`
 * into a district-keyed history: the district is the key, the region an
 * attribute with a date range. Regions were redrawn several times since the
 * earliest snapshot, so a region page must use each program year's own
 * membership (verified 2026-10-11: the column is present at every year-end,
 * two-digit "01".."14", the undistricted row "U" carries "DNAR").
 *
 * Inputs are persisted snapshots (ADR-015 P2); the caller reads the first
 * and last snapshot of every program year (`selectRegionSourceDates`), so a
 * mid-year change is seen and a year's final membership is what
 * `byProgramYear` reports. A snapshot's program year comes from its LOGICAL
 * date — the directory name — never from the CSV it was sourced from: the
 * 2026-06-30 close was collected from a July CSV and is still 2025-26
 * (the CLAUDE.md tripwire; Lesson 139).
 *
 * - Spans: consecutive sampled dates in one region extend a span; a sampled
 *   date the district is absent from, or a different region, starts a new
 *   one. `to: null` only when the district is in the latest sample (`asOf`).
 * - A retired district stays, its last span closed at its last sighting.
 * - Two regions in one program year → `conflicts[]` (never silently
 *   resolved); `byProgramYear` keeps the region of the year's last sample.
 * - Deterministic: inputs are sorted by date and districts inserted in
 *   sorted order, so any input order gives identical bytes (Lesson 158).
 */

import {
  DISTRICT_REGION_HISTORY_VERSION,
  type AllDistrictsRankingsData,
  type DistrictRegionConflict,
  type DistrictRegionHistory,
  type DistrictRegionHistoryDistrict,
  type DistrictRegionSpan,
} from '@taverns-red/shared-contracts'
import { programYearForSnapshotDate } from './ceoReportSnapshotDates.js'

export interface RegionSource {
  /** The snapshot directory's (logical) date, YYYY-MM-DD. */
  snapshotDate: string
  rankings: AllDistrictsRankingsData
}

/** The undistricted bucket's ranking row: not a district. */
const UNDISTRICTED_ID = 'U'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The snapshot dates to read: the first and the last of every program year
 * (by logical date), ascending and unique. Anything that is not a
 * YYYY-MM-DD date is ignored.
 */
export function selectRegionSourceDates(dates: readonly string[]): string[] {
  const byYear = new Map<string, { first: string; last: string }>()
  for (const date of dates) {
    if (!ISO_DATE.test(date)) continue
    const py = programYearForSnapshotDate(date)
    const seen = byYear.get(py)
    if (!seen) byYear.set(py, { first: date, last: date })
    else {
      if (date < seen.first) seen.first = date
      if (date > seen.last) seen.last = date
    }
  }
  const picked = new Set<string>()
  for (const { first, last } of byYear.values()) {
    picked.add(first)
    picked.add(last)
  }
  return [...picked].sort(byString)
}

export function foldDistrictRegionHistory(
  sources: readonly RegionSource[]
): DistrictRegionHistory {
  if (sources.length === 0) {
    throw new Error(
      'foldDistrictRegionHistory: no rankings; refusing to write an empty history'
    )
  }
  const sorted = [...sources].sort((a, b) =>
    byString(a.snapshotDate, b.snapshotDate)
  )
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.snapshotDate === sorted[i - 1]!.snapshotDate) {
      throw new Error(
        `foldDistrictRegionHistory: two rankings for ${sorted[i]!.snapshotDate}`
      )
    }
  }

  const sourceDates = sorted.map(s => s.snapshotDate)
  const asOf = sourceDates[sourceDates.length - 1]!

  // districtId → its region at each sampled date index it appears in.
  const sightings = new Map<
    string,
    Array<{ ordinal: number; region: string }>
  >()
  sorted.forEach((source, ordinal) => {
    for (const row of source.rankings.rankings) {
      const id = row.districtId.trim()
      if (id.toUpperCase() === UNDISTRICTED_ID) continue
      const list = sightings.get(id) ?? []
      list.push({ ordinal, region: row.region })
      sightings.set(id, list)
    }
  })

  const districts: Record<string, DistrictRegionHistoryDistrict> = {}
  const conflicts: DistrictRegionConflict[] = []
  for (const id of [...sightings.keys()].sort(byString)) {
    const list = sightings.get(id)!
    const spans: DistrictRegionSpan[] = []
    let previous: number | undefined
    for (const { ordinal, region } of list) {
      const date = sourceDates[ordinal]!
      const current = spans[spans.length - 1]
      if (current && current.region === region && previous === ordinal - 1) {
        current.to = date
      } else {
        spans.push({ from: date, to: date, region })
      }
      previous = ordinal
    }
    const last = spans[spans.length - 1]!
    if (last.to === asOf) last.to = null

    const byProgramYear: Record<string, string> = {}
    const perYear = new Map<
      string,
      Map<string, { firstSeen: string; lastSeen: string }>
    >()
    for (const { ordinal, region } of list) {
      const date = sourceDates[ordinal]!
      const py = programYearForSnapshotDate(date)
      byProgramYear[py] = region // ascending dates: the last sample wins
      const regions = perYear.get(py) ?? new Map()
      const seen = regions.get(region)
      if (seen) seen.lastSeen = date
      else regions.set(region, { firstSeen: date, lastSeen: date })
      perYear.set(py, regions)
    }
    for (const [py, regions] of perYear) {
      if (regions.size < 2) continue
      conflicts.push({
        districtId: id,
        programYear: py,
        regions: [...regions.entries()]
          .sort(([a], [b]) => byString(a, b))
          .map(([region, seen]) => ({ region, ...seen })),
      })
    }

    districts[id] = { spans, byProgramYear }
  }

  conflicts.sort(
    (a, b) =>
      byString(a.programYear, b.programYear) ||
      byString(a.districtId, b.districtId)
  )

  return {
    _format: {
      version: DISTRICT_REGION_HISTORY_VERSION,
      type: 'district-region-history',
    },
    asOf,
    programYears: [...new Set(sourceDates.map(programYearForSnapshotDate))],
    sourceDates,
    districts,
    conflicts,
  }
}
