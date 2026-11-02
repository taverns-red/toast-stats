/**
 * "Climbed / slipped since last year" (#2432) — compare each club's DCP goals
 * now with the same snapshot date in the prior program year.
 *
 * Like-for-like: DCP goals accumulate across a program year, so the only fair
 * comparison is the same point in last year's cycle. The comparison snapshot
 * is the same calendar date one year back, or the nearest earlier snapshot
 * inside the prior program year. It never reaches before that year's Jul 1:
 * an older snapshot belongs to a different year's DCP.
 *
 * A club absent from the comparison snapshot has no prior-year data. That is
 * a new charter, or a club that moved districts (the 2026 realignment: every
 * 2xx district's history starts at the 2026-06-30 close). Such a club is
 * labelled, never counted as a climber — its goals are not a gain.
 *
 * DCP goals are the snapshot's own count (`dcpGoals`, the same value the
 * analytics trend carries for today), never inferred from goal order.
 */
import { normalizeClubId } from '@taverns-red/shared-contracts'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { getLatestDcpGoals } from './columnFilterUtils'
import { getProgramYearForDate } from './programYear'

export type SinceLastYearMode = 'climbed' | 'slipped' | 'no-prior'

export const SINCE_LAST_YEAR_MODES: readonly SinceLastYearMode[] = [
  'climbed',
  'slipped',
  'no-prior',
]

export type NoPriorReason =
  /** Chartered after the comparison date. */
  | 'chartered-since'
  /** Chartered earlier but not in this district then (realignment, transfer). */
  | 'not-in-district'
  /** The district has no snapshot to compare with (e.g. formed this year). */
  | 'no-snapshot'

export type SinceLastYearEntry =
  | { kind: 'compared'; now: number; then: number; delta: number }
  | { kind: 'no-prior'; reason: NoPriorReason }

export interface PriorYearDate {
  /** The date one year before the current snapshot date. */
  targetDate: string
  /** The snapshot used: the target, or the nearest earlier one in the prior PY. */
  comparisonDate: string | null
}

export interface PriorYearClub {
  clubId: string
  dcpGoals: number
}

/** What the page hands the table: the dates resolved and last year's clubs. */
export interface PriorYearClubGoals {
  targetDate: string
  comparisonDate: string | null
  /** Null when there is no comparison snapshot for this district. */
  clubs: PriorYearClub[] | null
}

export interface SinceLastYearSummary {
  climbed: number
  slipped: number
  unchanged: number
  noPrior: number
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** `YYYY-MM-DD` one calendar year earlier; Feb 29 becomes Feb 28. */
function oneYearEarlier(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const year = y - 1
  // Day 0 of the next month is the last day of month `m`.
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return `${year}-${pad2(m)}-${pad2(Math.min(d, lastDay))}`
}

/**
 * The prior-year snapshot to compare `currentDate` with: the same date one
 * year back if the district has it, else the nearest earlier date in the
 * prior program year, else none.
 */
export function resolvePriorYearDate(
  currentDate: string,
  districtDates: readonly string[]
): PriorYearDate {
  const targetDate = oneYearEarlier(currentDate)
  const priorPyStart = getProgramYearForDate(targetDate).startDate
  let comparisonDate: string | null = null
  for (const d of districtDates) {
    if (d < priorPyStart || d > targetDate) continue
    if (comparisonDate === null || d > comparisonDate) comparisonDate = d
  }
  return { targetDate, comparisonDate }
}

/**
 * Each club's DCP goals now against the comparison snapshot, keyed on the
 * canonical club id (Toastmasters emits both `00002274` and `2274`).
 * `priorClubs` null means there is no comparison snapshot at all.
 */
export function compareSinceLastYear(
  clubs: readonly ClubTrend[],
  priorClubs: readonly PriorYearClub[] | null,
  comparisonDate: string | null
): Map<string, SinceLastYearEntry> {
  const prior = new Map<string, number>()
  for (const c of priorClubs ?? [])
    prior.set(normalizeClubId(c.clubId), c.dcpGoals)

  const byClub = new Map<string, SinceLastYearEntry>()
  for (const club of clubs) {
    const id = normalizeClubId(club.clubId)
    const then = prior.get(id)
    if (priorClubs === null || comparisonDate === null) {
      byClub.set(id, { kind: 'no-prior', reason: 'no-snapshot' })
    } else if (then === undefined) {
      const charteredSince =
        !!club.charterDate && club.charterDate.slice(0, 10) > comparisonDate
      byClub.set(id, {
        kind: 'no-prior',
        reason: charteredSince ? 'chartered-since' : 'not-in-district',
      })
    } else {
      const now = getLatestDcpGoals(club)
      byClub.set(id, { kind: 'compared', now, then, delta: now - then })
    }
  }
  return byClub
}

/** The entry for a club, looked up by its canonical id. */
export function lookupSinceLastYear(
  byClub: ReadonlyMap<string, SinceLastYearEntry>,
  clubId: string
): SinceLastYearEntry | undefined {
  return byClub.get(normalizeClubId(clubId))
}

/** Does this entry belong in the given mode? A club with no entry never does. */
export function matchesSinceLastYear(
  entry: SinceLastYearEntry | undefined,
  mode: SinceLastYearMode
): boolean {
  if (!entry) return false
  if (mode === 'no-prior') return entry.kind === 'no-prior'
  if (entry.kind !== 'compared') return false
  return mode === 'climbed' ? entry.delta > 0 : entry.delta < 0
}

/** Climbed / slipped / unchanged / no-prior counts over the given clubs. */
export function summarizeSinceLastYear(
  byClub: ReadonlyMap<string, SinceLastYearEntry>,
  clubIds: readonly string[]
): SinceLastYearSummary {
  const summary: SinceLastYearSummary = {
    climbed: 0,
    slipped: 0,
    unchanged: 0,
    noPrior: 0,
  }
  for (const id of clubIds) {
    const entry = lookupSinceLastYear(byClub, id)
    if (!entry) continue
    if (entry.kind === 'no-prior') summary.noPrior++
    else if (entry.delta > 0) summary.climbed++
    else if (entry.delta < 0) summary.slipped++
    else summary.unchanged++
  }
  return summary
}
