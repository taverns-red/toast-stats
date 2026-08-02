/**
 * Backfill fetch guard (#1384).
 *
 * Two independent facts about `dashboards.toastmasters.org/export.aspx` make a
 * backfill dangerous, and neither one shows up as an HTTP error:
 *
 *  1. **The root path ignores the `~{programYear}` token** (#1342). Pointing a
 *     historical fetch at it returns *current* data with a 200 and a valid
 *     `DISTRICT` header, which `isValidDistrictSummaryCsv` happily accepts —
 *     history rewritten, silently.
 *  2. **The root path also ignores the as-of date when the month-end slot is
 *     empty**, serving today instead:
 *
 *     ```
 *     districtsummary~7/31/2026~7/26/2026~2026-2027  → As of 07/26/2026  correct
 *     districtsummary~~7/26/2026~2026-2027           → As of 08/01/2026  CURRENT
 *     ```
 *
 * Both are the same class of failure — *we did not get the period we asked
 * for* — and both are visible in the CSV footer, which we already parse. So
 * rather than special-casing today's instance, every backfilled body is
 * checked against the request that produced it, and a disagreement is a hard
 * failure that never reaches storage.
 *
 * A third outcome needs its own handling: the dashboard answers 200 with a
 * header row, a plausible footer and **zero data rows** for any period it has
 * nothing for — TI's dark window before a program year publishes, and old
 * archives that no longer retain arbitrary daily as-of dates. That is not an
 * error and not data; it is nothing, and writing it would publish a bogus
 * snapshot under a real date.
 */

import { getPriorProgramYear } from './CachePaths.js'
import { parseFooterAsOfDate } from './csvFooterParser.js'
import { programYearFromCsvFooter } from './programYearResolver.js'
import type { ExportPathStyle } from '../services/HttpCsvDownloader.js'

/**
 * Which endpoint shape a program year must be fetched from.
 *
 * The live year exists **only** at the bare `/export.aspx` (the archive path
 * returns HTTP 500 for it); every other year exists **only** under
 * `/{programYear}/`. `liveProgramYear` is what the root path currently serves —
 * when it is unknown, everything falls back to the archive path, which is the
 * safe default because its URL actually constrains the year.
 */
export function resolveExportPathStyle(
  programYear: string,
  liveProgramYear: string | undefined
): ExportPathStyle {
  return liveProgramYear !== undefined && programYear === liveProgramYear
    ? 'live'
    : 'archive'
}

/**
 * Count the data rows in a CSV body — everything that is not the header, not a
 * `Month of …, As of …` footer, and not blank.
 *
 * Deliberately conservative: anything unrecognised counts as a data row, so a
 * body is only ever reported empty when it genuinely has nothing in it.
 */
export function countCsvDataRows(content: string | undefined | null): number {
  if (!content) return 0
  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !/^"?Month of\s+[A-Za-z]+,\s*As of\s+[0-9/]+"?$/i.test(l))
  // The first surviving line is the header row.
  return Math.max(0, lines.length - 1)
}

/**
 * The verdict on a downloaded CSV.
 *
 * - `ok`       — it is what was asked for; ingest it.
 * - `empty`    — 200 with no data rows. Skip it: not an error, but not data.
 * - `mismatch` — the body is for a different period or year than requested.
 *                Never ingest; fail loudly.
 */
export type BackfillCsvVerdict =
  | { status: 'ok' }
  | { status: 'empty'; reason: string }
  | { status: 'mismatch'; reason: string }

export interface VerifyBackfillCsvInput {
  content: string | undefined
  /** The program year token the request carried. */
  programYear: string
  /** The as-of date the request carried, `YYYY-MM-DD`. */
  date: string
  /** Which endpoint the request went to. */
  pathStyle: ExportPathStyle
}

/** Thrown when a downloaded body is not for the period that was requested. */
export class BackfillContentMismatchError extends Error {
  constructor(
    message: string,
    readonly context: { programYear: string; date: string; url?: string }
  ) {
    super(message)
    this.name = 'BackfillContentMismatchError'
  }
}

/**
 * Decide whether a downloaded CSV may be ingested for the request that
 * produced it.
 *
 * Checks run mismatch-first so a wrong-period body is never softened into a
 * benign "empty".
 */
export function verifyBackfillCsv(
  input: VerifyBackfillCsvInput
): BackfillCsvVerdict {
  const { content, programYear, date, pathStyle } = input

  if (!content || content.trim().length === 0) {
    return { status: 'empty', reason: 'response body was empty' }
  }

  const footerAsOf = parseFooterAsOfDate(content)

  if (footerAsOf === undefined) {
    // No footer — UNDECIDED, not a verdict (#1129). Which way that resolves
    // depends entirely on whether the URL pinned the year for us:
    //   archive → the `/{PY}/` path constrains the year, so accept. Some older
    //             exports genuinely have no footer and rejecting them would
    //             break historical backfills.
    //   live    → the endpoint ignores the year token, so an unverifiable body
    //             is a body we cannot attribute to anything. Reject.
    if (pathStyle === 'live') {
      return {
        status: 'mismatch',
        reason:
          'live-path response has no "Month of …, As of …" footer, so the ' +
          'period it covers cannot be confirmed — the root endpoint ignores ' +
          'the requested program year (#1342)',
      }
    }
    return countCsvDataRows(content) === 0
      ? { status: 'empty', reason: 'no data rows' }
      : { status: 'ok' }
  }

  if (footerAsOf !== date) {
    return {
      status: 'mismatch',
      reason:
        `footer is "As of ${footerAsOf}" but ${date} was requested — the ` +
        'response is not for the requested date (#1384)',
    }
  }

  const footerProgramYear = programYearFromCsvFooter(content, date)
  if (
    footerProgramYear !== undefined &&
    footerProgramYear !== programYear &&
    !isPriorYearCloseWindow(footerProgramYear, programYear, date)
  ) {
    return {
      status: 'mismatch',
      reason:
        `footer describes program year ${footerProgramYear} but ` +
        `${programYear} was requested (#1342)`,
    }
  }

  if (countCsvDataRows(content) === 0) {
    return { status: 'empty', reason: 'no data rows' }
  }

  return { status: 'ok' }
}

/**
 * July is legitimately ambiguous: the prior year's June close keeps updating
 * for weeks into the new program year, so a July request against year Y can
 * correctly come back describing Y-1 ("Month of Jun"). Treating that as a
 * mismatch would hard-fail every early-July date of every historical backfill.
 *
 * Only that one window is excused — any other year disagreement stands.
 */
function isPriorYearCloseWindow(
  footerProgramYear: string,
  requestedProgramYear: string,
  date: string
): boolean {
  if (footerProgramYear !== getPriorProgramYear(requestedProgramYear)) {
    return false
  }
  const startYear = parseInt(requestedProgramYear.split('-')[0]!, 10)
  return date.startsWith(`${startYear}-07-`)
}
