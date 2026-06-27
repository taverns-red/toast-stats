/**
 * Full Pipeline Integration Test
 *
 * Tests the complete data pipeline: raw CSV → snapshot → pre-computed analytics
 *
 * Requirements:
 * - 1.7: THE data pipeline SHALL be: raw CSV → snapshot → pre-computed analytics (all in Collector_CLI)
 * - 11.5: THE local development workflow SHALL be: scrape locally → compute analytics locally →
 *         run backend locally → serve pre-computed analytics
 *
 * This integration test verifies:
 * 1. TransformService correctly transforms raw CSV files into snapshots
 * 2. AnalyticsComputeService correctly computes analytics from snapshots
 * 3. All output files are created with correct structure
 * 4. The pipeline works end-to-end with multiple districts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import {
  ANALYTICS_SCHEMA_VERSION,
  type PreComputedAnalyticsFile,
  type DistrictAnalytics,
  type MembershipTrendData,
  type ClubHealthData,
  type AnalyticsManifest,
} from '@taverns-red/analytics-core'

/**
 * Create an isolated test cache directory with unique ID for parallel test safety.
 *
 * Per testing steering document:
 * - Use unique, isolated directories created per test (timestamps/random IDs)
 * - Clean up all created files in afterEach hooks
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${process.pid}`
  const cachePath = path.join(
    os.tmpdir(),
    `pipeline-integration-test-${uniqueId}`
  )

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Sample club performance CSV content with realistic data.
 * This CSV format matches what the Toastmasters dashboard produces.
 */
const SAMPLE_CLUB_CSV_DISTRICT_1 = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
1001,Alpha Speakers,A,1,25,30,7,Active
1002,Beta Toastmasters,A,2,18,22,5,Active
1003,Gamma Club,B,1,12,15,3,Active
1004,Delta Speakers,B,2,8,10,2,Active`

const SAMPLE_CLUB_CSV_DISTRICT_2 = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
2001,Echo Speakers,A,1,30,35,8,Active
2002,Foxtrot Club,A,2,22,28,6,Active
2003,Golf Toastmasters,B,1,15,18,4,Active`

const SAMPLE_CLUB_CSV_DISTRICT_3 = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
3001,Hotel Speakers,A,1,20,25,5,Active
3002,India Club,A,2,16,20,4,Active`

/**
 * Sample division performance CSV content
 */
const SAMPLE_DIVISION_CSV = `Division,Division Name,Club Count,Membership,Total to Date
A,Division Alpha,2,43,52
B,Division Beta,2,20,25`

/**
 * Sample district performance CSV content
 */
const SAMPLE_DISTRICT_CSV = `District,Distinguished Clubs,Select Distinguished,President's Distinguished
1,1,0,0`

/**
 * Write raw CSV files for a district to the test cache.
 * Creates the directory structure expected by TransformService.
 */
async function writeRawCSVFiles(
  cacheDir: string,
  date: string,
  districtId: string,
  clubCsv: string,
  divisionCsv: string = SAMPLE_DIVISION_CSV,
  districtCsv: string = SAMPLE_DISTRICT_CSV
): Promise<void> {
  const districtDir = path.join(
    cacheDir,
    'raw-csv',
    date,
    `district-${districtId}`
  )
  await fs.mkdir(districtDir, { recursive: true })

  await fs.writeFile(
    path.join(districtDir, 'club-performance.csv'),
    clubCsv,
    'utf-8'
  )
  await fs.writeFile(
    path.join(districtDir, 'division-performance.csv'),
    divisionCsv,
    'utf-8'
  )
  await fs.writeFile(
    path.join(districtDir, 'district-performance.csv'),
    districtCsv,
    'utf-8'
  )
}

describe('Pipeline Integration Tests', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService
  let analyticsComputeService: AnalyticsComputeService

  beforeEach(async () => {
    // Create isolated cache directory for this test
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    // Create fresh service instances per test via dependency injection
    transformService = new TransformService({
      cacheDir: testCache.path,
    })

    analyticsComputeService = new AnalyticsComputeService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    // Clean up all created files
    await testCache.cleanup()
  })

  describe('Full Pipeline: CSV → Transform → Compute Analytics → Verify Files', () => {
    it('should complete full pipeline for a single district (Requirement 1.7)', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      // Step 1: Write raw CSV files
      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Step 2: Transform raw CSV to snapshot
      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toContain(districtId)

      // Step 3: Compute analytics from snapshot
      const computeResult = await analyticsComputeService.compute({
        date,
        districts: [districtId],
      })

      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toContain(districtId)

      // Step 4: Verify all output files exist
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      const analyticsDir = path.join(snapshotDir, 'analytics')

      // Verify snapshot files
      const snapshotFiles = await fs.readdir(snapshotDir)
      expect(snapshotFiles).toContain(`district_${districtId}.json`)
      expect(snapshotFiles).toContain('metadata.json')
      expect(snapshotFiles).toContain('manifest.json')

      // Verify analytics files
      const analyticsFiles = await fs.readdir(analyticsDir)
      expect(analyticsFiles).toContain(`district_${districtId}_analytics.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_membership.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_clubhealth.json`)
      expect(analyticsFiles).toContain('manifest.json')
    })

    it('should complete full pipeline for multiple districts (Requirement 1.7)', async () => {
      const date = '2024-01-15'
      const districts = ['1', '2', '3']

      // Step 1: Write raw CSV files for all districts
      await writeRawCSVFiles(
        testCache.path,
        date,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await writeRawCSVFiles(
        testCache.path,
        date,
        '2',
        SAMPLE_CLUB_CSV_DISTRICT_2
      )
      await writeRawCSVFiles(
        testCache.path,
        date,
        '3',
        SAMPLE_CLUB_CSV_DISTRICT_3
      )

      // Step 2: Transform all districts
      const transformResult = await transformService.transform({ date })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toEqual(districts)

      // Step 3: Compute analytics for all districts
      const computeResult = await analyticsComputeService.compute({ date })

      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toEqual(districts)

      // Step 4: Verify all output files exist for each district
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )
      const analyticsFiles = await fs.readdir(analyticsDir)

      for (const districtId of districts) {
        expect(analyticsFiles).toContain(
          `district_${districtId}_analytics.json`
        )
        expect(analyticsFiles).toContain(
          `district_${districtId}_membership.json`
        )
        expect(analyticsFiles).toContain(
          `district_${districtId}_clubhealth.json`
        )
      }
    })
  })

  describe('Snapshot File Verification', () => {
    it('should create metadata.json with correct structure', async () => {
      const date = '2024-01-15'

      await writeRawCSVFiles(
        testCache.path,
        date,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await writeRawCSVFiles(
        testCache.path,
        date,
        '2',
        SAMPLE_CLUB_CSV_DISTRICT_2
      )

      await transformService.transform({ date })

      const metadataPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'metadata.json'
      )
      const metadataContent = await fs.readFile(metadataPath, 'utf-8')
      const metadata = JSON.parse(metadataContent) as {
        snapshotId: string
        schemaVersion: string
        calculationVersion: string
        status: string
        source: string
        successfulDistricts: string[]
        failedDistricts: string[]
        configuredDistricts: string[]
        dataAsOfDate: string
        createdAt: string
        processingDuration: number
        errors: string[]
      }

      expect(metadata.snapshotId).toBe(date)
      expect(metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(metadata.calculationVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(metadata.status).toBe('success')
      expect(metadata.source).toBe('collector-cli')
      expect(metadata.successfulDistricts).toEqual(['1', '2'])
      expect(metadata.failedDistricts).toEqual([])
      expect(metadata.configuredDistricts).toEqual(['1', '2'])
      expect(metadata.dataAsOfDate).toBe(date)
      expect(metadata.createdAt).toBeDefined()
      expect(metadata.processingDuration).toBeGreaterThanOrEqual(0)
    })

    it('should create manifest.json with district entries', async () => {
      const date = '2024-01-15'

      await writeRawCSVFiles(
        testCache.path,
        date,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      await transformService.transform({ date })

      const manifestPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'manifest.json'
      )
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent) as {
        snapshotId: string
        createdAt: string
        districts: Array<{
          districtId: string
          fileName: string
          status: string
          fileSize: number
          lastModified: string
        }>
        totalDistricts: number
        successfulDistricts: number
        failedDistricts: number
      }

      expect(manifest.snapshotId).toBe(date)
      expect(manifest.totalDistricts).toBeGreaterThan(0)
      expect(manifest.successfulDistricts).toBeGreaterThan(0)
      expect(manifest.failedDistricts).toBe(0)

      // Verify each district entry has required fields
      for (const district of manifest.districts) {
        expect(district.districtId).toBeDefined()
        expect(district.fileName).toBeDefined()
        expect(district.status).toBe('success')
        expect(district.fileSize).toBeGreaterThan(0)
        expect(district.lastModified).toBeDefined()
      }
    })

    it('should create district snapshot files with correct data', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      await transformService.transform({ date })

      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      // TransformService writes PerDistrictData wrapper format
      const wrapper = JSON.parse(snapshotContent) as {
        districtId: string
        data: {
          districtId: string
          snapshotDate: string
          clubs: Array<{ clubId: string; clubName: string }>
          divisions: Array<{ divisionId: string }>
        }
      }

      expect(wrapper.districtId).toBe(districtId)
      expect(wrapper.data.snapshotDate).toBe(date)
      expect(wrapper.data.clubs).toHaveLength(4) // 4 clubs in SAMPLE_CLUB_CSV_DISTRICT_1
      expect(wrapper.data.divisions).toHaveLength(2) // 2 divisions
    })
  })

  describe('Analytics File Verification', () => {
    it('should create district_analytics.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await transformService.transform({ date })
      await analyticsComputeService.compute({ date })

      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const analyticsContent = await fs.readFile(analyticsPath, 'utf-8')
      const analytics = JSON.parse(
        analyticsContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      // Verify metadata
      expect(analytics.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(analytics.metadata.snapshotDate).toBe(date)
      expect(analytics.metadata.districtId).toBe(districtId)
      expect(analytics.metadata.computedAt).toBeDefined()
      expect(analytics.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)

      // Verify data structure (Property 11: District Analytics Type Conformance)
      expect(analytics.data.districtId).toBe(districtId)
      expect(analytics.data.dateRange).toBeDefined()
      expect(analytics.data.totalMembership).toBeGreaterThan(0)
      expect(analytics.data.membershipChange).toBeDefined()
      expect(analytics.data.membershipTrend).toBeDefined()
      expect(analytics.data.allClubs).toBeDefined()
      expect(analytics.data.vulnerableClubs).toBeDefined()
      expect(analytics.data.thrivingClubs).toBeDefined()
      expect(analytics.data.interventionRequiredClubs).toBeDefined()
      expect(analytics.data.distinguishedClubs).toBeDefined()
      expect(analytics.data.distinguishedProjection).toBeDefined()
      expect(analytics.data.divisionRankings).toBeDefined()
      expect(analytics.data.topPerformingAreas).toBeDefined()
    })

    it('should create membership.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await transformService.transform({ date })
      await analyticsComputeService.compute({ date })

      const membershipPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_membership.json`
      )
      const membershipContent = await fs.readFile(membershipPath, 'utf-8')
      const membership = JSON.parse(
        membershipContent
      ) as PreComputedAnalyticsFile<MembershipTrendData>

      // Verify metadata
      expect(membership.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(membership.metadata.snapshotDate).toBe(date)
      expect(membership.metadata.districtId).toBe(districtId)

      // Verify data structure (Property 12: Membership Trends Completeness)
      expect(membership.data.membershipTrend).toBeDefined()
      expect(Array.isArray(membership.data.membershipTrend)).toBe(true)
      expect(membership.data.paymentsTrend).toBeDefined()
      expect(Array.isArray(membership.data.paymentsTrend)).toBe(true)
    })

    it('should create clubhealth.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await transformService.transform({ date })
      await analyticsComputeService.compute({ date })

      const clubHealthPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_clubhealth.json`
      )
      const clubHealthContent = await fs.readFile(clubHealthPath, 'utf-8')
      const clubHealth = JSON.parse(
        clubHealthContent
      ) as PreComputedAnalyticsFile<ClubHealthData>

      // Verify metadata
      expect(clubHealth.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(clubHealth.metadata.snapshotDate).toBe(date)
      expect(clubHealth.metadata.districtId).toBe(districtId)

      // Verify data structure (Property 13: Club Health Completeness)
      expect(clubHealth.data.allClubs).toBeDefined()
      expect(Array.isArray(clubHealth.data.allClubs)).toBe(true)
      expect(clubHealth.data.thrivingClubs).toBeDefined()
      expect(Array.isArray(clubHealth.data.thrivingClubs)).toBe(true)
      expect(clubHealth.data.vulnerableClubs).toBeDefined()
      expect(Array.isArray(clubHealth.data.vulnerableClubs)).toBe(true)
      expect(clubHealth.data.interventionRequiredClubs).toBeDefined()
      expect(Array.isArray(clubHealth.data.interventionRequiredClubs)).toBe(
        true
      )

      // Verify club entries have required fields
      if (clubHealth.data.allClubs.length > 0) {
        const club = clubHealth.data.allClubs[0]
        expect(club).toBeDefined()
        if (club) {
          expect(club.clubId).toBeDefined()
          expect(club.clubName).toBeDefined()
          expect(club.currentStatus).toBeDefined()
          expect(club.riskFactors).toBeDefined()
        }
      }
    })

    it('should create analytics manifest.json with correct checksums', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await transformService.transform({ date })
      await analyticsComputeService.compute({ date })

      const manifestPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        'manifest.json'
      )
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent) as AnalyticsManifest

      // Verify manifest structure
      expect(manifest.snapshotDate).toBe(date)
      expect(manifest.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(manifest.generatedAt).toBeDefined()
      expect(manifest.totalFiles).toBeGreaterThan(0)
      expect(manifest.totalSize).toBeGreaterThan(0)
      expect(manifest.files.length).toBe(manifest.totalFiles)

      // Valid file types including new extended analytics types
      const validFileTypes = [
        'analytics',
        'membership',
        'clubhealth',
        'rankings',
        'membership-analytics',
        'vulnerable-clubs',
        'leadership-insights',
        'distinguished-analytics',
        'year-over-year',
        'performance-targets',
        'club-trends-index',
      ]

      // Verify each file entry
      for (const file of manifest.files) {
        expect(file.filename).toBeDefined()
        expect(file.districtId).toBe(districtId)
        expect(validFileTypes).toContain(file.type)
        expect(file.size).toBeGreaterThan(0)
        expect(file.checksum).toMatch(/^[a-f0-9]{64}$/)
      }
    })
  })

  describe('Pipeline Error Handling', () => {
    it('should handle missing raw CSV gracefully', async () => {
      const date = '2024-01-15'

      // Don't write any CSV files
      const transformResult = await transformService.transform({ date })

      expect(transformResult.success).toBe(false)
      expect(transformResult.errors.length).toBeGreaterThan(0)
    })

    it('should handle missing snapshot gracefully in compute step', async () => {
      const date = '2024-01-15'

      // Don't run transform, try to compute directly
      const computeResult = await analyticsComputeService.compute({ date })

      expect(computeResult.success).toBe(false)
      expect(computeResult.errors.length).toBeGreaterThan(0)
      expect(computeResult.errors[0]?.error).toContain('Snapshot not found')
    })

    it('should continue processing when one district fails (Requirement 1.5)', async () => {
      const date = '2024-01-15'

      // Write valid CSV for district 1
      await writeRawCSVFiles(
        testCache.path,
        date,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Write invalid CSV for district 2 (empty directory, no club-performance.csv)
      const district2Dir = path.join(
        testCache.path,
        'raw-csv',
        date,
        'district-2'
      )
      await fs.mkdir(district2Dir, { recursive: true })

      const transformResult = await transformService.transform({ date })

      // Should have partial success
      expect(transformResult.districtsSucceeded).toContain('1')
      expect(transformResult.districtsFailed).toContain('2')

      // Compute should still work for district 1
      const computeResult = await analyticsComputeService.compute({
        date,
        districts: ['1'],
      })

      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toContain('1')
    })
  })

  describe('Local Development Workflow (Requirement 11.5)', () => {
    it('should support local development workflow: scrape → compute → serve', async () => {
      const date = '2024-01-15'

      // Simulate local scrape by writing CSV files
      await writeRawCSVFiles(
        testCache.path,
        date,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Transform (part of local scrape workflow)
      const transformResult = await transformService.transform({ date })
      expect(transformResult.success).toBe(true)

      // Compute analytics locally
      const computeResult = await analyticsComputeService.compute({ date })
      expect(computeResult.success).toBe(true)

      // Verify files are ready to be served by backend
      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        'district_1_analytics.json'
      )

      // File should exist and be valid JSON
      const content = await fs.readFile(analyticsPath, 'utf-8')
      const analytics = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      // Verify it has the structure the backend expects
      expect(analytics.metadata).toBeDefined()
      expect(analytics.data).toBeDefined()
      expect(analytics.data.districtId).toBe('1')
    })

    it('should work without cloud connectivity', async () => {
      const date = '2024-01-15'

      // This test verifies the pipeline works entirely locally
      // No network calls should be made

      await writeRawCSVFiles(
        testCache.path,
        date,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      const transformResult = await transformService.transform({ date })
      expect(transformResult.success).toBe(true)

      const computeResult = await analyticsComputeService.compute({ date })
      expect(computeResult.success).toBe(true)

      // All files should be in the local cache directory
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )
      const files = await fs.readdir(analyticsDir)

      expect(files.length).toBeGreaterThan(0)
    })
  })

  describe('Data Integrity', () => {
    it('should produce valid JSON in all output files (Property 10)', async () => {
      const date = '2024-01-15'

      await writeRawCSVFiles(
        testCache.path,
        date,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await transformService.transform({ date })
      await analyticsComputeService.compute({ date })

      // Check all files in analytics directory
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )
      const files = await fs.readdir(analyticsDir)

      for (const file of files) {
        const filePath = path.join(analyticsDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Should not throw - all files must be valid JSON
        expect(() => JSON.parse(content)).not.toThrow()
      }
    })

    it('should include source snapshot checksum in analytics metadata', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await transformService.transform({ date })
      await analyticsComputeService.compute({ date })

      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const content = await fs.readFile(analyticsPath, 'utf-8')
      const analytics = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      // Requirement 5.4: Source snapshot checksum should be stored
      expect(analytics.metadata.sourceSnapshotChecksum).toBeDefined()
      expect(analytics.metadata.sourceSnapshotChecksum).toMatch(
        /^[a-f0-9]{64}$/
      )
    })

    it('should maintain data consistency across pipeline stages', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await transformService.transform({ date })
      await analyticsComputeService.compute({ date })

      // Read snapshot (PerDistrictData wrapper format)
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as {
        data: {
          clubs: Array<{ membershipCount: number }>
          totals: { totalMembership: number }
        }
      }
      const snapshot = wrapper.data

      // Read analytics
      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const analyticsContent = await fs.readFile(analyticsPath, 'utf-8')
      const analytics = JSON.parse(
        analyticsContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      // Total membership in analytics should match snapshot
      expect(analytics.data.totalMembership).toBe(
        snapshot.totals.totalMembership
      )

      // Number of clubs should match
      expect(analytics.data.allClubs.length).toBe(snapshot.clubs.length)
    })
  })

  /**
   * Closing Period Integration Tests
   *
   * Tests the full pipeline flow when handling month-end closing periods.
   * During closing periods, the Toastmasters dashboard publishes data for a prior month
   * with an "As of" date in the current month. The pipeline must:
   * 1. TransformService: Write snapshots to the last day of the data month
   * 2. AnalyticsComputeService: Find snapshots at the adjusted date and write analytics there
   *
   * Requirements:
   * - 7.2: WHEN `isClosingPeriod` is true THEN look for snapshots at `CACHE_DIR/snapshots/{lastDayOfDataMonth}/`
   * - 8.1: WHEN computing analytics for closing period data THEN write analytics to `CACHE_DIR/snapshots/{lastDayOfDataMonth}/analytics/`
   */
  describe('Closing Period Pipeline Integration', () => {
    /**
     * Helper function to write cache metadata for closing period detection.
     * Creates the metadata.json file in the raw-csv directory.
     */
    async function writeCacheMetadata(
      cacheDir: string,
      date: string,
      metadata: {
        date: string
        isClosingPeriod?: boolean
        dataMonth?: string
      }
    ): Promise<void> {
      const rawCsvDir = path.join(cacheDir, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      )
    }

    /**
     * Integration test for full compute-analytics flow with closing period
     *
     * This test verifies the complete pipeline when handling closing period data:
     * 1. Sets up cache metadata indicating a closing period (January 5th collection, December data)
     * 2. Creates raw CSV files at the collection date
     * 3. Runs transform which creates snapshot at adjusted date (December 31)
     * 4. Runs compute-analytics with original requested date (January 5th)
     * 5. Verifies analytics are computed successfully using adjusted snapshot date
     * 6. Verifies analytics are written to correct directory (alongside December 31 snapshot)
     *
     * Requirements: 7.2, 8.1
     */
    it('should complete full pipeline for closing period data (Requirements 7.2, 8.1)', async () => {
      // Scenario: January 5th collection date, December data month
      const collectionDate = '2025-01-05' // When data was collected (As of date)
      const adjustedSnapshotDate = '2024-12-31' // Where snapshot should be stored
      const districtId = '1'

      // Step 1: Write cache metadata indicating closing period
      await writeCacheMetadata(testCache.path, collectionDate, {
        date: collectionDate,
        isClosingPeriod: true,
        dataMonth: '2024-12',
      })

      // Step 2: Write raw CSV files at the collection date
      await writeRawCSVFiles(
        testCache.path,
        collectionDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Step 3: Run transform - should create snapshot at adjusted date (2024-12-31)
      const transformResult = await transformService.transform({
        date: collectionDate,
      })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toContain(districtId)

      // Verify snapshot was created at the adjusted date (last day of data month)
      const snapshotDir = path.join(
        testCache.path,
        'snapshots',
        adjustedSnapshotDate
      )
      const snapshotExists = await fs
        .access(snapshotDir)
        .then(() => true)
        .catch(() => false)
      expect(snapshotExists).toBe(true)

      // Verify snapshot was NOT created at the collection date
      const wrongSnapshotDir = path.join(
        testCache.path,
        'snapshots',
        collectionDate
      )
      const wrongSnapshotExists = await fs
        .access(wrongSnapshotDir)
        .then(() => true)
        .catch(() => false)
      expect(wrongSnapshotExists).toBe(false)

      // Step 4: Run compute-analytics with original requested date (collection date)
      // The service should detect closing period and look for snapshot at adjusted date
      const computeResult = await analyticsComputeService.compute({
        date: collectionDate,
      })

      // Step 5: Verify analytics computed successfully
      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toContain(districtId)
      expect(computeResult.date).toBe(adjustedSnapshotDate) // Actual snapshot date used
      expect(computeResult.requestedDate).toBe(collectionDate) // Original requested date
      expect(computeResult.isClosingPeriod).toBe(true)
      expect(computeResult.dataMonth).toBe('2024-12')

      // Step 6: Verify analytics written to correct directory (alongside snapshot)
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        adjustedSnapshotDate,
        'analytics'
      )
      const analyticsFiles = await fs.readdir(analyticsDir)

      // Verify analytics files exist
      expect(analyticsFiles).toContain(`district_${districtId}_analytics.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_membership.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_clubhealth.json`)
      expect(analyticsFiles).toContain('manifest.json')

      // Verify analytics were NOT written to the collection date directory
      const wrongAnalyticsDir = path.join(
        testCache.path,
        'snapshots',
        collectionDate,
        'analytics'
      )
      const wrongAnalyticsExists = await fs
        .access(wrongAnalyticsDir)
        .then(() => true)
        .catch(() => false)
      expect(wrongAnalyticsExists).toBe(false)

      // Verify analytics file content has correct metadata
      const analyticsPath = path.join(
        analyticsDir,
        `district_${districtId}_analytics.json`
      )
      const analyticsContent = await fs.readFile(analyticsPath, 'utf-8')
      const analytics = JSON.parse(
        analyticsContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      expect(analytics.metadata.snapshotDate).toBe(adjustedSnapshotDate)
      expect(analytics.metadata.districtId).toBe(districtId)
      expect(analytics.data.districtId).toBe(districtId)
    })

    /**
     * Integration test for cross-year closing period scenario
     *
     * Tests the specific case where December data is collected in January,
     * requiring the snapshot to be dated December 31 of the PRIOR year.
     *
     * Requirements: 7.2, 8.1
     */
    it('should handle cross-year closing period (December data in January)', async () => {
      // Scenario: January 3rd 2025 collection, December 2024 data
      const collectionDate = '2025-01-03'
      const adjustedSnapshotDate = '2024-12-31' // December 31 of PRIOR year
      const districtId = '1'

      // Setup closing period metadata
      await writeCacheMetadata(testCache.path, collectionDate, {
        date: collectionDate,
        isClosingPeriod: true,
        dataMonth: '2024-12',
      })

      // Write raw CSV files
      await writeRawCSVFiles(
        testCache.path,
        collectionDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Run transform
      const transformResult = await transformService.transform({
        date: collectionDate,
      })
      expect(transformResult.success).toBe(true)

      // Run compute-analytics
      const computeResult = await analyticsComputeService.compute({
        date: collectionDate,
      })

      // Verify success and correct date handling
      expect(computeResult.success).toBe(true)
      expect(computeResult.date).toBe('2024-12-31') // December 31 of 2024
      expect(computeResult.requestedDate).toBe('2025-01-03') // January 3 of 2025
      expect(computeResult.isClosingPeriod).toBe(true)

      // Verify analytics at correct location
      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        '2024-12-31',
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const analyticsExists = await fs
        .access(analyticsPath)
        .then(() => true)
        .catch(() => false)
      expect(analyticsExists).toBe(true)
    })

    /**
     * Integration test for multiple districts during closing period
     *
     * Verifies that the closing period handling works correctly when
     * processing multiple districts in a single pipeline run.
     *
     * Requirements: 7.2, 8.1
     */
    it('should handle closing period with multiple districts', async () => {
      const collectionDate = '2025-01-05'
      const adjustedSnapshotDate = '2024-12-31'
      const districts = ['1', '2', '3']

      // Setup closing period metadata
      await writeCacheMetadata(testCache.path, collectionDate, {
        date: collectionDate,
        isClosingPeriod: true,
        dataMonth: '2024-12',
      })

      // Write raw CSV files for all districts
      await writeRawCSVFiles(
        testCache.path,
        collectionDate,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await writeRawCSVFiles(
        testCache.path,
        collectionDate,
        '2',
        SAMPLE_CLUB_CSV_DISTRICT_2
      )
      await writeRawCSVFiles(
        testCache.path,
        collectionDate,
        '3',
        SAMPLE_CLUB_CSV_DISTRICT_3
      )

      // Run transform
      const transformResult = await transformService.transform({
        date: collectionDate,
      })
      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toEqual(districts)

      // Run compute-analytics
      const computeResult = await analyticsComputeService.compute({
        date: collectionDate,
      })

      // Verify all districts processed successfully
      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toEqual(districts)
      expect(computeResult.date).toBe(adjustedSnapshotDate)

      // Verify analytics files for all districts at correct location
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        adjustedSnapshotDate,
        'analytics'
      )
      const analyticsFiles = await fs.readdir(analyticsDir)

      for (const districtId of districts) {
        expect(analyticsFiles).toContain(
          `district_${districtId}_analytics.json`
        )
        expect(analyticsFiles).toContain(
          `district_${districtId}_membership.json`
        )
        expect(analyticsFiles).toContain(
          `district_${districtId}_clubhealth.json`
        )
      }
    })

    /**
     * Integration test for February closing period with leap year
     *
     * Verifies correct handling of February data in a leap year,
     * where the last day should be February 29.
     *
     * Requirements: 7.2, 8.1
     */
    it('should handle February closing period in leap year correctly', async () => {
      // Scenario: March 5th 2024 collection, February 2024 data (leap year)
      const collectionDate = '2024-03-05'
      const adjustedSnapshotDate = '2024-02-29' // Leap year - 29 days
      const districtId = '1'

      // Setup closing period metadata
      await writeCacheMetadata(testCache.path, collectionDate, {
        date: collectionDate,
        isClosingPeriod: true,
        dataMonth: '2024-02',
      })

      // Write raw CSV files
      await writeRawCSVFiles(
        testCache.path,
        collectionDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Run transform
      const transformResult = await transformService.transform({
        date: collectionDate,
      })
      expect(transformResult.success).toBe(true)

      // Run compute-analytics
      const computeResult = await analyticsComputeService.compute({
        date: collectionDate,
      })

      // Verify correct leap year handling
      expect(computeResult.success).toBe(true)
      expect(computeResult.date).toBe('2024-02-29') // February 29 (leap year)

      // Verify analytics at correct location
      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        '2024-02-29',
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const analyticsExists = await fs
        .access(analyticsPath)
        .then(() => true)
        .catch(() => false)
      expect(analyticsExists).toBe(true)
    })

    /**
     * Integration test verifying snapshot metadata contains closing period fields
     *
     * Verifies that the snapshot metadata.json includes the closing period
     * information for downstream consumers.
     *
     * Requirements: 7.2, 8.1
     */
    it('should include closing period fields in snapshot metadata', async () => {
      const collectionDate = '2025-01-05'
      const adjustedSnapshotDate = '2024-12-31'
      const districtId = '1'

      // Setup closing period
      await writeCacheMetadata(testCache.path, collectionDate, {
        date: collectionDate,
        isClosingPeriod: true,
        dataMonth: '2024-12',
      })

      await writeRawCSVFiles(
        testCache.path,
        collectionDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Run transform
      await transformService.transform({ date: collectionDate })

      // Read snapshot metadata
      const metadataPath = path.join(
        testCache.path,
        'snapshots',
        adjustedSnapshotDate,
        'metadata.json'
      )
      const metadataContent = await fs.readFile(metadataPath, 'utf-8')
      const metadata = JSON.parse(metadataContent) as {
        snapshotId: string
        isClosingPeriodData?: boolean
        collectionDate?: string
        logicalDate?: string
      }

      // Verify closing period fields in snapshot metadata
      expect(metadata.snapshotId).toBe(adjustedSnapshotDate)
      expect(metadata.isClosingPeriodData).toBe(true)
      expect(metadata.collectionDate).toBe(collectionDate)
      expect(metadata.logicalDate).toBe(adjustedSnapshotDate)
    })
  })

  /**
   * Non-Closing Period Integration Tests
   *
   * Tests the full pipeline flow when handling regular (non-closing period) data.
   * When cache metadata has `isClosingPeriod: false` or is missing entirely,
   * the pipeline should use the requested date directly without adjustment.
   *
   * Requirements:
   * - 7.4: WHEN `isClosingPeriod` is false or undefined THEN look for snapshots at the requested date
   * - 8.3: WHEN computing analytics for non-closing-period data THEN write analytics to `CACHE_DIR/snapshots/{requestedDate}/analytics/`
   */
  describe('Non-Closing Period Pipeline Integration', () => {
    /**
     * Helper function to write cache metadata for non-closing period scenarios.
     * Creates the metadata.json file in the raw-csv directory.
     */
    async function writeCacheMetadata(
      cacheDir: string,
      date: string,
      metadata: {
        date: string
        isClosingPeriod?: boolean
        dataMonth?: string
      }
    ): Promise<void> {
      const rawCsvDir = path.join(cacheDir, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      )
    }

    /**
     * Integration test for non-closing period with isClosingPeriod: false
     *
     * This test verifies the pipeline behavior when cache metadata explicitly
     * indicates this is NOT a closing period (isClosingPeriod: false).
     * The snapshot and analytics should be stored at the requested date.
     *
     * Requirements: 7.4, 8.3
     */
    it('should use requested date when isClosingPeriod is false (Requirements 7.4, 8.3)', async () => {
      const requestedDate = '2024-06-15' // Mid-month date (not a closing period)
      const districtId = '1'

      // Step 1: Write cache metadata with isClosingPeriod: false
      await writeCacheMetadata(testCache.path, requestedDate, {
        date: requestedDate,
        isClosingPeriod: false,
        dataMonth: '2024-06',
      })

      // Step 2: Write raw CSV files at the requested date
      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Step 3: Run transform - should create snapshot at requested date (no adjustment)
      const transformResult = await transformService.transform({
        date: requestedDate,
      })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toContain(districtId)

      // Verify snapshot was created at the requested date (not adjusted)
      const snapshotDir = path.join(testCache.path, 'snapshots', requestedDate)
      const snapshotExists = await fs
        .access(snapshotDir)
        .then(() => true)
        .catch(() => false)
      expect(snapshotExists).toBe(true)

      // Step 4: Run compute-analytics with the same requested date
      const computeResult = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Step 5: Verify analytics computed successfully at requested date
      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toContain(districtId)
      expect(computeResult.date).toBe(requestedDate) // Should be the requested date
      expect(computeResult.requestedDate).toBe(requestedDate) // Same as date
      expect(computeResult.isClosingPeriod).toBe(false)

      // Step 6: Verify analytics written to correct directory (at requested date)
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        requestedDate,
        'analytics'
      )
      const analyticsFiles = await fs.readdir(analyticsDir)

      // Verify analytics files exist at requested date
      expect(analyticsFiles).toContain(`district_${districtId}_analytics.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_membership.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_clubhealth.json`)
      expect(analyticsFiles).toContain('manifest.json')

      // Verify analytics file content has correct metadata
      const analyticsPath = path.join(
        analyticsDir,
        `district_${districtId}_analytics.json`
      )
      const analyticsContent = await fs.readFile(analyticsPath, 'utf-8')
      const analytics = JSON.parse(
        analyticsContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      expect(analytics.metadata.snapshotDate).toBe(requestedDate)
      expect(analytics.metadata.districtId).toBe(districtId)
    })

    /**
     * Integration test for non-closing period with missing cache metadata
     *
     * This test verifies the pipeline behavior when cache metadata is missing entirely.
     * The pipeline should fall back to non-closing-period behavior and use the requested date.
     *
     * Requirements: 7.4, 8.3
     */
    it('should use requested date when cache metadata is missing (Requirements 7.4, 8.3)', async () => {
      const requestedDate = '2024-07-20' // Mid-month date
      const districtId = '1'

      // Step 1: Write raw CSV files WITHOUT cache metadata
      // (No writeCacheMetadata call - metadata.json does not exist)
      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Step 2: Run transform - should create snapshot at requested date
      const transformResult = await transformService.transform({
        date: requestedDate,
      })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toContain(districtId)

      // Verify snapshot was created at the requested date
      const snapshotDir = path.join(testCache.path, 'snapshots', requestedDate)
      const snapshotExists = await fs
        .access(snapshotDir)
        .then(() => true)
        .catch(() => false)
      expect(snapshotExists).toBe(true)

      // Step 3: Run compute-analytics with the same requested date
      const computeResult = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Step 4: Verify analytics computed successfully at requested date
      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toContain(districtId)
      expect(computeResult.date).toBe(requestedDate) // Should be the requested date
      expect(computeResult.requestedDate).toBe(requestedDate) // Same as date
      expect(computeResult.isClosingPeriod).toBe(false) // Default to false when metadata missing

      // Step 5: Verify analytics written to correct directory (at requested date)
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        requestedDate,
        'analytics'
      )
      const analyticsFiles = await fs.readdir(analyticsDir)

      // Verify analytics files exist at requested date
      expect(analyticsFiles).toContain(`district_${districtId}_analytics.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_membership.json`)
      expect(analyticsFiles).toContain(`district_${districtId}_clubhealth.json`)
      expect(analyticsFiles).toContain('manifest.json')
    })

    /**
     * Integration test for non-closing period with isClosingPeriod: undefined
     *
     * This test verifies the pipeline behavior when cache metadata exists but
     * isClosingPeriod is undefined (not set). Should behave as non-closing period.
     *
     * Requirements: 7.4, 8.3
     */
    it('should use requested date when isClosingPeriod is undefined (Requirements 7.4, 8.3)', async () => {
      const requestedDate = '2024-08-10' // Mid-month date
      const districtId = '1'

      // Step 1: Write cache metadata WITHOUT isClosingPeriod field
      await writeCacheMetadata(testCache.path, requestedDate, {
        date: requestedDate,
        // isClosingPeriod is intentionally omitted (undefined)
        dataMonth: '2024-08',
      })

      // Step 2: Write raw CSV files
      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Step 3: Run transform - should create snapshot at requested date
      const transformResult = await transformService.transform({
        date: requestedDate,
      })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toContain(districtId)

      // Verify snapshot was created at the requested date
      const snapshotDir = path.join(testCache.path, 'snapshots', requestedDate)
      const snapshotExists = await fs
        .access(snapshotDir)
        .then(() => true)
        .catch(() => false)
      expect(snapshotExists).toBe(true)

      // Step 4: Run compute-analytics
      const computeResult = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Step 5: Verify analytics computed at requested date
      expect(computeResult.success).toBe(true)
      expect(computeResult.date).toBe(requestedDate)
      expect(computeResult.isClosingPeriod).toBe(false)

      // Step 6: Verify analytics at correct location
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        requestedDate,
        'analytics'
      )
      const analyticsFiles = await fs.readdir(analyticsDir)
      expect(analyticsFiles).toContain(`district_${districtId}_analytics.json`)
    })

    /**
     * Integration test for non-closing period with multiple districts
     *
     * Verifies that non-closing period handling works correctly when
     * processing multiple districts in a single pipeline run.
     *
     * Requirements: 7.4, 8.3
     */
    it('should handle non-closing period with multiple districts (Requirements 7.4, 8.3)', async () => {
      const requestedDate = '2024-09-15'
      const districts = ['1', '2', '3']

      // Setup non-closing period metadata
      await writeCacheMetadata(testCache.path, requestedDate, {
        date: requestedDate,
        isClosingPeriod: false,
        dataMonth: '2024-09',
      })

      // Write raw CSV files for all districts
      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        '1',
        SAMPLE_CLUB_CSV_DISTRICT_1
      )
      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        '2',
        SAMPLE_CLUB_CSV_DISTRICT_2
      )
      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        '3',
        SAMPLE_CLUB_CSV_DISTRICT_3
      )

      // Run transform
      const transformResult = await transformService.transform({
        date: requestedDate,
      })
      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toEqual(districts)

      // Run compute-analytics
      const computeResult = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Verify all districts processed successfully at requested date
      expect(computeResult.success).toBe(true)
      expect(computeResult.districtsSucceeded).toEqual(districts)
      expect(computeResult.date).toBe(requestedDate) // No date adjustment

      // Verify analytics files for all districts at requested date
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        requestedDate,
        'analytics'
      )
      const analyticsFiles = await fs.readdir(analyticsDir)

      for (const districtId of districts) {
        expect(analyticsFiles).toContain(
          `district_${districtId}_analytics.json`
        )
        expect(analyticsFiles).toContain(
          `district_${districtId}_membership.json`
        )
        expect(analyticsFiles).toContain(
          `district_${districtId}_clubhealth.json`
        )
      }
    })

    /**
     * Integration test verifying snapshot metadata does NOT contain closing period fields
     *
     * Verifies that the snapshot metadata.json does NOT include closing period
     * information when the data is not from a closing period.
     *
     * Requirements: 7.4, 8.3
     */
    it('should NOT include closing period fields in snapshot metadata for non-closing period', async () => {
      const requestedDate = '2024-10-20'
      const districtId = '1'

      // Setup non-closing period
      await writeCacheMetadata(testCache.path, requestedDate, {
        date: requestedDate,
        isClosingPeriod: false,
        dataMonth: '2024-10',
      })

      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Run transform
      await transformService.transform({ date: requestedDate })

      // Read snapshot metadata
      const metadataPath = path.join(
        testCache.path,
        'snapshots',
        requestedDate,
        'metadata.json'
      )
      const metadataContent = await fs.readFile(metadataPath, 'utf-8')
      const metadata = JSON.parse(metadataContent) as {
        snapshotId: string
        isClosingPeriodData?: boolean
        collectionDate?: string
        logicalDate?: string
      }

      // Verify snapshot is at requested date
      expect(metadata.snapshotId).toBe(requestedDate)

      // Verify closing period fields are NOT set (or are false/undefined)
      expect(metadata.isClosingPeriodData).toBeFalsy()
      expect(metadata.collectionDate).toBeUndefined()
      expect(metadata.logicalDate).toBeUndefined()
    })

    /**
     * Integration test for end-of-month date that is NOT a closing period
     *
     * Verifies that even when the requested date is the last day of a month,
     * if isClosingPeriod is false, no date adjustment occurs.
     *
     * Requirements: 7.4, 8.3
     */
    it('should NOT adjust date for end-of-month when isClosingPeriod is false', async () => {
      // Even though this is the last day of the month, it's not a closing period
      const requestedDate = '2024-11-30' // Last day of November
      const districtId = '1'

      // Explicitly mark as NOT a closing period
      await writeCacheMetadata(testCache.path, requestedDate, {
        date: requestedDate,
        isClosingPeriod: false,
        dataMonth: '2024-11',
      })

      await writeRawCSVFiles(
        testCache.path,
        requestedDate,
        districtId,
        SAMPLE_CLUB_CSV_DISTRICT_1
      )

      // Run transform
      const transformResult = await transformService.transform({
        date: requestedDate,
      })
      expect(transformResult.success).toBe(true)

      // Run compute-analytics
      const computeResult = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Verify no date adjustment occurred
      expect(computeResult.success).toBe(true)
      expect(computeResult.date).toBe(requestedDate) // Same as requested
      expect(computeResult.requestedDate).toBe(requestedDate)
      expect(computeResult.isClosingPeriod).toBe(false)

      // Verify analytics at the requested date (not adjusted)
      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        requestedDate,
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const analyticsExists = await fs
        .access(analyticsPath)
        .then(() => true)
        .catch(() => false)
      expect(analyticsExists).toBe(true)
    })
  })
})
