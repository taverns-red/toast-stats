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
  type PerformanceTargetsData,
  type PreComputedAnalyticsFile,
  type AnalyticsManifestEntry,
  type AnalyticsManifest,
} from '@taverns-red/analytics-core'

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
          filename: 'district_1_performance-targets.json',
          districtId: '1',
          type: 'performance-targets',
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
          type: 'performance-targets',
          size: 200,
          checksum: 'b',
        },
        {
          filename: 'file3.json',
          districtId: '2',
          type: 'analytics',
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
      await analyticsWriter.writePerformanceTargets(
        date,
        districtId,
        createSamplePerformanceTargets()
      )
      await analyticsWriter.writeAnalyticsManifest(date, [])

      // Verify all files are in analytics/ subdirectory
      const analyticsDir = analyticsWriter.getAnalyticsDir(date)
      const files = await fs.readdir(analyticsDir)

      expect(files.sort()).toEqual(
        [
          `district_${districtId}_analytics.json`,
          `district_${districtId}_performance-targets.json`,
          'manifest.json',
        ].sort()
      )
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
