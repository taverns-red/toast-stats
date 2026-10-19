import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'

/**
 * #1843 — the club page's Lifecycle timeline (mobile review §6.3, feature
 * design §3.2): a short, oldest-first list of the events the CDN can vouch
 * for.
 *
 * - **Chartered** — the snapshot's `charterDate` (Find-a-Club enrichment).
 * - **First record in District N** — the first span of the club-district
 *   history (#1782). It is worded as a record, not a joining date: the
 *   history starts in 2017, and a club chartered in 1987 is first *seen* then.
 * - **Moved to District N** — one row per later span.
 *
 *   The history is program-year granular: a span's `from` is the first date
 *   of that program year's store (e.g. 2018-07-31), not the club's first
 *   appearance. Spans are therefore labelled by program year ("2018–19
 *   program year"), never by a month the data cannot vouch for — unless the
 *   span carries `firstSeenOn` (#1816), the day the history vouches for.
 * - **Last record in District N** — when the last span is closed; to the
 *   day when it carries `lastSeenOn` (#1816), else the month of `to`.
 * - **Suspended** — the `Susp` date from the page date's
 *   `suspended-clubs.json` (#1953), when the caller has one.
 *
 * Events are sorted by program year, then by kind (charter, first record,
 * moves, last record, suspension), then by date: a club chartered in April
 * 2019 has a 2018-19 first record, and reads charter first.
 */

/** One row of the club page's Lifecycle timeline. */
export interface ClubLifecycleEvent {
  key: string
  kind: 'charter' | 'first' | 'move' | 'last' | 'suspended'
  title: string
  when: string
  /** The club's current district (an open-ended span). */
  current: boolean
}

export interface ClubLifecycle {
  events: ClubLifecycleEvent[]
  formerNames: string[]
  /** False when the club-district history shard had no entry. */
  historyAvailable: boolean
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

function formatProgramYear(d: ParsedDate): string {
  const start = programYearStart(d)
  return `${start}–${String((start + 1) % 100).padStart(2, '0')} program year`
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

/** "01" → "District 1"; a lettered district keeps its letter. */
export function lifecycleDistrictLabel(districtId: string): string {
  const id = /^\d+$/.test(districtId) ? String(Number(districtId)) : districtId
  return `District ${id}`
}

const KIND_ORDER: Record<ClubLifecycleEvent['kind'], number> = {
  charter: 0,
  first: 1,
  move: 2,
  last: 3,
  suspended: 4,
}

export function buildClubLifecycle(input: {
  charterDate?: string | undefined
  history: ClubDistrictHistoryClub | null
  suspendDate?: string | null | undefined
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
  spans.forEach((span, i) => {
    const from = parseIsoPrefix(span.from)
    if (!from) return
    const label = lifecycleDistrictLabel(span.districtId)
    const kind = i === 0 ? 'first' : 'move'
    dated.push({
      py: programYearStart(from),
      at: from.sortKey,
      event: {
        key: `${kind}-${i}-${span.districtId}`,
        kind,
        title:
          kind === 'first' ? `First record in ${label}` : `Moved to ${label}`,
        when: exactDay(span.firstSeenOn) ?? formatProgramYear(from),
        current: span.to === null && i === spans.length - 1,
      },
    })
  })

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
  }
}
