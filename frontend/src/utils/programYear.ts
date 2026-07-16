/**
 * Program Year Utilities
 * Toastmasters program year runs from July 1 to June 30
 */

export interface ProgramYear {
  year: number // The starting year (e.g., 2024 for 2024-2025 program year)
  startDate: string // YYYY-MM-DD format
  endDate: string // YYYY-MM-DD format
  label: string // Display label (e.g., "2024-2025")
}

/**
 * Extract calendar year + month from a `YYYY-MM-DD` string WITHOUT going
 * through `new Date()`. `new Date("YYYY-MM-DD")` parses as UTC midnight, but
 * `.getFullYear()` / `.getMonth()` read LOCAL time — so in a UTC-negative
 * zone a first-of-month date rolls back to the prior month (and, at Jan 1 /
 * Jul 1, the prior year), flipping the derived program year. Reading the
 * components from the string keeps program-year derivation TZ-invariant.
 *
 * Falls back to `new Date()` for non-ISO inputs (e.g. a Date coerced to a
 * locale string), preserving prior behaviour for those callers.
 */
function calendarParts(dateStr: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (match) {
    return { year: parseInt(match[1]!, 10), month: parseInt(match[2]!, 10) }
  }
  const date = new Date(dateStr)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

/**
 * Get the current program year
 */
export function getCurrentProgramYear(): ProgramYear {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // JavaScript months are 0-indexed

  // If we're in July-December, the program year started this year
  // If we're in January-June, the program year started last year
  const programYearStart = currentMonth >= 7 ? currentYear : currentYear - 1

  return {
    year: programYearStart,
    startDate: `${programYearStart}-07-01`,
    endDate: `${programYearStart + 1}-06-30`,
    label: `${programYearStart}-${programYearStart + 1}`,
  }
}

/**
 * Get a specific program year by starting year
 */
export function getProgramYear(year: number): ProgramYear {
  return {
    year,
    startDate: `${year}-07-01`,
    endDate: `${year + 1}-06-30`,
    label: `${year}-${year + 1}`,
  }
}

/**
 * Get all available program years from a list of dates
 */
export function getAvailableProgramYears(
  dates: readonly string[]
): ProgramYear[] {
  if (dates.length === 0) return []

  const programYears = new Set<number>()

  dates.forEach(dateStr => {
    const { year, month } = calendarParts(dateStr)

    // Determine which program year this date belongs to
    const programYearStart = month >= 7 ? year : year - 1
    programYears.add(programYearStart)
  })

  // Convert to array and sort in descending order (most recent first)
  const years = Array.from(programYears).sort((a, b) => b - a)

  return years.map(year => getProgramYear(year))
}

/**
 * Filter dates to only include those within a specific program year.
 *
 * Generic in the date type so a branded `SnapshotDate[]` survives the filter —
 * this is a narrowing of the caller's own list, so every element it returns
 * already carries whatever provenance went in (#1323).
 */
export function filterDatesByProgramYear<T extends string>(
  dates: readonly T[],
  programYear: ProgramYear
): T[] {
  return dates.filter(dateStr => {
    return dateStr >= programYear.startDate && dateStr <= programYear.endDate
  })
}

/**
 * Get the program year that a specific date belongs to
 */
export function getProgramYearForDate(dateStr: string): ProgramYear {
  const { year, month } = calendarParts(dateStr)

  const programYearStart = month >= 7 ? year : year - 1
  return getProgramYear(programYearStart)
}

/**
 * Check if a date is within a program year
 */
export function isDateInProgramYear(
  dateStr: string,
  programYear: ProgramYear
): boolean {
  return dateStr >= programYear.startDate && dateStr <= programYear.endDate
}

/**
 * Get the most recent date within a program year from a list of dates.
 *
 * Generic for the same reason as `filterDatesByProgramYear`: it returns an
 * ELEMENT of `dates`, so a branded `SnapshotDate[]` yields a `SnapshotDate`.
 * This is the hot path — it is the direct source of both `effectiveDate`
 * (useProgramYearControls) and `effectiveEndDate` (useDistrictProgramYearControls),
 * which is how the brand reaches the per-snapshot fetches (#1323).
 *
 * ## The null case is unreachable when `programYear` came from these `dates`
 *
 * Callers that pass a PY drawn from `getAvailableProgramYears(dates)` can never
 * see `null` back: that derivation admits a PY iff `filterDatesByProgramYear`
 * keeps one of its dates — both use the identical `month >= 7 ? year : year - 1`
 * July-boundary rule. Such callers must NOT add a `|| programYear.endDate`
 * fallback: `endDate` is a synthesized `${year + 1}-06-30` calendar bound, not a
 * date any snapshot was written under, so feeding it to a `snapshots/{date}/…`
 * fetch is the #1315 laundering bug wearing a plausible disguise. The
 * `SnapshotDate` brand is what made those eight dead fallbacks visible (#1323).
 */
export function getMostRecentDateInProgramYear<T extends string>(
  dates: readonly T[],
  programYear: ProgramYear
): T | null {
  const filteredDates = filterDatesByProgramYear(dates, programYear)
  if (filteredDates.length === 0) return null

  // Sort in descending order and return the first (most recent)
  return filteredDates.sort((a, b) => b.localeCompare(a))[0] ?? null
}

/**
 * Format program year for display
 */
export function formatProgramYear(programYear: ProgramYear): string {
  return programYear.label
}

/**
 * Compact 2-digit-year program-year label ("2025-26").
 * Used by per-PY callouts (milestones, anniversaries) where the full
 * `formatProgramYear` 4-digit label ("2025-2026") is too wide.
 */
export function formatProgramYearShort(start: number): string {
  return `${start}-${(start + 1).toString().slice(-2)}`
}

/**
 * Get program year progress (0-100%)
 */
export function getProgramYearProgress(programYear: ProgramYear): number {
  const now = new Date()
  const start = new Date(programYear.startDate)
  const end = new Date(programYear.endDate)

  if (now < start) return 0
  if (now > end) return 100

  const total = end.getTime() - start.getTime()
  const elapsed = now.getTime() - start.getTime()

  return Math.round((elapsed / total) * 100)
}

/**
 * Calculate the day number within a program year for a given date.
 * Program year starts July 1 (day 0) and ends June 30 (day 364 or 365 in leap years).
 *
 * @param dateStr - ISO date string (YYYY-MM-DD) or Date object
 * @returns Day number within the program year (0-365)
 *
 * Requirements: 2.2 - Align data by relative position within the program year
 */
export function calculateProgramYearDay(dateStr: string | Date): number {
  // Resolve the calendar day (year, 0-indexed month, day-of-month). For a
  // YYYY-MM-DD string read the components directly — `new Date(str)` is UTC
  // midnight but local getters shift it (see calendarParts). For a Date,
  // honour the local calendar day the caller intended.
  let year: number
  let month: number // 0-indexed (0 = January, 6 = July)
  let day: number
  const isoMatch =
    typeof dateStr === 'string'
      ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
      : null
  if (isoMatch) {
    year = parseInt(isoMatch[1]!, 10)
    month = parseInt(isoMatch[2]!, 10) - 1
    day = parseInt(isoMatch[3]!, 10)
  } else {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    year = date.getFullYear()
    month = date.getMonth()
    day = date.getDate()
  }

  // Program year starts July 1. month >= 6 (July+) → started this calendar
  // year; earlier → started last calendar year.
  const programYearStartYear = month >= 6 ? year : year - 1

  // Anchor both endpoints in UTC so the day count is timezone- and
  // DST-invariant (a local-July-1 anchor drifts across the spring DST jump).
  const diffTime =
    Date.UTC(year, month, day) - Date.UTC(programYearStartYear, 6, 1)
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  // Clamp to valid range [0, 365]
  return Math.max(0, Math.min(365, diffDays))
}
