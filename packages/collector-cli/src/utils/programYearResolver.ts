/**
 * Active program-year resolution (#1284).
 *
 * Toastmasters' data rollover lags the calendar. On July 1 the calendar
 * program year (e.g. "2026-2027") has no published dashboard yet — the export
 * URL 302-redirects to /error.aspx, and fetch/curl follow it to a 200 HTML
 * page — while June's month-end close keeps updating under the prior year
 * ("2025-2026", CSV footer "Month of Jun"). Because a successful HTTP fetch is
 * NOT proof of valid data, we resolve the *active* program year by validating
 * content, not by trusting the calendar.
 *
 * This is intentionally separate from `calculateProgramYear`, whose calendar
 * semantics are correct for cache paths and historical logic and must not
 * change.
 */
import { calculateProgramYear, getPriorProgramYear } from './CachePaths.js'
import { parseFooterDataMonth } from './csvFooterParser.js'
import type { ExportPathStyle } from '../services/HttpCsvDownloader.js'
import { logger } from './logger.js'

export type { ExportPathStyle }

/**
 * A districtsummary CSV always starts with a header row containing the
 * "DISTRICT" column. The HTML error page served for an unpublished program
 * year does not, so this cleanly distinguishes real data from a redirect body.
 */
export function isValidDistrictSummaryCsv(
  content: string | undefined | null
): boolean {
  if (!content) return false
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const headers = firstLine
    .split(',')
    .map(h => h.replace(/"/g, '').trim().toUpperCase())
  return headers.includes('DISTRICT')
}

/**
 * Why the resolver ended up where it did (#1343).
 *
 * `fellBack` alone cannot distinguish a benign rollover from a broken fetch —
 * both produce `true`. That conflation is why #1342 (the export URL moving)
 * hid for a month behind a green pipeline: every run logged the same
 * indistinguishable warning, and nothing escalated.
 *
 * - `resolved`       — the calendar program year is live. Nothing to see.
 * - `not-published`  — the dashboard responded, but the calendar year has no
 *                      data yet. Expected during the July rollover window;
 *                      self-heals when TI publishes.
 * - `upstream-error` — a fetch THREW (HTTP 5xx, timeout, DNS). Never benign:
 *                      it means we could not ask the question, not that the
 *                      answer was "not yet".
 */
export type ProgramYearResolutionReason =
  'resolved' | 'not-published' | 'upstream-error'

export interface ProgramYearResolution {
  /** The program year whose dashboard actually has data for this date. */
  programYear: string
  /** Why this resolution was reached — drives alerting (#1343). */
  reason: ProgramYearResolutionReason
  /**
   * Which endpoint shape served `programYear`. Callers MUST thread this into
   * every subsequent fetch for the same run — the live year is reachable only
   * at the bare path, archived years only under `/{programYear}/` (#1342).
   */
  pathStyle: ExportPathStyle
  /** True when the resolved year is not the calendar program year. */
  fellBack: boolean
  /**
   * The validated districtsummary CSV body for `programYear`, or undefined when
   * nothing returned valid data (callers must then fail loudly).
   */
  content?: string
}

/**
 * Derive the program year a districtsummary CSV actually contains, from its
 * "Month of X, As of MM/DD/YYYY" footer (#1342).
 *
 * This is the only trustworthy year signal. The live `/export.aspx` endpoint
 * ignores the `~{programYear}` token in the request, so the URL we asked for
 * says nothing about the year we got back.
 *
 * June is the case that matters: "Month of Jun, As of 07/01/2026" is collected
 * in July but belongs to PY 2025-2026. Keying off the *data* month rather than
 * the as-of date is what makes the rollover unambiguous.
 *
 * @returns The `YYYY-YYYY` program year, or undefined when no footer is present
 *          (undecided — never a verdict, cf. #1129).
 */
export function programYearFromCsvFooter(
  content: string | undefined | null,
  collectionDate: string
): string | undefined {
  if (!content) return undefined

  const dataMonth = parseFooterDataMonth(content, collectionDate)
  if (!dataMonth) return undefined

  // The Toastmasters program year runs July 1 - June 30.
  const startYear = dataMonth.month >= 7 ? dataMonth.year : dataMonth.year - 1
  return `${startYear}-${startYear + 1}`
}

/**
 * Accept content only when it is a valid districtsummary AND its footer does
 * not contradict the program year we asked for.
 *
 * A missing footer is *undecided*, not a failure: some historical exports have
 * no footer row, and rejecting those would break backfill. We only reject an
 * explicit disagreement — which is precisely the wrong-year hazard the live
 * endpoint introduces (#1342).
 */
function isValidForProgramYear(
  content: string | undefined,
  expectedProgramYear: string,
  date: string
): boolean {
  if (!isValidDistrictSummaryCsv(content)) return false

  const actual = programYearFromCsvFooter(content, date)
  if (actual && actual !== expectedProgramYear) {
    logger.warn(
      'districtsummary content is for a different program year — rejecting (#1342)',
      { date, expectedProgramYear, actualProgramYear: actual }
    )
    return false
  }
  return true
}

/**
 * Extract the sorted, de-duplicated list of district IDs from a districtsummary
 * CSV. Returns [] for anything that isn't a valid districtsummary (missing
 * DISTRICT column, HTML error page, empty) — never throws (#1284).
 */
export function parseDistrictIdsFromSummaryCsv(
  content: string | undefined | null
): string[] {
  if (!content) return []
  const lines = content.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0]!
    .split(',')
    .map(h => h.replace(/"/g, '').trim().toUpperCase())
  const col = headers.indexOf('DISTRICT')
  if (col === -1) return []

  const ids = [
    ...new Set(
      lines
        .slice(1)
        .map(l => l.split(',')[col]?.replace(/"/g, '').trim() ?? '')
        .filter(id => /^[A-Z0-9]+$/i.test(id))
    ),
  ]
  ids.sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb
  })
  return ids
}

/**
 * Resolve the active Toastmasters program year for a date by probing which year
 * actually has data. Falls back to the prior program year when the calendar
 * year's districtsummary body isn't a valid CSV. Self-healing: the day the new
 * year publishes, the calendar probe validates and the fallback stops.
 *
 * @param date         YYYY-MM-DD target date.
 * @param fetchSummary Fetches the districtsummary CSV body for a program year.
 *                     May throw; a throw is treated the same as invalid content.
 */
export async function resolveActiveProgramYear(
  date: string,
  fetchSummary: (
    programYear: string,
    pathStyle: ExportPathStyle
  ) => Promise<string>
): Promise<ProgramYearResolution> {
  const calendarPY = calculateProgramYear(date)

  // A throw ANYWHERE in the probe chain makes the outcome an upstream error,
  // even if a later probe merely returned an unpublished-year page (#1343).
  let sawThrow = false

  // 1. Ask the LIVE endpoint what it has. It is authoritative about the current
  //    program year, so its footer answers the rollover question outright —
  //    no calendar guess, and no probing a /{PY}/ path that may not exist yet.
  const live = await tryFetch(fetchSummary, calendarPY, 'live', date)
  sawThrow ||= live.threw
  const liveContent = live.content
  if (isValidDistrictSummaryCsv(liveContent)) {
    const livePY = programYearFromCsvFooter(liveContent, date)
    if (livePY) {
      if (livePY !== calendarPY) {
        logger.info(
          'Live dashboard is still serving the prior program year (rollover window)',
          { date, calendarPY, programYear: livePY }
        )
      }
      return {
        programYear: livePY,
        reason: livePY === calendarPY ? 'resolved' : 'not-published',
        pathStyle: 'live',
        fellBack: livePY !== calendarPY,
        content: liveContent,
      }
    }
    // Valid CSV but no footer: we cannot tell which year it is, and the live
    // endpoint ignores the year token — so labelling it would be a guess. Fall
    // through to the archive path, where the URL does pin the year.
    logger.warn(
      'Live districtsummary has no "Month of" footer — cannot confirm its program year (#1342)',
      { date, calendarPY }
    )
  }

  // 2. Archive path for the calendar year. Reachable once TM archives it, and
  //    the only path whose URL actually constrains the year.
  const calendar = await tryFetch(fetchSummary, calendarPY, 'archive', date)
  sawThrow ||= calendar.threw
  const calendarContent = calendar.content
  if (isValidForProgramYear(calendarContent, calendarPY, date)) {
    return {
      programYear: calendarPY,
      reason: 'resolved',
      pathStyle: 'archive',
      fellBack: false,
      content: calendarContent,
    }
  }

  // 3. Archive path for the prior year (the original #1284 rollover fallback).
  const priorPY = getPriorProgramYear(calendarPY)
  logger.warn(
    'Calendar program-year dashboard unavailable — trying prior program year (#1284)',
    { date, calendarPY, priorPY }
  )

  const prior = await tryFetch(fetchSummary, priorPY, 'archive', date)
  sawThrow ||= prior.threw
  const priorContent = prior.content
  if (isValidForProgramYear(priorContent, priorPY, date)) {
    logger.info(
      'Resolved active program year to prior year (rollover window)',
      {
        date,
        programYear: priorPY,
      }
    )
    return {
      programYear: priorPY,
      reason: sawThrow ? 'upstream-error' : 'not-published',
      pathStyle: 'archive',
      fellBack: true,
      content: priorContent,
    }
  }

  // Nothing validated: return the calendar year so downstream fails loudly with
  // the real (calendar-year) error rather than silently ingesting stale data.
  return {
    programYear: calendarPY,
    reason: sawThrow ? 'upstream-error' : 'not-published',
    pathStyle: 'archive',
    fellBack: false,
  }
}

/**
 * A probe's outcome. `threw` is tracked separately from "no usable content"
 * because the two mean very different things: a throw says we could not ask
 * the question at all, which is never benign (#1343).
 */
interface ProbeResult {
  content?: string
  threw: boolean
}

async function tryFetch(
  fetchSummary: (
    programYear: string,
    pathStyle: ExportPathStyle
  ) => Promise<string>,
  programYear: string,
  pathStyle: ExportPathStyle,
  date: string
): Promise<ProbeResult> {
  try {
    return { content: await fetchSummary(programYear, pathStyle), threw: false }
  } catch (err) {
    logger.warn('districtsummary fetch failed during program-year resolution', {
      date,
      programYear,
      pathStyle,
      error: err instanceof Error ? err.message : String(err),
    })
    return { threw: true }
  }
}
