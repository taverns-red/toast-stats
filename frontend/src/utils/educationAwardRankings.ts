/**
 * Education award leaderboards (#1592). Placeholder exports so the red tests
 * typecheck; behaviour lands in the next commit.
 */
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'

export const MIN_ELIGIBLE_BASE = 8

export interface EducationAwardClub {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
  membershipBase: number
}

export interface EducationAwardEntry extends EducationAwardClub {
  numerator: number
  denominator: number
  ratio: number
  rank: number | null
}

export interface EducationAwardRanking {
  available: boolean
  sourceReportType: string | null
  asOf: string
  ranked: EducationAwardEntry[]
  ineligible: EducationAwardEntry[]
}

export function isCountedEducationAward(_award: string): boolean {
  return false
}

export function computeEducationAwardRankings(
  _clubs: EducationAwardClub[],
  _reports: DistrictReportsDataset | null
): {
  awardsPerBase: EducationAwardRanking
  membersWithAward: EducationAwardRanking
} {
  const empty: EducationAwardRanking = {
    available: false,
    sourceReportType: null,
    asOf: '',
    ranked: [],
    ineligible: [],
  }
  return { awardsPerBase: empty, membersWithAward: empty }
}
