/**
 * Club Success Plan deadline copy atoms (#1565).
 *
 * The due-date RULE lives in analytics-core (`cspDueDate`, `isCspOverdue`,
 * beside `isCspRequired`). This module holds the presentation pieces every
 * deadline-aware surface composes — the area and division narratives, the
 * action list and the district overview — so the date format, the grouping
 * order and the automatic-credit wording exist once (lessons 61/76).
 *
 * Nothing here reads a clock. `cspOverdue` is resolved upstream against the
 * caller's pinned snapshot date (R3) and arrives as a field, so a historical
 * snapshot renders the wording that was true on its date and every branch is
 * testable without mocking time.
 */

/** Per-club deadline fields carried by every listed club without a plan. */
export interface CspDeadlineFields {
  /** `YYYY-MM-DD` from `cspDueDate` — never null here (auto-credit clubs are not listed). */
  cspDueDate: string
  /** `isCspOverdue(cspDueDate, snapshotDate)` — late as of the pinned date. */
  cspOverdue: boolean
}

/** Clubs sharing one due date and one late/pending state. */
export interface CspDueGroup<T> {
  dueDate: string
  overdue: boolean
  clubs: T[]
}

/**
 * The terminal consequence, verbatim across surfaces. Deliberately free of
 * "until": once the date has passed there is nothing left to file.
 */
export const CSP_LOST_ELIGIBILITY = 'cannot be Distinguished this program year'

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
] as const

/** `2026-09-30` → "30 September 2026". String arithmetic only — no Date, no timezone. */
export function formatCspDueDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  const monthName = MONTHS[Number.parseInt(month ?? '', 10) - 1] ?? month
  return `${Number.parseInt(day ?? '', 10)} ${monthName} ${year}`
}

/**
 * Group clubs by (due date, overdue) — overdue groups first, each side in
 * due-date order, input order kept within a group. Overdue first because the
 * lost-eligibility fact is the one a leader must not miss.
 */
export function groupByCspDueDate<T extends CspDeadlineFields>(
  clubs: readonly T[]
): CspDueGroup<T>[] {
  const byKey = new Map<string, CspDueGroup<T>>()
  for (const club of clubs) {
    const key = `${club.cspOverdue ? '1' : '0'}|${club.cspDueDate}`
    const group = byKey.get(key)
    if (group) {
      group.clubs.push(club)
    } else {
      byKey.set(key, {
        dueDate: club.cspDueDate,
        overdue: club.cspOverdue,
        clubs: [club],
      })
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      a.dueDate.localeCompare(b.dueDate)
  )
}

/** "a, b and c" — the list join the narratives already use for prose. */
function joinProse(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * Name the due date(s) of some groups: one date plainly ("30 September 2026"),
 * several with their club counts ("30 September 2026 for 3 clubs and
 * 1 December 2026 for 1 club").
 */
export function describeCspDueDates(
  groups: readonly CspDueGroup<unknown>[]
): string {
  if (groups.length === 1) return formatCspDueDate(groups[0]!.dueDate)
  return joinProse(
    groups.map(g => {
      const n = g.clubs.length
      return `${formatCspDueDate(g.dueDate)} for ${n} club${n === 1 ? '' : 's'}`
    })
  )
}

/** "1 club chartered after 1 April has automatic credit" — the footnote atom. */
export function cspAutoCreditNote(count: number): string {
  return count === 1
    ? '1 club chartered after 1 April has automatic credit'
    : `${count} clubs chartered after 1 April have automatic credit`
}
