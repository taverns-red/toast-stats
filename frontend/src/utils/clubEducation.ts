import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'

/** #1790 — stub; implemented next. */
export type EducationProgram = 'Pathways' | 'Legacy' | 'DTM'

export interface ClassifiedEducationAward {
  program: EducationProgram
  code: string
  pathName: string | null
  level: number | null
}

export type ClubEducationSummary =
  | { available: false }
  | {
      available: true
      asOf: string
      isArchive: boolean
      total: number
      byProgram: Record<EducationProgram, number>
      pathwaysLevels: number[]
      paths: Array<{ code: string; name: string; count: number }>
      membersWithAward: number | null
    }

export function classifyEducationAward(
  _award: string
): ClassifiedEducationAward | null {
  return null
}

export function summarizeClubEducation(
  _reports: DistrictReportsDataset | null | undefined,
  _clubId: string
): ClubEducationSummary {
  return { available: false }
}
