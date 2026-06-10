/**
 * Unit Tests for AnalyticsWriter
 *
 * Tests the pre-computed analytics file writing functionality.
 *
 * Requirements:
 * - 1.6: WHEN analytics are computed, THE Collector_CLI SHALL store them in an
 *        `analytics/` subdirectory within the snapshot directory
 * - 3.1: THE Collector_CLI SHALL store pre-computed analytics in the structure:
 *        `CACHE_DIR/snapshots/{date}/analytics/`
 * - 3.2: WHEN writing analytics files, THE Collector_CLI SHALL include a schema
 *        version and computation timestamp in each file
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { AnalyticsWriter } from '../services/AnalyticsWriter.js'
import {
  ANALYTICS_SCHEMA_VERSION,
  type DistrictAnalytics,
  type MembershipTrendData,
  type ClubHealthData,
  type MembershipAnalyticsData,
  type VulnerableClubsData,
  type LeadershipInsightsData,
  type DistinguishedClubAnalyticsData,
  type YearOverYearData,
  type PerformanceTargetsData,
  type ClubTrendsIndex,
  type PreComputedAnalyticsFile,
  type AnalyticsManifestEntry,
  type AnalyticsManifest,
} from '@toastmasters/analytics-core'

/**
 * Create an isolated test cache directory
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(os.tmpdir(), `analytics-writer-test-${uniqueId}`)

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Create sample district analytics data for testing
 */
function createSampleDistrictAnalytics(districtId: string): DistrictAnalytics {
  return {
    districtId,
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-15',
    },
    totalMembership: 1500,
    membershipChange: 50,
    membershipTrend: [
      { date: '2024-01-01', count: 1450 },
      { date: '2024-01-08', count: 1475 },
      { date: '2024-01-15', count: 1500 },
    ],
    allClubs: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        currentStatus: 'thriving',
        riskFactors: {
          lowMembership: false,
          decliningMembership: false,
          lowPayments: false,
          inactiveOfficers: false,
          noRecentMeetings: false,
        },
        membershipCount: 25,
        paymentsCount: 30,
        healthScore: 95,
      },
    ],
    vulnerableClubs: [],
    thrivingClubs: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        currentStatus: 'thriving',
        riskFactors: {
          lowMembership: false,
          decliningMembership: false,
          lowPayments: false,
          inactiveOfficers: false,
          noRecentMeetings: false,
        },
        membershipCount: 25,
        paymentsCount: 30,
        healthScore: 95,
      },
    ],
    interventionRequiredClubs: [],
    distinguishedClubs: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        status: 'distinguished',
        dcpPoints: 7,
        goalsCompleted: 7,
      },
    ],
    distinguishedProjection: {
      projectedDistinguished: 10,
      currentDistinguished: 8,
      currentSelect: 4,
      currentPresident: 1,
      projectionDate: '2024-06-30',
    },
    divisionRankings: [
      {
        divisionId: 'A',
        divisionName: 'Division Alpha',
        rank: 1,
        score: 95,
        clubCount: 10,
        membershipTotal: 250,
      },
    ],
    topPerformingAreas: [
      {
        areaId: 'A1',
        areaName: 'Area A1',
        divisionId: 'A',
        score: 98,
        clubCount: 5,
        membershipTotal: 125,
      },
    ],
  }
}

/**
 * Create sample membership trend data for testing
 */
function createSampleMembershipTrends(): MembershipTrendData {
  return {
    membershipTrend: [
      { date: '2024-01-01', count: 1450 },
      { date: '2024-01-08', count: 1475 },
      { date: '2024-01-15', count: 1500 },
    ],
    paymentsTrend: [
      { date: '2024-01-01', payments: 1400 },
      { date: '2024-01-08', payments: 1425 },
      { date: '2024-01-15', payments: 1450 },
    ],
    yearOverYear: {
      currentYear: 1500,
      previousYear: 1400,
      membershipChange: 100,
      membershipChangePercent: 7.14,
      paymentsChange: 50,
      paymentsChangePercent: 3.57,
    },
  }
}

/**
 * Create sample club health data for testing
 */
function createSampleClubHealth(): ClubHealthData {
  return {
    allClubs: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        currentStatus: 'thriving',
        riskFactors: {
          lowMembership: false,
          decliningMembership: false,
          lowPayments: false,
          inactiveOfficers: false,
          noRecentMeetings: false,
        },
        membershipCount: 25,
        paymentsCount: 30,
        healthScore: 95,
      },
      {
        clubId: '5678',
        clubName: 'Test Club Two',
        currentStatus: 'vulnerable',
        riskFactors: {
          lowMembership: true,
          decliningMembership: true,
          lowPayments: false,
          inactiveOfficers: false,
          noRecentMeetings: false,
        },
        membershipCount: 10,
        paymentsCount: 12,
        healthScore: 45,
      },
    ],
    thrivingClubs: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        currentStatus: 'thriving',
        riskFactors: {
          lowMembership: false,
          decliningMembership: false,
          lowPayments: false,
          inactiveOfficers: false,
          noRecentMeetings: false,
        },
        membershipCount: 25,
        paymentsCount: 30,
        healthScore: 95,
      },
    ],
    vulnerableClubs: [
      {
        clubId: '5678',
        clubName: 'Test Club Two',
        currentStatus: 'vulnerable',
        riskFactors: {
          lowMembership: true,
          decliningMembership: true,
          lowPayments: false,
          inactiveOfficers: false,
          noRecentMeetings: false,
        },
        membershipCount: 10,
        paymentsCount: 12,
        healthScore: 45,
      },
    ],
    interventionRequiredClubs: [],
  }
}

/**
 * Create sample membership analytics data for testing
 *
 * Requirements:
 * - 1.1: Generate membership-analytics.json file for each district
 * - 1.2: Contain membership trends, year-over-year data, and growth patterns
 */
function createSampleMembershipAnalytics(
  districtId: string
): MembershipAnalyticsData {
  return {
    districtId,
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-15',
    },
    totalMembership: 1500,
    membershipChange: 50,
    membershipTrend: [
      { date: '2024-01-01', count: 1450 },
      { date: '2024-01-08', count: 1475 },
      { date: '2024-01-15', count: 1500 },
    ],
    paymentsTrend: [
      { date: '2024-01-01', payments: 1400 },
      { date: '2024-01-08', payments: 1425 },
      { date: '2024-01-15', payments: 1450 },
    ],
    yearOverYear: {
      currentYear: 1500,
      previousYear: 1400,
      membershipChange: 100,
      membershipChangePercent: 7.14,
      paymentsChange: 50,
      paymentsChangePercent: 3.57,
    },
    growthRate: 3.45,
    retentionRate: 92.5,
  }
}

/**
 * Create sample vulnerable clubs data for testing
 *
 * Requirements:
 * - 3.1: Generate vulnerable-clubs.json file for each district
 * - 3.2: Include clubs categorized as vulnerable and intervention-required
 * - 3.3: Include risk factors and health scores for each club
 */
function createSampleVulnerableClubs(districtId: string): VulnerableClubsData {
  return {
    districtId,
    computedAt: new Date().toISOString(),
    totalVulnerableClubs: 2,
    interventionRequiredClubs: 1,
    vulnerableClubs: [
      {
        clubId: '5678',
        clubName: 'Test Club Two',
        divisionId: 'A',
        divisionName: 'Division Alpha',
        areaId: 'A1',
        areaName: 'Area A1',
        currentStatus: 'vulnerable',
        healthScore: 45,
        membershipCount: 10,
        paymentsCount: 12,
        membershipTrend: [
          { date: '2024-01-01', count: 12 },
          { date: '2024-01-08', count: 11 },
          { date: '2024-01-15', count: 10 },
        ],
        dcpGoalsTrend: [
          { date: '2024-01-01', goalsAchieved: 2 },
          { date: '2024-01-15', goalsAchieved: 2 },
        ],
        riskFactors: ['lowMembership', 'decliningMembership'],
        distinguishedLevel: 'NotDistinguished',
      },
      {
        clubId: '9012',
        clubName: 'Test Club Three',
        divisionId: 'B',
        divisionName: 'Division Beta',
        areaId: 'B1',
        areaName: 'Area B1',
        currentStatus: 'vulnerable',
        healthScore: 50,
        membershipCount: 12,
        paymentsCount: 14,
        membershipTrend: [
          { date: '2024-01-01', count: 14 },
          { date: '2024-01-08', count: 13 },
          { date: '2024-01-15', count: 12 },
        ],
        dcpGoalsTrend: [
          { date: '2024-01-01', goalsAchieved: 3 },
          { date: '2024-01-15', goalsAchieved: 3 },
        ],
        riskFactors: ['decliningMembership'],
        distinguishedLevel: 'NotDistinguished',
      },
    ],
    interventionRequired: [
      {
        clubId: '3456',
        clubName: 'Test Club Four',
        divisionId: 'A',
        divisionName: 'Division Alpha',
        areaId: 'A2',
        areaName: 'Area A2',
        currentStatus: 'intervention_required',
        healthScore: 25,
        membershipCount: 6,
        paymentsCount: 8,
        membershipTrend: [
          { date: '2024-01-01', count: 10 },
          { date: '2024-01-08', count: 8 },
          { date: '2024-01-15', count: 6 },
        ],
        dcpGoalsTrend: [
          { date: '2024-01-01', goalsAchieved: 1 },
          { date: '2024-01-15', goalsAchieved: 1 },
        ],
        riskFactors: ['lowMembership', 'decliningMembership', 'lowPayments'],
        distinguishedLevel: 'NotDistinguished',
      },
    ],
  }
}

/**
 * Create sample leadership insights data for testing
 *
 * Requirements:
 * - 4.1: Generate leadership-insights.json file for each district
 * - 4.2: Include leadership effectiveness metrics and officer performance data
 */
function createSampleLeadershipInsights(
  districtId: string
): LeadershipInsightsData {
  return {
    districtId,
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-15',
    },
    officerCompletionRate: 85.5,
    trainingCompletionRate: 72.3,
    leadershipEffectivenessScore: 78.9,
    topPerformingDivisions: [
      {
        divisionId: 'A',
        divisionName: 'Division Alpha',
        rank: 1,
        score: 95,
        clubCount: 10,
        membershipTotal: 250,
      },
      {
        divisionId: 'B',
        divisionName: 'Division Beta',
        rank: 2,
        score: 88,
        clubCount: 8,
        membershipTotal: 200,
      },
    ],
    areasNeedingSupport: [
      {
        areaId: 'C1',
        areaName: 'Area C1',
        divisionId: 'C',
        score: 45,
        clubCount: 4,
        membershipTotal: 80,
      },
    ],
    insights: {
      leadershipScores: [
        {
          divisionId: 'A',
          divisionName: 'Division Alpha',
          healthScore: 95,
          growthScore: 90,
          dcpScore: 92,
          overallScore: 92.5,
          rank: 1,
          isBestPractice: true,
        },
        {
          divisionId: 'B',
          divisionName: 'Division Beta',
          healthScore: 85,
          growthScore: 80,
          dcpScore: 88,
          overallScore: 84.4,
          rank: 2,
          isBestPractice: false,
        },
      ],
      bestPracticeDivisions: [
        {
          divisionId: 'A',
          divisionName: 'Division Alpha',
          healthScore: 95,
          growthScore: 90,
          dcpScore: 92,
          overallScore: 92.5,
          rank: 1,
          isBestPractice: true,
        },
      ],
      leadershipChanges: [
        {
          divisionId: 'C',
          divisionName: 'Division Charlie',
          changeDate: '2024-01-10',
          performanceBeforeChange: 60,
          performanceAfterChange: 75,
          performanceDelta: 15,
          trend: 'improved',
        },
      ],
      areaDirectorCorrelations: [
        {
          areaId: 'A1',
          areaName: 'Area A1',
          divisionId: 'A',
          clubPerformanceScore: 92,
          activityIndicator: 'high',
          correlation: 'positive',
        },
      ],
      summary: {
        topPerformingDivisions: [
          {
            divisionId: 'A',
            divisionName: 'Division Alpha',
            score: 95,
          },
        ],
        topPerformingAreas: [
          {
            areaId: 'A1',
            areaName: 'Area A1',
            score: 92,
          },
        ],
        averageLeadershipScore: 78.9,
        totalBestPracticeDivisions: 1,
      },
    },
  }
}

/**
 * Create sample distinguished club analytics data for testing
 *
 * Requirements:
 * - 5.1: Generate distinguished-club-analytics.json file for each district
 * - 5.2: Include progress tracking, projections, and detailed club data
 */
function createSampleDistinguishedClubAnalytics(
  districtId: string
): DistinguishedClubAnalyticsData {
  return {
    districtId,
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-15',
    },
    distinguishedClubs: {
      smedley: 2,
      presidents: 5,
      select: 8,
      distinguished: 12,
      total: 27,
    },
    distinguishedClubsList: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        status: 'smedley',
        dcpPoints: 10,
        goalsCompleted: 10,
      },
      {
        clubId: '5678',
        clubName: 'Test Club Two',
        status: 'president',
        dcpPoints: 9,
        goalsCompleted: 9,
      },
      {
        clubId: '9012',
        clubName: 'Test Club Three',
        status: 'select',
        dcpPoints: 7,
        goalsCompleted: 7,
      },
    ],
    distinguishedProjection: {
      projectedDistinguished: 15,
      currentDistinguished: 12,
      currentSelect: 8,
      currentPresident: 5,
      projectionDate: '2024-06-30',
    },
    progressByLevel: {
      smedley: { current: 2, projected: 3, trend: 'increasing' },
      presidents: { current: 5, projected: 7, trend: 'increasing' },
      select: { current: 8, projected: 10, trend: 'stable' },
      distinguished: { current: 12, projected: 15, trend: 'increasing' },
    },
  }
}

/**
 * Create sample year-over-year data for testing
 *
 * Requirements:
 * - 6.1: Generate year-over-year.json file for each district
 * - 6.2: Include comparison metrics between current and previous program year
 * - 6.3: Include membership, distinguished clubs, and club health comparisons
 */
function createSampleYearOverYear(districtId: string): YearOverYearData {
  return {
    districtId,
    currentDate: '2024-01-15',
    previousYearDate: '2023-01-15',
    dataAvailable: true,
    metrics: {
      membership: {
        current: 1500,
        previous: 1400,
        change: 100,
        percentageChange: 7.14,
      },
      distinguishedClubs: {
        current: 27,
        previous: 22,
        change: 5,
        percentageChange: 22.73,
      },
      clubHealth: {
        thrivingClubs: {
          current: 45,
          previous: 40,
          change: 5,
          percentageChange: 12.5,
        },
        vulnerableClubs: {
          current: 8,
          previous: 12,
          change: -4,
          percentageChange: -33.33,
        },
        interventionRequiredClubs: {
          current: 3,
          previous: 5,
          change: -2,
          percentageChange: -40.0,
        },
      },
      dcpGoals: {
        totalGoals: {
          current: 350,
          previous: 300,
          change: 50,
          percentageChange: 16.67,
        },
        averagePerClub: {
          current: 5.8,
          previous: 5.2,
          change: 0.6,
          percentageChange: 11.54,
        },
      },
      clubCount: {
        current: 60,
        previous: 58,
        change: 2,
        percentageChange: 3.45,
      },
    },
    multiYearTrends: [
      {
        year: 2024,
        date: '2024-01-15',
        membership: 1500,
        distinguishedClubs: 27,
        totalDcpGoals: 350,
        clubCount: 60,
      },
      {
        year: 2023,
        date: '2023-01-15',
        membership: 1400,
        distinguishedClubs: 22,
        totalDcpGoals: 300,
        clubCount: 58,
      },
    ],
  }
}

/**
 * Create sample year-over-year data with no historical data for testing
 *
 * Requirements:
 * - 6.5: Return message indicating insufficient historical data
 */
function createSampleYearOverYearNoData(districtId: string): YearOverYearData {
  return {
    districtId,
    currentDate: '2024-01-15',
    previousYearDate: '2023-01-15',
    dataAvailable: false,
    message: 'Insufficient historical data for year-over-year comparison',
  }
}

/**
 * Create sample performance targets data for testing
 *
 * Requirements:
 * - 7.1: Generate performance-targets.json file for each district
 * - 7.2: Include DAP, DDP, and other recognition level targets
 */
function createSamplePerformanceTargets(
  districtId: string
): PerformanceTargetsData {
  return {
    districtId,
    computedAt: new Date().toISOString(),
    paidClubsCount: 70,
    currentProgress: {
      membership: 1500,
      distinguished: 27,
      clubGrowth: 2,
    },
  }
}

/**
 * Create sample club trends index data for testing
 *
 * Requirements:
 * - 2.1: Generate club trend data for each club in each district
 * - 2.2: Store in a format that allows efficient retrieval by club ID
 */
function createSampleClubTrendsIndex(districtId: string): ClubTrendsIndex {
  return {
    districtId,
    computedAt: new Date().toISOString(),
    clubs: {
      '1234': {
        clubId: '1234',
        clubName: 'Test Club One',
        divisionId: 'A',
        divisionName: 'Division Alpha',
        areaId: 'A1',
        areaName: 'Area A1',
        currentStatus: 'thriving',
        healthScore: 95,
        membershipCount: 25,
        paymentsCount: 30,
        membershipTrend: [
          { date: '2024-01-01', count: 23 },
          { date: '2024-01-08', count: 24 },
          { date: '2024-01-15', count: 25 },
        ],
        dcpGoalsTrend: [
          { date: '2024-01-01', goalsAchieved: 5 },
          { date: '2024-01-15', goalsAchieved: 7 },
        ],
        riskFactors: [],
        distinguishedLevel: 'Select',
      },
      '5678': {
        clubId: '5678',
        clubName: 'Test Club Two',
        divisionId: 'A',
        divisionName: 'Division Alpha',
        areaId: 'A2',
        areaName: 'Area A2',
        currentStatus: 'vulnerable',
        healthScore: 45,
        membershipCount: 10,
        paymentsCount: 12,
        membershipTrend: [
          { date: '2024-01-01', count: 12 },
          { date: '2024-01-08', count: 11 },
          { date: '2024-01-15', count: 10 },
        ],
        dcpGoalsTrend: [
          { date: '2024-01-01', goalsAchieved: 2 },
          { date: '2024-01-15', goalsAchieved: 2 },
        ],
        riskFactors: ['lowMembership', 'decliningMembership'],
        distinguishedLevel: 'NotDistinguished',
      },
      '9012': {
        clubId: '9012',
        clubName: 'Test Club Three',
        divisionId: 'B',
        divisionName: 'Division Beta',
        areaId: 'B1',
        areaName: 'Area B1',
        currentStatus: 'intervention_required',
        healthScore: 25,
        membershipCount: 6,
        paymentsCount: 8,
        membershipTrend: [
          { date: '2024-01-01', count: 10 },
          { date: '2024-01-08', count: 8 },
          { date: '2024-01-15', count: 6 },
        ],
        dcpGoalsTrend: [
          { date: '2024-01-01', goalsAchieved: 1 },
          { date: '2024-01-15', goalsAchieved: 1 },
        ],
        riskFactors: ['lowMembership', 'decliningMembership', 'lowPayments'],
        distinguishedLevel: 'NotDistinguished',
      },
    },
  }
}

/**
 * Calculate SHA256 checksum of content
 */
function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

describe('AnalyticsWriter', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let analyticsWriter: AnalyticsWriter

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    analyticsWriter = new AnalyticsWriter({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  describe('getAnalyticsDir', () => {
    it('should return correct analytics directory path', () => {
      const date = '2024-01-15'
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)

      expect(analyticsDir).toBe(
        path.join(testCache.path, 'snapshots', date, 'analytics')
      )
    })
  })

  describe('writeDistrictAnalytics', () => {
    it('should write district analytics to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_analytics.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      // Verify metadata fields (Requirement 3.2)
      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/) // SHA256 hex
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(analytics))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      // Verify data matches original
      expect(parsed.data).toEqual(analytics)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeDistrictAnalytics(date, districtId, analytics)

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should write valid JSON', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )

      const content = await fs.readFile(filePath, 'utf-8')

      // Should not throw
      expect(() => JSON.parse(content)).not.toThrow()
    })

    it('should have computedAt as valid ISO timestamp', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const beforeWrite = new Date()
      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )
      const afterWrite = new Date()

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      const computedAt = new Date(parsed.metadata.computedAt)
      expect(computedAt.getTime()).toBeGreaterThanOrEqual(beforeWrite.getTime())
      expect(computedAt.getTime()).toBeLessThanOrEqual(afterWrite.getTime())
    })
  })

  describe('writeMembershipTrends', () => {
    it('should write membership trends to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const trends = createSampleMembershipTrends()

      const filePath = await analyticsWriter.writeMembershipTrends(
        date,
        districtId,
        trends
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_membership.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const trends = createSampleMembershipTrends()

      const filePath = await analyticsWriter.writeMembershipTrends(
        date,
        districtId,
        trends
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<MembershipTrendData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should preserve data structure exactly', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const trends = createSampleMembershipTrends()

      const filePath = await analyticsWriter.writeMembershipTrends(
        date,
        districtId,
        trends
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<MembershipTrendData>

      expect(parsed.data).toEqual(trends)
    })
  })

  describe('writeClubHealth', () => {
    it('should write club health to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const health = createSampleClubHealth()

      const filePath = await analyticsWriter.writeClubHealth(
        date,
        districtId,
        health
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_clubhealth.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const health = createSampleClubHealth()

      const filePath = await analyticsWriter.writeClubHealth(
        date,
        districtId,
        health
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubHealthData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should preserve data structure exactly', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const health = createSampleClubHealth()

      const filePath = await analyticsWriter.writeClubHealth(
        date,
        districtId,
        health
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubHealthData>

      expect(parsed.data).toEqual(health)
    })
  })

  describe('writeMembershipAnalytics', () => {
    /**
     * Tests for writeMembershipAnalytics method
     *
     * Requirements:
     * - 1.1: Generate membership-analytics.json file for each district
     * - 1.3: Follow PreComputedAnalyticsFile structure with metadata
     */

    it('should write membership analytics to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleMembershipAnalytics(districtId)

      const filePath = await analyticsWriter.writeMembershipAnalytics(
        date,
        districtId,
        data
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_membership-analytics.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields (Requirement 1.3)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleMembershipAnalytics(districtId)

      const filePath = await analyticsWriter.writeMembershipAnalytics(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<MembershipAnalyticsData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleMembershipAnalytics(districtId)

      const filePath = await analyticsWriter.writeMembershipAnalytics(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<MembershipAnalyticsData>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(data))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleMembershipAnalytics(districtId)

      const filePath = await analyticsWriter.writeMembershipAnalytics(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<MembershipAnalyticsData>

      expect(parsed.data).toEqual(data)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleMembershipAnalytics(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeMembershipAnalytics(date, districtId, data)

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should store source snapshot checksum when provided (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleMembershipAnalytics(districtId)
      const sourceChecksum = 'abc123def456'

      const filePath = await analyticsWriter.writeMembershipAnalytics(
        date,
        districtId,
        data,
        { sourceSnapshotChecksum: sourceChecksum }
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<MembershipAnalyticsData>

      expect(parsed.metadata.sourceSnapshotChecksum).toBe(sourceChecksum)
    })
  })

  describe('writeVulnerableClubs', () => {
    /**
     * Tests for writeVulnerableClubs method
     *
     * Requirements:
     * - 3.1: Generate vulnerable-clubs.json file for each district
     * - 3.2: Include clubs categorized as vulnerable and intervention-required
     * - 3.3: Include risk factors and health scores for each club
     */

    it('should write vulnerable clubs to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)

      const filePath = await analyticsWriter.writeVulnerableClubs(
        date,
        districtId,
        data
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_vulnerable-clubs.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields (Requirement 3.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)

      const filePath = await analyticsWriter.writeVulnerableClubs(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<VulnerableClubsData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)

      const filePath = await analyticsWriter.writeVulnerableClubs(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<VulnerableClubsData>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(data))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly (Requirement 3.2, 3.3)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)

      const filePath = await analyticsWriter.writeVulnerableClubs(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<VulnerableClubsData>

      expect(parsed.data).toEqual(data)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeVulnerableClubs(date, districtId, data)

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should store source snapshot checksum when provided (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)
      const sourceChecksum = 'abc123def456'

      const filePath = await analyticsWriter.writeVulnerableClubs(
        date,
        districtId,
        data,
        { sourceSnapshotChecksum: sourceChecksum }
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<VulnerableClubsData>

      expect(parsed.metadata.sourceSnapshotChecksum).toBe(sourceChecksum)
    })

    it('should include vulnerable and intervention-required clubs (Requirement 3.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)

      const filePath = await analyticsWriter.writeVulnerableClubs(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<VulnerableClubsData>

      // Verify vulnerable clubs are included
      expect(parsed.data.vulnerableClubs.length).toBe(2)
      expect(parsed.data.vulnerableClubs[0]?.currentStatus).toBe('vulnerable')

      // Verify intervention-required clubs are included
      expect(parsed.data.interventionRequired.length).toBe(1)
      expect(parsed.data.interventionRequired[0]?.currentStatus).toBe(
        'intervention_required'
      )

      // Verify counts match
      expect(parsed.data.totalVulnerableClubs).toBe(2)
      expect(parsed.data.interventionRequiredClubs).toBe(1)
    })

    it('should include risk factors and health scores (Requirement 3.3)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleVulnerableClubs(districtId)

      const filePath = await analyticsWriter.writeVulnerableClubs(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<VulnerableClubsData>

      // Verify risk factors are included for vulnerable clubs
      const vulnerableClub = parsed.data.vulnerableClubs[0]
      expect(vulnerableClub?.riskFactors).toBeDefined()
      expect(vulnerableClub?.riskFactors.length).toBeGreaterThan(0)

      // Verify health scores are included
      expect(vulnerableClub?.healthScore).toBeDefined()
      expect(typeof vulnerableClub?.healthScore).toBe('number')

      // Verify intervention-required clubs also have risk factors and health scores
      const interventionClub = parsed.data.interventionRequired[0]
      expect(interventionClub?.riskFactors).toBeDefined()
      expect(interventionClub?.healthScore).toBeDefined()
    })
  })

  describe('writeLeadershipInsights', () => {
    /**
     * Tests for writeLeadershipInsights method
     *
     * Requirements:
     * - 4.1: Generate leadership-insights.json file for each district
     * - 4.2: Include leadership effectiveness metrics and officer performance data
     */

    it('should write leadership insights to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)

      const filePath = await analyticsWriter.writeLeadershipInsights(
        date,
        districtId,
        data
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_leadership-insights.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields (Requirement 4.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)

      const filePath = await analyticsWriter.writeLeadershipInsights(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<LeadershipInsightsData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)

      const filePath = await analyticsWriter.writeLeadershipInsights(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<LeadershipInsightsData>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(data))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly (Requirement 4.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)

      const filePath = await analyticsWriter.writeLeadershipInsights(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<LeadershipInsightsData>

      expect(parsed.data).toEqual(data)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeLeadershipInsights(date, districtId, data)

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should store source snapshot checksum when provided (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)
      const sourceChecksum = 'abc123def456'

      const filePath = await analyticsWriter.writeLeadershipInsights(
        date,
        districtId,
        data,
        { sourceSnapshotChecksum: sourceChecksum }
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<LeadershipInsightsData>

      expect(parsed.metadata.sourceSnapshotChecksum).toBe(sourceChecksum)
    })

    it('should include leadership effectiveness metrics (Requirement 4.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)

      const filePath = await analyticsWriter.writeLeadershipInsights(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<LeadershipInsightsData>

      // Verify leadership effectiveness metrics are included
      expect(parsed.data.officerCompletionRate).toBeDefined()
      expect(typeof parsed.data.officerCompletionRate).toBe('number')
      expect(parsed.data.trainingCompletionRate).toBeDefined()
      expect(typeof parsed.data.trainingCompletionRate).toBe('number')
      expect(parsed.data.leadershipEffectivenessScore).toBeDefined()
      expect(typeof parsed.data.leadershipEffectivenessScore).toBe('number')
    })

    it('should include top performing divisions and areas needing support (Requirement 4.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleLeadershipInsights(districtId)

      const filePath = await analyticsWriter.writeLeadershipInsights(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<LeadershipInsightsData>

      // Verify top performing divisions are included
      expect(parsed.data.topPerformingDivisions).toBeDefined()
      expect(parsed.data.topPerformingDivisions.length).toBeGreaterThan(0)
      expect(parsed.data.topPerformingDivisions[0]?.divisionId).toBeDefined()
      expect(parsed.data.topPerformingDivisions[0]?.score).toBeDefined()

      // Verify areas needing support are included
      expect(parsed.data.areasNeedingSupport).toBeDefined()
      expect(parsed.data.areasNeedingSupport.length).toBeGreaterThan(0)
      expect(parsed.data.areasNeedingSupport[0]?.areaId).toBeDefined()
      expect(parsed.data.areasNeedingSupport[0]?.score).toBeDefined()
    })
  })

  describe('writeDistinguishedClubAnalytics', () => {
    /**
     * Tests for writeDistinguishedClubAnalytics method
     *
     * Requirements:
     * - 5.1: Generate distinguished-club-analytics.json file for each district
     * - 5.2: Include progress tracking, projections, and detailed club data
     */

    it('should write distinguished club analytics to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleDistinguishedClubAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistinguishedClubAnalytics(
        date,
        districtId,
        data
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_distinguished-analytics.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields (Requirement 5.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleDistinguishedClubAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistinguishedClubAnalytics(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistinguishedClubAnalyticsData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleDistinguishedClubAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistinguishedClubAnalytics(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistinguishedClubAnalyticsData>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(data))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly (Requirement 5.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleDistinguishedClubAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistinguishedClubAnalytics(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistinguishedClubAnalyticsData>

      expect(parsed.data).toEqual(data)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleDistinguishedClubAnalytics(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeDistinguishedClubAnalytics(
        date,
        districtId,
        data
      )

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should store source snapshot checksum when provided (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleDistinguishedClubAnalytics(districtId)
      const sourceChecksum = 'abc123def456'

      const filePath = await analyticsWriter.writeDistinguishedClubAnalytics(
        date,
        districtId,
        data,
        { sourceSnapshotChecksum: sourceChecksum }
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistinguishedClubAnalyticsData>

      expect(parsed.metadata.sourceSnapshotChecksum).toBe(sourceChecksum)
    })

    it('should include progress tracking and projections (Requirement 5.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleDistinguishedClubAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistinguishedClubAnalytics(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistinguishedClubAnalyticsData>

      // Verify distinguished clubs counts are included
      expect(parsed.data.distinguishedClubs).toBeDefined()
      expect(parsed.data.distinguishedClubs.smedley).toBeDefined()
      expect(parsed.data.distinguishedClubs.presidents).toBeDefined()
      expect(parsed.data.distinguishedClubs.select).toBeDefined()
      expect(parsed.data.distinguishedClubs.distinguished).toBeDefined()
      expect(parsed.data.distinguishedClubs.total).toBeDefined()

      // Verify projections are included
      expect(parsed.data.distinguishedProjection).toBeDefined()
      expect(
        parsed.data.distinguishedProjection.projectedDistinguished
      ).toBeDefined()

      // Verify progress by level is included
      expect(parsed.data.progressByLevel).toBeDefined()
      expect(parsed.data.progressByLevel.smedley).toBeDefined()
      expect(parsed.data.progressByLevel.smedley.current).toBeDefined()
      expect(parsed.data.progressByLevel.smedley.projected).toBeDefined()
      expect(parsed.data.progressByLevel.smedley.trend).toBeDefined()
    })
  })

  describe('writeYearOverYear', () => {
    /**
     * Tests for writeYearOverYear method
     *
     * Requirements:
     * - 6.1: Generate year-over-year.json file for each district
     * - 6.2: Include comparison metrics between current and previous program year
     * - 6.3: Include membership, distinguished clubs, and club health comparisons
     */

    it('should write year-over-year data to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_year-over-year.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields (Requirement 6.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<YearOverYearData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<YearOverYearData>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(data))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly (Requirement 6.2, 6.3)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<YearOverYearData>

      expect(parsed.data).toEqual(data)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeYearOverYear(date, districtId, data)

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should store source snapshot checksum when provided (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)
      const sourceChecksum = 'abc123def456'

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data,
        { sourceSnapshotChecksum: sourceChecksum }
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<YearOverYearData>

      expect(parsed.metadata.sourceSnapshotChecksum).toBe(sourceChecksum)
    })

    it('should include comparison metrics when data is available (Requirement 6.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<YearOverYearData>

      // Verify data availability flag
      expect(parsed.data.dataAvailable).toBe(true)

      // Verify metrics are included
      expect(parsed.data.metrics).toBeDefined()
      expect(parsed.data.metrics?.membership).toBeDefined()
      expect(parsed.data.metrics?.membership.current).toBeDefined()
      expect(parsed.data.metrics?.membership.previous).toBeDefined()
      expect(parsed.data.metrics?.membership.change).toBeDefined()
      expect(parsed.data.metrics?.membership.percentageChange).toBeDefined()
    })

    it('should include club health comparisons (Requirement 6.3)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYear(districtId)

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<YearOverYearData>

      // Verify club health comparisons are included
      expect(parsed.data.metrics?.clubHealth).toBeDefined()
      expect(parsed.data.metrics?.clubHealth.thrivingClubs).toBeDefined()
      expect(parsed.data.metrics?.clubHealth.vulnerableClubs).toBeDefined()
      expect(
        parsed.data.metrics?.clubHealth.interventionRequiredClubs
      ).toBeDefined()
    })

    it('should handle data unavailable case (Requirement 6.5)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleYearOverYearNoData(districtId)

      const filePath = await analyticsWriter.writeYearOverYear(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<YearOverYearData>

      // Verify data unavailable flag and message
      expect(parsed.data.dataAvailable).toBe(false)
      expect(parsed.data.message).toBeDefined()
      expect(parsed.data.metrics).toBeUndefined()
    })
  })

  describe('writePerformanceTargets', () => {
    /**
     * Tests for writePerformanceTargets method
     *
     * Requirements:
     * - 7.1: Generate performance-targets.json file for each district
     * - 7.2: Include DAP, DDP, and other recognition level targets
     */

    it('should write performance targets to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSamplePerformanceTargets(districtId)

      const filePath = await analyticsWriter.writePerformanceTargets(
        date,
        districtId,
        data
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_performance-targets.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields (Requirement 7.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSamplePerformanceTargets(districtId)

      const filePath = await analyticsWriter.writePerformanceTargets(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSamplePerformanceTargets(districtId)

      const filePath = await analyticsWriter.writePerformanceTargets(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(data))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly (Requirement 7.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSamplePerformanceTargets(districtId)

      const filePath = await analyticsWriter.writePerformanceTargets(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      expect(parsed.data).toEqual(data)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSamplePerformanceTargets(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writePerformanceTargets(date, districtId, data)

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should store source snapshot checksum when provided (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSamplePerformanceTargets(districtId)
      const sourceChecksum = 'abc123def456'

      const filePath = await analyticsWriter.writePerformanceTargets(
        date,
        districtId,
        data,
        { sourceSnapshotChecksum: sourceChecksum }
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      expect(parsed.metadata.sourceSnapshotChecksum).toBe(sourceChecksum)
    })

    it('should include targets and progress (Requirement 7.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSamplePerformanceTargets(districtId)

      const filePath = await analyticsWriter.writePerformanceTargets(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<PerformanceTargetsData>

      // Verify paid clubs count is included
      expect(parsed.data.paidClubsCount).toBeDefined()
      expect(typeof parsed.data.paidClubsCount).toBe('number')

      // Verify current progress is included
      expect(parsed.data.currentProgress).toBeDefined()
      expect(parsed.data.currentProgress.membership).toBeDefined()
      expect(parsed.data.currentProgress.distinguished).toBeDefined()
      expect(parsed.data.currentProgress.clubGrowth).toBeDefined()

      // Legacy district targets were removed in #1127
      expect(parsed.data).not.toHaveProperty('membershipTarget')
      expect(parsed.data).not.toHaveProperty('distinguishedTarget')
      expect(parsed.data).not.toHaveProperty('clubGrowthTarget')
      expect(parsed.data).not.toHaveProperty('projectedAchievement')
    })
  })

  describe('writeClubTrendsIndex', () => {
    /**
     * Tests for writeClubTrendsIndex method
     *
     * Requirements:
     * - 2.1: Generate club trend data for each club in each district
     * - 2.2: Store in a format that allows efficient retrieval by club ID
     */

    it('should write club trends index to correct path', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data
      )

      expect(filePath).toBe(
        path.join(
          testCache.path,
          'snapshots',
          date,
          'analytics',
          `district_${districtId}_club-trends-index.json`
        )
      )

      // Verify file exists
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include required metadata fields (Requirement 2.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubTrendsIndex>

      expect(parsed.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(parsed.metadata.computedAt).toBeDefined()
      expect(parsed.metadata.snapshotDate).toBe(date)
      expect(parsed.metadata.districtId).toBe(districtId)
      expect(parsed.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should include correct data checksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubTrendsIndex>

      // Calculate expected checksum
      const expectedChecksum = calculateChecksum(JSON.stringify(data))
      expect(parsed.metadata.checksum).toBe(expectedChecksum)
    })

    it('should preserve data structure exactly (Requirement 2.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubTrendsIndex>

      expect(parsed.data).toEqual(data)
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      // Verify directory doesn't exist
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeClubTrendsIndex(date, districtId, data)

      // Verify directory was created
      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should store source snapshot checksum when provided (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)
      const sourceChecksum = 'abc123def456'

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data,
        { sourceSnapshotChecksum: sourceChecksum }
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubTrendsIndex>

      expect(parsed.metadata.sourceSnapshotChecksum).toBe(sourceChecksum)
    })

    it('should allow efficient O(1) lookup by club ID (Requirement 2.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubTrendsIndex>

      // Verify clubs are stored as a Record (object) for O(1) lookup
      expect(typeof parsed.data.clubs).toBe('object')
      expect(Array.isArray(parsed.data.clubs)).toBe(false)

      // Verify direct lookup by club ID works
      const club1234 = parsed.data.clubs['1234']
      expect(club1234).toBeDefined()
      expect(club1234?.clubId).toBe('1234')
      expect(club1234?.clubName).toBe('Test Club One')

      const club5678 = parsed.data.clubs['5678']
      expect(club5678).toBeDefined()
      expect(club5678?.clubId).toBe('5678')
      expect(club5678?.clubName).toBe('Test Club Two')
    })

    it('should include club trend data with all required fields (Requirement 2.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubTrendsIndex>

      // Verify club trend data includes all required fields
      const club = parsed.data.clubs['1234']
      expect(club?.clubId).toBeDefined()
      expect(club?.clubName).toBeDefined()
      expect(club?.divisionId).toBeDefined()
      expect(club?.areaId).toBeDefined()
      expect(club?.currentStatus).toBeDefined()
      expect(club?.healthScore).toBeDefined()
      expect(club?.membershipCount).toBeDefined()
      expect(club?.paymentsCount).toBeDefined()
      expect(club?.membershipTrend).toBeDefined()
      expect(club?.dcpGoalsTrend).toBeDefined()
      expect(club?.riskFactors).toBeDefined()
      expect(club?.distinguishedLevel).toBeDefined()
    })

    it('should include clubs with different health statuses', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const data = createSampleClubTrendsIndex(districtId)

      const filePath = await analyticsWriter.writeClubTrendsIndex(
        date,
        districtId,
        data
      )

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<ClubTrendsIndex>

      // Verify different health statuses are represented
      const thrivingClub = parsed.data.clubs['1234']
      expect(thrivingClub?.currentStatus).toBe('thriving')

      const vulnerableClub = parsed.data.clubs['5678']
      expect(vulnerableClub?.currentStatus).toBe('vulnerable')

      const interventionClub = parsed.data.clubs['9012']
      expect(interventionClub?.currentStatus).toBe('intervention_required')
    })
  })

  describe('writeAnalyticsManifest', () => {
    it('should write manifest to correct path', async () => {
      const date = '2024-01-15'
      const files: AnalyticsManifestEntry[] = [
        {
          filename: 'district_1_analytics.json',
          districtId: '1',
          type: 'analytics',
          size: 1024,
          checksum: 'abc123',
        },
      ]

      await analyticsWriter.writeAnalyticsManifest(date, files)

      const manifestPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        'manifest.json'
      )

      const stat = await fs.stat(manifestPath)
      expect(stat.isFile()).toBe(true)
    })

    it('should include all required manifest fields', async () => {
      const date = '2024-01-15'
      const files: AnalyticsManifestEntry[] = [
        {
          filename: 'district_1_analytics.json',
          districtId: '1',
          type: 'analytics',
          size: 1024,
          checksum: 'abc123',
        },
        {
          filename: 'district_1_membership.json',
          districtId: '1',
          type: 'membership',
          size: 512,
          checksum: 'def456',
        },
      ]

      await analyticsWriter.writeAnalyticsManifest(date, files)

      const manifestPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        'manifest.json'
      )
      const content = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(content) as AnalyticsManifest

      expect(manifest.snapshotDate).toBe(date)
      expect(manifest.generatedAt).toBeDefined()
      expect(manifest.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(manifest.files).toEqual(files)
      expect(manifest.totalFiles).toBe(2)
      expect(manifest.totalSize).toBe(1536) // 1024 + 512
    })

    it('should calculate correct total size', async () => {
      const date = '2024-01-15'
      const files: AnalyticsManifestEntry[] = [
        {
          filename: 'file1.json',
          districtId: '1',
          type: 'analytics',
          size: 100,
          checksum: 'a',
        },
        {
          filename: 'file2.json',
          districtId: '1',
          type: 'membership',
          size: 200,
          checksum: 'b',
        },
        {
          filename: 'file3.json',
          districtId: '1',
          type: 'clubhealth',
          size: 300,
          checksum: 'c',
        },
      ]

      await analyticsWriter.writeAnalyticsManifest(date, files)

      const manifestPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        'manifest.json'
      )
      const content = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(content) as AnalyticsManifest

      expect(manifest.totalSize).toBe(600)
      expect(manifest.totalFiles).toBe(3)
    })

    it('should write valid JSON', async () => {
      const date = '2024-01-15'
      const files: AnalyticsManifestEntry[] = []

      await analyticsWriter.writeAnalyticsManifest(date, files)

      const manifestPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        'manifest.json'
      )
      const content = await fs.readFile(manifestPath, 'utf-8')

      expect(() => JSON.parse(content)).not.toThrow()
    })

    it('should create analytics directory if it does not exist', async () => {
      const date = '2024-01-15'
      const files: AnalyticsManifestEntry[] = []

      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      await expect(fs.access(analyticsDir)).rejects.toThrow()

      await analyticsWriter.writeAnalyticsManifest(date, files)

      const stat = await fs.stat(analyticsDir)
      expect(stat.isDirectory()).toBe(true)
    })
  })

  describe('createManifestEntry', () => {
    it('should create correct manifest entry from written file', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )

      const entry = await analyticsWriter.createManifestEntry(
        filePath,
        districtId,
        'analytics'
      )

      expect(entry.filename).toBe(`district_${districtId}_analytics.json`)
      expect(entry.districtId).toBe(districtId)
      expect(entry.type).toBe('analytics')
      expect(entry.size).toBeGreaterThan(0)
      expect(entry.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should extract checksum from file metadata', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      const filePath = await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        analytics
      )

      const entry = await analyticsWriter.createManifestEntry(
        filePath,
        districtId,
        'analytics'
      )

      // Read file and verify checksum matches
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      expect(entry.checksum).toBe(parsed.metadata.checksum)
    })
  })

  describe('directory structure (Requirement 3.1)', () => {
    it('should write all analytics files to analytics/ subdirectory', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        createSampleDistrictAnalytics(districtId)
      )
      await analyticsWriter.writeMembershipTrends(
        date,
        districtId,
        createSampleMembershipTrends()
      )
      await analyticsWriter.writeClubHealth(
        date,
        districtId,
        createSampleClubHealth()
      )
      await analyticsWriter.writeAnalyticsManifest(date, [])

      // Verify all files are in analytics/ subdirectory
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      const files = await fs.readdir(analyticsDir)

      expect(files).toContain(`district_${districtId}_analytics.json`)
      expect(files).toContain(`district_${districtId}_membership.json`)
      expect(files).toContain(`district_${districtId}_clubhealth.json`)
      expect(files).toContain('manifest.json')
    })

    it('should create correct path structure: CACHE_DIR/snapshots/{date}/analytics/', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        createSampleDistrictAnalytics(districtId)
      )

      // Verify path structure
      const expectedPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_analytics.json`
      )

      const stat = await fs.stat(expectedPath)
      expect(stat.isFile()).toBe(true)
    })
  })

  describe('atomic writes', () => {
    it('should not leave partial files on error', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analytics = createSampleDistrictAnalytics(districtId)

      // Write successfully first
      await analyticsWriter.writeDistrictAnalytics(date, districtId, analytics)

      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      const files = await fs.readdir(analyticsDir)

      // Should not have any .tmp files
      const tmpFiles = files.filter(f => f.includes('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe('multiple districts', () => {
    it('should write analytics for multiple districts', async () => {
      const date = '2024-01-15'

      for (const districtId of ['1', '2', '3']) {
        await analyticsWriter.writeDistrictAnalytics(
          date,
          districtId,
          createSampleDistrictAnalytics(districtId)
        )
      }

      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      const files = await fs.readdir(analyticsDir)

      expect(files).toContain('district_1_analytics.json')
      expect(files).toContain('district_2_analytics.json')
      expect(files).toContain('district_3_analytics.json')
    })

    it('should maintain separate checksums for each district', async () => {
      const date = '2024-01-15'

      const checksums: string[] = []
      for (const districtId of ['1', '2']) {
        const analytics = createSampleDistrictAnalytics(districtId)
        const filePath = await analyticsWriter.writeDistrictAnalytics(
          date,
          districtId,
          analytics
        )

        const content = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(
          content
        ) as PreComputedAnalyticsFile<DistrictAnalytics>
        checksums.push(parsed.metadata.checksum)
      }

      // Checksums should be different because districtId is different
      expect(checksums[0]).not.toBe(checksums[1])
    })
  })
})
