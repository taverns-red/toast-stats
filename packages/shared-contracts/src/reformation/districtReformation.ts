/**
 * The 2026 district reformation — one place decides whether a year-over-year
 * comparison straddles it, and whether the district on either side is the
 * same district (#1442).
 *
 * On **2026-07-01** Toastmasters International merged and split districts:
 * 25+ fewer districts this program year. Two distinct things happened, and
 * only one of them is a bug for us:
 *
 * - A district that was **renumbered** (the 201–231 range) has no prior-year
 *   file at all. Every year-over-year site already degrades to null there,
 *   which is correct and needs nothing from this module.
 * - A **surviving id that absorbed or shed clubs** keeps its id and keeps its
 *   prior-year file, so every site happily compares the post-merge district
 *   against its own smaller pre-merge self. Membership and payments then read
 *   as enormous organic growth. The district did not grow, it annexed.
 *
 * There is no chokepoint the four year-over-year sites pass through — they
 * read four different data sources in three different packages
 * (`AnalyticsComputer.computeYearOverYear` over snapshots,
 * `useTimeSeriesYoY` over the time-series index, `usePaymentsTrend` over the
 * analytics `paymentsTrend`, `GlobalRankingsTab` over yearly rank summaries).
 * What they *can* share is the **signal**, so it lives here — in the one
 * package all of them already depend on — rather than inside any one
 * year-over-year function. Issue #1443 ("What Changed" reformation context)
 * consumes the same helper.
 *
 * ## Why a heuristic and not a predecessor map
 *
 * A hand-written predecessor map needs data that must be fetched and kept in
 * sync; built speculatively it is an unvalidated artifact that rots silently
 * the first time TI adjusts a boundary. The club-count discontinuity is
 * derivable from data every call site already holds.
 *
 * ## Calibration
 *
 * A merge adds a whole district's roster (+40% and up); a split removes one
 * (−30% and down). Ordinary year-over-year churn in a stable district runs
 * well under 10%, even in a declining year. {@link REFORMATION_RELATIVE_THRESHOLD}
 * sits at 15% and {@link REFORMATION_MIN_ABSOLUTE_CHANGE} at 8 — **both**
 * must be cleared, so a small district's ordinary churn (12 → 18 clubs) is
 * not mistaken for a merge and a very large district's 5% drift is not
 * either. The bias is deliberate: this gate only ever applies across the
 * single 2026-07-01 boundary, and a false positive costs one suppressed panel
 * carrying an honest explanation, which is strictly better than rendering a
 * number that is wrong. Both constants are exported so they can be retuned in
 * one place if live data says the line is in the wrong spot.
 */

/** The date the reformed district map took effect. */
export const DISTRICT_REFORMATION_DATE = '2026-07-01'

/** Start year of the first program year under the reformed district map. */
export const DISTRICT_REFORMATION_PROGRAM_YEAR = 2026

/**
 * The plain explanation shown in place of a suppressed year-over-year figure.
 * Deliberately says what happened rather than "N/A".
 */
export const DISTRICT_REFORMATION_NOTICE =
  'Not comparable across the 2026 district reformation'

/**
 * Minimum |relative change| in the compared population for the change to read
 * as a reformation discontinuity rather than ordinary churn.
 */
export const REFORMATION_RELATIVE_THRESHOLD = 0.15

/**
 * Minimum |absolute change| in the compared population, so a tiny district's
 * ordinary churn cannot clear the relative threshold on its own.
 */
export const REFORMATION_MIN_ABSOLUTE_CHANGE = 8

/** Why a comparison was, or was not, called discontinuous. */
export type ReformationDiscontinuityReason =
  /** The pair does not straddle 2026-07-01 — this gate never applies. */
  | 'does-not-span-reformation'
  /** No usable prior/current population to compare. */
  | 'no-baseline'
  /** Straddles the boundary but the population is continuous. */
  | 'comparable'
  /** Straddles the boundary and the population jumped discontinuously. */
  | 'population-discontinuity'

/**
 * The compared population on either side of the boundary.
 *
 * "Population" is whatever the comparison is measured over: a district's club
 * roster for membership/payments/club year-over-year, or the size of the
 * ranked field for a rank comparison (the field itself shrank by 25+
 * districts, so a rank of N is not the same achievement on both sides).
 */
export interface ReformationDiscontinuityInput {
  /** Date of the prior-year data point (YYYY-MM-DD). */
  previousDate: string
  /** Date of the current data point (YYYY-MM-DD). */
  currentDate: string
  /** Population at the prior-year data point. */
  previousCount: number | null | undefined
  /** Population at the current data point. */
  currentCount: number | null | undefined
}

/** The verdict, with the numbers behind it for logging and UI copy. */
export interface ReformationDiscontinuity {
  /** True when the comparison must not be presented as a bare figure. */
  isDiscontinuous: boolean
  /** Whether the compared pair straddles 2026-07-01 at all. */
  spansReformation: boolean
  /** current − previous, or null when there was nothing to compare. */
  absoluteChange: number | null
  /** (current − previous) / previous, or null when there is no baseline. */
  relativeChange: number | null
  /** Why the verdict came out the way it did. */
  reason: ReformationDiscontinuityReason
  /** Explanation to show the reader, or null when nothing is suppressed. */
  message: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const PROGRAM_YEAR_LABEL = /^(\d{4})-(\d{4})$/

/**
 * Start year of a program year, from either a `"2025-2026"` label or the year
 * itself. Returns null for anything that is not one of those.
 */
export function programYearStartYear(
  programYear: string | number
): number | null {
  if (typeof programYear === 'number') {
    return Number.isFinite(programYear) ? Math.trunc(programYear) : null
  }
  const label = PROGRAM_YEAR_LABEL.exec(programYear)
  if (label?.[1]) return Number(label[1])
  if (/^\d{4}$/.test(programYear)) return Number(programYear)
  return null
}

/**
 * The July 1 start date of a program year, given its label or start year.
 * Returns an empty string when the input is not a program year — callers pass
 * the result straight to {@link spansDistrictReformation}, which rejects it.
 */
export function programYearStartDate(programYear: string | number): string {
  const year = programYearStartYear(programYear)
  return year === null ? '' : `${year}-07-01`
}

/**
 * Whether a prior/current pair straddles the reformation: the prior point is
 * strictly before 2026-07-01 and the current point is on or after it.
 *
 * Both dates are compared as ISO strings — no `Date` parsing, so no timezone
 * can shift a July 1 snapshot to the wrong side of its own boundary.
 */
export function spansDistrictReformation(
  previousDate: string,
  currentDate: string
): boolean {
  if (!ISO_DATE.test(previousDate) || !ISO_DATE.test(currentDate)) return false
  return (
    previousDate < DISTRICT_REFORMATION_DATE &&
    currentDate >= DISTRICT_REFORMATION_DATE
  )
}

/**
 * Decide whether a year-over-year comparison is meaningful across the 2026
 * district reformation.
 *
 * Fires only when the pair straddles 2026-07-01 **and** the compared
 * population moved discontinuously. Outside that window it is inert by
 * construction: a normal year's comparison, and a renumbered district whose
 * prior-year data simply does not exist, both come back
 * `isDiscontinuous: false`.
 */
export function detectReformationDiscontinuity(
  input: ReformationDiscontinuityInput
): ReformationDiscontinuity {
  const { previousDate, currentDate, previousCount, currentCount } = input

  const spansReformation = spansDistrictReformation(previousDate, currentDate)

  if (!spansReformation) {
    return {
      isDiscontinuous: false,
      spansReformation: false,
      absoluteChange: null,
      relativeChange: null,
      reason: 'does-not-span-reformation',
      message: null,
    }
  }

  const hasBaseline =
    typeof previousCount === 'number' &&
    Number.isFinite(previousCount) &&
    previousCount > 0 &&
    typeof currentCount === 'number' &&
    Number.isFinite(currentCount)

  if (!hasBaseline) {
    return {
      isDiscontinuous: false,
      spansReformation: true,
      absoluteChange: null,
      relativeChange: null,
      reason: 'no-baseline',
      message: null,
    }
  }

  const absoluteChange = currentCount - previousCount
  const relativeChange = absoluteChange / previousCount

  const isDiscontinuous =
    Math.abs(relativeChange) >= REFORMATION_RELATIVE_THRESHOLD &&
    Math.abs(absoluteChange) >= REFORMATION_MIN_ABSOLUTE_CHANGE

  return {
    isDiscontinuous,
    spansReformation: true,
    absoluteChange,
    relativeChange,
    reason: isDiscontinuous ? 'population-discontinuity' : 'comparable',
    message: isDiscontinuous ? DISTRICT_REFORMATION_NOTICE : null,
  }
}
