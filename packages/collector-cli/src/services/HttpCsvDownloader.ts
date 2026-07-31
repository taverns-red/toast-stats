/**
 * HTTP-based CSV Downloader for Toastmasters Dashboard
 *
 * Downloads CSV exports directly via HTTP GET requests to the dashboard's
 * export.aspx endpoint, bypassing the need for Playwright browser automation.
 *
 * URL pattern (#1342):
 *   live PY:      https://dashboards.toastmasters.org/export.aspx?type=CSV&report={reportName}
 *   archived PY:  https://dashboards.toastmasters.org/{programYear}/export.aspx?type=CSV&report={reportName}
 *
 * The live year has no /{programYear}/ path (HTTP 500), and the bare path
 * ignores the ~{programYear} token and always serves the live year — so the
 * two are not interchangeable. See BackfillDateSpec.pathStyle.
 *
 * Report name patterns:
 *   - districtsummary~{date}~~{programYear}
 *   - districtperformance~{districtId}~{date}~~{programYear}
 *   - divisionperformance~{districtId}~{date}~~{programYear}
 *   - clubperformance~{districtId}~{date}~~{programYear}
 *
 * Requirements (#123):
 *   - Direct HTTP GET (no auth, no cookies, no session)
 *   - Configurable rate limiting
 *   - Resume-capable (skip already-cached files)
 *   - Parse district list from summary CSV
 */

import { parse } from 'csv-parse/sync'
import { logger } from '../utils/logger.js'

const BASE_URL = 'https://dashboards.toastmasters.org'

export type ReportType =
  | 'districtsummary'
  | 'districtperformance'
  | 'divisionperformance'
  | 'clubperformance'

export type DateFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface BackfillDateSpec {
  programYear: string
  reportType: ReportType
  districtId?: string
  date: Date
  /**
   * The month-end date for the reporting period (e.g., 8/31/2025 for August).
   * When provided, the export URL uses the 4-segment format:
   *   reportType~districtId~monthEndDate~collectionDate~programYear
   * This is REQUIRED for the dashboard to return month-specific data.
   * Without it, the dashboard returns only the latest closing period.
   */
  monthEndDate?: Date
  /**
   * Which endpoint shape to use (#1342).
   *
   * - `'archive'` (default) — `/{programYear}/export.aspx`, which serves that
   *   specific, already-archived program year.
   * - `'live'` — the bare `/export.aspx`, which serves whatever program year is
   *   currently live. The live year has no archive path (TM returns HTTP 500
   *   "URL Rewrite Module Error."), so it can ONLY be fetched this way.
   *
   * The default must stay `'archive'`: the live endpoint **ignores** the
   * trailing `~{programYear}` token, so pointing a historical fetch at it
   * silently returns current-year data under a historical date.
   */
  pathStyle?: ExportPathStyle
}

/** @see BackfillDateSpec.pathStyle (#1342) */
export type ExportPathStyle = 'live' | 'archive'

export interface HttpCsvDownloaderConfig {
  ratePerSecond: number
  cooldownEvery?: number // pause after this many requests
  cooldownMs?: number // pause duration in ms
  maxRetries?: number
}

interface DownloadResult {
  url: string
  content: string
  statusCode: number
  byteSize: number
}

/**
 * Format a Date as M/D/YYYY (no zero-padding) for the dashboard URL.
 */
function formatDateForUrl(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}

/**
 * Compute the month-end date for a given collection date.
 *
 * The Toastmasters dashboard's closing period works as follows:
 * data collected on date D belongs to the PREVIOUS month's closing period.
 * e.g., data collected on 9/8/2025 is the August 2025 closing → month-end = 8/31/2025.
 *
 * Special case: if the collection date is in the same month as the program year start
 * (July), the month-end is 7/31 of the start year.
 *
 * @param collectionDate - The date data was collected/scraped
 * @returns The last day of the previous month
 */
export function computeMonthEndDate(collectionDate: Date): Date {
  // Last day of previous month = day 0 of current month
  return new Date(collectionDate.getFullYear(), collectionDate.getMonth(), 0)
}

/**
 * Build the full export URL for a given report specification.
 *
 * Uses the 4-segment report format when monthEndDate is provided:
 *   reportType~districtId~monthEndDate~collectionDate~programYear
 *
 * This format is REQUIRED for the dashboard to return month-specific data.
 * Without monthEndDate, the dashboard returns the latest closing period data
 * regardless of the collection date.
 */
export function buildExportUrl(spec: BackfillDateSpec): string {
  const dateStr = formatDateForUrl(spec.date)
  const monthEndStr = spec.monthEndDate
    ? formatDateForUrl(spec.monthEndDate)
    : ''
  let reportName: string

  if (spec.reportType === 'districtsummary') {
    reportName = `districtsummary~${monthEndStr}~${dateStr}~${spec.programYear}`
  } else {
    if (!spec.districtId) {
      throw new Error(
        `districtId is required for report type: ${spec.reportType}`
      )
    }
    reportName = `${spec.reportType}~${spec.districtId}~${monthEndStr}~${dateStr}~${spec.programYear}`
  }

  // The live program year lives at the bare /export.aspx; archived years live
  // under /{programYear}/. Defaults to the archive path (#1342).
  const prefix = spec.pathStyle === 'live' ? '' : `/${spec.programYear}`

  return `${BASE_URL}${prefix}/export.aspx?type=CSV&report=${reportName}`
}

/**
 * Closing period metadata parsed from a CSV footer.
 */
export interface CsvClosingPeriodInfo {
  /** Whether this CSV represents a month-end closing period */
  isClosingPeriod: boolean
  /** The data month in YYYY-MM format (e.g., "2026-03") */
  dataMonth: string | undefined
  /**
   * Whether a "Month of …, As of …" footer was actually found. When false,
   * isClosingPeriod:false is a DEFAULT, not a decision — callers must treat
   * the result as undecided, never persist it as an explicit verdict (#1129).
   */
  footerFound: boolean
}

const MONTH_NAMES: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

/**
 * Parse closing period metadata from a CSV footer.
 *
 * Toastmasters CSVs contain a footer like:
 *   "Month of March, As of 04/01/2026"
 *
 * When the "Month of X" month differs from the "As of" date's month,
 * the data is a closing period for month X. For example, "Month of March,
 * As of 04/01/2026" means this is the March 2026 closing period collected
 * on April 1.
 *
 * @param csvContent - The full CSV content including footer rows
 * @param collectionDate - The date the data was collected (YYYY-MM-DD)
 * @returns Closing period info with isClosingPeriod and dataMonth
 */
export function parseClosingPeriodFromCsv(
  csvContent: string,
  collectionDate: string
): CsvClosingPeriodInfo {
  // Search the last 10 lines for the "Month of X, As of Y" pattern
  const lines = csvContent.trim().split('\n')
  const tailLines = lines.slice(-10)

  for (const line of tailLines) {
    const match = line.match(
      /Month of ([A-Za-z]+),\s*As of (\d{2})\/(\d{2})\/(\d{4})/
    )
    if (match) {
      const monthName = match[1]!.toLowerCase()
      const monthNum = MONTH_NAMES[monthName]
      const asOfYear = match[4]!

      if (monthNum) {
        // Handle year boundary: "Month of December" collected in January of next year
        const asOfMonth = match[2]!
        let dataYear = parseInt(asOfYear, 10)
        if (monthNum === '12' && asOfMonth === '01') {
          dataYear -= 1
        }
        const dataMonth = `${dataYear}-${monthNum}`

        // Compare data month to collection month
        // If different, this is a closing period (e.g., data is March, collected in April)
        const collectionMonth = collectionDate.slice(0, 7) // "YYYY-MM"
        const isClosingPeriod = dataMonth !== collectionMonth

        return {
          isClosingPeriod,
          dataMonth,
          footerFound: true,
        }
      }
    }
  }

  // No footer found — UNDECIDED, not a non-closing decision (#1129)
  return {
    isClosingPeriod: false,
    dataMonth: undefined,
    footerFound: false,
  }
}

/**
 * HTTP-based CSV downloader with rate limiting and retry logic.
 */
export class HttpCsvDownloader {
  private readonly config: HttpCsvDownloaderConfig
  private requestCount = 0
  private lastRequestTime = 0

  constructor(config: HttpCsvDownloaderConfig) {
    this.config = {
      cooldownEvery: 100,
      cooldownMs: 5000,
      maxRetries: 3,
      ...config,
    }
  }

  /**
   * Generate a range of program year strings (e.g., ['2017-2018', '2018-2019', ...]).
   */
  getProgramYearRange(startYear: number, endYear: number): string[] {
    const years: string[] = []
    for (let y = startYear; y <= endYear; y++) {
      years.push(`${y}-${y + 1}`)
    }
    return years
  }

  /**
   * Generate a grid of dates for a program year at the specified frequency.
   * The program year runs from July 1 to June 30.
   * The last date is always June 30 of the end year.
   */
  generateDateGrid(programYear: string, frequency: DateFrequency): Date[] {
    const startYear = parseInt(programYear.split('-')[0]!, 10)
    const start = new Date(startYear, 6, 1) // July 1
    const end = new Date(startYear + 1, 5, 30) // June 30

    const intervalDays =
      frequency === 'daily'
        ? 1
        : frequency === 'weekly'
          ? 7
          : frequency === 'biweekly'
            ? 14
            : 30 // monthly approximation

    const dates: Date[] = []
    const current = new Date(start)

    while (current <= end) {
      dates.push(new Date(current))
      current.setDate(current.getDate() + intervalDays)
    }

    // Always include the year-end date (June 30)
    const lastDate = dates[dates.length - 1]
    if (lastDate && (lastDate.getMonth() !== 5 || lastDate.getDate() !== 30)) {
      dates.push(new Date(end))
    }

    return dates
  }

  /**
   * Parse district IDs from an all-districts summary CSV.
   * The CSV has a "DISTRICT" column with district IDs.
   */
  parseDistrictsFromSummary(csvContent: string): string[] {
    if (!csvContent.trim()) return []

    try {
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as Record<string, string>[]

      const districtIds = new Set<string>()
      for (const record of records) {
        const districtId = record['DISTRICT']?.trim()
        // Filter to valid district IDs only: alphanumeric with no spaces or slashes.
        // Accepts: '01', '61', '130', 'F', 'U' (valid single-letter districts)
        // Rejects: 'As of 02/26/2026' and other CSV footer/metadata rows (#145)
        if (districtId && /^[A-Z0-9]+$/i.test(districtId)) {
          districtIds.add(districtId)
        }
      }

      return Array.from(districtIds).sort((a, b) => {
        const numA = parseInt(a, 10)
        const numB = parseInt(b, 10)
        if (isNaN(numA) && isNaN(numB)) return a.localeCompare(b)
        if (isNaN(numA)) return 1
        if (isNaN(numB)) return -1
        return numA - numB
      })
    } catch (error) {
      logger.error('Failed to parse districts from summary CSV', error)
      return []
    }
  }

  /**
   * Wait to respect rate limiting.
   */
  private async rateLimit(): Promise<void> {
    // Cooldown every N requests
    if (
      this.config.cooldownEvery &&
      this.requestCount > 0 &&
      this.requestCount % this.config.cooldownEvery === 0
    ) {
      logger.info(
        `Cooldown pause after ${this.requestCount} requests (${this.config.cooldownMs}ms)`
      )
      await this.sleep(this.config.cooldownMs ?? 5000)
    }

    // Per-request rate limiting
    const minInterval = 1000 / this.config.ratePerSecond
    const elapsed = Date.now() - this.lastRequestTime
    if (elapsed < minInterval) {
      await this.sleep(minInterval - elapsed)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Download a single CSV from the dashboard.
   * Includes retry with exponential backoff.
   */
  async downloadCsv(spec: BackfillDateSpec): Promise<DownloadResult> {
    const url = buildExportUrl(spec)
    const maxRetries = this.config.maxRetries ?? 3

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.rateLimit()

      try {
        this.lastRequestTime = Date.now()
        this.requestCount++

        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'ToastStats-Backfill/1.0 (data collection for analytics)',
          },
        })

        if (!response.ok) {
          if (attempt < maxRetries) {
            const backoffMs = Math.pow(2, attempt) * 1000
            logger.warn(
              `HTTP ${response.status} for ${url}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`
            )
            await this.sleep(backoffMs)
            continue
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const content = await response.text()

        return {
          url,
          content,
          statusCode: response.status,
          byteSize: content.length,
        }
      } catch (error) {
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000
          logger.warn(
            `Request failed for ${url}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`,
            error
          )
          await this.sleep(backoffMs)
          continue
        }
        throw error
      }
    }

    // Should never reach here due to throw above, but TypeScript needs it
    throw new Error(`Failed after ${maxRetries} retries: ${url}`)
  }

  /**
   * Get the total request count (for progress reporting).
   */
  getRequestCount(): number {
    return this.requestCount
  }

  /**
   * Reset request counter (for testing).
   */
  resetRequestCount(): void {
    this.requestCount = 0
    this.lastRequestTime = 0
  }
}
