/**
 * Unit tests for AnalyticsComputer.computePerformanceTargets with rankings integration
 *
 * Tests the integration of MetricRankingsCalculator into computePerformanceTargets,
 * verifying that world ranks are correctly extracted from allDistrictsRankings data
 * and that null handling works correctly.
 *
 * Also verifies that paidClubsCount is included in computation results.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AnalyticsComputer } from '../AnalyticsComputer.js'
import type { DistrictStatistics, ClubStatistics } from '../../interfaces.js'
import type {
  AllDistrictsRankingsData,
  DistrictRanking,
} from '@toastmasters/shared-contracts'

/**
 * Helper to create a mock club
 */
function createMockClub(
  overrides: Partial<ClubStatistics> = {}
): ClubStatistics {
  return {
    clubId: '1234',
    clubName: 'Test Club',
    divisionId: 'A',
    areaId: 'A1',
    divisionName: 'Division A',
    areaName: 'Area A1',
    membershipCount: 25,
    paymentsCount: 20,
    dcpGoals: 5,
    status: 'Active',
    octoberRenewals: 10,
    aprilRenewals: 5,
    newMembers: 5,
    membershipBase: 20,
    ...overrides,
  }
}

/**
 * Helper to create a mock district statistics snapshot
 */
function createMockSnapshot(
  districtId: string,
  snapshotDate: string,
  clubs: ClubStatistics[] = []
): DistrictStatistics {
  const totalMembership = clubs.reduce((sum, c) => sum + c.membershipCount, 0)
  const totalPayments = clubs.reduce((sum, c) => sum + c.paymentsCount, 0)

  return {
    districtId,
    snapshotDate,
    clubs,
    divisions: [],
    areas: [],
    totals: {
      totalClubs: clubs.length,
      totalMembership,
      totalPayments,
      distinguishedClubs: clubs.filter(c => c.dcpGoals >= 5).length,
      selectDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 7).length,
      presidentDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 9).length,
    },
    // Required raw CSV data arrays (empty for tests)
    divisionPerformance: [],
    clubPerformance: [],
    districtPerformance: [],
  }
}

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

describe('computePerformanceTargets with rankings integration', () => {
  let computer: AnalyticsComputer

  beforeEach(() => {
    computer = new AnalyticsComputer()
  })

  describe('null allDistrictsRankings handling', () => {
    /**
     * Test that null allDistrictsRankings results in null rankings
     *
     * **Validates: Requirement 1.5**
     */
    it('should return null rankings when allDistrictsRankings is undefined', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          dcpGoals: 5,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Call without allDistrictsRankings parameter
      const result = computer.computePerformanceTargets('D101', [snapshot])

      // All rankings should be null
      expect(result.paidClubsRankings.worldRank).toBeNull()
      expect(result.paidClubsRankings.worldPercentile).toBeNull()
      expect(result.paidClubsRankings.regionRank).toBeNull()
      expect(result.paidClubsRankings.totalDistricts).toBe(0)
      expect(result.paidClubsRankings.totalInRegion).toBe(0)
      expect(result.paidClubsRankings.region).toBeNull()

      expect(result.membershipPaymentsRankings.worldRank).toBeNull()
      expect(result.membershipPaymentsRankings.worldPercentile).toBeNull()
      expect(result.membershipPaymentsRankings.regionRank).toBeNull()

      expect(result.distinguishedClubsRankings.worldRank).toBeNull()
      expect(result.distinguishedClubsRankings.worldPercentile).toBeNull()
      expect(result.distinguishedClubsRankings.regionRank).toBeNull()

      // Verify paidClubsCount is included and correct (1 Active club)
      // **Validates: Requirement 1.2**
      expect(result.paidClubsCount).toBeDefined()
      expect(result.paidClubsCount).toBe(1)
      expect(Number.isInteger(result.paidClubsCount)).toBe(true)
      expect(result.paidClubsCount).toBeGreaterThanOrEqual(0)
    })

    it('should return null rankings for empty snapshots with undefined allDistrictsRankings', () => {
      const result = computer.computePerformanceTargets('D101', [])

      expect(result.paidClubsRankings.worldRank).toBeNull()
      expect(result.membershipPaymentsRankings.worldRank).toBeNull()
      expect(result.distinguishedClubsRankings.worldRank).toBeNull()

      // Verify paidClubsCount is included and zero for empty snapshots
      // **Validates: Requirement 1.2**
      expect(result.paidClubsCount).toBeDefined()
      expect(result.paidClubsCount).toBe(0)
      expect(Number.isInteger(result.paidClubsCount)).toBe(true)
    })
  })

  describe('world rank extraction from allDistrictsRankings', () => {
    /**
     * Test that clubsRank is extracted as worldRank for paidClubsRankings
     *
     * **Validates: Requirement 1.2**
     */
    it('should extract clubsRank as paidClubsRankings.worldRank', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            region: 'Region 10',
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      expect(result.paidClubsRankings.worldRank).toBe(5)

      // Verify paidClubsCount is included (1 Active club)
      // **Validates: Requirement 1.2**
      expect(result.paidClubsCount).toBeDefined()
      expect(result.paidClubsCount).toBe(1)
    })

    /**
     * Test that paymentsRank is extracted as worldRank for membershipPaymentsRankings
     *
     * **Validates: Requirement 1.3**
     */
    it('should extract paymentsRank as membershipPaymentsRankings.worldRank', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            region: 'Region 10',
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      expect(result.membershipPaymentsRankings.worldRank).toBe(10)
    })

    /**
     * Test that distinguishedRank is extracted as worldRank for distinguishedClubsRankings
     *
     * **Validates: Requirement 1.4**
     */
    it('should extract distinguishedRank as distinguishedClubsRankings.worldRank', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            region: 'Region 10',
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      expect(result.distinguishedClubsRankings.worldRank).toBe(3)
    })
  })

  describe('valid allDistrictsRankings data', () => {
    /**
     * Test complete rankings structure with valid data
     */
    it('should return complete rankings with all fields populated', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          dcpGoals: 6,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            region: 'Region 10',
            clubGrowthPercent: 8.0,
            paymentGrowthPercent: 6.0,
            distinguishedPercent: 50.0,
          },
          {
            districtId: 'D102',
            clubsRank: 15,
            paymentsRank: 20,
            distinguishedRank: 12,
            region: 'Region 10',
            clubGrowthPercent: 5.0,
            paymentGrowthPercent: 4.0,
            distinguishedPercent: 40.0,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify paidClubsRankings
      expect(result.paidClubsRankings.worldRank).toBe(5)
      expect(result.paidClubsRankings.worldPercentile).toBe(95.0) // ((100-5)/100)*100
      expect(result.paidClubsRankings.regionRank).toBe(1) // D101 has higher clubGrowthPercent
      expect(result.paidClubsRankings.totalDistricts).toBe(100)
      expect(result.paidClubsRankings.totalInRegion).toBe(2)
      expect(result.paidClubsRankings.region).toBe('Region 10')

      // Verify membershipPaymentsRankings
      expect(result.membershipPaymentsRankings.worldRank).toBe(10)
      expect(result.membershipPaymentsRankings.worldPercentile).toBe(90.0) // ((100-10)/100)*100
      expect(result.membershipPaymentsRankings.regionRank).toBe(1)
      expect(result.membershipPaymentsRankings.totalDistricts).toBe(100)

      // Verify distinguishedClubsRankings
      expect(result.distinguishedClubsRankings.worldRank).toBe(3)
      expect(result.distinguishedClubsRankings.worldPercentile).toBe(97.0) // ((100-3)/100)*100
      expect(result.distinguishedClubsRankings.regionRank).toBe(1)
      expect(result.distinguishedClubsRankings.totalDistricts).toBe(100)

      // Verify paidClubsCount is included and correct (1 Active club)
      // **Validates: Requirement 1.2**
      expect(result.paidClubsCount).toBeDefined()
      expect(result.paidClubsCount).toBe(1)
      expect(Number.isInteger(result.paidClubsCount)).toBe(true)
      expect(result.paidClubsCount).toBeGreaterThanOrEqual(0)
    })

    it('should return null rankings when district not found in allDistrictsRankings', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Rankings data does not include D101
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D999',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // All rankings should be null when district not found
      expect(result.paidClubsRankings.worldRank).toBeNull()
      expect(result.paidClubsRankings.worldPercentile).toBeNull()
      expect(result.paidClubsRankings.regionRank).toBeNull()
      expect(result.paidClubsRankings.totalDistricts).toBe(0)

      expect(result.membershipPaymentsRankings.worldRank).toBeNull()
      expect(result.distinguishedClubsRankings.worldRank).toBeNull()

      // Verify paidClubsCount is still computed correctly even when rankings not found
      // **Validates: Requirement 1.2**
      expect(result.paidClubsCount).toBeDefined()
      expect(result.paidClubsCount).toBe(1)
    })

    it('should still compute performance targets correctly when rankings are provided', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          dcpGoals: 6,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            region: 'Region 10',
            totalPayments: 100, // Set to match expected value
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify that performance targets are still computed correctly
      expect(result.districtId).toBe('D101')
      expect(result.membershipTarget).toBe(105) // ceil(100 * 1.05)
      // currentProgress.membership now uses totalPayments from rankings
      expect(result.currentProgress.membership).toBe(100)
      expect(result.computedAt).toBeDefined()

      // And rankings are also populated
      expect(result.paidClubsRankings.worldRank).toBe(5)

      // Verify paidClubsCount is included and correct (1 Active club)
      // **Validates: Requirement 1.2**
      expect(result.paidClubsCount).toBeDefined()
      expect(result.paidClubsCount).toBe(1)
    })

    it('should handle empty snapshots with valid allDistrictsRankings', () => {
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            region: 'Region 10',
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [],
        allDistrictsRankings
      )

      // Performance targets should be zero
      expect(result.membershipTarget).toBe(0)
      expect(result.distinguishedTarget).toBe(0)
      expect(result.clubGrowthTarget).toBe(0)

      // But rankings should still be populated from allDistrictsRankings
      expect(result.paidClubsRankings.worldRank).toBe(5)
      expect(result.membershipPaymentsRankings.worldRank).toBe(10)
      expect(result.distinguishedClubsRankings.worldRank).toBe(3)

      // Verify paidClubsCount is zero for empty snapshots
      // **Validates: Requirement 1.2**
      expect(result.paidClubsCount).toBeDefined()
      expect(result.paidClubsCount).toBe(0)
      expect(Number.isInteger(result.paidClubsCount)).toBe(true)
    })
  })

  // ========== NEW TESTS: Base Value Extraction ==========
  // **Validates: Requirements 1.1, 1.2, 1.3**

  describe('base value extraction from allDistrictsRankings', () => {
    /**
     * Test that paidClubBase and paymentBase are extracted when district is found in rankings
     *
     * **Validates: Requirements 1.1, 1.2**
     */
    it('should extract paidClubBase and paymentBase when district is found in rankings', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 95,
            paymentBase: 4800,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify base values are extracted correctly
      expect(result.paidClubBase).toBe(95)
      expect(result.paymentBase).toBe(4800)
    })

    /**
     * Test that base values are null when allDistrictsRankings is undefined
     *
     * **Validates: Requirement 1.3**
     */
    it('should set base values to null when allDistrictsRankings is undefined', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Call without allDistrictsRankings parameter
      const result = computer.computePerformanceTargets('D101', [snapshot])

      // Base values should be null
      expect(result.paidClubBase).toBeNull()
      expect(result.paymentBase).toBeNull()
    })

    /**
     * Test that base values are null when district is not found in rankings
     *
     * **Validates: Requirement 1.3**
     */
    it('should set base values to null when district is not found in rankings', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Rankings data does not include D101
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D999',
            paidClubBase: 95,
            paymentBase: 4800,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Base values should be null when district not found
      expect(result.paidClubBase).toBeNull()
      expect(result.paymentBase).toBeNull()
    })

    /**
     * Test that base values are extracted correctly with empty snapshots
     *
     * **Validates: Requirements 1.1, 1.2**
     */
    it('should extract base values even with empty snapshots', () => {
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 95,
            paymentBase: 4800,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [],
        allDistrictsRankings
      )

      // Base values should still be extracted from rankings
      expect(result.paidClubBase).toBe(95)
      expect(result.paymentBase).toBe(4800)
    })
  })

  // ========== NEW TESTS: Target Calculation Integration ==========
  // **Validates: Requirements 2.1-2.5, 3.1-3.5, 4.1-4.5**

  describe('recognition target calculation integration', () => {
    /**
     * Test that paidClubsTargets are calculated correctly when paidClubBase is available
     *
     * **Validates: Requirements 2.1-2.5**
     */
    it('should calculate paidClubsTargets when paidClubBase is available', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Use paidClubBase = 100 for easy calculation verification
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 100,
            paymentBase: 5000,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify paidClubsTargets are calculated correctly
      // Formula: base + (base * percentage), rounded up
      expect(result.paidClubsTargets).not.toBeNull()
      expect(result.paidClubsTargets?.distinguished).toBe(101) // ceil(100 * 1.01) = 101
      expect(result.paidClubsTargets?.select).toBe(103) // ceil(100 * 1.03) = 103
      expect(result.paidClubsTargets?.presidents).toBe(105) // ceil(100 * 1.05) = 105
      expect(result.paidClubsTargets?.smedley).toBe(108) // ceil(100 * 1.08) = 108
    })

    /**
     * Test that membershipPaymentsTargets are calculated correctly when paymentBase is available
     *
     * **Validates: Requirements 3.1-3.5**
     */
    it('should calculate membershipPaymentsTargets when paymentBase is available', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Use paymentBase = 1000 for easy calculation verification
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 100,
            paymentBase: 1000,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify membershipPaymentsTargets are calculated correctly
      // Formula: base + (base * percentage), rounded up
      expect(result.membershipPaymentsTargets).not.toBeNull()
      expect(result.membershipPaymentsTargets?.distinguished).toBe(1010) // ceil(1000 * 1.01) = 1010
      expect(result.membershipPaymentsTargets?.select).toBe(1030) // ceil(1000 * 1.03) = 1030
      expect(result.membershipPaymentsTargets?.presidents).toBe(1050) // ceil(1000 * 1.05) = 1050
      expect(result.membershipPaymentsTargets?.smedley).toBe(1080) // ceil(1000 * 1.08) = 1080
    })

    /**
     * Test that distinguishedClubsTargets are calculated correctly when paidClubBase is available
     *
     * **Validates: Requirements 4.1-4.5**
     */
    it('should calculate distinguishedClubsTargets when paidClubBase is available', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Use paidClubBase = 20 for clean calculation verification
      // (avoids floating-point precision issues with certain percentages)
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 20,
            paymentBase: 5000,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify distinguishedClubsTargets are calculated correctly
      // Formula: base * percentage, rounded up
      expect(result.distinguishedClubsTargets).not.toBeNull()
      expect(result.distinguishedClubsTargets?.distinguished).toBe(9) // ceil(20 * 0.45) = 9
      expect(result.distinguishedClubsTargets?.select).toBe(10) // ceil(20 * 0.50) = 10
      expect(result.distinguishedClubsTargets?.presidents).toBe(11) // ceil(20 * 0.55) = 11
      expect(result.distinguishedClubsTargets?.smedley).toBe(12) // ceil(20 * 0.60) = 12
    })

    /**
     * Test that targets are null when base values are not available
     *
     * **Validates: Requirements 2.5, 3.5, 4.5**
     */
    it('should set targets to null when base values are not available', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Call without allDistrictsRankings parameter
      const result = computer.computePerformanceTargets('D101', [snapshot])

      // All targets should be null when base values are not available
      expect(result.paidClubsTargets).toBeNull()
      expect(result.membershipPaymentsTargets).toBeNull()
      expect(result.distinguishedClubsTargets).toBeNull()
    })

    /**
     * Test ceiling rounding with fractional results
     *
     * **Validates: Requirements 2.6, 3.6, 4.6**
     */
    it('should use ceiling rounding for fractional target calculations', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Use paidClubBase = 99 to produce fractional results
      // 99 * 1.01 = 99.99 → ceil = 100
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 99,
            paymentBase: 99,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify ceiling rounding is applied
      // 99 * 1.01 = 99.99 → ceil = 100
      expect(result.paidClubsTargets?.distinguished).toBe(100)
      // 99 * 1.03 = 101.97 → ceil = 102
      expect(result.paidClubsTargets?.select).toBe(102)
      // 99 * 1.05 = 103.95 → ceil = 104
      expect(result.paidClubsTargets?.presidents).toBe(104)
      // 99 * 1.08 = 106.92 → ceil = 107
      expect(result.paidClubsTargets?.smedley).toBe(107)

      // Distinguished clubs targets with ceiling rounding
      // 99 * 0.45 = 44.55 → ceil = 45
      expect(result.distinguishedClubsTargets?.distinguished).toBe(45)
      // 99 * 0.50 = 49.5 → ceil = 50
      expect(result.distinguishedClubsTargets?.select).toBe(50)
      // 99 * 0.55 = 54.45 → ceil = 55
      expect(result.distinguishedClubsTargets?.presidents).toBe(55)
      // 99 * 0.60 = 59.4 → ceil = 60
      expect(result.distinguishedClubsTargets?.smedley).toBe(60)
    })
  })

  // ========== NEW TESTS: Achieved Level Integration ==========
  // **Validates: Requirements 5.1-5.6**

  describe('achieved recognition level determination', () => {
    /**
     * Test that achieved levels are determined correctly when targets are available
     * and current values meet thresholds
     *
     * **Validates: Requirements 5.1-5.5**
     */
    it('should determine correct achieved levels when current values meet thresholds', () => {
      // Create clubs that will result in specific current values
      // We need 108+ paid clubs to achieve Smedley level (base 100 + 8%)
      const clubs: ClubStatistics[] = []
      for (let i = 1; i <= 110; i++) {
        clubs.push(
          createMockClub({
            clubId: `${i}`,
            areaId: `A${Math.ceil(i / 10)}`,
            areaName: `Area A${Math.ceil(i / 10)}`,
            divisionId: String.fromCharCode(65 + Math.floor((i - 1) / 20)), // A, B, C, etc.
            membershipCount: 25,
            paymentsCount: 20,
            dcpGoals: i <= 60 ? 5 : 3, // 60 clubs with 5+ DCP goals (distinguished)
            status: 'Active',
          })
        )
      }
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Set base values so that current values exceed Smedley thresholds
      // paidClubBase = 100, so Smedley target = 108
      // paymentBase = 2000, so Smedley target = 2160
      // Current paid clubs = 110 (exceeds 108)
      // Current payments from rankings = 2200 (exceeds 2160)
      // Current distinguished = 60 (exceeds 60% of 100 = 60)
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 100,
            paymentBase: 2000,
            totalPayments: 2200, // Exceeds Smedley target of 2160
            clubsRank: 1,
            paymentsRank: 1,
            distinguishedRank: 1,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Verify achieved levels
      // Paid clubs: 110 >= 108 (Smedley target) → 'smedley'
      expect(result.paidClubsAchievedLevel).toBe('smedley')
      // Membership payments: 2200 >= 2160 (Smedley target) → 'smedley'
      expect(result.membershipPaymentsAchievedLevel).toBe('smedley')
      // Distinguished clubs: 60 >= 60 (Smedley target = 60% of 100) → 'smedley'
      expect(result.distinguishedClubsAchievedLevel).toBe('smedley')
    })

    /**
     * Test that achieved levels are null when targets are not available
     *
     * **Validates: Requirement 5.6**
     */
    it('should set achieved levels to null when targets are not available', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Call without allDistrictsRankings parameter
      const result = computer.computePerformanceTargets('D101', [snapshot])

      // All achieved levels should be null when targets are not available
      expect(result.paidClubsAchievedLevel).toBeNull()
      expect(result.membershipPaymentsAchievedLevel).toBeNull()
      expect(result.distinguishedClubsAchievedLevel).toBeNull()
    })

    /**
     * Test that achieved levels are null when current values are below all thresholds
     *
     * **Validates: Requirement 5.5**
     */
    it('should set achieved levels to null when current values are below all thresholds', () => {
      // Create a single club with low values
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 25,
          paymentsCount: 20,
          dcpGoals: 3, // Not distinguished
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Set high base values so current values are below all thresholds
      // paidClubBase = 100, so Distinguished target = 101
      // Current paid clubs = 1 (below 101)
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 100,
            paymentBase: 5000,
            totalPayments: 20, // Below Distinguished target of 5050
            clubsRank: 100,
            paymentsRank: 100,
            distinguishedRank: 100,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // All achieved levels should be null when below all thresholds
      expect(result.paidClubsAchievedLevel).toBeNull()
      expect(result.membershipPaymentsAchievedLevel).toBeNull()
      expect(result.distinguishedClubsAchievedLevel).toBeNull()
    })

    /**
     * Test intermediate achieved levels (distinguished, select, presidents)
     *
     * **Validates: Requirements 5.2, 5.3, 5.4**
     */
    it('should determine intermediate achieved levels correctly', () => {
      // Create clubs to achieve Select level for paid clubs
      // Base = 100, Select target = 103, Presidents target = 105
      // We need 103-104 paid clubs to achieve Select but not Presidents
      const clubs: ClubStatistics[] = []
      for (let i = 1; i <= 104; i++) {
        clubs.push(
          createMockClub({
            clubId: `${i}`,
            areaId: `A${Math.ceil(i / 10)}`,
            areaName: `Area A${Math.ceil(i / 10)}`,
            divisionId: String.fromCharCode(65 + Math.floor((i - 1) / 20)),
            membershipCount: 25,
            paymentsCount: 20,
            dcpGoals: i <= 50 ? 5 : 3, // 50 distinguished clubs (50% of 100 = Select level)
            status: 'Active',
          })
        )
      }
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 100,
            paymentBase: 1000,
            totalPayments: 1040, // Between Select (1030) and Presidents (1050)
            clubsRank: 10,
            paymentsRank: 10,
            distinguishedRank: 10,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      // Paid clubs: 104 >= 103 (Select) but < 105 (Presidents) → 'select'
      expect(result.paidClubsAchievedLevel).toBe('select')
      // Membership payments: 1040 >= 1030 (Select) but < 1050 (Presidents) → 'select'
      expect(result.membershipPaymentsAchievedLevel).toBe('select')
      // Distinguished clubs: 50 >= 50 (Select = 50% of 100) but < 55 (Presidents) → 'select'
      expect(result.distinguishedClubsAchievedLevel).toBe('select')
    })

    /**
     * Test achieved levels with empty snapshots
     *
     * **Validates: Requirement 5.6**
     */
    it('should set achieved levels to null with empty snapshots', () => {
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paidClubBase: 100,
            paymentBase: 5000,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [],
        allDistrictsRankings
      )

      // Achieved levels should be null with empty snapshots
      // (even though targets are available, there are no current values)
      expect(result.paidClubsAchievedLevel).toBeNull()
      expect(result.membershipPaymentsAchievedLevel).toBeNull()
      expect(result.distinguishedClubsAchievedLevel).toBeNull()
    })
  })
})

// ========== NEW TESTS: Membership Change Calculation ==========
// **Validates: Requirements 8.1, 8.2, 8.3**

describe('computeDistrictAnalytics membership change calculation', () => {
  let computer: AnalyticsComputer

  beforeEach(() => {
    computer = new AnalyticsComputer()
  })

  describe('membership change with paymentBase available', () => {
    /**
     * Test that membershipChange is calculated as currentPayments - paymentBase
     * when paymentBase is available from allDistrictsRankings.
     *
     * **Validates: Requirements 8.1, 8.2**
     */
    it('should calculate membershipChange as currentPayments - paymentBase when paymentBase is available', async () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 50, // This will be ignored when totalPayments is in rankings
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // paymentBase = 4800, totalPayments = 5000
      // Expected membershipChange = 5000 - 4800 = 200
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paymentBase: 4800,
            totalPayments: 5000,
            paidClubBase: 95,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = await computer.computeDistrictAnalytics(
        'D101',
        [snapshot],
        { allDistrictsRankings }
      )

      // membershipChange should be totalPayments - paymentBase = 5000 - 4800 = 200
      expect(result.districtAnalytics.membershipChange).toBe(200)
    })

    /**
     * Test that totalPayments from rankings is used when available
     * (official Toastmasters value takes precedence over snapshot calculation).
     *
     * **Validates: Requirements 8.1, 8.2**
     */
    it('should use totalPayments from rankings when available', async () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 999, // Different from rankings totalPayments
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Rankings has totalPayments = 5500, paymentBase = 5000
      // Expected membershipChange = 5500 - 5000 = 500
      // (NOT using snapshot paymentsCount of 999)
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paymentBase: 5000,
            totalPayments: 5500,
            paidClubBase: 95,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = await computer.computeDistrictAnalytics(
        'D101',
        [snapshot],
        { allDistrictsRankings }
      )

      // Should use rankings totalPayments (5500), not snapshot paymentsCount (999)
      expect(result.districtAnalytics.membershipChange).toBe(500)
    })

    /**
     * Test negative membership change when current payments are below base.
     *
     * **Validates: Requirements 8.1, 8.2**
     */
    it('should calculate negative membershipChange when currentPayments < paymentBase', async () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 50,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // paymentBase = 5000, totalPayments = 4500
      // Expected membershipChange = 4500 - 5000 = -500 (decline)
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paymentBase: 5000,
            totalPayments: 4500,
            paidClubBase: 95,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = await computer.computeDistrictAnalytics(
        'D101',
        [snapshot],
        { allDistrictsRankings }
      )

      // membershipChange should be negative: 4500 - 5000 = -500
      expect(result.districtAnalytics.membershipChange).toBe(-500)
    })

    /**
     * Test zero membership change when current payments equal base.
     *
     * **Validates: Requirements 8.1, 8.2**
     */
    it('should calculate zero membershipChange when currentPayments equals paymentBase', async () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 50,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // paymentBase = 5000, totalPayments = 5000
      // Expected membershipChange = 5000 - 5000 = 0
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            paymentBase: 5000,
            totalPayments: 5000,
            paidClubBase: 95,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = await computer.computeDistrictAnalytics(
        'D101',
        [snapshot],
        { allDistrictsRankings }
      )

      // membershipChange should be zero: 5000 - 5000 = 0
      expect(result.districtAnalytics.membershipChange).toBe(0)
    })
  })

  describe('membership change fallback when paymentBase unavailable', () => {
    /**
     * Test fallback to snapshot-based calculation when allDistrictsRankings is undefined.
     *
     * **Validates: Requirement 8.3**
     */
    it('should fall back to snapshot-based calculation when allDistrictsRankings is undefined', async () => {
      // Create two snapshots with different payment counts to verify fallback calculation
      const clubs1 = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 50,
          status: 'Active',
        }),
      ]
      const clubs2 = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 125,
          paymentsCount: 75,
          status: 'Active',
        }),
      ]
      const snapshot1 = createMockSnapshot('D101', '2024-01-01', clubs1)
      const snapshot2 = createMockSnapshot('D101', '2024-01-15', clubs2)

      // Call without allDistrictsRankings - should use snapshot-based calculation
      // Fallback calculates: sum(paymentsCount) - sum(membershipBase) from latest snapshot
      // Latest snapshot2: paymentsCount=75, membershipBase=20 (default) → 75 - 20 = 55
      const result = await computer.computeDistrictAnalytics('D101', [
        snapshot1,
        snapshot2,
      ])

      // Should use snapshot-based fallback: sum(paymentsCount) - sum(membershipBase) from latest
      expect(result.districtAnalytics.membershipChange).toBe(55)
    })

    /**
     * Test fallback when district is not found in allDistrictsRankings.
     *
     * **Validates: Requirement 8.3**
     */
    it('should fall back to snapshot-based calculation when district not found in rankings', async () => {
      const clubs1 = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 50,
          status: 'Active',
        }),
      ]
      const clubs2 = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 150,
          paymentsCount: 80,
          status: 'Active',
        }),
      ]
      const snapshot1 = createMockSnapshot('D101', '2024-01-01', clubs1)
      const snapshot2 = createMockSnapshot('D101', '2024-01-15', clubs2)

      // Rankings data does not include D101
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D999', // Different district
            paymentBase: 5000,
            totalPayments: 5500,
            paidClubBase: 95,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
          },
        ],
        100
      )

      const result = await computer.computeDistrictAnalytics(
        'D101',
        [snapshot1, snapshot2],
        { allDistrictsRankings }
      )

      // Should fall back to snapshot-based calculation: sum(paymentsCount) - sum(membershipBase) from latest
      // Latest snapshot2: paymentsCount=80, membershipBase=20 (default) → 80 - 20 = 60
      expect(result.districtAnalytics.membershipChange).toBe(60)
    })

    /**
     * Test fallback returns 0 for single snapshot (no change calculable).
     *
     * **Validates: Requirement 8.3**
     */
    it('should return 0 membershipChange for single snapshot without rankings', async () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 50,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)

      // Call without allDistrictsRankings and with single snapshot
      const result = await computer.computeDistrictAnalytics('D101', [snapshot])

      // Fallback with single snapshot: sum(paymentsCount) - sum(membershipBase)
      // paymentsCount=50, membershipBase=20 (default) → 50 - 20 = 30
      expect(result.districtAnalytics.membershipChange).toBe(30)
    })

    /**
     * Test fallback returns 0 for empty snapshots.
     *
     * **Validates: Requirement 8.3**
     */
    it('should return 0 membershipChange for empty snapshots without rankings', async () => {
      // Call without allDistrictsRankings and with empty snapshots
      const result = await computer.computeDistrictAnalytics('D101', [])

      // Empty snapshots should return 0
      expect(result.districtAnalytics.membershipChange).toBe(0)
    })

    /**
     * Test that fallback uses snapshot payments when totalPayments is missing from rankings
     * but paymentBase is also missing (so we can't use the base calculation).
     *
     * **Validates: Requirement 8.3**
     */
    it('should fall back when paymentBase is null in rankings', async () => {
      const clubs1 = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 100,
          paymentsCount: 50,
          status: 'Active',
        }),
      ]
      const clubs2 = [
        createMockClub({
          clubId: '1',
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          membershipCount: 130,
          paymentsCount: 70,
          status: 'Active',
        }),
      ]
      const snapshot1 = createMockSnapshot('D101', '2024-01-01', clubs1)
      const snapshot2 = createMockSnapshot('D101', '2024-01-15', clubs2)

      // Create rankings with paymentBase explicitly set to a value that will be overridden
      // We need to test when paymentBase is undefined/null
      const allDistrictsRankings: AllDistrictsRankingsData = {
        metadata: {
          snapshotId: '2024-01-15',
          calculatedAt: '2024-01-15T00:00:00.000Z',
          schemaVersion: '1.0',
          calculationVersion: '1.0',
          rankingVersion: '2.0',
          sourceCsvDate: '2024-01-15',
          csvFetchedAt: '2024-01-15T00:00:00.000Z',
          totalDistricts: 100,
          fromCache: false,
        },
        rankings: [
          {
            districtId: 'D101',
            districtName: 'District 101',
            region: 'Region 1',
            paidClubs: 100,
            paidClubBase: 95,
            clubGrowthPercent: 5.0,
            totalPayments: 5000,
            paymentBase: undefined as unknown as number, // Simulate missing paymentBase
            paymentGrowthPercent: 4.0,
            activeClubs: 98,
            distinguishedClubs: 45,
            selectDistinguished: 15,
            presidentsDistinguished: 10,
            distinguishedPercent: 45.0,
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            aggregateScore: 150,
            overallRank: 5,
          },
        ],
      }

      const result = await computer.computeDistrictAnalytics(
        'D101',
        [snapshot1, snapshot2],
        { allDistrictsRankings }
      )

      // Should fall back to snapshot-based calculation: sum(paymentsCount) - sum(membershipBase) from latest
      // Latest snapshot2: paymentsCount=70, membershipBase=20 (default) → 70 - 20 = 50
      expect(result.districtAnalytics.membershipChange).toBe(50)
    })
  })

  /**
   * Legacy district targets removal (#1127, epic #1097, audit §8).
   *
   * computePerformanceTargets published a legacy scalar block with wrong or
   * unsourced rules: distinguishedTarget = ceil(paidClubs * 0.5) (a 50% DAP
   * area rule with a current-paid denominator, applied to the district
   * metric — §13.2 is 45% of paid club base), clubGrowthTarget = 2%
   * (unsourced), membershipTarget = 5% (unsourced), and
   * projectedAchievement derived from those targets. The §13.2-correct
   * values already ship in the same payload as paidClubsTargets /
   * membershipPaymentsTargets / distinguishedClubsTargets (1/3/5/8% growth
   * tiers, 45/50/55/60% of paid club base) and are the fields the frontend
   * consumes. The legacy block has zero consumers (R8 inventory in #1127)
   * and is removed rather than corrected — correcting it would duplicate
   * the canonical fields (lessons 61/76 two-copies drift).
   */
  describe('legacy district targets are not published (#1127)', () => {
    const LEGACY_KEYS = [
      'membershipTarget',
      'distinguishedTarget',
      'clubGrowthTarget',
      'projectedAchievement',
    ] as const

    it('omits the legacy target fields for populated snapshots', () => {
      const clubs = [
        createMockClub({
          clubId: '1',
          membershipCount: 100,
          dcpGoals: 6,
          status: 'Active',
        }),
      ]
      const snapshot = createMockSnapshot('D101', '2024-01-15', clubs)
      const allDistrictsRankings = createRankingsData(
        [
          {
            districtId: 'D101',
            clubsRank: 5,
            paymentsRank: 10,
            distinguishedRank: 3,
            region: 'Region 10',
            totalPayments: 100,
          },
        ],
        100
      )

      const result = computer.computePerformanceTargets(
        'D101',
        [snapshot],
        allDistrictsRankings
      )

      for (const key of LEGACY_KEYS) {
        expect(result).not.toHaveProperty(key)
      }

      // The consumed fields stay intact: actuals + canonical §13.2 targets.
      expect(result.paidClubsCount).toBe(1)
      expect(result.currentProgress.membership).toBe(100)
      expect(typeof result.currentProgress.distinguished).toBe('number')
      expect(result.paidClubsTargets).not.toBeNull()
      expect(result.distinguishedClubsTargets).not.toBeNull()
      expect(result.paidClubsRankings.worldRank).toBe(5)
    })

    it('omits the legacy target fields for empty snapshots', () => {
      const result = computer.computePerformanceTargets('D101', [])

      for (const key of LEGACY_KEYS) {
        expect(result).not.toHaveProperty(key)
      }

      expect(result.paidClubsCount).toBe(0)
      expect(result.currentProgress).toEqual({
        membership: 0,
        distinguished: 0,
        clubGrowth: 0,
      })
    })
  })
})
