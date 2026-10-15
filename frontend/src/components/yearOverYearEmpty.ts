/* When the Year-Over-Year Comparison panel shows an empty state instead of
 * the comparison — shared by the panel and its lazy chunk fallback (#1835),
 * so the fallback paints the same state the panel will. */

export interface YearOverYearChanges {
  membershipChange: number
  distinguishedChange: number
  clubHealthChange: number
}

export interface YearOverYearEmpty {
  title: string
  message: string
}

export const NO_HISTORY: YearOverYearEmpty = {
  title: 'No Historical Data',
  message:
    'Year-over-year comparison requires data from previous program years. Continue collecting data to enable this feature.',
}

/** The empty state to show, or null when there is a comparison to draw. */
export function yearOverYearEmpty(
  yearOverYear: YearOverYearChanges | undefined,
  unavailableReason: string | null | undefined
): YearOverYearEmpty | null {
  // #1442: an explicit reason outranks both the "no data" and the "all
  // zeroes" empty states — it is the only one of the three that is true.
  if (unavailableReason) {
    return { title: 'Comparison Unavailable', message: unavailableReason }
  }
  if (!yearOverYear) return NO_HISTORY
  // All-zero changes mean no distinct previous-year data was found.
  const allChangesZero =
    yearOverYear.membershipChange === 0 &&
    yearOverYear.distinguishedChange === 0 &&
    yearOverYear.clubHealthChange === 0
  return allChangesZero ? NO_HISTORY : null
}
