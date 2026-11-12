import type { ProgramYear } from './programYear'
import type { SnapshotDate } from '../types/snapshotDate'

export type DateResolutionStatus = 'none' | 'valid' | 'switched-py' | 'fallback'

export interface DateResolution {
  status: DateResolutionStatus
  programYear: ProgramYear
  /** The snapshot to fetch; null only when the program year has no snapshots. */
  date: SnapshotDate | null
  /** The raw `?date=` value, when one was supplied. */
  requested: string | null
}

export function resolveRequestedDate(params: {
  requested: string | null
  dates: readonly SnapshotDate[]
  programYear: ProgramYear
}): DateResolution {
  const { requested, programYear, dates } = params
  return {
    status: requested ? 'valid' : 'none',
    programYear,
    date: dates.find(d => d === requested) ?? null,
    requested,
  }
}
