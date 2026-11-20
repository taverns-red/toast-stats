/**
 * Reinstatement rule (#3007, phase 1): which suspended or closed clubs can
 * still be reinstated, and whether reinstating one now adds to the club base.
 *
 * Source: Toastmasters International's club reinstatement FAQ. Quotes used:
 *  - "Reinstatement during the October renewal cycle will increase the club
 *    base."
 *  - "On October 1, the club will enter a closed status and a reinstatement
 *    after this date will not increase the club base."
 *  - Closed clubs "will not increase the club base".
 *
 * ## Renewal periods
 *
 * Two a year: Oct 1 to Mar 31, and Apr 1 to Sep 30. Everything below counts
 * in whole periods. Source for the October period ending Mar 31 (so the
 * October cycle a Sep 30 suspension can reinstate in ends Mar 31): Ron
 * (District 61 director, 2026-11-20) and TI Club FAQ footnote: 'by the end
 * of the renewal cycle (September 30/March 31)' (#3100).
 *
 * ## Who is eligible
 *
 * - A suspended club: always.
 * - A closed club: when its closure falls in the four renewal periods counting
 *   back from, and including, the period that contains `asOf` (so "past four
 *   periods" is the current period plus the three before it, the narrower
 *   reading Ron chose in #3007). The oldest of
 *   the four is flagged `oldestPeriod` ("confirm with World Headquarters"):
 *   the FAQ's "four renewal periods" and "inactive for five" answers don't
 *   clearly agree (Ron, #3007).
 *
 * We have no closure date, only `lastSeen`, the last snapshot in which the
 * club was on the roster. The closure is taken as the day after `lastSeen`.
 * Checked against real District 61 snapshots (#3011): a suspended club stays on
 * the roster, marked Suspended, until it closes. Five clubs suspended in the
 * Sep 30 2024 cycle were Suspended on 2024-10-31 and 2025-03-31 and gone on
 * 2025-04-30, so their `lastSeen` 2025-03-31 is the day before closure, not
 * the suspend date. `lastSeen` can run early by up to one snapshot gap, and
 * is capped at a program year's last snapshot (Jun 30).
 * So `lastSeen` 2025-03-31 closed on 2025-04-01, in the Apr-Sep 2025 period,
 * and `lastSeen` 2025-03-30 closed on 2025-03-31, in the period before.
 * When the club's suspend date is known, it fixes the closure instead
 * (Oct 1 for the Mar 31 cycle, from the FAQ; Apr 1 of the next year for the
 * Sep 30 cycle, an inference from the District 61 snapshots above, which the
 * FAQ doesn't state), unless the club was seen later than that. A club seen on `asOf` itself
 * was on the roster that day, so it is not closed yet (#3064 review).
 * With `asOf` 2026-11-17 the four periods are Oct 2026-Mar 2027, Apr-Sep 2026,
 * Oct 2025-Mar 2026 and Apr-Sep 2025 (the oldest). The window slides on each
 * Apr 1 and Oct 1.
 *
 * ## Base year
 *
 * The club base belongs to a program year and is fixed on July 1. A
 * reinstatement between Apr 1 and Jun 30 counts toward the NEXT program year;
 * at any other time, toward the current one. `baseProgramYear` is that year,
 * as `YYYY-YYYY`. Its start year `S` is what the cycles below hang from.
 *
 * ## Does it add to the base (suspended clubs)
 *
 * What matters is which renewal cycle ended with the suspension:
 *
 * | Suspended at the end of | Reinstated                 | Adds? |
 * | ----------------------- | -------------------------- | ----- |
 * | Sep 30 of `S`           | Oct 1 of `S` to Mar 31     | yes   |
 * | Mar 31 before Jul 1 `S` | before Oct 1 of `S`        | yes   |
 * | Mar 31 before Jul 1 `S` | on or after Oct 1 of `S`   | no    |
 * | Sep 30 of `S - 1`       | Apr 1 of `S` on            | no, the club has closed |
 * | any other date          |                            | no, with a distinct reason, never a guess |
 *
 * A closed club never adds.
 *
 * ## Mapping a suspend date to a cycle
 *
 * TI stamps the suspension a day after the cycle ends: the real District 83
 * rows recorded on 2026-10-13 all read `2026-10-01` for the Sep 30 cycle
 * (frontend/src/__tests__/fixtures/suspended-clubs-2026-10-13.recorded.json).
 * Other sources give Sep 30 or Mar 31 exactly. So a date belongs to a cycle
 * by which cycle it ends, not by equality: within {@link CYCLE_TOLERANCE_DAYS}
 * days of Sep 30 or Mar 31, either side. Anything farther out is "unexpected".
 *
 * @module reinstatement
 */

export type ReinstatementInput =
  | { status: 'suspended'; suspendDate: string }
  | {
      status: 'closed'
      lastSeen: string
      /**
       * The club's suspend date, when a suspended list still had it. The FAQ
       * then fixes the closure: Oct 1 for the Mar 31 cycle, Apr 1 of the next
       * year for the Sep 30 cycle. A later sighting still wins.
       */
      suspendDate?: string
    }

/** Stable codes: safe to store, test against and map to display text. */
export type ReinstatementReason =
  /** Suspended at the Sep 30 cycle and `asOf` is in the October cycle. Adds. */
  | 'suspended_sept30_october_cycle'
  /** Suspended at the Mar 31 cycle and `asOf` is before Oct 1. Adds. */
  | 'suspended_mar31_before_oct1'
  /** Suspended at the Mar 31 cycle and `asOf` is on or after Oct 1. Does not add. */
  | 'suspended_mar31_after_oct1'
  /**
   * Suspended at the Sep 30 cycle of the year before the base year, and `asOf`
   * is past the October cycle (on or after Apr 1). By the FAQ the club has
   * closed by then, so reinstating does not add to the base.
   */
  | 'suspended_sept30_past_october_cycle'
  /** Suspend date is not at a cycle end that matches the base year. Does not add. */
  | 'suspend_date_unexpected'
  /** Suspend date is later than `asOf`. Does not add. */
  | 'suspend_date_after_as_of'
  /** Closed inside the four-period window. Does not add. */
  | 'closed_does_not_add'
  /** Closed before the four-period window. Not eligible. */
  | 'closed_outside_window'
  /** `lastSeen` is on or after `asOf`: not closed yet. Not eligible. */
  | 'closed_last_seen_after_as_of'
  /** `lastSeen` is not an ISO date. Not eligible. */
  | 'closed_last_seen_invalid'

export interface ReinstatementResult {
  eligible: boolean
  /** True: the closure is in the oldest of the four periods, confirm with WHQ. */
  oldestPeriod: boolean
  addsToBase: boolean
  /** The program year whose July 1 base a reinstatement now would affect. */
  baseProgramYear: string
  reason: ReinstatementReason
}

/** How far a suspend date may sit from Sep 30 or Mar 31 and still count. */
export const CYCLE_TOLERANCE_DAYS = 3

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/** UTC day number for an ISO date, or null when it isn't a real date. */
function parseIso(value: string): number | null {
  const m = ISO_DATE.exec(value)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(y, mo - 1, d)
  const back = new Date(t)
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d
  ) {
    return null
  }
  return t / DAY_MS
}

const day = (y: number, month1: number, d: number): number =>
  Date.UTC(y, month1 - 1, d) / DAY_MS

/** Start year of the program year a reinstatement on `asOf` counts toward. */
function baseStartYear(asOf: number): number {
  const dt = new Date(asOf * DAY_MS)
  const y = dt.getUTCFullYear()
  const m = dt.getUTCMonth() + 1
  // Apr - Dec: the program year that starts (or started) this July. Apr 1 -
  // Jun 30 is the next year's base. Jan - Mar: the year that started last July.
  return m >= 4 ? y : y - 1
}

/** First day of the renewal period containing `t`. */
function periodStart(t: number): number {
  const dt = new Date(t * DAY_MS)
  const y = dt.getUTCFullYear()
  const m = dt.getUTCMonth() + 1
  if (m >= 10) return day(y, 10, 1)
  if (m >= 4) return day(y, 4, 1)
  return day(y - 1, 10, 1)
}

/**
 * Start of the period three periods before the one starting at `current`
 * (the oldest of the four). Each step back swaps Oct 1 and Apr 1:
 * Oct 1 Y -> Apr 1 Y -> Oct 1 Y-1 -> Apr 1 Y-1, and
 * Apr 1 Y -> Oct 1 Y-1 -> Apr 1 Y-1 -> Oct 1 Y-2.
 */
function oldestPeriodStart(current: number): number {
  const dt = new Date(current * DAY_MS)
  const y = dt.getUTCFullYear()
  return dt.getUTCMonth() + 1 === 10 ? day(y - 1, 4, 1) : day(y - 2, 10, 1)
}

function baseLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}`
}

/**
 * The closure for a suspend date: Oct 1 of the same year for the Mar 31
 * cycle (the FAQ), Apr 1 of the next year for the Sep 30 cycle (inferred
 * from District 61 snapshots; see the module comment). Null when the date is
 * not near either cycle end.
 */
function closureFromSuspendDate(suspendDate: string): number | null {
  const d = parseIso(suspendDate)
  if (d === null) return null
  const y = new Date(d * DAY_MS).getUTCFullYear()
  // Sep 30 within tolerance can spill into Oct 1-3, same year.
  if (Math.abs(d - day(y, 3, 31)) <= CYCLE_TOLERANCE_DAYS) return day(y, 10, 1)
  if (Math.abs(d - day(y, 9, 30)) <= CYCLE_TOLERANCE_DAYS) {
    return day(y + 1, 4, 1)
  }
  return null
}

function classifySuspended(
  suspendDate: string,
  asOf: number,
  s: number
): Pick<ReinstatementResult, 'addsToBase' | 'reason'> {
  const unexpected = {
    addsToBase: false,
    reason: 'suspend_date_unexpected' as const,
  }
  const d = parseIso(suspendDate)
  if (d === null) return unexpected
  if (d > asOf) {
    return { addsToBase: false, reason: 'suspend_date_after_as_of' }
  }
  const near = (target: number): boolean =>
    Math.abs(d - target) <= CYCLE_TOLERANCE_DAYS

  const oct1 = day(s, 10, 1)
  if (near(day(s, 9, 30))) {
    // The October cycle: Oct 1 of S through Mar 31 of S+1 (source in the
    // module comment, "Renewal periods").
    const inOctoberCycle = asOf >= oct1 && asOf <= day(s + 1, 3, 31)
    return inOctoberCycle
      ? { addsToBase: true, reason: 'suspended_sept30_october_cycle' }
      : unexpected
  }
  if (near(day(s, 3, 31))) {
    return asOf < oct1
      ? { addsToBase: true, reason: 'suspended_mar31_before_oct1' }
      : { addsToBase: false, reason: 'suspended_mar31_after_oct1' }
  }
  if (near(day(s - 1, 9, 30))) {
    return { addsToBase: false, reason: 'suspended_sept30_past_october_cycle' }
  }
  return unexpected
}

/**
 * Classifies a suspended or closed club for reinstatement as of `asOf`.
 *
 * @param input A suspended club (with its `suspendDate`) or a closed club
 *   (with its `lastSeen`), both ISO `YYYY-MM-DD`.
 * @param asOf ISO `YYYY-MM-DD`. Throws `RangeError` when it isn't one.
 */
export function classifyReinstatement(
  input: ReinstatementInput,
  asOf: string
): ReinstatementResult {
  const asOfDay = parseIso(asOf)
  if (asOfDay === null) {
    throw new RangeError(`asOf must be an ISO date (YYYY-MM-DD), got "${asOf}"`)
  }
  const s = baseStartYear(asOfDay)
  const baseProgramYear = baseLabel(s)

  if (input.status === 'suspended') {
    return {
      eligible: true,
      oldestPeriod: false,
      baseProgramYear,
      ...classifySuspended(input.suspendDate, asOfDay, s),
    }
  }

  const base = { oldestPeriod: false, addsToBase: false, baseProgramYear }
  const lastSeen = parseIso(input.lastSeen)
  if (lastSeen === null) {
    return { ...base, eligible: false, reason: 'closed_last_seen_invalid' }
  }
  // Seen on asOf itself: the club was on the roster that day, not closed.
  if (lastSeen >= asOfDay) {
    return { ...base, eligible: false, reason: 'closed_last_seen_after_as_of' }
  }
  const fromSuspend =
    input.suspendDate === undefined
      ? null
      : closureFromSuspendDate(input.suspendDate)
  const closure = Math.max(lastSeen + 1, fromSuspend ?? 0)
  const windowStart = oldestPeriodStart(periodStart(asOfDay))
  if (closure < windowStart) {
    return { ...base, eligible: false, reason: 'closed_outside_window' }
  }
  const oldest = periodStart(closure) === windowStart
  return {
    ...base,
    eligible: true,
    oldestPeriod: oldest,
    reason: 'closed_does_not_add',
  }
}
