/**
 * World education page model (#1811, epic #1781) over the #1801 rollup.
 * Stub: the failing tests come first.
 */
import type {
  EducationAwardTotals,
  EducationRollupIndex,
  EducationRollupProgramYear,
} from '@taverns-red/shared-contracts'
import type { EducationSummary } from './districtEducation'

export interface EducationTrendYear {
  programYear: string
  totals: EducationAwardTotals | null
}

export type WorldEducationRegionRow =
  | {
      id: string
      status: 'available'
      totals: EducationAwardTotals
      clubsWithAward: number
      membersWithAward: number | null
      districts: { available: number; notAvailable: number }
    }
  | {
      id: string
      status: 'not-available'
      districts: { available: number; notAvailable: number }
    }

export type WorldEducation =
  | { status: 'not-available'; reason: 'no-rollup' }
  | {
      status: 'available'
      summary: EducationSummary
      kpis: {
        awards: number
        membersWithAward: number | null
        dtms: number
        tripleCrownAchievers: number | null
        clubsWithAward: number
      }
      regions: WorldEducationRegionRow[] | null
      unassigned: string[]
      coverage: { available: number; notAvailable: number }
      source: {
        source: EducationRollupProgramYear['source']
        sourceDate: string | null
      }
    }

export function buildWorldEducation(_: {
  rollup: EducationRollupProgramYear | null
}): WorldEducation {
  throw new Error('not implemented')
}

export function worldEducationTrend(
  _: EducationRollupIndex | null
): EducationTrendYear[] {
  throw new Error('not implemented')
}
