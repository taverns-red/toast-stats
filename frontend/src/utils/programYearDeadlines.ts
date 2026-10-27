/**
 * Program-year deadlines (#2298) — stub for the Red commit.
 */

export type DeadlineId =
  | 'csp'
  | 'training-r1-close'
  | 'dues-october'
  | 'training-r2-open'
  | 'visits-r1'
  | 'training-r2-close'
  | 'dues-april'
  | 'visits-r2'

export interface ProgramYearDeadline {
  id: DeadlineId
  label: string
  date: string
  source: string
}

export interface DeadlineRule {
  id: DeadlineId
  label: string
  fromProgramYear: string
  source: string
  date: (programYear: string) => string
}

export const PROGRAM_YEAR_DEADLINE_RULES: readonly DeadlineRule[] = []

export function deadlinesForProgramYear(
  _programYear: string
): ProgramYearDeadline[] {
  return []
}

export interface UpcomingDeadline extends ProgramYearDeadline {
  daysLeft: number
}

export function nextDeadlines(
  _programYear: string,
  _asOfDate: string,
  _limit = 2
): UpcomingDeadline[] {
  return []
}

export function areaVisitDeadlines(_programYear: string): {
  r1: string
  r2: string
} {
  return { r1: '', r2: '' }
}
