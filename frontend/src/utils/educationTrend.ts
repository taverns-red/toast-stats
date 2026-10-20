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

// Red stub (#1793): implemented in the next commit.
export function educationYearsSparkline(
  _years: EducationTrendYear[],
  _programYear: string
): { series: number[]; selected: EducationTrendYear | null } {
  return { series: [], selected: null }
}
