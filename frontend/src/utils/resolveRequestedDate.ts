/**
 * resolveRequestedDate (#2635) — the one place a `?date=` is checked against
 * the snapshots that exist.
 *
 * A shared or hand-edited link can carry any date. Treating it as loaded
 * either fetched a snapshot that does not exist (skeletons forever), or
 * labelled another date's data with the requested date. The result here is
 * always an ELEMENT of `dates` (or null when the program year has none), so
 * everything downstream — the fetch, the chip, the freshness pill — names the
 * date whose data is on screen.
 *
 *  - no param            → the PY's latest snapshot ('none')
 *  - a snapshot in the PY → used as-is ('valid')
 *  - a snapshot in another PY → that PY is selected ('switched-py')
 *  - anything else        → the nearest earlier snapshot (in the date's own
 *    PY first, then any PY; the PY follows it), else the selected PY's latest
 *    ('fallback'); the caller shows a notice and drops the param
 */

import {
  getAvailableProgramYears,
  getMostRecentDateInProgramYear,
  getProgramYearForDate,
  filterDatesByProgramYear,
} from './programYear'
import type { ProgramYear } from './programYear'
import type { SnapshotDate } from '../types/snapshotDate'

export type DateResolutionStatus = 'none' | 'valid' | 'switched-py' | 'fallback'

export interface DateResolution {
  status: DateResolutionStatus
  programYear: ProgramYear
  /** The snapshot to fetch; null only when the program year has no snapshots. */
  date: SnapshotDate | null
  /** The raw `?date=` value, when one was supplied. */
  requested: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function resolveRequestedDate(params: {
  requested: string | null
  dates: readonly SnapshotDate[]
  programYear: ProgramYear
}): DateResolution {
  const { requested, dates, programYear } = params
  const latestInPy = getMostRecentDateInProgramYear([...dates], programYear)

  if (!requested) {
    return { status: 'none', programYear, date: latestInPy, requested: null }
  }

  const exact = dates.find(d => d === requested)
  if (exact) {
    const owner = getProgramYearForDate(exact)
    if (owner.year === programYear.year) {
      return { status: 'valid', programYear, date: exact, requested }
    }
    const available = getAvailableProgramYears([...dates]).some(
      py => py.year === owner.year
    )
    if (available) {
      return {
        status: 'switched-py',
        programYear: owner,
        date: exact,
        requested,
      }
    }
  }

  // No snapshot for the requested date: take the nearest EARLIER one, looking
  // first inside the date's own program year, then across every year — and the
  // program year follows the date that is shown (#2635).
  if (!ISO_DATE.test(requested)) {
    return { status: 'fallback', programYear, date: latestInPy, requested }
  }
  const nearestEarlier = (candidates: readonly SnapshotDate[]) =>
    candidates.filter(d => d < requested).sort((a, b) => b.localeCompare(a))[0]
  const inOwnYear = nearestEarlier(
    filterDatesByProgramYear([...dates], getProgramYearForDate(requested))
  )
  const earlier = inOwnYear ?? nearestEarlier(dates)
  if (!earlier) {
    return { status: 'fallback', programYear, date: latestInPy, requested }
  }
  return {
    status: 'fallback',
    programYear: getProgramYearForDate(earlier),
    date: earlier,
    requested,
  }
}
