/**
 * Tests for OfficerAwardsCalculator (#333)
 *
 * - Excellence in Education & Training (PQD): training met + Distinguished tier
 * - Excellence in Club Growth (CGD): 1%+ club growth + 1%+ payment growth
 */

import { describe, it, expect } from 'vitest'
import { OfficerAwardsCalculator } from './OfficerAwardsCalculator.js'
import type { DistrictRanking } from '@toastmasters/shared-contracts'
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

  describe('Excellence in Education & Training (PQD)', () => {
    it('should qualify when training met AND district is Distinguished', () => {
      const rankings = [buildRanking({ trainingMet: true })]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus({ currentTier: 'Distinguished' }),
      }

      const result = calculator.calculate(rankings, statuses)

      expect(result.educationTraining).toHaveLength(1)
      expect(result.educationTraining[0]?.qualifies).toBe(true)
    })

    it('should NOT qualify when training not met', () => {
      const rankings = [buildRanking({ trainingMet: false })]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus({ currentTier: 'Presidents' }),
      }

      const result = calculator.calculate(rankings, statuses)

      expect(result.educationTraining[0]?.qualifies).toBe(false)
    })

    it('should NOT qualify when training met but NOT Distinguished', () => {
      const rankings = [buildRanking({ trainingMet: true })]
      const statuses: Record<string, DistinguishedDistrictStatus> = {
        '1': buildStatus({ currentTier: 'NotDistinguished' }),
      }

      const result = calculator.calculate(rankings, statuses)

      expect(result.educationTraining[0]?.qualifies).toBe(false)
    })

    it('should qualify for any Distinguished tier (Select, Presidents, Smedley)', () => {
      for (const tier of [
        'Distinguished',
        'Select',
        'Presidents',
        'Smedley',
      ] as const) {
        const rankings = [buildRanking({ trainingMet: true })]
        const statuses: Record<string, DistinguishedDistrictStatus> = {
          '1': buildStatus({ currentTier: tier }),
        }
        const result = calculator.calculate(rankings, statuses)
        expect(result.educationTraining[0]?.qualifies).toBe(true)
      }
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

  it('Unknown tier does not qualify for Education & Training (#1116 item 5)', () => {
    const result = calculator.calculate(
      [buildRanking({ districtId: '1', trainingMet: true })],
      { '1': buildStatus({ currentTier: 'Unknown' }) }
    )
    expect(result.educationTraining[0]?.qualifies).toBe(false)
  })
})
