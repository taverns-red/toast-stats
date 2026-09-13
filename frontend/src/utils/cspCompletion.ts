/**
 * Club Success Plan completion over analytics club rows (#1555).
 *
 * One reducer shared by every surface that reads `ClubTrend.cspSubmitted`
 * (the action list; the district overview line), so "how many clubs have not
 * submitted" is never computed two ways (lessons 052/061/076).
 *
 * Two rules are reused, not restated:
 * - the boolean fold is `getCSPStatus` (analytics-core) — the single home of
 *   the `cspSubmitted ?? true` normalisation;
 * - the active/ineligible split is `isIneligibleStatus`, the same predicate
 *   the raw-snapshot lists use, so the narratives and this list agree.
 *
 * This does NOT gate on the program year. The caller owns the year (R3) and
 * must not call this for a year before the CSP requirement (`isCspRequired`):
 * pre-2025-26 rows carry no `cspSubmitted`, which `getCSPStatus` reads as
 * submitted — so an ungated call would report "all submitted" for a year with
 * no requirement. Within a tracked year an absent value is UNKNOWN (never
 * observed live, but the type allows it): excluded from both lists and
 * counted separately so the UI can say "(n clubs with no CSP data)".
 */

import { getCSPStatus } from '@taverns-red/analytics-core'
import { isIneligibleStatus } from './extractDivisionPerformance'

/** The two fields this reducer reads from a club row. */
export interface CspCompletionRow {
  cspSubmitted?: boolean | undefined
  clubStatus?: string | undefined
}

export interface CspCompletion<T extends CspCompletionRow> {
  /** Rows with a submitted plan, any operational status. */
  submittedCount: number
  /**
   * How many of `submittedCount` are suspended / closed / ineligible — so an
   * "of N active clubs" denominator can be `submittedCount -
   * submittedIneligibleCount + notSubmitted.length` and agree with the
   * active-only list it accompanies.
   */
  submittedIneligibleCount: number
  /** Active (non-ineligible) rows without a plan, in input order. */
  notSubmitted: T[]
  /** Suspended / closed / ineligible rows without a plan, in input order. */
  notSubmittedIneligible: T[]
  /** Rows with no CSP value on a tracked year — neither numerator nor denominator. */
  unknownCount: number
}

export function summarizeCspCompletion<T extends CspCompletionRow>(
  clubs: readonly T[]
): CspCompletion<T> {
  let submittedCount = 0
  let submittedIneligibleCount = 0
  let unknownCount = 0
  const notSubmitted: T[] = []
  const notSubmittedIneligible: T[] = []

  for (const club of clubs) {
    const cspSubmitted = club.cspSubmitted
    if (cspSubmitted === undefined) {
      unknownCount++
      continue
    }
    const ineligible = isIneligibleStatus(club.clubStatus ?? '')
    if (getCSPStatus({ cspSubmitted })) {
      submittedCount++
      if (ineligible) submittedIneligibleCount++
    } else if (ineligible) {
      notSubmittedIneligible.push(club)
    } else {
      notSubmitted.push(club)
    }
  }

  return {
    submittedCount,
    submittedIneligibleCount,
    notSubmitted,
    notSubmittedIneligible,
    unknownCount,
  }
}
