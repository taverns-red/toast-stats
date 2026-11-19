/**
 * MembershipRetentionCalculator (#1614): signature only, so the red tests
 * compile. The behaviour lands in the next commit.
 */

import type { DistrictRanking } from '@taverns-red/shared-contracts'

import type { CompetitiveAwardRanking } from './CompetitiveAwardsCalculator.js'

export type MembershipRetentionStatus =
  'not-started' | 'in-progress' | 'final' | 'baseline-missing'

export interface MembershipRetentionStanding extends CompetitiveAwardRanking {
  retained: number
  base: number
}

export interface MembershipRetentionAward {
  status: MembershipRetentionStatus
  baselineDate?: string
  standings: MembershipRetentionStanding[]
}

export function calculateMembershipRetention(
  _rankings: DistrictRanking[],
  _logicalDate: string
): MembershipRetentionAward {
  return { status: 'not-started', standings: [] }
}
