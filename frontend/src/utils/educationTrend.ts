import type {
  EducationAwardTotals,
  EducationRollupIndex,
} from '@taverns-red/shared-contracts'

export interface EducationTrendYear {
  programYear: string
  totals: EducationAwardTotals | null
}

// Red stub (#1807): implemented in the next commit.
export function districtEducationTrend(
  _index: EducationRollupIndex | null,
  _districtId: string
): EducationTrendYear[] {
  return []
}

export function skipsProgramYears(_years: EducationTrendYear[]): boolean {
  return false
}
