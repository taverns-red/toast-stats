/* #3100 (M1) — the last day a suspended club can reinstate and still add to
   the club base, for the "Can reinstate" list.

   Renewal periods run October 1 to March 31 and April 1 to September 30
   (source: Ron, District 61 director, 2026-11-20, and the TI Club FAQ
   footnote "by the end of the renewal cycle (September 30/March 31)").
   - A September 30 suspension adds if it reinstates in the October cycle,
     so by March 31.
   - A March 31 suspension adds if it reinstates before October 1, so by
     September 30.

   The year is the first such date on or after the snapshot date, which the
   page passes in (R3). The pipeline's reason code already says whether the
   club still adds on that date; this only names the day. */

const DEADLINE_BY_REASON: Readonly<
  Record<string, { month: number; day: number }>
> = {
  suspended_sept30_october_cycle: { month: 3, day: 31 },
  suspended_mar31_before_oct1: { month: 9, day: 30 },
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO `YYYY-MM-DD` deadline for an adding suspension; null for any other
 *  reason code, or when `snapshotDate` isn't an ISO date. */
export function reinstateDeadline(
  reason: string,
  snapshotDate: string
): string | null {
  const deadline = DEADLINE_BY_REASON[reason]
  const m = ISO_DATE.exec(snapshotDate)
  if (!deadline || !m) return null
  const year = Number(m[1])
  const sameYear = `${year}-${pad(deadline.month)}-${pad(deadline.day)}`
  // ISO dates compare as strings.
  return snapshotDate <= sameYear
    ? sameYear
    : `${year + 1}-${pad(deadline.month)}-${pad(deadline.day)}`
}

/* Ron, 2026-11-20: the page always talks about THIS year's club base, fixed
   on July 1. A March 31 suspension reinstated from April 1 to June 30 only
   counts toward next year's base, so it doesn't add; from July 1 to
   September 30 it does. Decided here from the reason code and the snapshot
   date, not the row's `addsToBase`, which files written before #3103 set
   for next year's base in that window. Since #3103 the pipeline itself
   emits `suspended_mar31_before_july1` (addsToBase false) there. Every other
   code keeps the pipeline's flag. */
const MAR31_ADDING = 'suspended_mar31_before_oct1'

/** Whether reinstating this club now adds to this year's club base. */
export function addsToThisYearsBase(
  reason: string,
  addsToBase: boolean,
  snapshotDate: string
): boolean {
  if (reason !== MAR31_ADDING) return addsToBase
  // The code only appears from April to September; April to June is the
  // window whose reinstatements count toward next year's base.
  const month = Number(ISO_DATE.exec(snapshotDate)?.[2])
  return !(month >= 4 && month <= 6)
}

/* #3109 review (F1): a suspend date more than 3 days from March 31 or
   September 30 is off the renewal cycle (the pipeline's tolerance,
   CYCLE_TOLERANCE_DAYS in analytics-core; TI stamps a passed deadline the
   day after). The pipeline places such a club by Ron's convention, but the
   Why sentences name a renewal, so those rows get none until Ron approves
   wording. */
const CYCLE_TOLERANCE_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

/** Whether an ISO suspend date is off the Sep 30 / Mar 31 cycle. False
 *  for a missing or malformed date. */
export function isOffCycleSuspendDate(
  suspendDate: string | undefined
): boolean {
  const m = ISO_DATE.exec(suspendDate ?? '')
  if (!m) return false
  const year = Number(m[1])
  const at = Date.UTC(year, Number(m[2]) - 1, Number(m[3]))
  const deadlines = [Date.UTC(year, 2, 31), Date.UTC(year, 8, 30)]
  return deadlines.every(d => Math.abs(at - d) > CYCLE_TOLERANCE_DAYS * DAY_MS)
}
