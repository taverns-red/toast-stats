/**
 * Club Success Plan completion over analytics club rows (#1555, #1565).
 *
 * One reducer shared by every surface that reads `ClubTrend.cspSubmitted`
 * (the action list; the district overview line), so "how many clubs have not
 * submitted" and "when is each one due" are never computed two ways
 * (lessons 052/061/076).
 *
 * Four rules are reused, not restated:
 * - the boolean fold is `getCSPStatus` (analytics-core) — the single home of
 *   the `cspSubmitted ?? true` normalisation;
 * - the active/ineligible split is `isIneligibleStatus`, the same predicate
 *   the raw-snapshot lists use, so the narratives and this list agree;
 * - the per-club due date is `cspDueDate` (analytics-core): 30 September for
 *   existing clubs, charter + 90 days in-year, `null` (automatic credit) when
 *   chartered after 1 April — such a club is excluded from the lists and both
 *   sides of the ratio through the same path as an ineligible club;
 * - overdue is `isCspOverdue` against the caller's PINNED snapshot date (R3),
 *   so a historical snapshot reads as it did on its date and no test needs a
 *   mocked clock.
 *
 * This does NOT gate on the program year. The caller owns the year (R3) and
 * must not call this for a year before the CSP requirement (`isCspRequired`):
 * pre-2025-26 rows carry no `cspSubmitted`, which `getCSPStatus` reads as
 * submitted — so an ungated call would report "all submitted" for a year with
 * no requirement. Within a tracked year an absent value is UNKNOWN (never
 * observed live, but the type allows it): excluded from both lists and
 * counted separately so the UI can say "(n clubs with no CSP data)".
 */

import {
  cspDueDate,
  getCSPStatus,
  isCspOverdue,
} from '@taverns-red/analytics-core'
import type { CspDeadlineFields } from './cspDeadlines'
import { isIneligibleStatus } from './extractDivisionPerformance'

/** The fields this reducer reads from a club row. */
export interface CspCompletionRow {
  cspSubmitted?: boolean | undefined
  clubStatus?: string | undefined
  /** Find-A-Club charter date (`YYYY-MM-DD`); absent → existing club. */
  charterDate?: string | undefined
}

/** The page-owned context the deadline is judged against (R3). */
export interface CspCompletionAsOf {
  /** "YYYY-YYYY" — the year the page is showing. */
  programYear: string
  /** The PINNED snapshot date (`YYYY-MM-DD`) the rows were fetched under. */
  snapshotDate: string
}

export interface CspCompletion<T extends CspCompletionRow> {
  /**
   * Rows with a submitted plan that were held to the requirement — any
   * operational status; auto-credit clubs excluded (#1565).
   */
  submittedCount: number
  /**
   * How many of `submittedCount` are suspended / closed / ineligible — so an
   * "of N active clubs" denominator can be `submittedCount -
   * submittedIneligibleCount + notSubmitted.length` and agree with the
   * active-only list it accompanies.
   */
  submittedIneligibleCount: number
  /** Active (non-ineligible) rows without a plan, in input order, each with its deadline. */
  notSubmitted: Array<T & CspDeadlineFields>
  /** Suspended / closed / ineligible rows without a plan, in input order. */
  notSubmittedIneligible: T[]
  /**
   * Rows without a plan chartered after 1 April — automatic credit (DCP
   * p. 11): never listed, in neither count, named in the footnote (#1565).
   */
  notSubmittedAutoCredit: T[]
  /** Rows with no CSP value on a tracked year — neither numerator nor denominator. */
  unknownCount: number
}

export function summarizeCspCompletion<T extends CspCompletionRow>(
  clubs: readonly T[],
  asOf: CspCompletionAsOf
): CspCompletion<T> {
  let submittedCount = 0
  let submittedIneligibleCount = 0
  let unknownCount = 0
  const notSubmitted: Array<T & CspDeadlineFields> = []
  const notSubmittedIneligible: T[] = []
  const notSubmittedAutoCredit: T[] = []

  for (const club of clubs) {
    const cspSubmitted = club.cspSubmitted
    if (cspSubmitted === undefined) {
      unknownCount++
      continue
    }
    const ineligible = isIneligibleStatus(club.clubStatus ?? '')
    const dueDate = cspDueDate(club, asOf.programYear)
    if (getCSPStatus({ cspSubmitted })) {
      if (dueDate !== null) {
        submittedCount++
        if (ineligible) submittedIneligibleCount++
      }
    } else if (ineligible) {
      // Status first, same order as the raw path's pushByEligibility.
      notSubmittedIneligible.push(club)
    } else if (dueDate === null) {
      notSubmittedAutoCredit.push(club)
    } else {
      notSubmitted.push({
        ...club,
        cspDueDate: dueDate,
        cspOverdue: isCspOverdue(dueDate, asOf.snapshotDate),
      })
    }
  }

  return {
    submittedCount,
    submittedIneligibleCount,
    notSubmitted,
    notSubmittedIneligible,
    notSubmittedAutoCredit,
    unknownCount,
  }
}
