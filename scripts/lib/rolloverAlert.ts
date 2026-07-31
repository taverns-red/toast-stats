/**
 * Program-year rollover alerting (#1343, follows #1342).
 *
 * The collector resolves the active program year by data and falls back to the
 * prior year when the calendar year isn't available. That fallback is correct,
 * self-healing — and, until now, completely silent: one `warn` in a job log
 * nobody reads, and a pipeline that still reports success.
 *
 * That silence is why #1342 (TI moving the export URL) went unnoticed for a
 * month. Every run fell back for the same indistinguishable-looking reason.
 *
 * This module decides when a fallback stops being routine. It deliberately
 * needs NO persistent state: "how long have we been falling back?" is derivable
 * from the target date and the calendar program year's July 1 start, so there
 * is no counter to drift, reset, or lose on an ephemeral runner (R2).
 */

/**
 * How long TI's rollover may legitimately lag July 1 before an unpublished
 * new year is treated as a problem.
 *
 * Grounded in observation, not guesswork: in 2026 the new year was still
 * unpublished on July 29 and June's close did not land until July 29
 * (docs/month-end-closing-dates.json, `2026-06` → `2026-07-29`). 35 days
 * clears that comfortably while still catching a genuinely stuck rollover
 * well before a month-end close depends on it.
 */
export const ROLLOVER_GRACE_DAYS = 35

export type RolloverReason = 'resolved' | 'not-published' | 'upstream-error'

export interface RolloverAlertInput {
  /** The resolver's reason for this run. */
  reason: RolloverReason
  /** The program year actually scraped. */
  programYear: string
  /** Target date, `YYYY-MM-DD`. */
  date: string
}

export interface RolloverAlertResult {
  /** File or refresh the `program-year-rollover-overdue` issue. */
  alert: boolean
  /** Close any open issue — the rollover completed. */
  shouldClose: boolean
  /** Days since the calendar program year began (July 1), or null if unparseable. */
  daysIntoProgramYear: number | null
  /** One-line human summary for the issue body / step summary. */
  summary: string
}

/**
 * Days from the July 1 start of `date`'s calendar program year to `date`.
 * Anchored in UTC so the count is timezone- and DST-invariant.
 */
function daysIntoProgramYear(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  // Program year runs July 1 – June 30.
  const startYear = month >= 7 ? year : year - 1
  const diffMs = Date.UTC(year, month - 1, day) - Date.UTC(startYear, 6, 1)
  return Math.floor(diffMs / 86_400_000)
}

export function evaluateRolloverAlert(
  input: RolloverAlertInput
): RolloverAlertResult {
  const days = daysIntoProgramYear(input.date)

  if (input.reason === 'resolved') {
    return {
      alert: false,
      shouldClose: true,
      daysIntoProgramYear: days,
      summary: `Active program year ${input.programYear} resolved normally.`,
    }
  }

  if (input.reason === 'upstream-error') {
    return {
      alert: true,
      shouldClose: false,
      daysIntoProgramYear: days,
      summary:
        `The Toastmasters dashboard could not be reached while resolving the ` +
        `program year — the fetch threw rather than reporting "not published". ` +
        `Scraping fell back to ${input.programYear}. This is an upstream error, ` +
        `not a rollover wait, and will not self-heal.`,
    }
  }

  // not-published: benign inside the grace window, overdue past it. An
  // unparseable date fails LOUD — a silent 0-day count would suppress a real
  // alert, which is precisely the failure mode this module exists to end.
  if (days === null) {
    return {
      alert: true,
      shouldClose: false,
      daysIntoProgramYear: null,
      summary:
        `Falling back to ${input.programYear}, and the target date ` +
        `"${input.date}" could not be parsed to judge how overdue the ` +
        `rollover is. Alerting rather than assuming it is early.`,
    }
  }

  const overdue = days > ROLLOVER_GRACE_DAYS
  return {
    alert: overdue,
    shouldClose: false,
    daysIntoProgramYear: days,
    summary: overdue
      ? `The new program year still has no published data ${days} days in ` +
        `(grace ${ROLLOVER_GRACE_DAYS}). Scraping is still on ${input.programYear}.`
      : `New program year not published yet (${days} days in, within the ` +
        `${ROLLOVER_GRACE_DAYS}-day grace window). Scraping ${input.programYear}.`,
  }
}
