/**
 * Copy for a crossing window (#1556).
 *
 * The collector records the first snapshot date a club met a tier's
 * requirements AND the observed snapshot date before it. Those two dates
 * are the honest resolution of the crossing — the days in between were
 * never collected — so the copy names the window rather than a point:
 *
 * - previous observed date is the day before → "on 12 Aug"
 * - otherwise                                → "between 17 Aug and 19 Aug"
 * - nothing earlier ever observed            → "by 26 Jul 2026"
 *
 * Dates are parsed as UTC calendar dates and formatted field-by-field, so a
 * first-of-month never rolls back a day in a negative-offset timezone
 * (Lesson: #1116 item 2).
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

interface CalendarDate {
  year: number
  month: number
  day: number
}

function parse(iso: string): CalendarDate {
  return {
    year: Number.parseInt(iso.slice(0, 4), 10),
    month: Number.parseInt(iso.slice(5, 7), 10),
    day: Number.parseInt(iso.slice(8, 10), 10),
  }
}

const format = (d: CalendarDate, withYear: boolean): string =>
  `${d.day} ${MONTHS[d.month - 1]}${withYear ? ` ${d.year}` : ''}`

/** Whole days from `a` to `b` (UTC midnight to UTC midnight). */
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export function reachWindowCopy(
  reachedOn: string,
  observedAfter: string | null
): string {
  const on = parse(reachedOn)
  if (observedAfter === null) return `by ${format(on, true)}`

  if (daysBetween(observedAfter, reachedOn) <= 1) {
    return `on ${format(on, false)}`
  }

  const after = parse(observedAfter)
  const straddlesYear = after.year !== on.year
  return `between ${format(after, straddlesYear)} and ${format(on, straddlesYear)}`
}
