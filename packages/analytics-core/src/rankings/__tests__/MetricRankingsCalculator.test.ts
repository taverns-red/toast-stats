/**
 * Unit tests for MetricRankingsCalculator
 *
 * Tests the calculation of per-metric rankings including:
 * - World percentile calculation
 * - Region rank computation with ties
 * - Null handling for edge cases
 * - Unknown region handling
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.2, 3.4, 6.1**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MetricRankingsCalculator } from '../MetricRankingsCalculator.js'
import type {
  AllDistrictsRankingsData,
  DistrictRanking,
} from '@taverns-red/shared-contracts'

/**
 * Helper to create a minimal AllDistrictsRankingsData structure for testing.
 */
function createRankingsData(
  rankings: Partial<DistrictRanking>[],
  totalDistricts?: number
): AllDistrictsRankingsData {
  const fullRankings = rankings.map((r, index) => ({
    districtId: r.districtId ?? `${index + 1}`,
    districtName: r.districtName ?? `District ${index + 1}`,
    region: r.region ?? 'Region 1',
    paidClubs: r.paidClubs ?? 100,
    paidClubBase: r.paidClubBase ?? 95,
    clubGrowthPercent: r.clubGrowthPercent ?? 5.0,
    totalPayments: r.totalPayments ?? 5000,
    paymentBase: r.paymentBase ?? 4800,
    paymentGrowthPercent: r.paymentGrowthPercent ?? 4.0,
    activeClubs: r.activeClubs ?? 98,
    distinguishedClubs: r.distinguishedClubs ?? 45,
    selectDistinguished: r.selectDistinguished ?? 15,
    presidentsDistinguished: r.presidentsDistinguished ?? 10,
    distinguishedPercent: r.distinguishedPercent ?? 45.0,
    clubsRank: r.clubsRank ?? index + 1,
    paymentsRank: r.paymentsRank ?? index + 1,
    distinguishedRank: r.distinguishedRank ?? index + 1,
    aggregateScore: r.aggregateScore ?? 150,
    overallRank: r.overallRank ?? index + 1,
  }))

  return {
    metadata: {
      snapshotId: '2024-01-15',
      calculatedAt: '2024-01-15T00:00:00.000Z',
      schemaVersion: '1.0',
      calculationVersion: '1.0',
      rankingVersion: '2.0',
      sourceCsvDate: '2024-01-15',
      csvFetchedAt: '2024-01-15T00:00:00.000Z',
      totalDistricts: totalDistricts ?? fullRankings.length,
      fromCache: false,
    },
    rankings: fullRankings,
  }
}

describe('MetricRankingsCalculator', () => {
  let calculator: MetricRankingsCalculator

  beforeEach(() => {
    calculator = new MetricRankingsCalculator()
  })

  describe('calculateWorldPercentile', () => {
    /**
     * Test world percentile calculation with examples
     * Formula: ((totalDistricts - worldRank) / totalDistricts) * 100
     * Rounded to 1 decimal place
     *
     * **Validates: Requirements 2.1, 2.2**
     */
    it('should calculate percentile for rank=1 out of 100 as 99.0', () => {
      const result = calculator.calculateWorldPercentile(1, 100)
      expect(result).toBe(99.0)
    })

    it('should calculate percentile for rank=50 out of 100 as 50.0', () => {
      const result = calculator.calculateWorldPercentile(50, 100)
      expect(result).toBe(50.0)
    })

    it('should calculate percentile for rank=100 out of 100 as 0.0', () => {
      const result = calculator.calculateWorldPercentile(100, 100)
      expect(result).toBe(0.0)
    })

    it('should round percentile to 1 decimal place', () => {
      // rank=3, total=7 → ((7-3)/7)*100 = 57.142857... → 57.1
      const result = calculator.calculateWorldPercentile(3, 7)
      expect(result).toBe(57.1)
    })

    it('should handle rank=1 out of 2 as 50.0', () => {
      const result = calculator.calculateWorldPercentile(1, 2)
      expect(result).toBe(50.0)
    })

    /**
     * Test null handling for edge cases
     *
     * **Validates: Requirements 2.3, 2.4**
     */
    it('should return null when totalDistricts is 0', () => {
      const result = calculator.calculateWorldPercentile(1, 0)
      expect(result).toBeNull()
    })

    it('should return null when totalDistricts is 1', () => {
      const result = calculator.calculateWorldPercentile(1, 1)
      expect(result).toBeNull()
    })

    it('should return null when worldRank is null', () => {
      const result = calculator.calculateWorldPercentile(null, 100)
      expect(result).toBeNull()
    })
  })

  describe('calculateRegionRank', () => {
    /**
     * Test region rank computation with ties
     *
     * **Validates: Requirements 3.2, 6.1**
     */
    it('should rank districts within region from highest to lowest metric value', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10', clubGrowthPercent: 10.0 },
        { districtId: '2', region: 'Region 10', clubGrowthPercent: 5.0 },
        { districtId: '3', region: 'Region 10', clubGrowthPercent: 15.0 },
      ])

      // District 3 has highest clubGrowthPercent (15.0), should be rank 1
      const result3 = calculator.calculateRegionRank('3', 'clubs', rankings)
      expect(result3.regionRank).toBe(1)
      expect(result3.totalInRegion).toBe(3)
      expect(result3.region).toBe('Region 10')

      // District 1 has second highest (10.0), should be rank 2
      const result1 = calculator.calculateRegionRank('1', 'clubs', rankings)
      expect(result1.regionRank).toBe(2)

      // District 2 has lowest (5.0), should be rank 3
      const result2 = calculator.calculateRegionRank('2', 'clubs', rankings)
      expect(result2.regionRank).toBe(3)
    })

    it('should assign same rank to districts with equal metric values (ties)', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10', clubGrowthPercent: 10.0 },
        { districtId: '2', region: 'Region 10', clubGrowthPercent: 10.0 }, // Tie with district 1
        { districtId: '3', region: 'Region 10', clubGrowthPercent: 5.0 },
      ])

      // Both district 1 and 2 have same value, should both be rank 1
      const result1 = calculator.calculateRegionRank('1', 'clubs', rankings)
      const result2 = calculator.calculateRegionRank('2', 'clubs', rankings)

      expect(result1.regionRank).toBe(1)
      expect(result2.regionRank).toBe(1)

      // District 3 should be rank 3 (not 2) because two districts tied for rank 1
      const result3 = calculator.calculateRegionRank('3', 'clubs', rankings)
      expect(result3.regionRank).toBe(3)
    })

    it('should filter districts by same region value', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10', clubGrowthPercent: 10.0 },
        { districtId: '2', region: 'Region 10', clubGrowthPercent: 5.0 },
        { districtId: '3', region: 'Region 11', clubGrowthPercent: 15.0 }, // Different region
      ])

      // District 1 should be rank 1 in Region 10 (only 2 districts in region)
      const result1 = calculator.calculateRegionRank('1', 'clubs', rankings)
      expect(result1.regionRank).toBe(1)
      expect(result1.totalInRegion).toBe(2)
      expect(result1.region).toBe('Region 10')

      // District 3 should be rank 1 in Region 11 (only 1 district in region)
      const result3 = calculator.calculateRegionRank('3', 'clubs', rankings)
      expect(result3.regionRank).toBe(1)
      expect(result3.totalInRegion).toBe(1)
      expect(result3.region).toBe('Region 11')
    })

    it('should work with payments metric', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10', paymentGrowthPercent: 8.0 },
        { districtId: '2', region: 'Region 10', paymentGrowthPercent: 12.0 },
      ])

      // District 2 has higher paymentGrowthPercent, should be rank 1
      const result2 = calculator.calculateRegionRank('2', 'payments', rankings)
      expect(result2.regionRank).toBe(1)

      const result1 = calculator.calculateRegionRank('1', 'payments', rankings)
      expect(result1.regionRank).toBe(2)
    })

    it('should work with distinguished metric', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10', distinguishedPercent: 40.0 },
        { districtId: '2', region: 'Region 10', distinguishedPercent: 55.0 },
      ])

      // District 2 has higher distinguishedPercent, should be rank 1
      const result2 = calculator.calculateRegionRank(
        '2',
        'distinguished',
        rankings
      )
      expect(result2.regionRank).toBe(1)

      const result1 = calculator.calculateRegionRank(
        '1',
        'distinguished',
        rankings
      )
      expect(result1.regionRank).toBe(2)
    })

    /**
     * Test unknown region handling
     *
     * **Validates: Requirement 3.4**
     */
    it('should return null regionRank when region is "Unknown"', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Unknown', clubGrowthPercent: 10.0 },
      ])

      const result = calculator.calculateRegionRank('1', 'clubs', rankings)
      expect(result.regionRank).toBeNull()
      expect(result.totalInRegion).toBe(0)
      expect(result.region).toBeNull()
    })

    it('should return null regionRank when region is empty string', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: '', clubGrowthPercent: 10.0 },
      ])

      const result = calculator.calculateRegionRank('1', 'clubs', rankings)
      expect(result.regionRank).toBeNull()
      expect(result.totalInRegion).toBe(0)
      expect(result.region).toBeNull()
    })

    it('should return null when district is not found', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10', clubGrowthPercent: 10.0 },
      ])

      const result = calculator.calculateRegionRank('999', 'clubs', rankings)
      expect(result.regionRank).toBeNull()
      expect(result.totalInRegion).toBe(0)
      expect(result.region).toBeNull()
    })

    it('should exclude districts with Unknown region from region count', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10', clubGrowthPercent: 10.0 },
        { districtId: '2', region: 'Region 10', clubGrowthPercent: 5.0 },
        { districtId: '3', region: 'Unknown', clubGrowthPercent: 15.0 },
      ])

      // Only 2 districts in Region 10 (district 3 has Unknown region)
      const result1 = calculator.calculateRegionRank('1', 'clubs', rankings)
      expect(result1.totalInRegion).toBe(2)
    })
  })

  describe('calculateMetricRankings', () => {
    /**
     * Test world rank extraction from existing rankings
     *
     * **Validates: Requirements 1.2, 1.3, 1.4**
     */
    it('should extract clubsRank as worldRank for clubs metric', () => {
      const rankings = createRankingsData([
        {
          districtId: '42',
          clubsRank: 5,
          paymentsRank: 10,
          distinguishedRank: 3,
        },
      ])

      const result = calculator.calculateMetricRankings('42', 'clubs', rankings)
      expect(result.worldRank).toBe(5)
    })

    it('should extract paymentsRank as worldRank for payments metric', () => {
      const rankings = createRankingsData([
        {
          districtId: '42',
          clubsRank: 5,
          paymentsRank: 10,
          distinguishedRank: 3,
        },
      ])

      const result = calculator.calculateMetricRankings(
        '42',
        'payments',
        rankings
      )
      expect(result.worldRank).toBe(10)
    })

    it('should extract distinguishedRank as worldRank for distinguished metric', () => {
      const rankings = createRankingsData([
        {
          districtId: '42',
          clubsRank: 5,
          paymentsRank: 10,
          distinguishedRank: 3,
        },
      ])

      const result = calculator.calculateMetricRankings(
        '42',
        'distinguished',
        rankings
      )
      expect(result.worldRank).toBe(3)
    })

    /**
     * Test complete MetricRankings structure
     */
    it('should return complete MetricRankings with all fields', () => {
      const rankings = createRankingsData(
        [
          {
            districtId: '42',
            region: 'Region 10',
            clubsRank: 5,
            clubGrowthPercent: 10.0,
          },
          {
            districtId: '43',
            region: 'Region 10',
            clubsRank: 10,
            clubGrowthPercent: 8.0,
          },
          {
            districtId: '44',
            region: 'Region 11',
            clubsRank: 3,
            clubGrowthPercent: 12.0,
          },
        ],
        100 // totalDistricts in metadata
      )

      const result = calculator.calculateMetricRankings('42', 'clubs', rankings)

      expect(result.worldRank).toBe(5)
      expect(result.worldPercentile).toBe(95.0) // ((100-5)/100)*100 = 95.0
      expect(result.regionRank).toBe(1) // Highest clubGrowthPercent in Region 10
      expect(result.totalDistricts).toBe(100)
      expect(result.totalInRegion).toBe(2) // 2 districts in Region 10
      expect(result.region).toBe('Region 10')
    })

    /**
     * Test null handling when district not found
     *
     * **Validates: Requirement 1.5**
     */
    it('should return null rankings when district is not found', () => {
      const rankings = createRankingsData([{ districtId: '42', clubsRank: 5 }])

      const result = calculator.calculateMetricRankings(
        '999',
        'clubs',
        rankings
      )

      expect(result.worldRank).toBeNull()
      expect(result.worldPercentile).toBeNull()
      expect(result.regionRank).toBeNull()
      expect(result.totalDistricts).toBe(0)
      expect(result.totalInRegion).toBe(0)
      expect(result.region).toBeNull()
    })

    /**
     * Test null handling for edge cases
     *
     * **Validates: Requirements 2.3, 2.4, 3.4**
     */
    it('should return null worldPercentile when totalDistricts is 0', () => {
      const rankings = createRankingsData(
        [{ districtId: '42', clubsRank: 1 }],
        0 // totalDistricts = 0
      )

      const result = calculator.calculateMetricRankings('42', 'clubs', rankings)

      expect(result.worldRank).toBe(1)
      expect(result.worldPercentile).toBeNull()
    })

    it('should return null worldPercentile when totalDistricts is 1', () => {
      const rankings = createRankingsData(
        [{ districtId: '42', clubsRank: 1 }],
        1 // totalDistricts = 1
      )

      const result = calculator.calculateMetricRankings('42', 'clubs', rankings)

      expect(result.worldRank).toBe(1)
      expect(result.worldPercentile).toBeNull()
    })

    it('should return null regionRank when region is Unknown', () => {
      const rankings = createRankingsData([
        { districtId: '42', region: 'Unknown', clubsRank: 5 },
      ])

      const result = calculator.calculateMetricRankings('42', 'clubs', rankings)

      expect(result.worldRank).toBe(5)
      expect(result.regionRank).toBeNull()
      expect(result.region).toBeNull()
      expect(result.totalInRegion).toBe(0)
    })

    /**
     * Test region filtering and counting
     *
     * **Validates: Requirements 3.1, 3.3, 3.5**
     */
    it('should set totalInRegion to count of districts with same region', () => {
      const rankings = createRankingsData([
        { districtId: '1', region: 'Region 10' },
        { districtId: '2', region: 'Region 10' },
        { districtId: '3', region: 'Region 10' },
        { districtId: '4', region: 'Region 11' },
        { districtId: '5', region: 'Region 11' },
      ])

      const result1 = calculator.calculateMetricRankings('1', 'clubs', rankings)
      expect(result1.totalInRegion).toBe(3)
      expect(result1.region).toBe('Region 10')

      const result4 = calculator.calculateMetricRankings('4', 'clubs', rankings)
      expect(result4.totalInRegion).toBe(2)
      expect(result4.region).toBe('Region 11')
    })
  })
})
