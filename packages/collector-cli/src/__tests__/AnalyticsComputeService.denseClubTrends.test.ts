/**
 * Unit Tests for AnalyticsComputeService - Dense Club Trends Enrichment
 *
 * Tests that club-trends-index files are enriched with data from all
 * program-year snapshots, not just the 2 (previous-year + current) used
 * for the standard YoY computation.
 *
 * Issue #79b: Club membership graph only shows 1-2 points instead of
 * the full program-year history.
 *
 * Validates: Requirement 79b
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import type {
  DistrictStatistics,
  PreComputedAnalyticsFile,
  ClubTrendsIndex,
} from '@taverns-red/analytics-core'

/**
 * Create an isolated test cache directory with automatic cleanup.
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(
    os.tmpdir(),
    `analytics-dense-trends-test-${uniqueId}`
  )

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Create sample district statistics with configurable membership per club.
 */
function createSampleDistrictStatistics(
  districtId: string,
  date: string,
  overrides?: {
    clubOneMembership?: number
    clubTwoMembership?: number
    clubThreeMembership?: number
    clubOneGoals?: number
    clubTwoGoals?: number
    clubThreeGoals?: number
  }
): DistrictStatistics {
  const club1Membership = overrides?.clubOneMembership ?? 25
  const club2Membership = overrides?.clubTwoMembership ?? 15
  const club3Membership = overrides?.clubThreeMembership ?? 8
  const club1Goals = overrides?.clubOneGoals ?? 7
  const club2Goals = overrides?.clubTwoGoals ?? 4
  const club3Goals = overrides?.clubThreeGoals ?? 2
  const totalMembership = club1Membership + club2Membership + club3Membership

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
        membershipCount: club1Membership,
        paymentsCount: 30,
        dcpGoals: club1Goals,
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
        membershipCount: club2Membership,
        paymentsCount: 18,
        dcpGoals: club2Goals,
        status: 'Active',
        charterDate: '2019-06-01',
        octoberRenewals: 6,
        aprilRenewals: 5,
        newMembers: 7,
        membershipBase: 12,
      },
      {
        clubId: '9012',
        clubName: 'Test Club Three',
        divisionId: 'B',
        areaId: 'B1',
        divisionName: 'Division Beta',
        areaName: 'Area B1',
        membershipCount: club3Membership,
        paymentsCount: 10,
        dcpGoals: club3Goals,
        status: 'Active',
        charterDate: '2021-03-20',
        octoberRenewals: 3,
        aprilRenewals: 2,
        newMembers: 5,
        membershipBase: 10,
      },
    ],
    divisions: [
      {
        divisionId: 'A',
        divisionName: 'Division Alpha',
        clubCount: 2,
        membershipTotal: club1Membership + club2Membership,
        paymentsTotal: 48,
      },
      {
        divisionId: 'B',
        divisionName: 'Division Beta',
        clubCount: 1,
        membershipTotal: club3Membership,
        paymentsTotal: 10,
      },
    ],
    areas: [
      {
        areaId: 'A1',
        areaName: 'Area A1',
        divisionId: 'A',
        clubCount: 1,
        membershipTotal: club1Membership,
        paymentsTotal: 30,
      },
      {
        areaId: 'A2',
        areaName: 'Area A2',
        divisionId: 'A',
        clubCount: 1,
        membershipTotal: club2Membership,
        paymentsTotal: 18,
      },
      {
        areaId: 'B1',
        areaName: 'Area B1',
        divisionId: 'B',
        clubCount: 1,
        membershipTotal: club3Membership,
        paymentsTotal: 10,
      },
    ],
    totals: {
      totalClubs: 3,
      totalMembership,
      totalPayments: 58,
      distinguishedClubs: 1,
      selectDistinguishedClubs: 0,
      presidentDistinguishedClubs: 0,
    },
  }
}

/**
 * Write a district snapshot to the test cache directory.
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
 * Read the club-trends-index output file for a district.
 */
async function readClubTrendsIndex(
  cacheDir: string,
  date: string,
  districtId: string
): Promise<PreComputedAnalyticsFile<ClubTrendsIndex>> {
  const filePath = path.join(
    cacheDir,
    'snapshots',
    date,
    'analytics',
    `district_${districtId}_club-trends-index.json`
  )
  const content = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(content) as PreComputedAnalyticsFile<ClubTrendsIndex>
}

describe('AnalyticsComputeService - Dense Club Trends (#79b)', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  it('should accumulate club trends across sequential pipeline runs via ClubTrendsStore', async () => {
    const districtId = '1'
    // Use dates within the same program year (July 1 - June 30)
    // Program year 2024-2025: July 1 2024 to June 30 2025
    const dates = [
      '2024-10-01', // Run 1
      '2024-11-15', // Run 2
      '2025-01-15', // Run 3 (final)
    ]

    // Previous year snapshot for YoY (used only in run 3)
    const previousYearDate = '2024-01-15'

    await writeDistrictSnapshot(
      testCache.path,
      previousYearDate,
      districtId,
      createSampleDistrictStatistics(districtId, previousYearDate, {
        clubOneMembership: 20,
        clubTwoMembership: 12,
        clubThreeMembership: 6,
      })
    )

    // Snapshot data for each simulated pipeline run
    const runData = [
      {
        date: dates[0]!,
        overrides: {
          clubOneMembership: 22,
          clubTwoMembership: 14,
          clubThreeMembership: 7,
          clubOneGoals: 3,
          clubTwoGoals: 2,
          clubThreeGoals: 1,
        },
      },
      {
        date: dates[1]!,
        overrides: {
          clubOneMembership: 24,
          clubTwoMembership: 15,
          clubThreeMembership: 8,
          clubOneGoals: 5,
          clubTwoGoals: 3,
          clubThreeGoals: 1,
        },
      },
      {
        date: dates[2]!,
        overrides: {
          clubOneMembership: 25,
          clubTwoMembership: 15,
          clubThreeMembership: 8,
          clubOneGoals: 7,
          clubTwoGoals: 4,
          clubThreeGoals: 2,
        },
      },
    ]

    // Simulate 3 sequential pipeline runs
    // Each run: write today's snapshot, compute analytics (updates ClubTrendsStore)
    for (const run of runData) {
      await writeDistrictSnapshot(
        testCache.path,
        run.date,
        districtId,
        createSampleDistrictStatistics(districtId, run.date, run.overrides)
      )

      const service = new AnalyticsComputeService({
        cacheDir: testCache.path,
      })

      const result = await service.computeDistrictAnalytics(
        run.date,
        districtId,
        { force: true }
      )
      expect(result.success).toBe(true)
    }

    // After 3 runs, the club-trends-index for the final date should have 3 points
    const indexFile = await readClubTrendsIndex(
      testCache.path,
      dates[2]!,
      districtId
    )

    const clubs = indexFile.data.clubs
    const club1 = clubs['1234']
    expect(club1).toBeDefined()
    // 3 pipeline runs = 3 accumulated data points
    expect(club1!.membershipTrend.length).toBeGreaterThanOrEqual(3)

    // Verify the trend data is sorted by date ascending
    const membershipDates = club1!.membershipTrend.map(p => p.date)
    const sortedDates = [...membershipDates].sort()
    expect(membershipDates).toEqual(sortedDates)

    // Verify membership values match what we set
    const club1Trend = club1!.membershipTrend
    // Should see the progression 22 → 24 → 25 from the 3 pipeline runs
    const programYearTrend = club1Trend.filter(p => p.date >= '2024-07-01')
    expect(programYearTrend.length).toBe(3)
    expect(programYearTrend[0]!.count).toBe(22) // 2024-10-01
    expect(programYearTrend[1]!.count).toBe(24) // 2024-11-15
    expect(programYearTrend[2]!.count).toBe(25) // 2025-01-15

    // DCP goals should also be accumulated
    const club1DcpTrend = club1!.dcpGoalsTrend
    const programYearDcp = club1DcpTrend.filter(p => p.date >= '2024-07-01')
    expect(programYearDcp.length).toBe(3)
    expect(programYearDcp[0]!.goalsAchieved).toBe(3)
    expect(programYearDcp[1]!.goalsAchieved).toBe(5)
    expect(programYearDcp[2]!.goalsAchieved).toBe(7)

    // All 3 clubs should be present
    expect(Object.keys(clubs)).toHaveLength(3)
    const club2 = clubs['5678']
    expect(club2).toBeDefined()
    expect(club2!.membershipTrend.length).toBeGreaterThanOrEqual(3)
  })

  it('should work with a single pipeline run (first-ever run, no prior store)', async () => {
    const districtId = '1'
    const currentDate = '2025-01-15'
    const previousDate = '2024-01-15'

    // Only current + previous year snapshots (no extra program-year dates)
    await writeDistrictSnapshot(
      testCache.path,
      currentDate,
      districtId,
      createSampleDistrictStatistics(districtId, currentDate)
    )

    await writeDistrictSnapshot(
      testCache.path,
      previousDate,
      districtId,
      createSampleDistrictStatistics(districtId, previousDate, {
        clubOneMembership: 20,
      })
    )

    const service = new AnalyticsComputeService({
      cacheDir: testCache.path,
    })

    const result = await service.computeDistrictAnalytics(
      currentDate,
      districtId,
      { force: true }
    )

    expect(result.success).toBe(true)

    // First ever run: ClubTrendsStore is empty, so only 1 data point is created
    const indexFile = await readClubTrendsIndex(
      testCache.path,
      currentDate,
      districtId
    )
    const club1 = indexFile.data.clubs['1234']
    expect(club1).toBeDefined()
    // First run produces exactly 1 data point (the current date's membership)
    expect(club1!.membershipTrend.length).toBeGreaterThanOrEqual(1)
  })
})
