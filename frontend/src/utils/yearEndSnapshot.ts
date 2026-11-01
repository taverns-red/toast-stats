/**
 * A district's settled (year-end) snapshot date for a program year, from the
 * district snapshot index (#1229, extracted from `useClubHistory` for #2427).
 *
 * The LATEST date in a program year is that year's year-end: taking the max
 * in-PY date is the nearest-prior-to-Jun-30 fallback (#621), and a July-dated
 * close stays in its own program year (Lesson 139). The index keys are the
 * districts' own ids ("01"), so the lookup is padding-blind.
 */

import { getProgramYearForDate } from './programYear'
import { sameDistrict } from './clubHistory'
import { snapshotDatesFrom, type SnapshotDate } from '../types/snapshotDate'

export type SnapshotIndexLike = Record<string, string[] | undefined>

/** The index's own key for a district, matched padding-blind. */
export function snapshotIndexKeyFor(
  index: SnapshotIndexLike,
  districtId: string
): string {
  return districtId in index
    ? districtId
    : (Object.keys(index).find(k => sameDistrict(k, districtId)) ?? districtId)
}

/**
 * Latest snapshot date within each program year (by start year).
 *
 * Generic in the date type so a branded `SnapshotDate[]` yields branded
 * values: every entry is an ELEMENT of `dates` (#1323).
 */
export function latestDateByProgramYear<T extends string>(
  dates: readonly T[]
): Map<number, T> {
  const latestByYear = new Map<number, T>()
  for (const d of dates) {
    // getProgramYearForDate parses the ISO string via calendarParts (regex,
    // timezone-safe) — not new Date() — so the Jul-1 boundary is exact.
    const startYear = getProgramYearForDate(d).year
    const cur = latestByYear.get(startYear)
    if (!cur || d > cur) latestByYear.set(startYear, d)
  }
  return latestByYear
}

/** The district's year-end date for one program year, or null if it has none. */
export function yearEndDateFor(
  index: SnapshotIndexLike,
  districtId: string,
  startYear: number
): { districtId: string; date: SnapshotDate } | null {
  const key = snapshotIndexKeyFor(index, districtId)
  const date = latestDateByProgramYear(
    snapshotDatesFrom({ dates: index[key] ?? [] })
  ).get(startYear)
  return date ? { districtId: key, date } : null
}
