/**
 * Integration Tests for AnalyticsComputeService Rankings Loading
 *
 * Tests the integration between AnalyticsComputeService and all-districts-rankings.json
 * for computing per-metric rankings in performance targets.
 *
 * Requirements:
 * - 5.1: Load the all-districts-rankings.json file for the snapshot date
 * - 5.3: If the all-districts-rankings.json file is not available, log a warning
 *        and compute performance targets with null rankings
 * - 5.4: The Analytics_Compute_Service SHALL NOT fail if all-districts-rankings.json is missing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import type {
  DistrictStatistics,
  PreComputedAnalyticsFile,
  PerformanceTargetsData,
} from '@taverns-red/analytics-core'
import type { AllDistrictsRankingsData } from '@taverns-red/shared-contracts'

/**
 * Create an isolated test cache directory with unique ID
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(
    os.tmpdir(),
    `analytics-rankings-test-${uniqueId}`
  )

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Create sample district statistics for testing
 */
function createSampleDistrictStatistics(
  districtId: string,
  date: string
): DistrictStatistics {
  return {
    districtId,
    snapshotDate: date,
    clubs: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        divisionId: 'A',
        areaId: 'A1',
        divisionName: 'Division Alpha',
        areaName: 'Area A1',
        membershipCount: 25,
        paymentsCount: 30,
        dcpGoals: 7,
        status: 'Active',
        charterDate: '2020-01-15',
        octoberRenewals: 10,
        aprilRenewals: 8,
        newMembers: 12,
        membershipBase: 20,
      },
      {
        clubId: '5678',
        clubName: 'Test Club Two',
        divisionId: 'A',
        areaId: 'A2',
        divisionName: 'Division Alpha',
        areaName: 'Area A2',
        membershipCount: 15,
        paymentsCount: 18,
        dcpGoals: 4,
        status: 'Active',
        charterDate: '2019-06-01',
        octoberRenewals: 6,
        aprilRenewals: 5,
        newMembers: 7,
        membershipBase: 12,
      },
    ],
    divisions: [
      {
        divisionId: 'A',
        divisionName: 'Division Alpha',
        clubCount: 2,
        membershipTotal: 40,
        paymentsTotal: 48,
      },
    ],
    areas: [
      {
        areaId: 'A1',
        areaName: 'Area A1',
        divisionId: 'A',
        clubCount: 1,
        membershipTotal: 25,
        paymentsTotal: 30,
      },
      {
        areaId: 'A2',
        areaName: 'Area A2',
        divisionId: 'A',
        clubCount: 1,
        membershipTotal: 15,
        paymentsTotal: 18,
      },
    ],
    totals: {
      totalClubs: 2,
      totalMembership: 40,
      totalPayments: 48,
      distinguishedClubs: 1,
      selectDistinguishedClubs: 0,
      presidentDistinguishedClubs: 0,
    },
  }
}

/**
 * Create sample all-districts rankings data for testing
 */
function createSampleAllDistrictsRankings(
  districtIds: string[],
  date: string
): AllDistrictsRankingsData {
  const rankings = districtIds.map((districtId, index) => ({
    districtId,
    districtName: `District ${districtId}`,
    region: `Region ${Math.floor(index / 3) + 1}`,
    paidClubs: 100 - index * 10,
    paidClubBase: 95 - index * 10,
    clubGrowthPercent: 5.26 - index * 0.5,
    totalPayments: 1000 - index * 100,
    paymentBase: 950 - index * 100,
    paymentGrowthPercent: 5.26 - index * 0.5,
    activeClubs: 100 - index * 10,
    distinguishedClubs: 30 - index * 5,
    selectDistinguished: 15 - index * 2,
    presidentsDistinguished: 10 - index,
    distinguishedPercent: 30 - index * 5,
    clubsRank: index + 1,
    paymentsRank: index + 1,
    distinguishedRank: index + 1,
    aggregateScore: 9 - index,
    overallRank: index + 1,
  }))

  return {
    metadata: {
      snapshotId: date,
      calculatedAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
      calculationVersion: '2.0',
      rankingVersion: '2.0',
      sourceCsvDate: date,
      csvFetchedAt: new Date().toISOString(),
      totalDistricts: districtIds.length,
      fromCache: false,
    },
    rankings,
  }
}

/**
 * Write a district snapshot to the test cache
 */
async function writeDistrictSnapshot(
  cacheDir: string,
  date: string,
  districtId: string,
  stats: DistrictStatistics
): Promise<void> {
  const snapshotDir = path.join(cacheDir, 'snapshots', date)
  await fs.mkdir(snapshotDir, { recursive: true })

  const snapshotPath = path.join(snapshotDir, `district_${districtId}.json`)
  await fs.writeFile(snapshotPath, JSON.stringify(stats, null, 2), 'utf-8')
}

/**
 * Write all-districts rankings to the test cache
 */
async function writeAllDistrictsRankings(
  cacheDir: string,
  date: string,
  rankings: AllDistrictsRankingsData
): Promise<void> {
  const snapshotDir = path.join(cacheDir, 'snapshots', date)
  await fs.mkdir(snapshotDir, { recursive: true })

  const rankingsPath = path.join(snapshotDir, 'all-districts-rankings.json')
  await fs.writeFile(rankingsPath, JSON.stringify(rankings, null, 2), 'utf-8')
}

describe('AnalyticsComputeService - Rankings Loading Integration', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let analyticsComputeService: AnalyticsComputeService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    analyticsComputeService = new AnalyticsComputeService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  describe('loadAllDistrictsRankings (Requirement 5.1)', () => {
    it('should successfully load all-districts-rankings.json when it exists', async () => {
      const date = '2024-01-15'
      const districtIds = ['1', '2', '3']
      const rankings = createSampleAllDistrictsRankings(districtIds, date)

      await writeAllDistrictsRankings(testCache.path, date, rankings)

      const loadedRankings =
        await analyticsComputeService.loadAllDistrictsRankings(date)

      expect(loadedRankings).not.toBeNull()
      expect(loadedRankings?.metadata.snapshotId).toBe(date)
      expect(loadedRankings?.metadata.totalDistricts).toBe(3)
      expect(loadedRankings?.rankings).toHaveLength(3)
    })

    it('should load rankings with correct district data', async () => {
      const date = '2024-01-15'
      const districtIds = ['42', '43']
      const rankings = createSampleAllDistrictsRankings(districtIds, date)

      await writeAllDistrictsRankings(testCache.path, date, rankings)

      const loadedRankings =
        await analyticsComputeService.loadAllDistrictsRankings(date)

      expect(loadedRankings).not.toBeNull()

      const district42 = loadedRankings?.rankings.find(
        r => r.districtId === '42'
      )
      expect(district42).toBeDefined()
      expect(district42?.clubsRank).toBe(1)
      expect(district42?.paymentsRank).toBe(1)
      expect(district42?.distinguishedRank).toBe(1)
      expect(district42?.region).toBe('Region 1')
    })

    it('should load rankings with region information for percentile calculation', async () => {
      const date = '2024-01-15'
      const districtIds = ['1', '2', '3', '4', '5', '6']
      const rankings = createSampleAllDistrictsRankings(districtIds, date)

      await writeAllDistrictsRankings(testCache.path, date, rankings)

      const loadedRankings =
        await analyticsComputeService.loadAllDistrictsRankings(date)

      expect(loadedRankings).not.toBeNull()

      // Districts 1, 2, 3 should be in Region 1
      // Districts 4, 5, 6 should be in Region 2
      const region1Districts = loadedRankings?.rankings.filter(
        r => r.region === 'Region 1'
      )
      const region2Districts = loadedRankings?.rankings.filter(
        r => r.region === 'Region 2'
      )

      expect(region1Districts).toHaveLength(3)
      expect(region2Districts).toHaveLength(3)
    })
  })

  describe('Graceful handling when rankings file is missing (Requirements 5.3, 5.4)', () => {
    it('should return null when all-districts-rankings.json does not exist', async () => {
      const date = '2024-01-15'

      // Create snapshot directory but don't write rankings file
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      await fs.mkdir(snapshotDir, { recursive: true })

      const loadedRankings =
        await analyticsComputeService.loadAllDistrictsRankings(date)

      expect(loadedRankings).toBeNull()
    })

    it('should return null when snapshot directory does not exist', async () => {
      const date = '2024-01-15'
      // Don't create any directories

      const loadedRankings =
        await analyticsComputeService.loadAllDistrictsRankings(date)

      expect(loadedRankings).toBeNull()
    })

    it('should not fail analytics computation when rankings file is missing (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      // Write district snapshot but NOT rankings file
      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // Compute analytics - should NOT fail
      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId
      )

      expect(result.success).toBe(true)
      expect(result.districtId).toBe(districtId)
      expect(result.performanceTargetsPath).toBeDefined()
    })

    it('should produce performance-targets with null rankings when rankings file is missing', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      // Write district snapshot but NOT rankings file
      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      // Read the performance-targets file
      const performanceTargetsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_performance-targets.json`
      )
      const content = await fs.readFile(performanceTargetsPath, 'utf-8')
      const file = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      // Rankings should be null when rankings file is missing
      expect(file.data.paidClubsRankings.worldRank).toBeNull()
      expect(file.data.paidClubsRankings.worldPercentile).toBeNull()
      expect(file.data.paidClubsRankings.regionRank).toBeNull()
      expect(file.data.paidClubsRankings.region).toBeNull()

      expect(file.data.membershipPaymentsRankings.worldRank).toBeNull()
      expect(file.data.membershipPaymentsRankings.worldPercentile).toBeNull()
      expect(file.data.membershipPaymentsRankings.regionRank).toBeNull()

      expect(file.data.distinguishedClubsRankings.worldRank).toBeNull()
      expect(file.data.distinguishedClubsRankings.worldPercentile).toBeNull()
      expect(file.data.distinguishedClubsRankings.regionRank).toBeNull()
    })
  })

  describe('End-to-end flow with rankings (Requirements 5.1, 5.2)', () => {
    it('should produce performance-targets with rankings when rankings file exists', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)
      const rankings = createSampleAllDistrictsRankings(['1', '2', '3'], date)

      // Write both district snapshot AND rankings file
      await writeDistrictSnapshot(testCache.path, date, districtId, stats)
      await writeAllDistrictsRankings(testCache.path, date, rankings)

      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      // Read the performance-targets file
      const performanceTargetsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_performance-targets.json`
      )
      const content = await fs.readFile(performanceTargetsPath, 'utf-8')
      const file = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      // Rankings should be populated from all-districts-rankings.json
      expect(file.data.paidClubsRankings.worldRank).toBe(1)
      expect(file.data.paidClubsRankings.totalDistricts).toBe(3)
      expect(file.data.paidClubsRankings.worldPercentile).not.toBeNull()

      expect(file.data.membershipPaymentsRankings.worldRank).toBe(1)
      expect(file.data.membershipPaymentsRankings.totalDistricts).toBe(3)

      expect(file.data.distinguishedClubsRankings.worldRank).toBe(1)
      expect(file.data.distinguishedClubsRankings.totalDistricts).toBe(3)
    })

    it('should compute correct world percentile from rankings', async () => {
      const date = '2024-01-15'
      const districtId = '2' // Second district, rank 2
      const stats = createSampleDistrictStatistics(districtId, date)
      const rankings = createSampleAllDistrictsRankings(
        ['1', '2', '3', '4', '5'],
        date
      )

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)
      await writeAllDistrictsRankings(testCache.path, date, rankings)

      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      const performanceTargetsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_performance-targets.json`
      )
      const content = await fs.readFile(performanceTargetsPath, 'utf-8')
      const file = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      // District 2 has rank 2 out of 5 districts
      // Percentile = ((5 - 2) / 5) * 100 = 60.0
      expect(file.data.paidClubsRankings.worldRank).toBe(2)
      expect(file.data.paidClubsRankings.totalDistricts).toBe(5)
      expect(file.data.paidClubsRankings.worldPercentile).toBe(60.0)
    })

    it('should include region information in rankings', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)
      const rankings = createSampleAllDistrictsRankings(['1', '2', '3'], date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)
      await writeAllDistrictsRankings(testCache.path, date, rankings)

      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      const performanceTargetsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_performance-targets.json`
      )
      const content = await fs.readFile(performanceTargetsPath, 'utf-8')
      const file = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      // Region should be populated from rankings
      expect(file.data.paidClubsRankings.region).toBe('Region 1')
      expect(file.data.paidClubsRankings.totalInRegion).toBeGreaterThan(0)
      expect(file.data.paidClubsRankings.regionRank).not.toBeNull()
    })

    it('should handle district not found in rankings gracefully', async () => {
      const date = '2024-01-15'
      const districtId = '99' // Not in rankings
      const stats = createSampleDistrictStatistics(districtId, date)
      const rankings = createSampleAllDistrictsRankings(['1', '2', '3'], date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)
      await writeAllDistrictsRankings(testCache.path, date, rankings)

      // Should not fail
      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId
      )

      expect(result.success).toBe(true)

      const performanceTargetsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_performance-targets.json`
      )
      const content = await fs.readFile(performanceTargetsPath, 'utf-8')
      const file = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      // Rankings should be null for district not in rankings
      expect(file.data.paidClubsRankings.worldRank).toBeNull()
      expect(file.data.membershipPaymentsRankings.worldRank).toBeNull()
      expect(file.data.distinguishedClubsRankings.worldRank).toBeNull()
    })
  })

  describe('Batch compute with rankings', () => {
    it('should load rankings once and pass to all district computations', async () => {
      const date = '2024-01-15'
      const districtIds = ['1', '2', '3']
      const rankings = createSampleAllDistrictsRankings(districtIds, date)

      // Write snapshots for all districts
      for (const districtId of districtIds) {
        const stats = createSampleDistrictStatistics(districtId, date)
        await writeDistrictSnapshot(testCache.path, date, districtId, stats)
      }
      await writeAllDistrictsRankings(testCache.path, date, rankings)

      // Run batch compute
      const result = await analyticsComputeService.compute({ date })

      expect(result.success).toBe(true)
      expect(result.districtsSucceeded).toEqual(districtIds)

      // Verify each district has correct rankings
      for (let i = 0; i < districtIds.length; i++) {
        const districtId = districtIds[i]
        const performanceTargetsPath = path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_performance-targets.json`
        )
        const content = await fs.readFile(performanceTargetsPath, 'utf-8')
        const file = JSON.parse(
          content
        ) as PreComputedAnalyticsFile<PerformanceTargetsData>

        // Each district should have its correct rank
        expect(file.data.paidClubsRankings.worldRank).toBe(i + 1)
        expect(file.data.paidClubsRankings.totalDistricts).toBe(3)
      }
    })

    it('should continue processing all districts when rankings file is missing', async () => {
      const date = '2024-01-15'
      const districtIds = ['1', '2', '3']

      // Write snapshots for all districts but NO rankings file
      for (const districtId of districtIds) {
        const stats = createSampleDistrictStatistics(districtId, date)
        await writeDistrictSnapshot(testCache.path, date, districtId, stats)
      }

      // Run batch compute - should NOT fail
      const result = await analyticsComputeService.compute({ date })

      expect(result.success).toBe(true)
      expect(result.districtsSucceeded).toEqual(districtIds)
      expect(result.districtsFailed).toEqual([])

      // All districts should have null rankings
      for (const districtId of districtIds) {
        const performanceTargetsPath = path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_performance-targets.json`
        )
        const content = await fs.readFile(performanceTargetsPath, 'utf-8')
        const file = JSON.parse(
          content
        ) as PreComputedAnalyticsFile<PerformanceTargetsData>

        expect(file.data.paidClubsRankings.worldRank).toBeNull()
      }
    })
  })
})
