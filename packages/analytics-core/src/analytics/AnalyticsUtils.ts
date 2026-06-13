/**
 * Analytics Utility Functions
 *
 * Shared utility functions used across all analytics modules.
 * Extracted from backend AnalyticsEngine for code reuse.
 *
 * Requirements: 7.2, 7.3, 7.4, 7.5
 */

/**
 * Trend direction type for multi-year analysis
 */
export type MultiYearTrendDirection = 'increasing' | 'decreasing' | 'stable'

/**
 * Safely parse a value that could be string or number to integer
 *
 * @param value - Value to parse (string, number, null, or undefined)
 * @param defaultValue - Default value if parsing fails (default: 0)
 * @returns Parsed integer value
 */
export function parseIntSafe(
  value: string | number | null | undefined,
  defaultValue = 0
): number {
  if (typeof value === 'number') return Math.floor(value)
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? defaultValue : parsed
  }
  return defaultValue
}

/**
 * Parse an integer value, returning undefined for missing/invalid data
 *
 * Unlike parseIntSafe which returns a default value, this function returns
 * undefined when the value cannot be parsed. This is used for optional
 * numeric fields where we need to distinguish between "0" and "missing".
 *
 * @param value - Value to parse (string, number, null, or undefined)
 * @returns Parsed integer value or undefined if parsing fails
 */
export function parseIntOrUndefined(
  value: string | number | null | undefined
): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  if (typeof value === 'number') {
    return isNaN(value) ? undefined : Math.floor(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      return undefined
    }
    const parsed = parseInt(trimmed, 10)
    return isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

/**
 * Ensure a value is a string for use as Map key
 *
 * @param value - Value to convert to string
 * @returns String representation of the value
 */
export function ensureString(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * Get the DCP goals checkpoint for a given month
 *
 * Returns the minimum DCP goals required for that month in the program year.
 * The Toastmasters program year runs July 1 - June 30.
 *
 * Thresholds:
 * - July-August (7-8): 0 (start of program year, no DCP goals required yet)
 * - September (9): 1 goal
 * - October-November (10-11): 2 goals
 * - December-January (12, 1): 3 goals
 * - February-March (2-3): 4 goals
 * - April-June (4-6): 5 goals
 *
 * @param month - Month number (1-12)
 * @returns Minimum DCP goals required for that month
 * @throws Error if month is not between 1 and 12
 */
export function getDCPCheckpoint(month: number): number {
  // Validate month is in valid range
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`)
  }

  // July-August (7-8): Start of program year - 0 DCP goals required
  if (month === 7 || month === 8) {
    return 0
  }

  // September (9): 1 goal required
  if (month === 9) {
    return 1
  }

  // October-November (10-11): 2 goals required
  if (month === 10 || month === 11) {
    return 2
  }

  // December (12) or January (1): 3 goals required
  if (month === 12 || month === 1) {
    return 3
  }

  // February-March (2-3): 4 goals required
  if (month === 2 || month === 3) {
    return 4
  }

  // April-June (4-6): 5 goals required
  return 5
}

/**
 * Determine the current month for DCP checkpoint evaluation
 *
 * Uses the snapshot date or current date to determine program month.
 * The Toastmasters program year runs July 1 - June 30.
 *
 * @param dateString - Optional date string in YYYY-MM-DD format
 * @returns Month number (1-12)
 * @throws Error if date string is invalid
 */
export function getCurrentProgramMonth(dateString?: string): number {
  if (dateString) {
    // Read the month directly from the YYYY-MM-DD string. Going through
    // `new Date(dateString)` parses it as UTC midnight, but `getMonth()`
    // reads LOCAL time — so in a UTC-negative zone a first-of-month date
    // rolls back to the prior month (a 2026-07-01 snapshot evaluated as
    // June → wrong DCP checkpoint). Validate the date is real, then take
    // the month from the string itself so the result is TZ-invariant.
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
    const parsed = new Date(dateString)
    if (!match || isNaN(parsed.getTime())) {
      throw new Error(
        `Invalid date string: ${dateString}. Expected format: YYYY-MM-DD`
      )
    }
    const month = parseInt(match[2]!, 10)
    if (month < 1 || month > 12) {
      throw new Error(
        `Invalid date string: ${dateString}. Expected format: YYYY-MM-DD`
      )
    }
    return month
  }

  // No date provided: use the current local month (getMonth() returns 0-11).
  return new Date().getMonth() + 1
}

/**
 * Get month name from month number
 *
 * @param month - Month number (1-12)
 * @returns Month name string
 */
export function getMonthName(month: number): string {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return monthNames[month - 1] || 'Unknown'
}

/**
 * Find the same date in the previous program year
 *
 * Toastmasters program year runs July 1 - June 30.
 * To find the same point in the previous program year, subtract 1 year.
 *
 * @param currentDate - Current date in YYYY-MM-DD format
 * @returns Previous year date in YYYY-MM-DD format
 */
export function findPreviousProgramYearDate(currentDate: string): string {
  const currentYear = parseInt(currentDate.substring(0, 4))
  const previousYearDate = `${currentYear - 1}${currentDate.substring(4)}`
  return previousYearDate
}

/**
 * Calculate percentage change between two values
 *
 * Returns 100 if previous value is 0 and current is positive,
 * 0 if both are 0.
 *
 * @param previousValue - Previous value
 * @param currentValue - Current value
 * @returns Percentage change rounded to 1 decimal place
 */
export function calculatePercentageChange(
  previousValue: number,
  currentValue: number
): number {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0
  }
  return (
    Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10
  )
}

/**
 * Determine trend direction from a series of values
 *
 * Uses simple linear regression to calculate slope and determine trend.
 * A relative slope > 0.05 is increasing, < -0.05 is decreasing, otherwise stable.
 *
 * @param values - Array of numeric values in chronological order
 * @returns Trend direction: 'increasing', 'decreasing', or 'stable'
 */
export function determineTrend(values: number[]): MultiYearTrendDirection {
  if (values.length < 2) return 'stable'

  // Calculate simple linear regression slope
  const n = values.length
  const sumX = (n * (n - 1)) / 2 // Sum of indices 0, 1, 2, ...
  const sumY = values.reduce((sum, val) => sum + val, 0)
  const sumXY = values.reduce((sum, val, idx) => sum + idx * val, 0)
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6 // Sum of squares

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return 'stable'

  const slope = (n * sumXY - sumX * sumY) / denominator

  // Determine trend based on slope
  // Use a threshold to avoid classifying small changes as trends
  const avgValue = sumY / n
  const relativeSlope = avgValue > 0 ? slope / avgValue : slope

  if (relativeSlope > 0.05) {
    return 'increasing'
  } else if (relativeSlope < -0.05) {
    return 'decreasing'
  } else {
    return 'stable'
  }
}
