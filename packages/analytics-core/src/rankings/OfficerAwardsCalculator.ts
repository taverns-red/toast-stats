/**
 * OfficerAwardsCalculator (#333)
 *
 * Computes two officer-specific district awards:
 *
 * - **Excellence in Education & Training** (PQD role):
 *   85% of Area and Division Directors trained AND the district meets the
 *   Distinguished goal for number of Distinguished clubs (#1612) — not full
 *   Distinguished District status (growth goals and the other
 *   prerequisites are not required)
 *
 * - **Excellence in Club Growth** (CGD role):
 *   District meets Distinguished goals in club growth (1%+) AND
 *   membership payments growth (1%+)
 *
 * Source: Item 1490, Rev. 04/2025
 */

import type { DistrictRanking } from '@taverns-red/shared-contracts'
import { distinguishedClubsGoalPercent } from './DistinguishedDistrictCalculator.js'

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
  /**
   * @param programYear - "YYYY-YYYY"; selects that year's Distinguished-clubs
   *   goal (45% from 2025-26, 40% before). Omitted → current rules.
   */
  calculate(
    rankings: DistrictRanking[],
    programYear?: string
  ): OfficerAwardStandings {
    const clubsGoal = distinguishedClubsGoalPercent(programYear)

    const educationTraining: OfficerAwardResult[] = rankings.map(r => ({
      districtId: r.districtId,
      districtName: r.districtName,
      region: r.region,
      qualifies: r.trainingMet === true && r.distinguishedPercent >= clubsGoal,
    }))

    const clubGrowth: OfficerAwardResult[] = rankings.map(r => ({
      districtId: r.districtId,
      districtName: r.districtName,
      region: r.region,
      qualifies: r.clubGrowthPercent >= 1 && r.paymentGrowthPercent >= 1,
    }))

    return { educationTraining, clubGrowth }
  }
}
