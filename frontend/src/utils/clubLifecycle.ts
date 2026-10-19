import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'

/**
 * #1843 — the club page's Lifecycle timeline (mobile review §6.3, feature
 * design §3.2): a short, oldest-first list of the events the CDN can vouch
 * for.
 *
 * - **Chartered** — the snapshot's `charterDate` (Find-a-Club enrichment).
 * - **In District N · Current** — a club the history never saw move, still
 *   seen: its current state. #2169: there is no "First record in District N"
 *   row. The history starts where our data starts (2016–17 for most
 *   districts), so its first span says nothing about when the club joined.
 * - **Moved from District Y to District X** — one row per move the history
 *   observed: a later span in a different district (#1782). The latest is
 *   current while it is open.
 *
 *   The history is program-year granular: a span's `from` is the first date
 *   of that program year's store (e.g. 2018-07-31), not the club's first
 *   appearance. A move is therefore labelled by month and year ("Mar 2026")
 *   only when the span carries `firstSeenOn` (#1816, the day the history
 *   vouches for), else by program year ("2018–19 program year") — never by
 *   a month the data cannot vouch for.
 * - **Last record in District N** — when the last span is closed; to the
 *   day when it carries `lastSeenOn` (#1816), else the month of `to`.
 * - **Suspended** — the `Susp` date from the page date's
 *   `suspended-clubs.json` (#1953), when the caller has one.
 *
 * `recordsStart` (#2169): when the charter predates the earliest snapshot we
 * hold for the club's district (`recordsStartDate`, per district — not a
 * global 2016–17), the program year our records start in, for a note under
 * the timeline.
 *
 * Events are sorted by program year, then by kind (charter, current, moves,
 * last record, suspension), then by date.
 */

/** One row of the club page's Lifecycle timeline. */
export interface ClubLifecycleEvent {
  key: string
  kind: 'charter' | 'current' | 'move' | 'last' | 'suspended'
  title: string
  /** Empty for a current-state row, which has no date to show. */
  when: string
  /** The club's current district (an open-ended span). */
  current: boolean
}

export interface ClubLifecycle {
  events: ClubLifecycleEvent[]
  formerNames: string[]
  /** False when the club-district history shard had no entry. */
  historyAvailable: boolean
  /** Short program year our records start in ("2016–17"), when the charter
      predates the district's earliest snapshot; else null. */
  recordsStart: string | null
}

const SHORT_MONTHS = [
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
] as const

interface ParsedDate {
  /** Sortable ISO-ish key (YYYY, YYYY-MM or YYYY-MM-DD). */
  sortKey: string
  year: number
  month: number | null
  day: number | null
}

/* String-parsed (never through Date) so a date never drifts across a
   time-zone boundary. Accepts YYYY, YYYY-MM and YYYY-MM-DD[Thh…]. */
function parseIsoPrefix(value: string | null | undefined): ParsedDate | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value?.trim() ?? '')
  if (!m) return null
  const year = Number(m[1])
  if (year < 1900 || year > 2200) return null
  const month = m[2] ? Number(m[2]) : null
  if (month !== null && (month < 1 || month > 12)) return null
  const day = m[3] ? Number(m[3]) : null
  return { sortKey: m[0], year, month, day }
}

function formatMonthYear(d: ParsedDate): string {
  return d.month === null
    ? String(d.year)
    : `${SHORT_MONTHS[d.month - 1]} ${d.year}`
}

/** The program year (July–June) a date falls in, by its start year. */
function programYearStart(d: ParsedDate): number {
  return d.month !== null && d.month < 7 ? d.year - 1 : d.year
}

/** "2016–17". */
function shortProgramYear(d: ParsedDate): string {
  const start = programYearStart(d)
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`
}

function formatProgramYear(d: ParsedDate): string {
  return `${shortProgramYear(d)} program year`
}

function formatDay(d: ParsedDate): string {
  if (d.month === null || d.day === null) return formatMonthYear(d)
  return `${SHORT_MONTHS[d.month - 1]} ${d.day}, ${d.year}`
}

/** A full date the history vouches for (#1816), as "Jul 26, 2026". */
function exactDay(value: string | undefined): string | null {
  const d = parseIsoPrefix(value)
  return d && d.day !== null ? formatDay(d) : null
}

/** A move the history dates to the day (#1816), as "Mar 2026" (#2170). */
function monthYearOf(value: string | undefined): string | null {
  const d = parseIsoPrefix(value)
  return d && d.day !== null ? formatMonthYear(d) : null
}

/** "01" → "District 1"; a lettered district keeps its letter. */
export function lifecycleDistrictLabel(districtId: string): string {
  const id = /^\d+$/.test(districtId) ? String(Number(districtId)) : districtId
  return `District ${id}`
}

/* "01" and "1" are one district (as `sameDistrictId` in clubDistrictSpan.ts,
   which imports this module, so it cannot be imported back). */
function sameDistrict(a: string, b: string): boolean {
  const norm = (id: string) =>
    /^\d+$/.test(id) ? String(Number(id)) : id.toUpperCase()
  return norm(a) === norm(b)
}

/* The program year our records start in, when the charter predates the
   district's earliest snapshot. Compared at the charter's own precision: a
   month-only charter ("2017-01") in the first snapshot's month may be
   in-window, so it gets no note. */
function recordsStartNote(
  charter: ParsedDate | null,
  recordsStartDate: string | null | undefined
): string | null {
  const start = parseIsoPrefix(recordsStartDate)
  if (!charter || !start) return null
  return charter.sortKey < start.sortKey.slice(0, charter.sortKey.length)
    ? shortProgramYear(start)
    : null
}

const KIND_ORDER: Record<ClubLifecycleEvent['kind'], number> = {
  charter: 0,
  current: 1,
  move: 2,
  last: 3,
  suspended: 4,
}

export function buildClubLifecycle(input: {
  charterDate?: string | undefined
  history: ClubDistrictHistoryClub | null
  suspendDate?: string | null | undefined
  /** The earliest snapshot we hold for the club's district. */
  recordsStartDate?: string | null | undefined
}): ClubLifecycle {
  const dated: Array<{ py: number; at: string; event: ClubLifecycleEvent }> = []

  const charter = parseIsoPrefix(input.charterDate)
  if (charter) {
    dated.push({
      py: programYearStart(charter),
      at: charter.sortKey,
      event: {
        key: 'charter',
        kind: 'charter',
        title: 'Chartered',
        when: formatMonthYear(charter),
        current: false,
      },
    })
  }

  const spans = input.history?.spans ?? []
  let moved = false
  spans.forEach((span, i) => {
    const prev = spans[i - 1]
    if (!prev || sameDistrict(prev.districtId, span.districtId)) return
    const from = parseIsoPrefix(span.from)
    if (!from) return
    moved = true
    dated.push({
      py: programYearStart(from),
      at: from.sortKey,
      event: {
        key: `move-${i}-${span.districtId}`,
        kind: 'move',
        title: `Moved from ${lifecycleDistrictLabel(prev.districtId)} to ${lifecycleDistrictLabel(span.districtId)}`,
        when: monthYearOf(span.firstSeenOn) ?? formatProgramYear(from),
        current: span.to === null && i === spans.length - 1,
      },
    })
  })

  const latest = spans[spans.length - 1]
  const latestFrom = parseIsoPrefix(latest?.from)
  if (!moved && latest && latest.to === null && latestFrom) {
    dated.push({
      py: programYearStart(latestFrom),
      at: latestFrom.sortKey,
      event: {
        key: `current-${latest.districtId}`,
        kind: 'current',
        title: `In ${lifecycleDistrictLabel(latest.districtId)}`,
        when: '',
        current: true,
      },
    })
  }

  const lastSpan = spans[spans.length - 1]
  const lastTo = parseIsoPrefix(lastSpan?.to)
  if (lastSpan && lastTo) {
    dated.push({
      py: programYearStart(lastTo),
      at: lastTo.sortKey,
      event: {
        key: `last-${lastSpan.districtId}`,
        kind: 'last',
        title: `Last record in ${lifecycleDistrictLabel(lastSpan.districtId)}`,
        when: exactDay(lastSpan.lastSeenOn) ?? formatMonthYear(lastTo),
        current: false,
      },
    })
  }

  const suspended = parseIsoPrefix(input.suspendDate)
  if (suspended) {
    dated.push({
      py: programYearStart(suspended),
      at: suspended.sortKey,
      event: {
        key: 'suspended',
        kind: 'suspended',
        title: 'Suspended',
        when: formatDay(suspended),
        current: false,
      },
    })
  }

  dated.sort(
    (a, b) =>
      a.py - b.py ||
      KIND_ORDER[a.event.kind] - KIND_ORDER[b.event.kind] ||
      a.at.localeCompare(b.at)
  )

  return {
    events: dated.map(d => d.event),
    formerNames: input.history?.formerNames ?? [],
    historyAvailable: input.history !== null,
    recordsStart: recordsStartNote(charter, input.recordsStartDate),
  }
}
