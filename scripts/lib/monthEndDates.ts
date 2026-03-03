/**
 * Month-End Date Discovery — Pure Functions
 *
 * These pure functions contain the core business logic for identifying
 * month-end closing-period collection dates from raw-csv metadata.
 *
 * A "month-end date" for a given dataMonth (YYYY-MM) is the lexically
 * LAST collection date in raw-csv/ where:
 *   metadata.isClosingPeriod === true
 *   metadata.dataMonth === "YYYY-MM"
 *
 * All functions are pure (no GCS I/O) to enable unit testing.
 */

/** Minimum shape read from raw-csv/{date}/metadata.json */
export interface RawCSVEntry {
  /** Actual collection date (YYYY-MM-DD) — the GCS folder name */
  collectionDate: string
  /** True when this collection captured prior-month closing data */
  isClosingPeriod: boolean
  /** YYYY-MM of the prior month the data represents (only meaningful when isClosingPeriod) */
  dataMonth: string | undefined
}

export interface MonthEndResult {
  /** The data month this date represents, e.g. "2024-08" */
  dataMonth: string
  /** The last collection date that was a closing period for this month */
  lastClosingDate: string
  /** All collection dates that were closing-period for this month */
  allClosingDates: string[]
  /** Program year this month belongs to, e.g. "2024-2025" */
  programYear: string
}

export interface ProgramYearSummary {
  year: string
  isComplete: boolean
  monthResults: MonthEndResult[]
  /** Months in completed PYs with no closing-period data found */
  missingMonths: string[]
}

/**
 * Return the Toastmasters program year key for a given YYYY-MM string.
 * Program year runs July 1 → June 30.
 */
export function getProgramYearForMonth(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error(`Invalid month key format: ${monthKey}. Expected YYYY-MM.`)
  }
  const [yearStr, monthStr] = monthKey.split('-')
  const year = parseInt(yearStr!, 10)
  const month = parseInt(monthStr!, 10)
  const pyStart = month >= 7 ? year : year - 1
  return `${pyStart}-${pyStart + 1}`
}

/**
 * Determine if a program year has ended.
 * A year is complete if today > June 30 of the end year.
 */
export function isProgramYearComplete(
  programYear: string,
  today: Date
): boolean {
  const parts = programYear.split('-')
  const endYear = parseInt(parts[1] ?? '0', 10)
  const endDate = new Date(Date.UTC(endYear, 5, 30)) // June 30 (month 5, 0-indexed)
  return today.getTime() > endDate.getTime()
}

/**
 * Group raw-csv entries by their dataMonth.
 * Only includes entries where isClosingPeriod === true and dataMonth is defined.
 *
 * @returns Map of dataMonth (YYYY-MM) → sorted array of collection dates (ascending)
 */
export function groupByDataMonth(
  entries: RawCSVEntry[]
): Map<string, string[]> {
  const result = new Map<string, string[]>()

  for (const entry of entries) {
    if (!entry.isClosingPeriod || !entry.dataMonth) continue

    const month = entry.dataMonth
    const existing = result.get(month) ?? []
    existing.push(entry.collectionDate)
    result.set(month, existing)
  }

  // Sort each group ascending
  for (const [month, dates] of result) {
    result.set(month, [...dates].sort())
  }

  return result
}

/**
 * Find the last (authoritative) closing-period collection date for a given dataMonth.
 *
 * Returns the lexically greatest collection date among all closing-period entries
 * for that month. Returns null if no closing-period data exists for the month.
 */
export function findLastClosingDate(
  entries: RawCSVEntry[],
  targetDataMonth: string
): string | null {
  const candidates = entries.filter(
    e => e.isClosingPeriod && e.dataMonth === targetDataMonth
  )

  if (candidates.length === 0) return null

  // Lexical sort descending — ISO dates sort correctly as strings
  const sorted = candidates
    .map(e => e.collectionDate)
    .sort((a, b) => b.localeCompare(a))

  return sorted[0]!
}

/**
 * Generate the list of YYYY-MM months that belong to a given program year.
 * Program year "2024-2025" spans July 2024 → June 2025.
 */
export function getMonthsInProgramYear(programYear: string): string[] {
  const parts = programYear.split('-')
  const startYear = parseInt(parts[0] ?? '0', 10)

  const months: string[] = []
  // July → December of start year
  for (let m = 7; m <= 12; m++) {
    months.push(`${startYear}-${String(m).padStart(2, '0')}`)
  }
  // January → June of end year
  const endYear = startYear + 1
  for (let m = 1; m <= 6; m++) {
    months.push(`${endYear}-${String(m).padStart(2, '0')}`)
  }
  return months
}

/**
 * Build the full month-end summary for all completed program years.
 *
 * For each calendar month in each completed program year:
 * - Finds the last closing-period collection date (the authoritative month-end)
 * - Records months with no closing-period data as "missing"
 *
 * @param entries - All raw-csv metadata entries from GCS
 * @param today   - Reference date for determining which PYs are complete (injectable)
 * @returns Summary grouped by program year, sorted descending
 */
export function buildMonthEndSummary(
  entries: RawCSVEntry[],
  today: Date
): ProgramYearSummary[] {
  // Discover all program years present in the entries
  const programYears = new Set<string>()
  for (const entry of entries) {
    // Derive PY from the collection date itself (not dataMonth)
    const [yearStr, monthStr] = entry.collectionDate.split('-')
    if (yearStr && monthStr) {
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)
      const pyStart = month >= 7 ? year : year - 1
      programYears.add(`${pyStart}-${pyStart + 1}`)
    }
    // Also consider dataMonth for closing-period entries
    if (entry.isClosingPeriod && entry.dataMonth) {
      programYears.add(getProgramYearForMonth(entry.dataMonth))
    }
  }

  const summaries: ProgramYearSummary[] = []

  for (const py of programYears) {
    const isComplete = isProgramYearComplete(py, today)

    if (!isComplete) {
      summaries.push({
        year: py,
        isComplete: false,
        monthResults: [],
        missingMonths: [],
      })
      continue
    }

    const months = getMonthsInProgramYear(py)
    const monthResults: MonthEndResult[] = []
    const missingMonths: string[] = []

    for (const month of months) {
      const lastClosingDate = findLastClosingDate(entries, month)

      if (lastClosingDate === null) {
        missingMonths.push(month)
        continue
      }

      // Collect all closing dates for this month
      const allClosingDates = entries
        .filter(e => e.isClosingPeriod && e.dataMonth === month)
        .map(e => e.collectionDate)
        .sort()

      monthResults.push({
        dataMonth: month,
        lastClosingDate,
        allClosingDates,
        programYear: py,
      })
    }

    summaries.push({ year: py, isComplete: true, monthResults, missingMonths })
  }

  // Sort descending by program year
  summaries.sort((a, b) => b.year.localeCompare(a.year))
  return summaries
}

/**
 * Forward-scan algorithm: find the month-end keeper date for a given month
 * by reading entries from the *first N days of the following calendar month*.
 *
 * Background: Closing-period CSVs for dataMonth X are collected a few days
 * into month X+1. The last collection date with isClosingPeriod=true and
 * dataMonth=X is the authoritative month-end. Scanning only the opening days
 * of X+1 gives the same answer with far fewer metadata reads (~14 vs ~30).
 *
 * @param targetMonth   - The month we want the keeper for, e.g. "2024-08"
 * @param windowEntries - RawCSVEntry objects from the first N days of the
 *   following calendar month (caller fetches the right window via gcsHelpers)
 * @returns The last collection date with isClosingPeriod=true for targetMonth,
 *   or null if no such date exists in the window
 */
export function findMonthEndKeeperForward(
  targetMonth: string,
  windowEntries: RawCSVEntry[]
): string | null {
  const candidates = windowEntries
    .filter(e => e.isClosingPeriod && e.dataMonth === targetMonth)
    .map(e => e.collectionDate)

  if (candidates.length === 0) return null

  // Return the lexically greatest (latest) closing-period date for the month
  return candidates.sort((a, b) => b.localeCompare(a))[0] ?? null
}
