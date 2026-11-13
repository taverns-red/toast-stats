/**
 * Date formatting utilities that handle ISO date strings correctly.
 *
 * IMPORTANT: When parsing date-only strings like "2025-07-23", JavaScript's
 * Date constructor interprets them as UTC midnight. When displayed with
 * toLocaleDateString(), this shifts the date back by one day for users
 * west of UTC (e.g., US timezones).
 *
 * These utilities parse date strings as local dates to avoid this issue.
 */

/**
 * Parse an ISO date string as a local date.
 * Handles both date-only (YYYY-MM-DD) and full datetime (ISO 8601) formats.
 * For date-only strings, this avoids the UTC midnight interpretation that causes off-by-one errors.
 *
 * @param dateStr - Date string in YYYY-MM-DD or ISO 8601 datetime format
 * @returns Date object representing the date
 */
export function parseLocalDate(dateStr: string): Date {
  // If the string already contains a time component (T or space separator),
  // parse it directly without modification
  if (dateStr.includes('T') || dateStr.includes(' ')) {
    return new Date(dateStr)
  }
  // For date-only strings, append T00:00:00 to force local time interpretation
  // Without this, "2025-07-23" is parsed as UTC midnight
  return new Date(dateStr + 'T00:00:00')
}

/**
 * Format a date string for display, handling timezone correctly.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param options - Intl.DateTimeFormat options (defaults to short format)
 * @returns Formatted date string
 */
export function formatDisplayDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = parseLocalDate(dateStr)
  return date.toLocaleDateString('en-US', options)
}

/**
 * Format a date string with month and day only.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "Jul 23")
 */
export function formatShortDate(dateStr: string): string {
  return formatDisplayDate(dateStr, { month: 'short', day: 'numeric' })
}

/**
 * Format a date string with full month name.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "July 23, 2025")
 */
export function formatLongDate(dateStr: string): string {
  return formatDisplayDate(dateStr, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const ISO_DATE_SHAPE = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/

/**
 * The one way a snapshot or as-of date appears in visible text (#2648):
 * "Nov 11, 2026" ('long', the default) or "Nov 11" ('short'). Only the
 * calendar-date part of an ISO value is used, so a full timestamp keeps its
 * own date in every timezone. Text that is not ISO-shaped (a report's own
 * "October 14, 2026") or is not a real date is passed through untouched, and
 * a missing date renders as nothing.
 */
export function formatDateText(
  value: string | null | undefined,
  style: 'long' | 'short' = 'long'
): string {
  if (!value) return ''
  const day = ISO_DATE_SHAPE.exec(value)?.[1]
  if (!day) return value
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const real = new Date(y, m - 1, d)
  if (real.getMonth() !== m - 1 || real.getDate() !== d) return value
  return style === 'short' ? formatShortDate(day) : formatDisplayDate(day)
}
