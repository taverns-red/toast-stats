/**
 * Time-window presets for the "What Changed" date-pair picker (#1462, epic
 * #1458 Sprint 4).
 *
 * ## The honest model
 *
 * A district has snapshots on RECORDED dates only — never on every calendar
 * day, and the cadence varies (daily during a campaign, monthly in a quiet
 * stretch, and month-end pinning shifts them again). So "last week" cannot mean
 * `to − 7 days`: that date usually names no snapshot, and fetching it 404s to an
 * empty digest with no error to show for it.
 *
 * Every preset therefore resolves to a date the district ACTUALLY RECORDED:
 *
 * - `to` is always the latest recorded date.
 * - `from` is the latest recorded date **at or before** the window's target
 *   day. At-or-before (never after) is the direction that keeps the label
 *   honest — you asked for a week, you get at least a week. Rounding forward
 *   would let a "~1 week" chip silently compare two days.
 * - `program-year` instead takes the **earliest** recorded date on or after the
 *   July 1 boundary of `to`'s program year — the program year's opening
 *   snapshot, which is the baseline a district leader means by "this year".
 *
 * When no recorded date anchors the window, the preset resolves to `null` and
 * the chip renders disabled. It never falls back to a closer date (that would
 * mislabel the window) and never emits `from === to` or a reversed pair (the
 * page would render an all-zero digest or negative deltas — R17, Lesson 124).
 *
 * These are pure derivations over the already-loaded `dates` array: no new
 * fetch, and no new URL param — a preset simply writes a resolved from/to pair
 * through the existing URL state, so deep links stay plain date pairs.
 */

import { getProgramYearForDate } from './programYear'

/** The window a preset chip selects. */
export type DatePairPresetId =
  'last-snapshot' | 'week' | 'month' | 'program-year'

export interface DatePairPresetDefinition {
  id: DatePairPresetId
  /** Chip text. The `~` is load-bearing: the window snaps to recorded dates. */
  label: string
  /** Accessible description — what the chip will actually compare. */
  description: string
}

/** Display order, widest-last: the common pick sits first. */
export const DATE_PAIR_PRESETS: readonly DatePairPresetDefinition[] = [
  {
    id: 'last-snapshot',
    label: 'Last snapshot',
    description: 'Compare the latest snapshot with the one recorded before it',
  },
  {
    id: 'week',
    label: '~1 week',
    description:
      'Compare the latest snapshot with the nearest recorded date a week or more earlier',
  },
  {
    id: 'month',
    label: '~1 month',
    description:
      'Compare the latest snapshot with the nearest recorded date a month or more earlier',
  },
  {
    id: 'program-year',
    label: 'Program year',
    description:
      'Compare the latest snapshot with the first date recorded in this program year',
  },
]

const pad = (n: number): string => String(n).padStart(2, '0')

/** UTC-safe day shift. `Date` arithmetic on a bare `YYYY-MM-DD` is local-time. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * UTC-safe month shift, clamped to a real calendar day: Mar 31 − 1 month is
 * Feb 28, not Mar 3. (`setUTCMonth` rolls the overflow forward, which would
 * push the target PAST `to`'s own month and widen the window by a month.)
 */
function shiftMonths(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const absolute = year * 12 + (month - 1) + months
  const targetYear = Math.floor(absolute / 12)
  const targetMonth = absolute - targetYear * 12 // 0-indexed, always ≥ 0
  // Day 0 of the next month is the last day of the target month.
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate()
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`
}

/** Latest date at or before `target`, or undefined if the history starts later. */
function latestAtOrBefore<T extends string>(
  ascending: readonly T[],
  target: string
): T | undefined {
  for (let i = ascending.length - 1; i >= 0; i--) {
    if (ascending[i]! <= target) return ascending[i]
  }
  return undefined
}

/** Earliest date at or after `target`, or undefined if the history ends first. */
function earliestAtOrAfter<T extends string>(
  ascending: readonly T[],
  target: string
): T | undefined {
  return ascending.find(d => d >= target)
}

/**
 * Resolve a preset to a concrete pair of RECORDED dates.
 *
 * Generic in the date type so a branded `SnapshotDate[]` round-trips branded
 * (#1323): every date returned is an ELEMENT of `dates`, never a computed
 * string. The window targets are computed, but they are only ever used to
 * *select* from the real list.
 *
 * @param dates The district's recorded snapshot dates (order-insensitive).
 * @returns The pair, or `null` when the window has no recorded date to anchor
 *   it — the caller renders that preset disabled.
 */
export function resolveDatePairPreset<T extends string>(
  id: DatePairPresetId,
  dates: readonly T[]
): { from: T; to: T } | null {
  if (dates.length < 2) return null
  // Plain `<`, not localeCompare: ISO YYYY-MM-DD sorts chronologically as
  // bytes, and a locale collator is both slower and (in principle) locale-
  // dependent for a value that must never be.
  const ascending = [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const to = ascending[ascending.length - 1]!

  let from: T | undefined
  switch (id) {
    case 'last-snapshot':
      from = ascending[ascending.length - 2]
      break
    case 'week':
      from = latestAtOrBefore(ascending, shiftDays(to, -7))
      break
    case 'month':
      from = latestAtOrBefore(ascending, shiftMonths(to, -1))
      break
    case 'program-year':
      // The July-1 rule already lives in programYear.ts, timezone-hardened and
      // covered by programYear.timezone.test.ts — reuse it rather than adding a
      // fourth copy of the boundary arithmetic to this directory (R7).
      from = earliestAtOrAfter(ascending, getProgramYearForDate(to).startDate)
      break
  }

  // The single gate for both invalid shapes (R17): an unanchored window, a
  // window that collapsed onto `to`, and — defensively — any reversal.
  if (from === undefined || from >= to) return null
  return { from, to }
}
