/**
 * Reinstatement rule (#3007, #3103): which suspended or closed clubs can still
 * be reinstated, which inactive renewal period each is in, and whether
 * reinstating one now adds to the club base.
 *
 * Sources:
 * - Toastmasters International's Club FAQ (club reinstatement):
 *   - "Clubs that have been inactive for five (5) renewal periods must be
 *     chartered as new clubs."
 *   - "Reinstatement during the October renewal cycle will increase the club
 *     base."
 *   - "On October 1, the club will enter a closed status and a reinstatement
 *     after this date will not increase the club base."
 *   - Closed clubs "will not increase the club base".
 * - Ron Servant, District 61 director, 2026-11-20: how the five periods are
 *   counted (below), and how an off-cycle suspension is placed.
 *
 * ## Renewal periods
 *
 * Two a year: Oct 1 to Mar 31, and Apr 1 to Sep 30. Everything below counts
 * in whole periods. Source for the October period ending Mar 31 (so the
 * October cycle a Sep 30 suspension can reinstate in ends Mar 31): Ron
 * (District 61 director, 2026-11-20) and TI Club FAQ footnote: 'by the end
 * of the renewal cycle (September 30/March 31)' (#3100).
 *
 * ## Who is eligible (Ron, District 61 director, 2026-11-20, #3103)
 *
 * - A club suspended at a deadline (Sep 30 or Mar 31) is suspended for the
 *   period AFTER that deadline. That period is inactive period 1: Sep 30 2024
 *   makes Oct 2024 - Mar 2025 period 1.
 * - Suspended and closed periods both count. The club can reinstate through
 *   the end of its fifth inactive period: eligible while the period that
 *   contains `asOf` is period 5 or lower. `lastChanceBy` is the last day of
 *   period 5 (Mar 31 or Sep 30).
 * - Off-cycle suspend dates (Ron, 2026-11-20): the period containing the day
 *   after the suspend date is the suspension period and inactive period 1.
 *   For the club base it counts like the deadline just before that period,
 *   with the same reinstate-by date: 2026-06-15 is treated like the
 *   2026-03-31 suspensions (suspended Apr - Sep 2026), so it adds if it
 *   reinstates by Sep 30 2026.
 *
 * Where the suspension comes from, best first:
 * 1. TI's suspend date (the suspended lists, from 2025-07-31 on).
 * 2. `suspensionDeadline`: the deadline before the start of the club's last
 *    run of Suspended status, from the legacy file built once from the
 *    2024-25 monthly history (`config/legacy-suspension-deadlines.json`).
 * 3. Neither: only `lastSeen` is known. It is capped at a program year's last
 *    snapshot (Jun 30) and mixes cohorts there, so it can't give the period.
 *    The suspension can be no later than the day after `lastSeen`, so a club
 *    is left out when even that reading is past period 5, and listed with no
 *    period otherwise. Toastmasters makes the final call.
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
 * What matters is the suspension deadline (an off-cycle date counts as the
 * deadline before its period):
 *
 * | Suspended at              | Reinstated                 | Adds? |
 * | ------------------------- | -------------------------- | ----- |
 * | Sep 30 of `S`             | Oct 1 of `S` to Mar 31     | yes   |
 * | Mar 31 of `S`             | before Oct 1 of `S`        | yes   |
 * | Mar 31 of `S`             | on or after Oct 1 of `S`   | no    |
 * | Sep 30 of `S - 1`         | Apr 1 of `S` on            | no, the club has closed |
 * | an earlier deadline       |                            | no, the club has closed |
 *
 * That a Sep 30 suspension has closed by Apr 1 of the next year is an
 * inference, not a TI statement: District 61 clubs suspended Sep 30 2024 were
 * Suspended on 2025-03-31 and gone from the roster on 2025-04-30 (#3011).
 *
 * A closed club never adds.
 *
 * ## Mapping a suspend date to a deadline
 *
 * TI stamps the suspension a day after the cycle ends: the real District 83
 * rows recorded on 2026-10-13 all read `2026-10-01` for the Sep 30 cycle
 * (frontend/src/__tests__/fixtures/suspended-clubs-2026-10-13.recorded.json).
 * Other sources give Sep 30 or Mar 31 exactly. So a date within
 * {@link CYCLE_TOLERANCE_DAYS} days of Sep 30 or Mar 31, either side, is that
 * deadline. Any other date is off-cycle and placed as above.
 *
 * @module reinstatement
 */

export type ReinstatementInput =
  | { status: 'suspended'; suspendDate: string }
  | {
      status: 'closed'
      lastSeen: string
      /** The club's TI suspend date, when a suspended list still had it. */
      suspendDate?: string
      /**
       * The club's suspension deadline from status history, for clubs
       * suspended before TI's suspend date reached our data (#3103).
       * A TI suspend date wins over it.
       */
      suspensionDeadline?: string
    }

/** Stable codes: safe to store, test against and map to display text. */
export type ReinstatementReason =
  /** Suspended at the Sep 30 deadline of `S` and `asOf` is in the October cycle. Adds. */
  | 'suspended_sept30_october_cycle'
  /** Suspended at the Mar 31 deadline of `S` and `asOf` is before Oct 1. Adds. */
  | 'suspended_mar31_before_oct1'
  /** Suspended at a Mar 31 deadline and `asOf` is on or after Oct 1. Does not add. */
  | 'suspended_mar31_after_oct1'
  /**
   * Suspended at a Sep 30 deadline whose October cycle is over. The club has
   * closed by then (an inference, see the module comment). Does not add.
   */
  | 'suspended_sept30_past_october_cycle'
  /**
   * The suspend date is not a date. Does not add. Since #3103 an off-cycle
   * date is placed by its period instead; the code stays for old files.
   */
  | 'suspend_date_unexpected'
  /** The suspend date is later than `asOf`. Does not add. */
  | 'suspend_date_after_as_of'
  /** Closed, period 5 or lower (or not known to be past it). Does not add. */
  | 'closed_does_not_add'
  /** Closed and past its fifth inactive period. Not eligible. */
  | 'closed_outside_window'
  /** `lastSeen` is on or after `asOf`: not closed yet. Not eligible. */
  | 'closed_last_seen_after_as_of'
  /** `lastSeen` is not an ISO date. Not eligible. */
  | 'closed_last_seen_invalid'

export interface ReinstatementResult {
  eligible: boolean
  /**
   * Always false since #3103: the four-period window it belonged to is gone.
   * Kept so already-deployed readers, which require it, still parse the file.
   */
  oldestPeriod: boolean
  addsToBase: boolean
  /** The program year whose July 1 base a reinstatement now would affect. */
  baseProgramYear: string
  reason: ReinstatementReason
  /** Inactive renewal period (1-5) the club is in on `asOf`, when known. */
  inactivePeriod?: number
  /** ISO date: the last day of inactive period 5, when the period is known. */
  lastChanceBy?: string
}

/** How far a suspend date may sit from Sep 30 or Mar 31 and still count. */
export const CYCLE_TOLERANCE_DAYS = 3

/** The last inactive period a club can reinstate in (TI Club FAQ). */
export const MAX_INACTIVE_PERIODS = 5

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

const yearOf = (t: number): number => new Date(t * DAY_MS).getUTCFullYear()
const monthOf = (t: number): number => new Date(t * DAY_MS).getUTCMonth() + 1

/** Start year of the program year a reinstatement on `asOf` counts toward. */
function baseStartYear(asOf: number): number {
  // Apr - Dec: the program year that starts (or started) this July. Apr 1 -
  // Jun 30 is the next year's base. Jan - Mar: the year that started last July.
  return monthOf(asOf) >= 4 ? yearOf(asOf) : yearOf(asOf) - 1
}

/**
 * Renewal period containing day `t`, as a counter that goes up by one each
 * period: the one starting Oct 1 of Y is 2Y + 1, Apr 1 of Y is 2Y.
 */
function periodIndex(t: number): number {
  const y = yearOf(t)
  const m = monthOf(t)
  if (m >= 10) return 2 * y + 1
  if (m >= 4) return 2 * y
  return 2 * (y - 1) + 1
}

/** First day of period `index`. */
function periodStartDay(index: number): number {
  const y = Math.floor(index / 2)
  return index % 2 === 1 ? day(y, 10, 1) : day(y, 4, 1)
}

/** Last day of period `index`, ISO. */
function periodEndIso(index: number): string {
  const y = Math.floor(index / 2)
  return index % 2 === 1 ? `${y + 1}-03-31` : `${y}-09-30`
}

function baseLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}`
}

/**
 * The deadline (Sep 30 or Mar 31) a suspend date counts as: the deadline
 * itself within the tolerance, otherwise the deadline just before the period
 * that contains the day after the date (Ron, 2026-11-20). Null when that
 * deadline isn't known by `asOf`: a date after `asOf` is never placed, except
 * TI's day-after stamp of a deadline that has passed.
 */
function deadlineFor(d: number, asOf: number): number | null {
  const y = yearOf(d)
  for (const target of [day(y, 3, 31), day(y, 9, 30)]) {
    if (Math.abs(d - target) <= CYCLE_TOLERANCE_DAYS) {
      return target > asOf ? null : target
    }
  }
  return d > asOf ? null : periodStartDay(periodIndex(d + 1)) - 1
}

/** Inactive period on `asOf` and the last-chance date, or nothing. */
function periodFields(
  deadline: number,
  asOf: number
): Pick<ReinstatementResult, 'inactivePeriod' | 'lastChanceBy'> | null {
  const first = periodIndex(deadline + 1)
  const k = periodIndex(asOf) - first + 1
  if (k < 1 || k > MAX_INACTIVE_PERIODS) return null
  return {
    inactivePeriod: k,
    lastChanceBy: periodEndIso(first + MAX_INACTIVE_PERIODS - 1),
  }
}

function classifySuspended(
  deadline: number,
  asOf: number,
  s: number
): Pick<ReinstatementResult, 'addsToBase' | 'reason'> {
  const isSept = monthOf(deadline) === 9
  const y = yearOf(deadline)
  if (isSept && y === s) {
    // The October cycle: through Mar 31 of S+1 (asOf is never later while
    // its base year is S). On Sep 30 itself it is already the cycle's.
    return { addsToBase: true, reason: 'suspended_sept30_october_cycle' }
  }
  if (!isSept && y === s) {
    return asOf < day(s, 10, 1)
      ? { addsToBase: true, reason: 'suspended_mar31_before_oct1' }
      : { addsToBase: false, reason: 'suspended_mar31_after_oct1' }
  }
  // An earlier deadline: the club has closed, so it does not add.
  return isSept
    ? { addsToBase: false, reason: 'suspended_sept30_past_october_cycle' }
    : { addsToBase: false, reason: 'suspended_mar31_after_oct1' }
}

/** The suspension deadline from a TI date or a status-history deadline. */
function knownDeadline(value: string | undefined, asOf: number): number | null {
  if (value === undefined) return null
  const d = parseIso(value)
  return d === null ? null : deadlineFor(d, asOf)
}

/**
 * Classifies a suspended or closed club for reinstatement as of `asOf`.
 *
 * @param input A suspended club (with its `suspendDate`) or a closed club
 *   (with its `lastSeen`, and its suspension when known), all ISO
 *   `YYYY-MM-DD`.
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
    const d = parseIso(input.suspendDate)
    if (d === null) {
      return {
        eligible: true,
        oldestPeriod: false,
        addsToBase: false,
        baseProgramYear,
        reason: 'suspend_date_unexpected',
      }
    }
    const deadline = deadlineFor(d, asOfDay)
    if (deadline === null) {
      return {
        eligible: true,
        oldestPeriod: false,
        addsToBase: false,
        baseProgramYear,
        reason: 'suspend_date_after_as_of',
      }
    }
    return {
      eligible: true,
      oldestPeriod: false,
      baseProgramYear,
      ...classifySuspended(deadline, asOfDay, s),
      ...periodFields(deadline, asOfDay),
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
  const outside = {
    ...base,
    eligible: false,
    reason: 'closed_outside_window' as const,
  }
  const deadline =
    knownDeadline(input.suspendDate, asOfDay) ??
    knownDeadline(input.suspensionDeadline, asOfDay)
  if (deadline !== null) {
    const fields = periodFields(deadline, asOfDay)
    if (fields === null) return outside
    return {
      ...base,
      eligible: true,
      reason: 'closed_does_not_add',
      ...fields,
    }
  }
  // lastSeen only: the latest the suspension can be is the day after it.
  const fewest = periodIndex(asOfDay) - periodIndex(lastSeen + 1) + 1
  if (fewest > MAX_INACTIVE_PERIODS) return outside
  return { ...base, eligible: true, reason: 'closed_does_not_add' }
}
