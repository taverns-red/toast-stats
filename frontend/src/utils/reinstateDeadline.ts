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
