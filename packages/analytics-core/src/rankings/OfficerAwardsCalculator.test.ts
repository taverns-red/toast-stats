/**
 * Tests for OfficerAwardsCalculator (#333)
 *
 * - Excellence in Education & Training (PQD): training met + the
 *   Distinguished-clubs goal for the program year (#1612)
 * - Excellence in Club Growth (CGD): 1%+ club growth + 1%+ payment growth
 */

import { describe, it, expect } from 'vitest'
import { OfficerAwardsCalculator } from './OfficerAwardsCalculator.js'
import type { DistrictRanking } from '@taverns-red/shared-contracts'
import type { DistinguishedDistrictStatus } from './DistinguishedDistrictCalculator.js'

function buildRanking(overrides: Partial<DistrictRanking>): DistrictRanking {
  return {
    districtId: '1',
    districtName: 'District 1',
    region: '1',
    paidClubs: 100,
    paidClubBase: 100,
    clubGrowthPercent: 0,
    totalPayments: 1000,
    paymentBase: 1000,
    paymentGrowthPercent: 0,
    activeClubs: 100,
    distinguishedClubs: 0,
    selectDistinguished: 0,
    presidentsDistinguished: 0,
    distinguishedPercent: 0,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    aggregateScore: 0,
    overallRank: 1,
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
    ...overrides,
  }
}

function buildStatus(
  overrides: Partial<DistinguishedDistrictStatus>
): DistinguishedDistrictStatus {
  return {
    districtId: '1',
    currentTier: 'NotDistinguished',
    allPrerequisitesMet: true,
    prerequisites: {
      dspSubmitted: true,
      trainingMet: true,
      marketAnalysisSubmitted: true,
      communicationPlanSubmitted: true,
      regionAdvisorVisitMet: true,
    },
    nextTierGap: null,
    ...overrides,
  }
}

describe('OfficerAwardsCalculator (#333)', () => {
  const calculator = new OfficerAwardsCalculator()

  // Item 1490 Rev. 04/2025 (#1612): "train 85% of their Area and Division
  // Directors and meet Distinguished goals in number of Distinguished clubs".
  // Only the Distinguished-clubs goal — not the growth goals or the other
  // prerequisites that full Distinguished District status needs.
  describe('Excellence in Education & Training (PQD)', () => {
    it('qualifies on training + the Distinguished-clubs goal even when a growth goal is missed (#1612)', () => {
      const rankings = [
        buildRanking({
          trainingMet: true,
          distinguishedPercent: 46,
          clubGrowthPercent: -2,
          paymentGrowthPercent: 0.5,
        }),
      ]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus({ currentTier: 'NotDistinguished' }),
      }

      const result = calculator.calculate(rankings, statuses, '2025-2026')

      expect(result.educationTraining).toHaveLength(1)
      expect(result.educationTraining[0]?.qualifies).toBe(true)
    })

    it('does not need the non-training prerequisites (#1612)', () => {
      const rankings = [
        buildRanking({
          trainingMet: true,
          distinguishedPercent: 50,
          dspSubmitted: false,
          marketAnalysisSubmitted: false,
        }),
      ]
      const result = calculator.calculate(
        rankings,
        { '1': buildStatus({ currentTier: 'NotDistinguished' }) },
        '2025-2026'
      )
      expect(result.educationTraining[0]?.qualifies).toBe(true)
    })

    it('should NOT qualify when training not met', () => {
      const rankings = [
        buildRanking({ trainingMet: false, distinguishedPercent: 70 }),
      ]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus({ currentTier: 'Presidents' }),
      }

      const result = calculator.calculate(rankings, statuses, '2025-2026')

      expect(result.educationTraining[0]?.qualifies).toBe(false)
    })

    it('should NOT qualify when the Distinguished-clubs goal is missed, even if Distinguished', () => {
      const rankings = [
        buildRanking({ trainingMet: true, distinguishedPercent: 44.9 }),
      ]
      const result = calculator.calculate(
        rankings,
        { '1': buildStatus({ currentTier: 'Distinguished' }) },
        '2025-2026'
      )
      expect(result.educationTraining[0]?.qualifies).toBe(false)
    })

    it("uses that program year's Distinguished-clubs goal (40% before 2025-26)", () => {
      const rankings = [
        buildRanking({ trainingMet: true, distinguishedPercent: 42 }),
      ]
      const statuses = { '1': buildStatus({}) }
      expect(
        calculator.calculate(rankings, statuses, '2024-2025')
          .educationTraining[0]?.qualifies
      ).toBe(true)
      expect(
        calculator.calculate(rankings, statuses, '2025-2026')
          .educationTraining[0]?.qualifies
      ).toBe(false)
    })

    it('should NOT qualify when training status is unknown (column absent)', () => {
      const rankings = [
        buildRanking({ trainingMet: undefined, distinguishedPercent: 70 }),
      ]
      const result = calculator.calculate(
        rankings,
        { '1': buildStatus({ currentTier: 'Unknown' }) },
        '2025-2026'
      )
      expect(result.educationTraining[0]?.qualifies).toBe(false)
    })
  })

  describe('Excellence in Club Growth (CGD)', () => {
    it('should qualify when both club and payment growth >= 1%', () => {
      const rankings = [
        buildRanking({ clubGrowthPercent: 1, paymentGrowthPercent: 1 }),
      ]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus(),
      }

      const result = calculator.calculate(rankings, statuses)

      expect(result.clubGrowth).toHaveLength(1)
      expect(result.clubGrowth[0]?.qualifies).toBe(true)
    })

    it('should NOT qualify when club growth is below 1%', () => {
      const rankings = [
        buildRanking({ clubGrowthPercent: 0.9, paymentGrowthPercent: 5 }),
      ]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus(),
      }

      const result = calculator.calculate(rankings, statuses)

      expect(result.clubGrowth[0]?.qualifies).toBe(false)
    })

    it('should NOT qualify when payment growth is below 1%', () => {
      const rankings = [
        buildRanking({ clubGrowthPercent: 5, paymentGrowthPercent: 0.5 }),
      ]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus(),
      }

      const result = calculator.calculate(rankings, statuses)

      expect(result.clubGrowth[0]?.qualifies).toBe(false)
    })
  })
})
