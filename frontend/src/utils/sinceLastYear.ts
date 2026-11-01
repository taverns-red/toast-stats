/**
 * "Climbed / slipped since last year" (#2432) — compare each club's DCP goals
 * now with the same snapshot date in the prior program year.
 */
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

export type SinceLastYearMode = 'climbed' | 'slipped' | 'no-prior'

export const SINCE_LAST_YEAR_MODES: readonly SinceLastYearMode[] = [
  'climbed',
  'slipped',
  'no-prior',
]

export type NoPriorReason =
  'chartered-since' | 'not-in-district' | 'no-snapshot'

export type SinceLastYearEntry =
  | { kind: 'compared'; now: number; then: number; delta: number }
  | { kind: 'no-prior'; reason: NoPriorReason }

export interface PriorYearDate {
  /** The date one year before the current snapshot date. */
  targetDate: string
  /** The snapshot actually used: the target, or the nearest earlier one in the prior PY. */
  comparisonDate: string | null
}

export interface PriorYearClub {
  clubId: string
  dcpGoals: number
}

export interface SinceLastYearSummary {
  climbed: number
  slipped: number
  unchanged: number
  noPrior: number
}

export function resolvePriorYearDate(
  _currentDate: string,
  _districtDates: readonly string[]
): PriorYearDate {
  return { targetDate: '', comparisonDate: null }
}

export function compareSinceLastYear(
  _clubs: readonly ClubTrend[],
  _priorClubs: readonly PriorYearClub[] | null,
  _comparisonDate: string | null
): Map<string, SinceLastYearEntry> {
  return new Map()
}

export function matchesSinceLastYear(
  _entry: SinceLastYearEntry | undefined,
  _mode: SinceLastYearMode
): boolean {
  return true
}

export function summarizeSinceLastYear(
  _byClub: ReadonlyMap<string, SinceLastYearEntry>,
  _clubIds: readonly string[]
): SinceLastYearSummary {
  return { climbed: 0, slipped: 0, unchanged: 0, noPrior: 0 }
}

export function lookupSinceLastYear(
  _byClub: ReadonlyMap<string, SinceLastYearEntry>,
  _clubId: string
): SinceLastYearEntry | undefined {
  return undefined
}

/** What the page hands the table: the dates resolved and last year's clubs. */
export interface PriorYearClubGoals {
  targetDate: string
  comparisonDate: string | null
  /** Null when there is no comparison snapshot for this district. */
  clubs: PriorYearClub[] | null
}
