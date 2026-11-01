import type { SnapshotDate } from '../types/snapshotDate'
import type { PriorYearClubGoals } from '../utils/sinceLastYear'

export interface UsePriorYearClubGoalsResult {
  data: PriorYearClubGoals | undefined
  isLoading: boolean
  isError: boolean
}

export function usePriorYearClubGoals(
  _districtId: string | null | undefined,
  _currentDate: SnapshotDate | null | undefined,
  _districtDates: readonly SnapshotDate[],
  _enabled: boolean
): UsePriorYearClubGoalsResult {
  return { data: undefined, isLoading: false, isError: false }
}
