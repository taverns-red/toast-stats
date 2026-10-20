/**
 * Education awards per program year (#1807, epic #1781), read from the
 * #1801 rollup index's `trend` — ledger only, as the rollup computed it.
 *
 * Absent is never 0: a year the rollup marks `null` (no ledger for the
 * district that year) stays `totals: null`, "not available". A year the
 * number was not a district at all (TI reuses retired numbers, e.g. D17
 * 2008-11) is absent from the trend and left out here; `skipsProgramYears`
 * tells the page so it can say so instead of implying continuity.
 */
import type {
  EducationAwardTotals,
  EducationRollupIndex,
} from '@taverns-red/shared-contracts'

export interface EducationTrendYear {
  programYear: string
  /** `null` = not available that year (no ledger), never 0. */
  totals: EducationAwardTotals | null
}

/** The rollup keys one-digit districts padded (`02`); the URL may not. */
const rollupKey = (
  byDistrict: EducationRollupIndex['trend']['districts'],
  districtId: string
): string | undefined => {
  if (byDistrict[districtId]) return districtId
  const padded = /^\d$/.test(districtId) ? `0${districtId}` : districtId
  return byDistrict[padded] ? padded : undefined
}

/** The district's totals per program year, oldest first. */
export function districtEducationTrend(
  index: EducationRollupIndex | null,
  districtId: string
): EducationTrendYear[] {
  if (!index) return []
  const key = rollupKey(index.trend.districts, districtId)
  if (key === undefined) return []
  return Object.entries(index.trend.districts[key]!)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([programYear, totals]) => ({ programYear, totals }))
}

const startYear = (py: string) => Number(py.slice(0, 4))

/** True when two neighbouring rows are more than one program year apart. */
export function skipsProgramYears(years: EducationTrendYear[]): boolean {
  return years.some(
    (y, i) =>
      i > 0 &&
      startYear(y.programYear) - startYear(years[i - 1]!.programYear) > 1
  )
}

/** The sparkline behind the mobile sparkline-expand (#1793): the awards of
 *  the latest unbroken run of years with a ledger — a not-available year or
 *  a year the number was not a district ends the run, so the line never
 *  bridges a gap. `selected` is the page's own PY (R3), `null` if the
 *  district has no row for it. */
export function educationYearsSparkline(
  years: EducationTrendYear[],
  programYear: string
): { series: number[]; selected: EducationTrendYear | null } {
  const series: number[] = []
  for (let i = years.length - 1; i >= 0; i--) {
    const y = years[i]!
    if (!y.totals) break
    const newer = years[i + 1]
    if (newer && startYear(newer.programYear) - startYear(y.programYear) > 1)
      break
    series.unshift(y.totals.awards)
  }
  return {
    series,
    selected: years.find(y => y.programYear === programYear) ?? null,
  }
}
