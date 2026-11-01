/**
 * Club "Recent changes" feed (#2430) — one dated line per change to ONE club.
 *
 * What Changed (epic #797) answers "what changed in the district between two
 * dates". This answers "what happened to this club, and when", by running the
 * SAME diff over the club's own dated snapshot sequence:
 *
 *   - `diffSnapshots` (analytics-core) for membership, payments (with its
 *     typed October/April/new/late/charter breakdown, #1459), DCP goals,
 *     Distinguished tier and Club Success Plan events;
 *   - `diffClubStatus` (frontend, #1247) for operational-status moves.
 *
 * No parallel diff: each snapshot is reduced to the club's own rows
 * (`reduceSnapshotToClub`) and consecutive pairs go through the engine as-is.
 * The engine's labels begin with the club name (#1013); on the club's own page
 * that name is dropped from each line.
 *
 * ## Gaps
 *
 * A snapshot can be unavailable (missing file, failed collection) or lack the
 * club (an export without it, a district move). Neither is a club event: the
 * pair is BRIDGED — the last usable snapshot is compared with the next one —
 * so a missing day never reads as the club leaving and rejoining the roster.
 * The bridged window says so (`spansMissingData`) and the date is reported.
 *
 * ## Reasons
 *
 * A reason is claimed only where a cited rule supports it: a membership DROP
 * across the October 1 or April 1 dues renewal deadline (TI Renewal Dues FAQ,
 * DCP Item 1111 p. 8), read from the cited `programYearDeadlines` table. The
 * line says the drop spans the deadline — not that it was caused by it.
 *
 * Aggregates only: counts and statuses, never a member or contact field.
 *
 * @module clubChangeFeed
 */
import { diffSnapshots } from '@taverns-red/analytics-core'
import {
  normalizeClubId,
  type DiffEvent,
  type DiffEventCategory,
  type DistrictStatisticsFile,
} from '@taverns-red/shared-contracts'
import { diffClubStatus } from './diffClubStatus'
import { deadlinesForProgramYear } from './programYearDeadlines'
import { getProgramYearForDate } from './programYear'

/** How far back the feed looks from the page's as-of date. */
export const FEED_WINDOW_DAYS = 90
/** Spacing between the compared snapshots (one fetch per step). */
export const FEED_STEP_DAYS = 7
/** Lines shown before the feed points to the full history. */
export const FEED_MAX_EVENTS = 8

export interface FeedPoint {
  date: string
  /** The club-reduced snapshot, or null when unavailable / club absent. */
  snapshot: DistrictStatisticsFile | null
}

export interface ClubChangeReason {
  text: string
  /** The TI documents the rule comes from. */
  source: string
}

export interface ClubChangeEntry {
  key: string
  category: DiffEventCategory
  fromDate: string
  toDate: string
  /** Sentence-case line without the club name, e.g. "Gained 1 member". */
  text: string
  magnitude: number
  /** The window bridges a snapshot that was unavailable or lacked the club. */
  spansMissingData: boolean
  reason?: ClubChangeReason
}

export interface ClubChangeFeed {
  /** Newest first, at most `maxEvents`. */
  entries: ClubChangeEntry[]
  /** Events across the whole window, before the bound. */
  totalEvents: number
  truncated: boolean
  /** At least two usable snapshots were compared. */
  comparable: boolean
  /** Any shown line carries a cited reason (the panel then cites it). */
  hasReasons: boolean
  windowStart: string | null
  windowEnd: string | null
  /** Picked dates with no usable snapshot for the club, oldest first. */
  unavailableDates: string[]
}

const DAY_MS = 86_400_000

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/**
 * The snapshot dates to compare: the newest date ≤ `asOf`, then the newest
 * date at least `stepDays` before the last pick, back to `windowDays` before
 * `asOf`; the oldest in-window date closes the window when the last step
 * lands before it. Ascending. Elements of `dates`, so a branded
 * `SnapshotDate[]` stays branded (#1323).
 */
export function pickFeedDates<T extends string>(
  dates: readonly T[],
  asOf: string,
  { windowDays = FEED_WINDOW_DAYS, stepDays = FEED_STEP_DAYS } = {}
): T[] {
  const start = shiftDays(asOf, -windowDays)
  const inWindow = [...dates]
    .filter(d => d <= asOf && d >= start)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  if (inWindow.length === 0) return []

  const picked: T[] = [inWindow[0]!]
  for (;;) {
    const last = picked[picked.length - 1]!
    const target = shiftDays(last, -stepDays)
    const next = inWindow.find(d => d <= target)
    if (next) {
      picked.push(next)
      continue
    }
    const oldest = inWindow[inWindow.length - 1]!
    if (oldest < last) picked.push(oldest)
    break
  }
  return picked.reverse()
}

/**
 * The snapshot reduced to one club's rows, so the district-wide engine diffs
 * just this club. Null when the club is not on the snapshot. Club numbers are
 * matched canonically (#1440): TI exports pad them ("07238597").
 */
export function reduceSnapshotToClub(
  snapshot: DistrictStatisticsFile,
  clubId: string
): DistrictStatisticsFile | null {
  const key = normalizeClubId(clubId)
  const clubs = snapshot.clubs.filter(c => normalizeClubId(c.clubId) === key)
  if (clubs.length === 0) return null
  return {
    ...snapshot,
    clubs,
    clubPerformance: snapshot.clubPerformance.filter(
      r => normalizeClubId(r['Club Number']) === key
    ),
    districtPerformance: snapshot.districtPerformance.filter(
      r => normalizeClubId(r['Club']) === key
    ),
    divisionPerformance: [],
    divisions: [],
    areas: [],
  }
}

/** Order of a window's lines: status first, the slower signals after. */
const CATEGORY_ORDER: readonly DiffEventCategory[] = [
  'club-status',
  'distinguished',
  'membership',
  'payments',
  'dcp-goals',
  'csp',
]

const MONTHS = [
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

/** A dues renewal deadline inside (from, to], from the cited rules table. */
function duesDeadlineReason(
  fromDate: string,
  toDate: string
): ClubChangeReason | undefined {
  const years = new Set([
    getProgramYearForDate(fromDate).label,
    getProgramYearForDate(toDate).label,
  ])
  for (const py of years) {
    const hit = deadlinesForProgramYear(py).find(
      d =>
        (d.id === 'dues-october' || d.id === 'dues-april') &&
        d.date > fromDate &&
        d.date <= toDate
    )
    if (hit) {
      const month = MONTHS[Number(hit.date.slice(5, 7)) - 1]
      const day = Number(hit.date.slice(8, 10))
      return {
        text: `Across the ${month} ${day} dues renewal deadline`,
        source: hit.source,
      }
    }
  }
  return undefined
}

/** "90 Elgin Toastmasters gained 1 member" → "Gained 1 member". */
function lineText(event: DiffEvent): string {
  const prefix = `${event.clubName} `
  const rest = event.label.startsWith(prefix)
    ? event.label.slice(prefix.length)
    : event.label
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/**
 * Diff each consecutive pair of usable points with the What Changed engine
 * and return the club's dated lines, newest first, bounded to `maxEvents`.
 */
export function buildClubChangeFeed(
  points: readonly FeedPoint[],
  { maxEvents = FEED_MAX_EVENTS }: { maxEvents?: number } = {}
): ClubChangeFeed {
  const ordered = [...points].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  )
  const unavailableDates: string[] = []
  const usable: { date: string; snapshot: DistrictStatisticsFile }[] = []
  // For each usable point: did a gap sit between it and the previous one?
  const bridged: boolean[] = []
  let gapPending = false
  for (const p of ordered) {
    if (!p.snapshot) {
      unavailableDates.push(p.date)
      if (usable.length > 0) gapPending = true
      continue
    }
    usable.push({ date: p.date, snapshot: p.snapshot })
    bridged.push(gapPending)
    gapPending = false
  }

  const all: ClubChangeEntry[] = []
  for (let i = usable.length - 1; i >= 1; i--) {
    const from = usable[i - 1]!
    const to = usable[i]!
    const events = [
      ...diffSnapshots(from.snapshot, to.snapshot).events,
      ...diffClubStatus(from.snapshot, to.snapshot),
    ]
      .filter(e => CATEGORY_ORDER.includes(e.category))
      .sort(
        (a, b) =>
          CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category)
      )
    for (const event of events) {
      const reason =
        event.category === 'membership' && event.magnitude < 0
          ? duesDeadlineReason(from.date, to.date)
          : undefined
      all.push({
        key: `${to.date}:${event.category}`,
        category: event.category,
        fromDate: from.date,
        toDate: to.date,
        text: lineText(event),
        magnitude: event.magnitude,
        spansMissingData: bridged[i]!,
        ...(reason ? { reason } : {}),
      })
    }
  }

  const entries = all.slice(0, Math.max(0, maxEvents))
  return {
    entries,
    totalEvents: all.length,
    truncated: all.length > entries.length,
    comparable: usable.length >= 2,
    hasReasons: entries.some(e => e.reason),
    windowStart: usable[0]?.date ?? null,
    windowEnd: usable[usable.length - 1]?.date ?? null,
    unavailableDates,
  }
}

/** RED stub (#2430). */
export function formatFeedWindow(_fromDate: string, _toDate: string): string {
  return ''
}
