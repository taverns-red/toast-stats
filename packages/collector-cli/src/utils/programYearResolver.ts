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
import { logger } from './logger.js'

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

export interface ProgramYearResolution {
  /** The program year whose dashboard actually has data for this date. */
  programYear: string
  /** True when the calendar year was empty and we fell back to the prior year. */
  fellBack: boolean
  /**
   * The validated districtsummary CSV body for `programYear`, or undefined when
   * neither year returned valid data (callers must then fail loudly).
   */
  content?: string
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
  fetchSummary: (programYear: string) => Promise<string>
): Promise<ProgramYearResolution> {
  const calendarPY = calculateProgramYear(date)

  const calendarContent = await tryFetch(fetchSummary, calendarPY, date)
  if (isValidDistrictSummaryCsv(calendarContent)) {
    return {
      programYear: calendarPY,
      fellBack: false,
      content: calendarContent,
    }
  }

  const priorPY = getPriorProgramYear(calendarPY)
  logger.warn(
    'Calendar program-year dashboard unavailable — trying prior program year (#1284)',
    { date, calendarPY, priorPY }
  )

  const priorContent = await tryFetch(fetchSummary, priorPY, date)
  if (isValidDistrictSummaryCsv(priorContent)) {
    logger.info(
      'Resolved active program year to prior year (rollover window)',
      {
        date,
        programYear: priorPY,
      }
    )
    return { programYear: priorPY, fellBack: true, content: priorContent }
  }

  // Neither validated: return the calendar year so downstream fails loudly with
  // the real (calendar-year) error rather than silently ingesting stale data.
  return { programYear: calendarPY, fellBack: false }
}

async function tryFetch(
  fetchSummary: (programYear: string) => Promise<string>,
  programYear: string,
  date: string
): Promise<string | undefined> {
  try {
    return await fetchSummary(programYear)
  } catch (err) {
    logger.warn('districtsummary fetch failed during program-year resolution', {
      date,
      programYear,
      error: err instanceof Error ? err.message : String(err),
    })
    return undefined
  }
}
