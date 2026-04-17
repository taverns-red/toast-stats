/**
 * OfficerAwardsCalculator (#333)
 *
 * Computes two officer-specific district awards:
 *
 * - **Excellence in Education & Training** (PQD role):
 *   85% Director training complete + district is Distinguished (any tier)
 *
 * - **Excellence in Club Growth** (CGD role):
 *   District meets Distinguished goals in club growth (1%+) AND
 *   membership payments growth (1%+)
 *
 * Source: Item 1490, Rev. 04/2025
 */

import type { DistrictRanking } from '@toastmasters/shared-contracts'
import type { DistinguishedDistrictStatus } from './DistinguishedDistrictCalculator.js'

export interface OfficerAwardResult {
  districtId: string
  districtName: string
  region: string
  qualifies: boolean
}

export interface OfficerAwardStandings {
  educationTraining: OfficerAwardResult[]
  clubGrowth: OfficerAwardResult[]
}

export class OfficerAwardsCalculator {
  calculate(
    rankings: DistrictRanking[],
    statuses: Record<string, DistinguishedDistrictStatus>
  ): OfficerAwardStandings {
    const educationTraining: OfficerAwardResult[] = rankings.map(r => {
      const status = statuses[r.districtId]
      const trainingMet = r.trainingMet ?? false
      const isDistinguished =
        status !== undefined && status.currentTier !== 'NotDistinguished'

      return {
        districtId: r.districtId,
        districtName: r.districtName,
        region: r.region,
        qualifies: trainingMet && isDistinguished,
      }
    })

    const clubGrowth: OfficerAwardResult[] = rankings.map(r => ({
      districtId: r.districtId,
      districtName: r.districtName,
      region: r.region,
      qualifies: r.clubGrowthPercent >= 1 && r.paymentGrowthPercent >= 1,
    }))

    return { educationTraining, clubGrowth }
  }
}
