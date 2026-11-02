/**
 * The program-year deadline table as an iCalendar feed (#2429, RFC 5545).
 *
 * Built at build time (`deadlinesIcsPlugin`) from the same cited table the
 * deadline strip reads — one source of truth. Each event's UID is the
 * deadline id plus its program year, never a timestamp, so re-importing a
 * newer build updates the same events instead of duplicating them.
 *
 * Nothing here reads a clock: the program years and the DTSTAMP are the
 * caller's.
 */

import { deadlinesForProgramYear } from './programYearDeadlines'

/** Where the feed is served from (Firebase Hosting, `frontend/dist`). */
export const DEADLINES_ICS_FILE = 'deadlines.ics'
export const DEADLINES_ICS_PATH = `/${DEADLINES_ICS_FILE}`

const UID_DOMAIN = 'ts.taverns.red'
const CRLF = '\r\n'
const MAX_OCTETS = 75

/** RFC 5545 §3.3.11 TEXT escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545 §3.1: fold a content line at 75 octets, continuing with one
 * space. Splits on code points, so a multi-byte character is never cut.
 */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // A continuation line spends one octet on its leading space.
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1
    if (octets + size > limit) {
      parts.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

const compact = (isoDate: string): string => isoDate.replace(/-/g, '')

/** The day after `YYYY-MM-DD`: an all-day DTEND is exclusive (§3.6.1). */
function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** `20261101T123456Z` (§3.3.5, UTC form). */
function utcStamp(at: Date): string {
  return at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

/** Stable across builds: the deadline and its program year, nothing else. */
export function deadlineUid(id: string, programYear: string): string {
  return `${id}-${programYear}@${UID_DOMAIN}`
}

/** The feed for the given program years, stamped `dtstamp`. */
export function buildDeadlinesIcs(
  programYears: readonly string[],
  dtstamp: Date
): string {
  const stamp = utcStamp(dtstamp)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Red Taverns//Toast Stats program-year deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText('Toastmasters program-year deadlines')}`,
  ]
  for (const programYear of programYears) {
    for (const d of deadlinesForProgramYear(programYear)) {
      const description = [
        d.owner
          ? `Owner: ${d.owner.role} (${d.owner.citation}: ${d.owner.url})`
          : null,
        `Source: ${d.source}`,
        `Program year ${programYear}.`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${deadlineUid(d.id, programYear)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact(d.date)}`,
        `DTEND;VALUE=DATE:${compact(nextDay(d.date))}`,
        `SUMMARY:${escapeText(d.label)}`,
        `DESCRIPTION:${escapeText(description)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join(CRLF) + CRLF
}

/**
 * The program years a build publishes: the one the build date falls in
 * (Jul 1 – Jun 30, by the calendar) and the next, so a subscriber has the
 * coming year's dates before it starts.
 */
export function feedProgramYears(at: Date): [string, string] {
  const year = at.getUTCFullYear()
  const start = at.getUTCMonth() >= 6 ? year : year - 1
  return [`${start}-${start + 1}`, `${start + 1}-${start + 2}`]
}
