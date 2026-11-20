/* #3111 — the five-period reinstate window, drawn from what the pipeline
   already decided (#3103, `classifyReinstatement` in analytics-core, R3):
   `lastChanceBy` is the last day of inactive period 5 and `inactivePeriod`
   the period the club is in on the snapshot date. This file only lays the
   five periods out backwards from that last day; it never re-derives the
   rule.

   Renewal periods run October 1 to March 31 and April 1 to September 30
   (Ron, District 61 director, 2026-11-20). Period 1 is the one after the
   suspension deadline, the period the club is suspended in. Periods 2 to 5
   it is closed. */

import { formatDisplayDate, formatLongDate } from './dateFormatting'

export const WINDOW_PERIODS = 5

export interface WindowPeriod {
  /** 1 to 5. */
  number: number
  /** First day, ISO. */
  start: string
  /** Last day, ISO. */
  end: string
  /** "Oct 2024 – Mar 2025" */
  range: string
  status: 'suspended' | 'closed'
}

/** Draft switch (#3111): period 5 shows one line that merges the approved
 *  period line with the approved "must reinstate by" line. Whether to merge
 *  is Ron's call; set false to show the two lines separately. */
export const MERGE_PERIOD5_LINE = true

const PERIOD_END = /^(\d{4})-(03-31|09-30)$/

/** "Oct 2024" */
const monthYear = (iso: string) =>
  formatDisplayDate(iso, { month: 'short', year: 'numeric' })

/**
 * The five periods ending on `lastChanceBy`. Null when it isn't a period
 * end (March 31 or September 30), so a bad value draws nothing.
 */
export function reinstateWindowPeriods(
  lastChanceBy: string
): WindowPeriod[] | null {
  const m = PERIOD_END.exec(lastChanceBy)
  if (!m) return null
  // A counter that goes up by one each period: the period starting Apr 1 of
  // Y is 2Y, the one starting Oct 1 of Y is 2Y + 1.
  const year = Number(m[1])
  const last = m[2] === '09-30' ? 2 * year : 2 * (year - 1) + 1
  const periods: WindowPeriod[] = []
  for (let n = 1; n <= WINDOW_PERIODS; n++) {
    const index = last - (WINDOW_PERIODS - n)
    const y = Math.floor(index / 2)
    const october = index % 2 === 1
    const start = october ? `${y}-10-01` : `${y}-04-01`
    const end = october ? `${y + 1}-03-31` : `${y}-09-30`
    periods.push({
      number: n,
      start,
      end,
      range: `${monthYear(start)} – ${monthYear(end)}`,
      status: n === 1 ? 'suspended' : 'closed',
    })
  }
  return periods
}

/** A period the window can draw: a whole number from 1 to 5. */
export function isWindowPeriod(period: number | undefined): period is number {
  return (
    period !== undefined &&
    Number.isInteger(period) &&
    period >= 1 &&
    period <= WINDOW_PERIODS
  )
}

/** The screen reader sentence: "Period 5 of 5, last chance March 31, 2027." */
export function reinstateWindowSummary(
  inactivePeriod: number,
  lastChanceBy: string
): string {
  return `Period ${inactivePeriod} of ${WINDOW_PERIODS}, last chance ${formatLongDate(lastChanceBy)}.`
}

/** "Last chance: must reinstate by March 31, 2027, or charter as a new
 *  club." Approved by Ron on 2026-11-20 (#3103), period 5 only. */
export function mustReinstateText(lastChanceBy: string): string {
  return `Last chance: must reinstate by ${formatLongDate(lastChanceBy)}, or charter as a new club.`
}

/**
 * The Can reinstate row line, for a row the pipeline gives a period.
 * Pattern approved by Ron (2026-11-20), no full stop after the date:
 * "Period 4 of 5. Last chance: September 30, 2027". Period 5 merges it with {@link mustReinstateText} while
 * {@link MERGE_PERIOD5_LINE} is on; with it off, period 5 shows only that
 * approved sentence, as before #3111. Empty without a period in 1 to 5 or
 * without a date.
 */
export function reinstatePeriodLine(
  row: {
    inactivePeriod?: number | undefined
    lastChanceBy?: string | undefined
  },
  { mergePeriod5 = MERGE_PERIOD5_LINE }: { mergePeriod5?: boolean } = {}
): string {
  const { inactivePeriod, lastChanceBy } = row
  if (!isWindowPeriod(inactivePeriod) || !lastChanceBy) return ''
  const lead = `Period ${inactivePeriod} of ${WINDOW_PERIODS}.`
  if (inactivePeriod !== WINDOW_PERIODS) {
    return `${lead} Last chance: ${formatLongDate(lastChanceBy)}`
  }
  return mergePeriod5
    ? `${lead} ${mustReinstateText(lastChanceBy)}`
    : mustReinstateText(lastChanceBy)
}

/** The Growth page example: suspended at the March 31, 2025 renewal, so
 *  period 1 is Apr 2025 – Sep 2025 and the last chance is September 30,
 *  2027. A September date can't match the base deadline on the same card,
 *  which is March 31 in the October cycle (review of 09bb8f19c). */
export const EXAMPLE_SUSPENDED_AT = '2025-03-31'
export const EXAMPLE_LAST_CHANCE = '2027-09-30'
