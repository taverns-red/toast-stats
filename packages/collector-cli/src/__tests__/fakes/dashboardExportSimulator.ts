/**
 * A fake `dashboards.toastmasters.org/export.aspx` (#1384).
 *
 * Every rule below was measured against the live dashboard on 2026-08-02 and is
 * annotated with the probe that established it. The point of simulating the
 * endpoint rather than stubbing `downloadCsv` is that the URL `buildExportUrl`
 * produces is then genuinely under test — a backfill pointed at the wrong path
 * fails here exactly the way it fails in production.
 *
 * Measured rules:
 *  A. `/{PY}/export.aspx` for the **live** program year → HTTP 500. The live
 *     year has no archive path yet.
 *  B. `/export.aspx` (root) serves the live year and **ignores the trailing
 *     `~{programYear}` token**.
 *  C. Root also **ignores the as-of date when the month-end slot is empty**,
 *     serving *today* instead. Only the slot's presence matters, not its value
 *     (probes B and M returned byte-identical bodies for 7/31 vs 6/30).
 *  D. `/{PY}/export.aspx` for an archived year honours the requested as-of.
 *  E. A date the dashboard has no data for returns HTTP 200 with a header row,
 *     a valid-looking footer and **zero data rows**.
 */

import {
  buildExportUrl,
  type BackfillDateSpec,
} from '../../services/HttpCsvDownloader.js'

/** The program year the bare /export.aspx currently serves. */
export const SIM_LIVE_PROGRAM_YEAR = '2026-2027'

/** "Today" for the simulator — what root returns when the as-of is ignored. */
export const SIM_TODAY = '2026-08-02'

/**
 * TI published PY 2026-2027 data on this date. Earlier July dates are the
 * dark window: HTTP 200, valid footer, no rows (#1384).
 */
export const SIM_FIRST_LIVE_DATE = '2026-07-26'

/** As-of dates the 2025-2026 archive still serves data for. */
export const SIM_ARCHIVED_DATES_WITH_DATA = new Set([
  '2026-03-15',
  '2026-06-30',
])

const SUMMARY_HEADER = '"REGION","DISTRICT","Paid Clubs"'
const SUMMARY_ROWS = ['"02","61","150"', '"14","128","127"', '"DNAR","U","21"']
const DISTRICT_HEADER = '"District","Division","Area","Club Number"'
const DISTRICT_ROWS = ['"61","A","01","00001234"', '"61","B","02","00005678"']

const MONTH_ABBR = [
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
]

export interface SimulatedResponse {
  status: number
  body: string
}

/** Parse an `M/D/YYYY` URL date into `YYYY-MM-DD`. */
function usDateToIso(value: string): string | undefined {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return undefined
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
}

function isoToUsDate(iso: string): string {
  const [y, mo, d] = iso.split('-')
  return `${parseInt(mo!, 10)}/${parseInt(d!, 10)}/${y}`
}

/** Build a body with the TM footer: `Month of Jul, As of 07/26/2026`. */
function buildCsv(
  header: string,
  rows: string[],
  monthIso: string,
  asOfIso: string
): string {
  const monthName = MONTH_ABBR[parseInt(monthIso.slice(5, 7), 10) - 1]!
  const [y, mo, d] = asOfIso.split('-')
  const footer = `Month of ${monthName}, As of ${mo}/${d}/${y}`
  return [header, ...rows, footer].join('\n')
}

/**
 * Answer a request for an export URL exactly as the live dashboard does.
 */
export function simulateDashboardExport(url: string): SimulatedResponse {
  const match = url.match(
    /^https:\/\/dashboards\.toastmasters\.org(?:\/(\d{4}-\d{4}))?\/export\.aspx\?type=CSV&report=(.+)$/
  )
  if (!match) return { status: 404, body: 'Not found' }

  const pathYear = match[1]
  const segments = match[2]!.split('~')
  const reportType = segments[0]!
  const requestedAsOf = usDateToIso(segments[segments.length - 2] ?? '')
  const monthEndSlot = segments[segments.length - 3] ?? ''

  // Rule A — the live program year has no archive path.
  if (pathYear === SIM_LIVE_PROGRAM_YEAR) {
    return { status: 500, body: 'URL Rewrite Module Error.' }
  }

  if (!requestedAsOf) return { status: 500, body: 'URL Rewrite Module Error.' }

  const isRoot = pathYear === undefined

  // Rule C — root with an empty month-end slot ignores the as-of and serves
  // today. Root also ignores the ~{programYear} token entirely (rule B), so
  // the year it serves is always the live one.
  const servedAsOf = isRoot && monthEndSlot === '' ? SIM_TODAY : requestedAsOf

  // Which month the body claims. With data present the footer tracks the
  // as-of month; with no data it echoes the requested month-end slot.
  const hasData = isRoot
    ? servedAsOf >= SIM_FIRST_LIVE_DATE
    : SIM_ARCHIVED_DATES_WITH_DATA.has(servedAsOf)

  const monthEndIso = usDateToIso(monthEndSlot)
  const monthIso = hasData ? servedAsOf : (monthEndIso ?? servedAsOf)

  const [header, rows] =
    reportType === 'districtsummary'
      ? [SUMMARY_HEADER, SUMMARY_ROWS]
      : [DISTRICT_HEADER, DISTRICT_ROWS]

  return {
    status: 200,
    body: buildCsv(header, hasData ? rows : [], monthIso, servedAsOf),
  }
}

export interface SimulatedDownload {
  url: string
  content: string
  statusCode: number
  byteSize: number
}

/**
 * A `downloadCsv` replacement that routes the **real** `buildExportUrl` output
 * through the simulator and throws on non-2xx just like `HttpCsvDownloader`.
 * Every URL it is asked for is appended to `requestedUrls`.
 */
export function createSimulatedDownloader(): {
  downloadCsv: (spec: BackfillDateSpec) => Promise<SimulatedDownload>
  requestedUrls: string[]
} {
  const requestedUrls: string[] = []
  return {
    requestedUrls,
    async downloadCsv(spec: BackfillDateSpec): Promise<SimulatedDownload> {
      const url = buildExportUrl(spec)
      requestedUrls.push(url)
      const { status, body } = simulateDashboardExport(url)
      if (status !== 200) {
        throw new Error(`HTTP ${status}: Internal Server Error`)
      }
      return { url, content: body, statusCode: status, byteSize: body.length }
    },
  }
}

export { usDateToIso, isoToUsDate }
