/**
 * Unit Tests for AnalyticsComputeService
 *
 * Tests the analytics computation pipeline that loads snapshot data,
 * computes analytics using the shared AnalyticsComputer, and writes
 * the results using AnalyticsWriter.
 *
 * Requirements:
 * - 1.2: WHEN snapshots are created, THE Collector_CLI SHALL compute analytics
 *        for each district using the same algorithms as the Analytics_Engine
 * - 1.3: WHEN computing analytics, THE Collector_CLI SHALL generate membership
 *        trends, club health scores, distinguished club projections,
 *        division/area comparisons, and year-over-year metrics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import {
  ANALYTICS_SCHEMA_VERSION,
  ClubHealthAnalyticsModule,
  type DistrictStatistics,
  type PreComputedAnalyticsFile,
  type DistrictAnalytics,
  type MembershipTrendData,
  type ClubHealthData,
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
  const cachePath = path.join(os.tmpdir(), `analytics-compute-test-${uniqueId}`)

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
      {
        clubId: '9012',
        clubName: 'Test Club Three',
        divisionId: 'B',
        areaId: 'B1',
        divisionName: 'Division Beta',
        areaName: 'Area B1',
        membershipCount: 8,
        paymentsCount: 10,
        dcpGoals: 2,
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
        membershipTotal: 40,
        paymentsTotal: 48,
      },
      {
        divisionId: 'B',
        divisionName: 'Division Beta',
        clubCount: 1,
        membershipTotal: 8,
        paymentsTotal: 10,
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
      {
        areaId: 'B1',
        areaName: 'Area B1',
        divisionId: 'B',
        clubCount: 1,
        membershipTotal: 8,
        paymentsTotal: 10,
      },
    ],
    totals: {
      totalClubs: 3,
      totalMembership: 48,
      totalPayments: 58,
      distinguishedClubs: 1,
      selectDistinguishedClubs: 0,
      presidentDistinguishedClubs: 0,
    },
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
 * Mock logger for capturing log messages in tests
 */
function createMockLogger(): {
  logger: {
    info: (msg: string, data?: unknown) => void
    warn: (msg: string, data?: unknown) => void
    error: (msg: string, data?: unknown) => void
    debug: (msg: string, data?: unknown) => void
  }
  warnings: Array<{ message: string; data?: unknown }>
  errors: Array<{ message: string; data?: unknown }>
} {
  const warnings: Array<{ message: string; data?: unknown }> = []
  const errors: Array<{ message: string; data?: unknown }> = []

  return {
    logger: {
      info: () => {},
      warn: (msg: string, data?: unknown) => {
        warnings.push({ message: msg, data })
      },
      error: (msg: string, data?: unknown) => {
        errors.push({ message: msg, data })
      },
      debug: () => {},
    },
    warnings,
    errors,
  }
}

describe('AnalyticsComputeService', () => {
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

  describe('getAnalyticsDir', () => {
    it('should return correct analytics directory path', () => {
      const date = '2024-01-15'
      const analyticsDir = analyticsComputeService.getAnalyticsDir(date)

      expect(analyticsDir).toBe(
        path.join(testCache.path, 'snapshots', date, 'analytics')
      )
    })
  })

  /**
   * Unit tests for readCacheMetadata method
   *
   * Requirements:
   * - 6.1: WHEN computing analytics for a date THEN the AnalyticsComputeService SHALL read
   *        the cache metadata from `CACHE_DIR/raw-csv/{date}/metadata.json`
   * - 6.2: WHEN cache metadata exists with `isClosingPeriod: true` THEN the AnalyticsComputeService
   *        SHALL extract `isClosingPeriod` and `dataMonth` fields
   * - 6.3: WHEN cache metadata does not exist THEN the AnalyticsComputeService SHALL look for
   *        snapshots at the requested date
   * - 6.4: IF reading cache metadata fails THEN the AnalyticsComputeService SHALL log a warning
   *        and continue with non-closing-period behavior
   */
  describe('readCacheMetadata', () => {
    it('should read valid metadata with isClosingPeriod true and dataMonth fields', async () => {
      // Requirement 6.1, 6.2: Read cache metadata and extract closing period fields
      const date = '2025-01-05'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      const metadata = {
        date: '2025-01-05',
        isClosingPeriod: true,
        dataMonth: '2024-12',
      }
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata)
      )

      const result = await analyticsComputeService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2025-01-05')
      expect(result?.isClosingPeriod).toBe(true)
      expect(result?.dataMonth).toBe('2024-12')
    })

    it('should read valid metadata with isClosingPeriod false', async () => {
      // Requirement 6.2: Extract isClosingPeriod field when false
      const date = '2024-06-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      const metadata = {
        date: '2024-06-15',
        isClosingPeriod: false,
      }
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata)
      )

      const result = await analyticsComputeService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2024-06-15')
      expect(result?.isClosingPeriod).toBe(false)
      expect(result?.dataMonth).toBeUndefined()
    })

    it('should return null when metadata file does not exist', async () => {
      // Requirement 6.3: When cache metadata does not exist, return null
      // (service will then look for snapshots at the requested date)
      const date = '2024-01-15'
      // Don't create the metadata file

      const result = await analyticsComputeService.readCacheMetadata(date)

      expect(result).toBeNull()
    })

    it('should return null and log warning when metadata contains invalid JSON', async () => {
      // Requirement 6.4: Log warning and continue with non-closing-period behavior
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      // Write invalid JSON
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        '{ invalid json content'
      )

      // Create service with mock logger to verify warning
      const mockLogger = createMockLogger()
      const serviceWithLogger = new AnalyticsComputeService({
        cacheDir: testCache.path,
        logger: mockLogger.logger,
      })

      const result = await serviceWithLogger.readCacheMetadata(date)

      expect(result).toBeNull()
      expect(mockLogger.warnings.length).toBeGreaterThan(0)
      expect(mockLogger.warnings[0]?.message).toBe(
        'Failed to read cache metadata'
      )
    })

    it('should handle metadata with missing optional fields', async () => {
      // Requirement 6.2: Extract fields when some are missing
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      // Metadata with only date field
      const metadata = {
        date: '2024-01-15',
      }
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata)
      )

      const result = await analyticsComputeService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2024-01-15')
      expect(result?.isClosingPeriod).toBeUndefined()
      expect(result?.dataMonth).toBeUndefined()
    })

    it('should use requested date when metadata date field is missing', async () => {
      // Requirement 6.2: Handle edge case where date field is missing
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      // Metadata without date field
      const metadata = {
        isClosingPeriod: true,
        dataMonth: '2024-12',
      }
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata)
      )

      const result = await analyticsComputeService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe(date) // Falls back to requested date
      expect(result?.isClosingPeriod).toBe(true)
      expect(result?.dataMonth).toBe('2024-12')
    })

    it('should return null and log warning when metadata is null JSON', async () => {
      // Requirement 6.4: Handle null JSON value
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      await fs.writeFile(path.join(rawCsvDir, 'metadata.json'), 'null')

      const mockLogger = createMockLogger()
      const serviceWithLogger = new AnalyticsComputeService({
        cacheDir: testCache.path,
        logger: mockLogger.logger,
      })

      const result = await serviceWithLogger.readCacheMetadata(date)

      expect(result).toBeNull()
      expect(mockLogger.warnings.length).toBeGreaterThan(0)
    })

    it('should ignore fields with wrong types', async () => {
      // Requirement 6.2: Type validation for extracted fields
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      // Metadata with wrong types for optional fields
      const metadata = {
        date: '2024-01-15',
        isClosingPeriod: 'yes', // Should be boolean
        dataMonth: 12, // Should be string
      }
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata)
      )

      const result = await analyticsComputeService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2024-01-15')
      // Wrong types should result in undefined
      expect(result?.isClosingPeriod).toBeUndefined()
      expect(result?.dataMonth).toBeUndefined()
    })
  })

  /**
   * Unit tests for determineSnapshotDate method
   *
   * Tests the snapshot date determination logic based on closing period detection.
   * The AnalyticsComputeService uses ClosingPeriodDetector to determine the correct
   * snapshot location when computing analytics.
   *
   * Requirements:
   * - 7.1: WHEN `isClosingPeriod` is true THEN calculate the last day of the data month
   *        using the existing ClosingPeriodDetector utility
   * - 7.2: WHEN `isClosingPeriod` is true THEN look for snapshots at
   *        `CACHE_DIR/snapshots/{lastDayOfDataMonth}/`
   * - 7.3: WHEN the data month is December and collection date is in January THEN
   *        look for snapshots dated December 31 of prior year
   * - 7.4: WHEN `isClosingPeriod` is false or undefined THEN look for snapshots at
   *        the requested date
   */
  describe('determineSnapshotDate', () => {
    it('should return last day of data month for closing period metadata (Requirement 7.1, 7.2)', () => {
      // Closing period: January 5th collection date, December data month
      const requestedDate = '2025-01-05'
      const metadata = {
        date: '2025-01-05',
        isClosingPeriod: true,
        dataMonth: '2024-12',
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2024-12-31') // Last day of December
      expect(result.dataMonth).toBe('2024-12')
      expect(result.collectionDate).toBe('2025-01-05')
      expect(result.logicalDate).toBe('2024-12-31')
    })

    it('should return requested date for non-closing period metadata (Requirement 7.4)', () => {
      // Non-closing period: regular mid-month data
      const requestedDate = '2024-06-15'
      const metadata = {
        date: '2024-06-15',
        isClosingPeriod: false,
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      expect(result.isClosingPeriod).toBe(false)
      expect(result.snapshotDate).toBe('2024-06-15') // Same as requested
      expect(result.collectionDate).toBe('2024-06-15')
      expect(result.logicalDate).toBe('2024-06-15')
    })

    it('should return requested date when metadata is null (Requirement 7.4)', () => {
      // No metadata available - treat as non-closing period
      const requestedDate = '2024-06-15'

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        null
      )

      expect(result.isClosingPeriod).toBe(false)
      expect(result.snapshotDate).toBe('2024-06-15')
      expect(result.collectionDate).toBe('2024-06-15')
    })

    it('should handle cross-year scenario - December data in January (Requirement 7.3)', () => {
      // Cross-year: January 2025 collection, December 2024 data
      const requestedDate = '2025-01-03'
      const metadata = {
        date: '2025-01-03',
        isClosingPeriod: true,
        dataMonth: '2024-12',
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2024-12-31') // December 31 of PRIOR year
      expect(result.dataMonth).toBe('2024-12')
      expect(result.collectionDate).toBe('2025-01-03')
    })

    it('should handle cross-year with MM format data month (Requirement 7.3)', () => {
      // Cross-year with short format: "12" means December of prior year when collected in January
      const requestedDate = '2025-01-05'
      const metadata = {
        date: '2025-01-05',
        isClosingPeriod: true,
        dataMonth: '12', // Short format - should infer 2024
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2024-12-31') // December 31 of 2024
      expect(result.dataMonth).toBe('2024-12')
    })

    it('should handle February closing period with leap year', () => {
      // February closing period in a leap year (2024)
      const requestedDate = '2024-03-05'
      const metadata = {
        date: '2024-03-05',
        isClosingPeriod: true,
        dataMonth: '2024-02',
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2024-02-29') // Leap year - 29 days
      expect(result.dataMonth).toBe('2024-02')
    })

    it('should handle February closing period with non-leap year', () => {
      // February closing period in a non-leap year (2023)
      const requestedDate = '2023-03-05'
      const metadata = {
        date: '2023-03-05',
        isClosingPeriod: true,
        dataMonth: '2023-02',
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2023-02-28') // Non-leap year - 28 days
      expect(result.dataMonth).toBe('2023-02')
    })

    it('should return requested date when isClosingPeriod is undefined (Requirement 7.4)', () => {
      // Metadata exists but isClosingPeriod is not set
      const requestedDate = '2024-06-15'
      const metadata = {
        date: '2024-06-15',
        // isClosingPeriod not set
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      expect(result.isClosingPeriod).toBe(false)
      expect(result.snapshotDate).toBe('2024-06-15')
    })

    it('should return requested date when dataMonth is missing for closing period', () => {
      // Closing period flag set but no dataMonth - cannot determine snapshot date
      const requestedDate = '2025-01-05'
      const metadata = {
        date: '2025-01-05',
        isClosingPeriod: true,
        // dataMonth missing
      }

      const result = analyticsComputeService.determineSnapshotDate(
        requestedDate,
        metadata
      )

      // Without dataMonth, falls back to non-closing period behavior
      expect(result.isClosingPeriod).toBe(false)
      expect(result.snapshotDate).toBe('2025-01-05')
    })
  })

  /**
   * Unit tests for compute() method closing period snapshot lookup
   *
   * Tests that the compute() method correctly uses closing period detection
   * to find snapshots at the adjusted date location.
   *
   * Requirements:
   * - 7.1: WHEN `isClosingPeriod` is true THEN calculate the last day of the data month
   * - 7.2: WHEN `isClosingPeriod` is true THEN look for snapshots at adjusted date
   * - 7.3: WHEN the data month is December and collection date is in January THEN
   *        look for snapshots dated December 31 of prior year
   * - 7.4: WHEN `isClosingPeriod` is false or undefined THEN look for snapshots at
   *        the requested date
   */
  describe('compute() closing period snapshot lookup', () => {
    it('should look for snapshot at last day of data month during closing period (Requirement 7.1, 7.2)', async () => {
      // Setup: Create cache metadata indicating closing period
      const requestedDate = '2025-01-05'
      const snapshotDate = '2024-12-31' // Where snapshot should be found
      const districtId = '1'

      // Create cache metadata for the requested date
      const rawCsvDir = path.join(testCache.path, 'raw-csv', requestedDate)
      await fs.mkdir(rawCsvDir, { recursive: true })
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify({
          date: requestedDate,
          isClosingPeriod: true,
          dataMonth: '2024-12',
        })
      )

      // Create snapshot at the adjusted date (last day of data month)
      await writeDistrictSnapshot(
        testCache.path,
        snapshotDate,
        districtId,
        createSampleDistrictStatistics(districtId, snapshotDate)
      )

      // Run compute with the requested date
      const result = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Should succeed by finding snapshot at adjusted date
      expect(result.success).toBe(true)
      expect(result.date).toBe(snapshotDate) // Actual snapshot date used
      expect(result.requestedDate).toBe(requestedDate) // Original requested date
      expect(result.isClosingPeriod).toBe(true)
      expect(result.dataMonth).toBe('2024-12')
      expect(result.districtsSucceeded).toContain(districtId)
    })

    it('should look for snapshot at requested date for non-closing period (Requirement 7.4)', async () => {
      // Setup: Create cache metadata indicating non-closing period
      const requestedDate = '2024-06-15'
      const districtId = '1'

      // Create cache metadata for the requested date
      const rawCsvDir = path.join(testCache.path, 'raw-csv', requestedDate)
      await fs.mkdir(rawCsvDir, { recursive: true })
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify({
          date: requestedDate,
          isClosingPeriod: false,
        })
      )

      // Create snapshot at the requested date
      await writeDistrictSnapshot(
        testCache.path,
        requestedDate,
        districtId,
        createSampleDistrictStatistics(districtId, requestedDate)
      )

      // Run compute
      const result = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Should succeed by finding snapshot at requested date
      expect(result.success).toBe(true)
      expect(result.date).toBe(requestedDate)
      expect(result.requestedDate).toBe(requestedDate)
      expect(result.isClosingPeriod).toBe(false)
      expect(result.dataMonth).toBeUndefined()
      expect(result.districtsSucceeded).toContain(districtId)
    })

    it('should look for snapshot at requested date when metadata is missing (Requirement 7.4)', async () => {
      // Setup: No cache metadata exists
      const requestedDate = '2024-06-15'
      const districtId = '1'

      // Create snapshot at the requested date (no metadata)
      await writeDistrictSnapshot(
        testCache.path,
        requestedDate,
        districtId,
        createSampleDistrictStatistics(districtId, requestedDate)
      )

      // Run compute
      const result = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Should succeed by finding snapshot at requested date
      expect(result.success).toBe(true)
      expect(result.date).toBe(requestedDate)
      expect(result.isClosingPeriod).toBe(false)
      expect(result.districtsSucceeded).toContain(districtId)
    })

    it('should handle cross-year scenario - December data in January (Requirement 7.3)', async () => {
      // Setup: January collection date, December data month (cross-year)
      const requestedDate = '2025-01-03'
      const snapshotDate = '2024-12-31' // December 31 of PRIOR year
      const districtId = '1'

      // Create cache metadata for the requested date
      const rawCsvDir = path.join(testCache.path, 'raw-csv', requestedDate)
      await fs.mkdir(rawCsvDir, { recursive: true })
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify({
          date: requestedDate,
          isClosingPeriod: true,
          dataMonth: '2024-12',
        })
      )

      // Create snapshot at December 31 of prior year
      await writeDistrictSnapshot(
        testCache.path,
        snapshotDate,
        districtId,
        createSampleDistrictStatistics(districtId, snapshotDate)
      )

      // Run compute with January date
      const result = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Should succeed by finding snapshot at December 31 of prior year
      expect(result.success).toBe(true)
      expect(result.date).toBe('2024-12-31')
      expect(result.requestedDate).toBe('2025-01-03')
      expect(result.isClosingPeriod).toBe(true)
      expect(result.dataMonth).toBe('2024-12')
    })

    it('should fail with helpful error when closing period snapshot not found', async () => {
      // Setup: Closing period metadata but no snapshot at adjusted date
      const requestedDate = '2025-01-05'
      const districtId = '1'

      // Create cache metadata for the requested date
      const rawCsvDir = path.join(testCache.path, 'raw-csv', requestedDate)
      await fs.mkdir(rawCsvDir, { recursive: true })
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify({
          date: requestedDate,
          isClosingPeriod: true,
          dataMonth: '2024-12',
        })
      )

      // Create snapshot at WRONG date (requested date instead of adjusted)
      await writeDistrictSnapshot(
        testCache.path,
        requestedDate, // Wrong - should be at 2024-12-31
        districtId,
        createSampleDistrictStatistics(districtId, requestedDate)
      )

      // Run compute
      const result = await analyticsComputeService.compute({
        date: requestedDate,
      })

      // Should fail because snapshot is not at the adjusted date
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]?.error).toContain('Snapshot not found')
      expect(result.errors[0]?.error).toContain('2024-12-31') // Expected location
      expect(result.isClosingPeriod).toBe(true)
    })

    it('should write analytics to adjusted date directory during closing period', async () => {
      // Setup: Closing period with snapshot at adjusted date
      const requestedDate = '2025-01-05'
      const snapshotDate = '2024-12-31'
      const districtId = '1'

      // Create cache metadata
      const rawCsvDir = path.join(testCache.path, 'raw-csv', requestedDate)
      await fs.mkdir(rawCsvDir, { recursive: true })
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify({
          date: requestedDate,
          isClosingPeriod: true,
          dataMonth: '2024-12',
        })
      )

      // Create snapshot at adjusted date
      await writeDistrictSnapshot(
        testCache.path,
        snapshotDate,
        districtId,
        createSampleDistrictStatistics(districtId, snapshotDate)
      )

      // Run compute
      const result = await analyticsComputeService.compute({
        date: requestedDate,
      })

      expect(result.success).toBe(true)

      // Verify analytics were written to the adjusted date directory
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        snapshotDate, // Should be at adjusted date, not requested date
        'analytics'
      )
      const analyticsPath = path.join(
        analyticsDir,
        `district_${districtId}_analytics.json`
      )

      const analyticsExists = await fs
        .access(analyticsPath)
        .then(() => true)
        .catch(() => false)
      expect(analyticsExists).toBe(true)

      // Verify analytics were NOT written to the requested date directory
      const wrongAnalyticsDir = path.join(
        testCache.path,
        'snapshots',
        requestedDate,
        'analytics'
      )
      const wrongAnalyticsExists = await fs
        .access(wrongAnalyticsDir)
        .then(() => true)
        .catch(() => false)
      expect(wrongAnalyticsExists).toBe(false)
    })
  })

  describe('snapshotExists', () => {
    it('should return false when snapshot directory does not exist', async () => {
      const exists = await analyticsComputeService.snapshotExists('2024-01-15')
      expect(exists).toBe(false)
    })

    it('should return true when snapshot directory exists', async () => {
      const date = '2024-01-15'
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      await fs.mkdir(snapshotDir, { recursive: true })

      const exists = await analyticsComputeService.snapshotExists(date)
      expect(exists).toBe(true)
    })
  })

  describe('analyticsExist', () => {
    it('should return false when analytics do not exist', async () => {
      const exists = await analyticsComputeService.analyticsExist(
        '2024-01-15',
        '1'
      )
      expect(exists).toBe(false)
    })

    it('should return true when analytics exist', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )
      await fs.mkdir(analyticsDir, { recursive: true })
      await fs.writeFile(
        path.join(analyticsDir, `district_${districtId}_analytics.json`),
        '{}'
      )

      const exists = await analyticsComputeService.analyticsExist(
        date,
        districtId
      )
      expect(exists).toBe(true)
    })
  })

  describe('loadDistrictSnapshot', () => {
    it('should return null when snapshot does not exist', async () => {
      const snapshot = await analyticsComputeService.loadDistrictSnapshot(
        '2024-01-15',
        '1'
      )
      expect(snapshot).toBeNull()
    })

    it('should load snapshot when it exists', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      const snapshot = await analyticsComputeService.loadDistrictSnapshot(
        date,
        districtId
      )
      expect(snapshot).toEqual(stats)
    })
  })

  describe('discoverAvailableDistricts', () => {
    it('should return empty array when snapshot directory does not exist', async () => {
      const districts =
        await analyticsComputeService.discoverAvailableDistricts('2024-01-15')
      expect(districts).toEqual([])
    })

    it('should discover districts from snapshot files', async () => {
      const date = '2024-01-15'

      // Write multiple district snapshots
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '2',
        createSampleDistrictStatistics('2', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '10',
        createSampleDistrictStatistics('10', date)
      )

      const districts =
        await analyticsComputeService.discoverAvailableDistricts(date)

      // Should be sorted numerically
      expect(districts).toEqual(['1', '2', '10'])
    })

    it('should handle non-numeric district IDs', async () => {
      const date = '2024-01-15'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        'F',
        createSampleDistrictStatistics('F', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )

      const districts =
        await analyticsComputeService.discoverAvailableDistricts(date)

      // Numeric first, then alphabetic
      expect(districts).toEqual(['1', 'F'])
    })

    it('should ignore non-district files', async () => {
      const date = '2024-01-15'
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      await fs.mkdir(snapshotDir, { recursive: true })

      // Write district file
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )

      // Write non-district files
      await fs.writeFile(path.join(snapshotDir, 'metadata.json'), '{}')
      await fs.writeFile(path.join(snapshotDir, 'manifest.json'), '{}')

      const districts =
        await analyticsComputeService.discoverAvailableDistricts(date)

      expect(districts).toEqual(['1'])
    })

    /**
     * #1428: `fetch-daily-reports` writes
     * `snapshots/{date}/district_{id}_reports.json` into the SAME directory
     * discovery scans. `/^district_(.+)\.json$/` captured `61_reports` as a
     * district id, so a `compute-analytics` run without `--districts` (i.e.
     * scripts/rebuild-analytics.ts or a manual invocation — the daily
     * pipeline always passes --districts) fabricated a district that does
     * not exist and failed the run computing it.
     */
    it('ignores the district_{id}_reports.json daily-reports sidecar', async () => {
      const date = '2024-01-15'
      const snapshotDir = path.join(testCache.path, 'snapshots', date)

      await writeDistrictSnapshot(
        testCache.path,
        date,
        '61',
        createSampleDistrictStatistics('61', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        'F',
        createSampleDistrictStatistics('F', date)
      )
      await fs.writeFile(
        path.join(snapshotDir, 'district_61_reports.json'),
        JSON.stringify({
          districtId: '61',
          programYear: '2025-2026',
          generatedAt: '2026-08-20T06:12:00.000Z',
          sections: {},
        })
      )
      // Any future sidecar must be excluded too — the pattern is the fix.
      await fs.writeFile(
        path.join(snapshotDir, 'district_61_foo.json'),
        JSON.stringify({ districtId: '61' })
      )

      const districts =
        await analyticsComputeService.discoverAvailableDistricts(date)

      expect(districts).toEqual(['61', 'F'])
      expect(districts).not.toContain('61_reports')
    })
  })

  describe('computeDistrictAnalytics', () => {
    it('should compute analytics for a district', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId
      )

      expect(result.success).toBe(true)
      expect(result.districtId).toBe(districtId)
      expect(result.analyticsPath).toBeDefined()
      expect(result.membershipPath).toBeDefined()
      expect(result.clubHealthPath).toBeDefined()
      expect(result.skipped).toBeUndefined()
    })

    it('should write analytics files with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId
      )

      // Verify analytics file
      const analyticsContent = await fs.readFile(result.analyticsPath!, 'utf-8')
      const analytics = JSON.parse(
        analyticsContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      expect(analytics.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(analytics.metadata.snapshotDate).toBe(date)
      expect(analytics.metadata.districtId).toBe(districtId)
      expect(analytics.data.districtId).toBe(districtId)
      expect(analytics.data.totalMembership).toBe(48)
    })

    it('should write membership trends file', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId
      )

      const membershipContent = await fs.readFile(
        result.membershipPath!,
        'utf-8'
      )
      const membership = JSON.parse(
        membershipContent
      ) as PreComputedAnalyticsFile<MembershipTrendData>

      expect(membership.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(membership.data.membershipTrend).toBeDefined()
      expect(membership.data.paymentsTrend).toBeDefined()
    })

    it('should write club health file', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId
      )

      const healthContent = await fs.readFile(result.clubHealthPath!, 'utf-8')
      const health = JSON.parse(
        healthContent
      ) as PreComputedAnalyticsFile<ClubHealthData>

      expect(health.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(health.data.allClubs).toBeDefined()
      expect(health.data.thrivingClubs).toBeDefined()
      expect(health.data.vulnerableClubs).toBeDefined()
      expect(health.data.interventionRequiredClubs).toBeDefined()
    })

    it('should skip computation when analytics exist and force is false', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // First computation
      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      // Second computation without force
      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId,
        { force: false }
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBe(true)
    })

    it('should recompute when force is true', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // First computation
      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      // Second computation with force
      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId,
        { force: true }
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBeUndefined()
      expect(result.analyticsPath).toBeDefined()
    })

    it('should return error when snapshot does not exist', async () => {
      const result = await analyticsComputeService.computeDistrictAnalytics(
        '2024-01-15',
        '999'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Snapshot not found')
    })
  })

  describe('compute', () => {
    it('should compute analytics for all available districts', async () => {
      const date = '2024-01-15'

      // Write multiple district snapshots
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '2',
        createSampleDistrictStatistics('2', date)
      )

      const result = await analyticsComputeService.compute({
        date,
      })

      expect(result.success).toBe(true)
      expect(result.districtsProcessed).toEqual(['1', '2'])
      expect(result.districtsSucceeded).toEqual(['1', '2'])
      expect(result.districtsFailed).toEqual([])
      expect(result.analyticsLocations.length).toBeGreaterThan(0)
    })

    it('should compute analytics for specific districts only', async () => {
      const date = '2024-01-15'

      // Write multiple district snapshots
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '2',
        createSampleDistrictStatistics('2', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '3',
        createSampleDistrictStatistics('3', date)
      )

      const result = await analyticsComputeService.compute({
        date,
        districts: ['1', '3'],
      })

      expect(result.success).toBe(true)
      expect(result.districtsProcessed).toEqual(['1', '3'])
      expect(result.districtsSucceeded).toEqual(['1', '3'])
    })

    it('should return error when snapshot does not exist for date', async () => {
      const result = await analyticsComputeService.compute({
        date: '2024-01-15',
      })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]?.error).toContain('Snapshot not found')
    })

    it('should write analytics manifest', async () => {
      const date = '2024-01-15'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )

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

      expect(manifest.snapshotDate).toBe(date)
      expect(manifest.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(manifest.files.length).toBeGreaterThan(0)
      expect(manifest.totalFiles).toBe(manifest.files.length)
    })

    it('should continue processing when one district fails (Requirement 1.5)', async () => {
      const date = '2024-01-15'

      // Write valid snapshot for district 1
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )

      // Write invalid snapshot for district 2 (invalid JSON)
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      await fs.writeFile(
        path.join(snapshotDir, 'district_2.json'),
        'invalid json'
      )

      const result = await analyticsComputeService.compute({
        date,
      })

      // Should have partial success
      expect(result.districtsSucceeded).toContain('1')
      expect(result.districtsFailed).toContain('2')
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should skip districts with existing analytics when force is false', async () => {
      const date = '2024-01-15'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )
      await writeDistrictSnapshot(
        testCache.path,
        date,
        '2',
        createSampleDistrictStatistics('2', date)
      )

      // First computation
      await analyticsComputeService.compute({ date })

      // Second computation without force
      const result = await analyticsComputeService.compute({
        date,
        force: false,
      })

      expect(result.success).toBe(true)
      expect(result.districtsSkipped).toEqual(['1', '2'])
      expect(result.districtsSucceeded).toEqual([])
    })

    it('should recompute all districts when force is true', async () => {
      const date = '2024-01-15'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )

      // First computation
      await analyticsComputeService.compute({ date })

      // Second computation with force
      const result = await analyticsComputeService.compute({
        date,
        force: true,
      })

      expect(result.success).toBe(true)
      expect(result.districtsSucceeded).toEqual(['1'])
      expect(result.districtsSkipped).toEqual([])
    })

    it('should include duration_ms in result', async () => {
      const date = '2024-01-15'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        '1',
        createSampleDistrictStatistics('1', date)
      )

      const result = await analyticsComputeService.compute({ date })

      expect(result.duration_ms).toBeGreaterThanOrEqual(0)
    })
  })

  describe('analytics file structure (Requirements 1.2, 1.3)', () => {
    it('should generate all required analytics types', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        districtId,
        createSampleDistrictStatistics(districtId, date)
      )

      await analyticsComputeService.compute({ date })

      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )
      const files = await fs.readdir(analyticsDir)

      // Should have all three analytics files plus manifest
      expect(files).toContain(`district_${districtId}_analytics.json`)
      expect(files).toContain(`district_${districtId}_membership.json`)
      expect(files).toContain(`district_${districtId}_clubhealth.json`)
      expect(files).toContain('manifest.json')
    })

    it('should include membership trends in analytics', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        districtId,
        createSampleDistrictStatistics(districtId, date)
      )

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

      expect(analytics.data.membershipTrend).toBeDefined()
      expect(Array.isArray(analytics.data.membershipTrend)).toBe(true)
    })

    it('should include club health data in analytics', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        districtId,
        createSampleDistrictStatistics(districtId, date)
      )

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

      expect(analytics.data.allClubs).toBeDefined()
      expect(analytics.data.vulnerableClubs).toBeDefined()
      expect(analytics.data.thrivingClubs).toBeDefined()
      expect(analytics.data.interventionRequiredClubs).toBeDefined()
    })

    it('should include distinguished club data in analytics', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        districtId,
        createSampleDistrictStatistics(districtId, date)
      )

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

      expect(analytics.data.distinguishedClubs).toBeDefined()
      expect(analytics.data.distinguishedProjection).toBeDefined()
    })

    it('should include division/area rankings in analytics', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      await writeDistrictSnapshot(
        testCache.path,
        date,
        districtId,
        createSampleDistrictStatistics(districtId, date)
      )

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

      expect(analytics.data.divisionRankings).toBeDefined()
      expect(analytics.data.topPerformingAreas).toBeDefined()
    })
  })

  describe('incremental update logic (Requirements 5.1-5.5)', () => {
    it('should store source snapshot checksum in analytics metadata (Requirement 5.4)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

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

    it('should skip computation when snapshot checksum is unchanged (Requirement 5.3)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // First computation
      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      // Second computation - snapshot unchanged
      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId,
        { force: false }
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBe(true)
    })

    it('should recompute when snapshot checksum changes (Requirement 5.2)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // First computation
      const firstResult =
        await analyticsComputeService.computeDistrictAnalytics(date, districtId)
      expect(firstResult.success).toBe(true)
      expect(firstResult.skipped).toBeUndefined()

      // Get the original checksum
      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const originalContent = await fs.readFile(analyticsPath, 'utf-8')
      const originalAnalytics = JSON.parse(
        originalContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>
      const originalChecksum = originalAnalytics.metadata.sourceSnapshotChecksum

      // Modify the snapshot (change membership count)
      const modifiedStats = {
        ...stats,
        totals: {
          ...stats.totals,
          totalMembership: 100, // Changed from 48
        },
      }
      await writeDistrictSnapshot(
        testCache.path,
        date,
        districtId,
        modifiedStats
      )

      // Second computation - snapshot changed, should recompute
      const secondResult =
        await analyticsComputeService.computeDistrictAnalytics(
          date,
          districtId,
          { force: false }
        )

      expect(secondResult.success).toBe(true)
      expect(secondResult.skipped).toBeUndefined() // Should NOT be skipped

      // Verify the checksum was updated
      const newContent = await fs.readFile(analyticsPath, 'utf-8')
      const newAnalytics = JSON.parse(
        newContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>
      expect(newAnalytics.metadata.sourceSnapshotChecksum).not.toBe(
        originalChecksum
      )
    })

    it('should bypass checksum comparison with --force-analytics (Requirement 5.5)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // First computation
      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      // Get the original computedAt timestamp
      const analyticsPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_analytics.json`
      )
      const originalContent = await fs.readFile(analyticsPath, 'utf-8')
      const originalAnalytics = JSON.parse(
        originalContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>
      const originalComputedAt = originalAnalytics.metadata.computedAt

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      // Second computation with force - should recompute even though snapshot unchanged
      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId,
        { force: true }
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBeUndefined()

      // Verify the file was rewritten (computedAt should be different)
      const newContent = await fs.readFile(analyticsPath, 'utf-8')
      const newAnalytics = JSON.parse(
        newContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>
      expect(newAnalytics.metadata.computedAt).not.toBe(originalComputedAt)
    })

    it('should calculate correct snapshot checksum (Requirement 5.1)', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // Calculate expected checksum manually
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const crypto = await import('crypto')
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(snapshotContent)
        .digest('hex')

      // Compute analytics
      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      // Verify stored checksum matches
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

      expect(analytics.metadata.sourceSnapshotChecksum).toBe(expectedChecksum)
    })

    it('should recompute legacy analytics without sourceSnapshotChecksum', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // Create legacy analytics file without sourceSnapshotChecksum
      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )
      await fs.mkdir(analyticsDir, { recursive: true })

      const legacyAnalytics = {
        metadata: {
          schemaVersion: '1.0.0',
          computedAt: new Date().toISOString(),
          snapshotDate: date,
          districtId,
          checksum: 'abc123',
          // Note: no sourceSnapshotChecksum
        },
        data: {
          districtId,
          dateRange: { start: date, end: date },
          totalMembership: 0,
          membershipChange: 0,
          membershipTrend: [],
          allClubs: [],
          vulnerableClubs: [],
          thrivingClubs: [],
          interventionRequiredClubs: [],
          distinguishedClubs: [],
          distinguishedProjection: {
            projectedDistinguished: 0,
            currentDistinguished: 0,
            currentSelect: 0,
            currentPresident: 0,
            projectionDate: date,
          },
          divisionRankings: [],
          topPerformingAreas: [],
        },
      }

      await fs.writeFile(
        path.join(analyticsDir, `district_${districtId}_analytics.json`),
        JSON.stringify(legacyAnalytics, null, 2)
      )

      // Compute analytics - should recompute because no stored checksum
      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId,
        { force: false }
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBeUndefined() // Should NOT be skipped

      // Verify the new analytics has sourceSnapshotChecksum
      const analyticsPath = path.join(
        analyticsDir,
        `district_${districtId}_analytics.json`
      )
      const newContent = await fs.readFile(analyticsPath, 'utf-8')
      const newAnalytics = JSON.parse(
        newContent
      ) as PreComputedAnalyticsFile<DistrictAnalytics>

      expect(newAnalytics.metadata.sourceSnapshotChecksum).toBeDefined()
      expect(newAnalytics.metadata.sourceSnapshotChecksum).toMatch(
        /^[a-f0-9]{64}$/
      )
    })

    it('should store same checksum in all analytics files for a district', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.computeDistrictAnalytics(date, districtId)

      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )

      // Read all three analytics files
      const analyticsContent = await fs.readFile(
        path.join(analyticsDir, `district_${districtId}_analytics.json`),
        'utf-8'
      )
      const membershipContent = await fs.readFile(
        path.join(analyticsDir, `district_${districtId}_membership.json`),
        'utf-8'
      )
      const clubHealthContent = await fs.readFile(
        path.join(analyticsDir, `district_${districtId}_clubhealth.json`),
        'utf-8'
      )

      const analytics = JSON.parse(
        analyticsContent
      ) as PreComputedAnalyticsFile<unknown>
      const membership = JSON.parse(
        membershipContent
      ) as PreComputedAnalyticsFile<unknown>
      const clubHealth = JSON.parse(
        clubHealthContent
      ) as PreComputedAnalyticsFile<unknown>

      // All should have the same sourceSnapshotChecksum
      expect(analytics.metadata.sourceSnapshotChecksum).toBeDefined()
      expect(membership.metadata.sourceSnapshotChecksum).toBe(
        analytics.metadata.sourceSnapshotChecksum
      )
      expect(clubHealth.metadata.sourceSnapshotChecksum).toBe(
        analytics.metadata.sourceSnapshotChecksum
      )
    })
  })

  /**
   * Integration test for complete analytics generation (Requirement 12.3)
   *
   * Verifies that all pre-computed analytics files are generated in a single
   * compute-analytics run, including the new extended analytics types.
   */
  describe('complete analytics generation (Requirement 12.3)', () => {
    it('should generate all required analytics files in a single compute run', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      // Run compute-analytics
      const result = await analyticsComputeService.compute({ date })

      expect(result.success).toBe(true)
      expect(result.districtsSucceeded).toContain(districtId)

      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )
      const files = await fs.readdir(analyticsDir)

      // Verify all required files are generated
      // Base analytics files (existing)
      expect(files).toContain(`district_${districtId}_analytics.json`)
      expect(files).toContain(`district_${districtId}_membership.json`)
      expect(files).toContain(`district_${districtId}_clubhealth.json`)

      // Extended analytics files (NEW - Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1)
      expect(files).toContain(
        `district_${districtId}_membership-analytics.json`
      )
      expect(files).toContain(`district_${districtId}_vulnerable-clubs.json`)
      expect(files).toContain(`district_${districtId}_leadership-insights.json`)
      expect(files).toContain(
        `district_${districtId}_distinguished-analytics.json`
      )
      expect(files).toContain(`district_${districtId}_year-over-year.json`)
      expect(files).toContain(`district_${districtId}_performance-targets.json`)
      expect(files).toContain(`district_${districtId}_club-trends-index.json`)

      // Manifest file
      expect(files).toContain('manifest.json')
    })

    it('should include all new file types in the manifest', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

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

      // Verify manifest contains entries for all file types
      const fileTypes = manifest.files.map(f => f.type)

      // Base types
      expect(fileTypes).toContain('analytics')
      expect(fileTypes).toContain('membership')
      expect(fileTypes).toContain('clubhealth')

      // Extended types (NEW)
      expect(fileTypes).toContain('membership-analytics')
      expect(fileTypes).toContain('vulnerable-clubs')
      expect(fileTypes).toContain('leadership-insights')
      expect(fileTypes).toContain('distinguished-analytics')
      expect(fileTypes).toContain('year-over-year')
      expect(fileTypes).toContain('performance-targets')
      expect(fileTypes).toContain('club-trends-index')

      // Total should be 10 files (3 base + 7 extended)
      expect(manifest.totalFiles).toBe(10)
    })

    it('should generate valid membership-analytics.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const filePath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_membership-analytics.json`
      )
      const content = await fs.readFile(filePath, 'utf-8')
      const file = JSON.parse(content) as PreComputedAnalyticsFile<{
        districtId: string
        dateRange: { start: string; end: string }
        totalMembership: number
        membershipChange: number
        growthRate: number
        retentionRate: number
      }>

      expect(file.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(file.metadata.districtId).toBe(districtId)
      expect(file.data.districtId).toBe(districtId)
      expect(file.data.dateRange).toBeDefined()
      expect(typeof file.data.totalMembership).toBe('number')
      expect(typeof file.data.membershipChange).toBe('number')
      expect(typeof file.data.growthRate).toBe('number')
      expect(typeof file.data.retentionRate).toBe('number')
    })

    it('should generate valid vulnerable-clubs.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const filePath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_vulnerable-clubs.json`
      )
      const content = await fs.readFile(filePath, 'utf-8')
      const file = JSON.parse(content) as PreComputedAnalyticsFile<{
        districtId: string
        computedAt: string
        totalVulnerableClubs: number
        interventionRequiredClubs: number
        vulnerableClubs: unknown[]
        interventionRequired: unknown[]
      }>

      expect(file.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(file.metadata.districtId).toBe(districtId)
      expect(file.data.districtId).toBe(districtId)
      expect(file.data.computedAt).toBeDefined()
      expect(typeof file.data.totalVulnerableClubs).toBe('number')
      expect(typeof file.data.interventionRequiredClubs).toBe('number')
      expect(Array.isArray(file.data.vulnerableClubs)).toBe(true)
      expect(Array.isArray(file.data.interventionRequired)).toBe(true)
    })

    it('should generate valid leadership-insights.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const filePath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_leadership-insights.json`
      )
      const content = await fs.readFile(filePath, 'utf-8')
      const file = JSON.parse(content) as PreComputedAnalyticsFile<{
        districtId: string
        dateRange: { start: string; end: string }
        officerCompletionRate: number
        trainingCompletionRate: number
        leadershipEffectivenessScore: number
        topPerformingDivisions: unknown[]
        areasNeedingSupport: unknown[]
      }>

      expect(file.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(file.metadata.districtId).toBe(districtId)
      expect(file.data.districtId).toBe(districtId)
      expect(file.data.dateRange).toBeDefined()
      expect(typeof file.data.officerCompletionRate).toBe('number')
      expect(typeof file.data.trainingCompletionRate).toBe('number')
      expect(typeof file.data.leadershipEffectivenessScore).toBe('number')
      expect(Array.isArray(file.data.topPerformingDivisions)).toBe(true)
      expect(Array.isArray(file.data.areasNeedingSupport)).toBe(true)
    })

    it('should generate valid distinguished-analytics.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const filePath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_distinguished-analytics.json`
      )
      const content = await fs.readFile(filePath, 'utf-8')
      const file = JSON.parse(content) as PreComputedAnalyticsFile<{
        districtId: string
        dateRange: { start: string; end: string }
        distinguishedClubs: {
          smedley: number
          presidents: number
          select: number
          distinguished: number
          total: number
        }
        distinguishedClubsList: unknown[]
        distinguishedProjection: unknown
        progressByLevel: unknown
      }>

      expect(file.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(file.metadata.districtId).toBe(districtId)
      expect(file.data.districtId).toBe(districtId)
      expect(file.data.dateRange).toBeDefined()
      expect(file.data.distinguishedClubs).toBeDefined()
      expect(typeof file.data.distinguishedClubs.total).toBe('number')
      expect(Array.isArray(file.data.distinguishedClubsList)).toBe(true)
      expect(file.data.distinguishedProjection).toBeDefined()
      expect(file.data.progressByLevel).toBeDefined()
    })

    it('should generate valid year-over-year.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const filePath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_year-over-year.json`
      )
      const content = await fs.readFile(filePath, 'utf-8')
      const file = JSON.parse(content) as PreComputedAnalyticsFile<{
        districtId: string
        currentDate: string
        previousYearDate: string
        dataAvailable: boolean
        message?: string
      }>

      expect(file.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(file.metadata.districtId).toBe(districtId)
      expect(file.data.districtId).toBe(districtId)
      expect(file.data.currentDate).toBeDefined()
      expect(file.data.previousYearDate).toBeDefined()
      expect(typeof file.data.dataAvailable).toBe('boolean')
    })

    it('should generate valid performance-targets.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const filePath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_performance-targets.json`
      )
      const content = await fs.readFile(filePath, 'utf-8')
      const file = JSON.parse(content) as PreComputedAnalyticsFile<{
        districtId: string
        computedAt: string
        paidClubsCount: number
        currentProgress: {
          membership: number
          distinguished: number
          clubGrowth: number
        }
      }>

      expect(file.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(file.metadata.districtId).toBe(districtId)
      expect(file.data.districtId).toBe(districtId)
      expect(file.data.computedAt).toBeDefined()
      expect(typeof file.data.paidClubsCount).toBe('number')
      expect(file.data.currentProgress).toBeDefined()
      // Legacy district targets were removed in #1127 — the canonical
      // recognition targets ship as paidClubsTargets / *Targets fields.
      expect(file.data).not.toHaveProperty('membershipTarget')
      expect(file.data).not.toHaveProperty('distinguishedTarget')
      expect(file.data).not.toHaveProperty('clubGrowthTarget')
      expect(file.data).not.toHaveProperty('projectedAchievement')
    })

    it('should generate valid club-trends-index.json with correct structure', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const filePath = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics',
        `district_${districtId}_club-trends-index.json`
      )
      const content = await fs.readFile(filePath, 'utf-8')
      const file = JSON.parse(content) as PreComputedAnalyticsFile<{
        districtId: string
        computedAt: string
        clubs: Record<string, unknown>
      }>

      expect(file.metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(file.metadata.districtId).toBe(districtId)
      expect(file.data.districtId).toBe(districtId)
      expect(file.data.computedAt).toBeDefined()
      expect(file.data.clubs).toBeDefined()
      expect(typeof file.data.clubs).toBe('object')

      // Verify clubs from the sample data are indexed
      expect(file.data.clubs['1234']).toBeDefined()
      expect(file.data.clubs['5678']).toBeDefined()
      expect(file.data.clubs['9012']).toBeDefined()
    })

    it('should return all new file paths in DistrictComputeResult', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      const result = await analyticsComputeService.computeDistrictAnalytics(
        date,
        districtId
      )

      expect(result.success).toBe(true)

      // Base paths (existing)
      expect(result.analyticsPath).toBeDefined()
      expect(result.membershipPath).toBeDefined()
      expect(result.clubHealthPath).toBeDefined()

      // Extended paths (NEW)
      expect(result.membershipAnalyticsPath).toBeDefined()
      expect(result.vulnerableClubsPath).toBeDefined()
      expect(result.leadershipInsightsPath).toBeDefined()
      expect(result.distinguishedAnalyticsPath).toBeDefined()
      expect(result.yearOverYearPath).toBeDefined()
      expect(result.performanceTargetsPath).toBeDefined()
      expect(result.clubTrendsIndexPath).toBeDefined()

      // Verify paths point to correct files
      expect(result.membershipAnalyticsPath).toContain(
        'membership-analytics.json'
      )
      expect(result.vulnerableClubsPath).toContain('vulnerable-clubs.json')
      expect(result.leadershipInsightsPath).toContain(
        'leadership-insights.json'
      )
      expect(result.distinguishedAnalyticsPath).toContain(
        'distinguished-analytics.json'
      )
      expect(result.yearOverYearPath).toContain('year-over-year.json')
      expect(result.performanceTargetsPath).toContain(
        'performance-targets.json'
      )
      expect(result.clubTrendsIndexPath).toContain('club-trends-index.json')
    })

    it('should store same sourceSnapshotChecksum in all analytics files', async () => {
      const date = '2024-01-15'
      const districtId = '1'
      const stats = createSampleDistrictStatistics(districtId, date)

      await writeDistrictSnapshot(testCache.path, date, districtId, stats)

      await analyticsComputeService.compute({ date })

      const analyticsDir = path.join(
        testCache.path,
        'snapshots',
        date,
        'analytics'
      )

      // Read all analytics files
      const fileNames = [
        `district_${districtId}_analytics.json`,
        `district_${districtId}_membership.json`,
        `district_${districtId}_clubhealth.json`,
        `district_${districtId}_membership-analytics.json`,
        `district_${districtId}_vulnerable-clubs.json`,
        `district_${districtId}_leadership-insights.json`,
        `district_${districtId}_distinguished-analytics.json`,
        `district_${districtId}_year-over-year.json`,
        `district_${districtId}_performance-targets.json`,
        `district_${districtId}_club-trends-index.json`,
      ]

      const checksums: string[] = []

      for (const fileName of fileNames) {
        const content = await fs.readFile(
          path.join(analyticsDir, fileName),
          'utf-8'
        )
        const file = JSON.parse(content) as PreComputedAnalyticsFile<unknown>
        expect(file.metadata.sourceSnapshotChecksum).toBeDefined()
        checksums.push(file.metadata.sourceSnapshotChecksum!)
      }

      // All checksums should be the same
      const firstChecksum = checksums[0]
      for (const checksum of checksums) {
        expect(checksum).toBe(firstChecksum)
      }
    })
  })
})

describe('Time-series generation integration (Requirements 4.1, 9.1, 9.2, 9.4)', () => {
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

  it('should generate time-series data point alongside analytics (Requirement 9.1)', async () => {
    const date = '2024-01-15'
    const districtId = '1'
    const stats = createSampleDistrictStatistics(districtId, date)

    await writeDistrictSnapshot(testCache.path, date, districtId, stats)

    const result = await analyticsComputeService.computeDistrictAnalytics(
      date,
      districtId
    )

    // Verify analytics were computed
    expect(result.success).toBe(true)
    expect(result.analyticsPath).toBeDefined()

    // Verify time-series was written
    expect(result.timeSeriesWritten).toBe(true)
    expect(result.timeSeriesError).toBeUndefined()

    // Verify time-series files exist
    const timeSeriesDir = path.join(
      testCache.path,
      'time-series',
      `district_${districtId}`
    )

    // Check that program year index file exists
    const programYear = '2023-2024' // January 2024 is in 2023-2024 program year
    const indexPath = path.join(timeSeriesDir, `${programYear}.json`)
    const indexExists = await fs
      .access(indexPath)
      .then(() => true)
      .catch(() => false)
    expect(indexExists).toBe(true)

    // Check that metadata file exists
    const metadataPath = path.join(timeSeriesDir, 'index-metadata.json')
    const metadataExists = await fs
      .access(metadataPath)
      .then(() => true)
      .catch(() => false)
    expect(metadataExists).toBe(true)
  })

  it('should write time-series data point with correct values (Requirement 4.1)', async () => {
    const date = '2024-01-15'
    const districtId = '1'
    const stats = createSampleDistrictStatistics(districtId, date)

    await writeDistrictSnapshot(testCache.path, date, districtId, stats)

    await analyticsComputeService.computeDistrictAnalytics(date, districtId)

    // Read the time-series index file
    const programYear = '2023-2024'
    const indexPath = path.join(
      testCache.path,
      'time-series',
      `district_${districtId}`,
      `${programYear}.json`
    )
    const indexContent = await fs.readFile(indexPath, 'utf-8')
    const indexFile = JSON.parse(indexContent) as {
      districtId: string
      programYear: string
      dataPoints: Array<{
        date: string
        snapshotId: string
        membership: number
        payments: number
        dcpGoals: number
        distinguishedTotal: number
        clubCounts: {
          total: number
          thriving: number
          vulnerable: number
          interventionRequired: number
        }
      }>
    }

    expect(indexFile.districtId).toBe(districtId)
    expect(indexFile.programYear).toBe(programYear)
    expect(indexFile.dataPoints.length).toBe(1)

    const dataPoint = indexFile.dataPoints[0]
    expect(dataPoint).toBeDefined()
    expect(dataPoint?.date).toBe(date)
    expect(dataPoint?.snapshotId).toBe(date)

    // Verify data point contains required fields (Requirement 4.3)
    expect(typeof dataPoint?.membership).toBe('number')
    expect(typeof dataPoint?.payments).toBe('number')
    expect(typeof dataPoint?.dcpGoals).toBe('number')
    expect(typeof dataPoint?.distinguishedTotal).toBe('number')
    expect(dataPoint?.clubCounts).toBeDefined()
    expect(typeof dataPoint?.clubCounts.total).toBe('number')
    expect(typeof dataPoint?.clubCounts.thriving).toBe('number')
    expect(typeof dataPoint?.clubCounts.vulnerable).toBe('number')
    expect(typeof dataPoint?.clubCounts.interventionRequired).toBe('number')
  })

  it('classifies club health per ClubHealthAnalyticsModule and counts letter-code distinguished status (#1120)', async () => {
    // Verdict-layer test (through the real compute() → conversion → builder
    // path) for the two C3 audit defects:
    // 1. club health used `dcpGoals > 0` instead of the §5.3 monthly
    //    checkpoint + CSP (June requires 5 goals)
    // 2. the conversion mapped the operational clubStatus into
    //    'Club Distinguished Status', so live letter codes were lost
    const date = '2026-06-15' // June → DCP checkpoint 5
    const districtId = '61'

    const makeClub = (
      overrides: Partial<DistrictStatistics['clubs'][number]> & {
        clubId: string
        clubName: string
      }
    ): DistrictStatistics['clubs'][number] => ({
      divisionId: 'A',
      areaId: 'A1',
      divisionName: 'Division A',
      areaName: 'Area A1',
      membershipCount: 25,
      paymentsCount: 0,
      dcpGoals: 0,
      status: 'Active',
      octoberRenewals: 0,
      aprilRenewals: 0,
      newMembers: 0,
      membershipBase: 20,
      clubStatus: 'Active',
      ...overrides,
    })

    const clubs = [
      // thriving + distinguished (heuristic and letter code agree)
      makeClub({
        clubId: '1001',
        clubName: 'Thriving Select',
        dcpGoals: 7,
        cspSubmitted: true,
        distinguishedStatus: 'S',
      }),
      // 3 goals in June → vulnerable (legacy dcpGoals>0 said thriving)
      makeClub({
        clubId: '1002',
        clubName: 'June Three Goals',
        dcpGoals: 3,
        cspSubmitted: true,
      }),
      // distinguished ONLY via the live letter code — fails the heuristic
      makeClub({
        clubId: '1003',
        clubName: 'Code Only Distinguished',
        membershipCount: 15,
        membershipBase: 15,
        dcpGoals: 2,
        cspSubmitted: true,
        distinguishedStatus: 'D',
      }),
      // intervention required: 8 members, base 10
      makeClub({
        clubId: '1004',
        clubName: 'Critical Club',
        membershipCount: 8,
        membershipBase: 10,
        dcpGoals: 2,
        cspSubmitted: true,
        clubStatus: 'Low',
      }),
      // all metrics met but CSP not submitted → vulnerable, not distinguished
      makeClub({
        clubId: '1005',
        clubName: 'No CSP Club',
        dcpGoals: 9,
        cspSubmitted: false,
      }),
    ]

    const stats: DistrictStatistics = {
      districtId,
      snapshotDate: date,
      clubs,
      divisions: [],
      areas: [],
      totals: {
        totalClubs: clubs.length,
        totalMembership: 98,
        totalPayments: 0,
        distinguishedClubs: 0,
        selectDistinguishedClubs: 0,
        presidentDistinguishedClubs: 0,
      },
      divisionPerformance: [],
      clubPerformance: [],
      districtPerformance: [],
    }

    await writeDistrictSnapshot(testCache.path, date, districtId, stats)
    const result = await analyticsComputeService.computeDistrictAnalytics(
      date,
      districtId
    )
    expect(result.timeSeriesWritten).toBe(true)

    const indexPath = path.join(
      testCache.path,
      'time-series',
      `district_${districtId}`,
      '2025-2026.json'
    )
    const indexFile = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as {
      dataPoints: Array<{
        distinguishedTotal: number
        clubCounts: {
          total: number
          thriving: number
          vulnerable: number
          interventionRequired: number
        }
      }>
    }
    const dataPoint = indexFile.dataPoints[0]

    // §5.3 June classification: 1001 thriving; 1002 (checkpoint), 1003
    // (membership), 1005 (CSP) vulnerable; 1004 intervention
    expect(dataPoint?.clubCounts).toEqual({
      total: 5,
      thriving: 1,
      vulnerable: 3,
      interventionRequired: 1,
    })

    // 1001 (code 'S' + heuristic) and 1003 (code 'D' only); 1005 blocked by CSP
    expect(dataPoint?.distinguishedTotal).toBe(2)

    // Parity: the time-series counts must equal the dashboard's
    // ClubHealthAnalyticsModule classification for the same snapshot
    const module = new ClubHealthAnalyticsModule()
    const healthData = module.generateClubHealthData([stats])
    expect(dataPoint?.clubCounts.thriving).toBe(healthData.thrivingClubs.length)
    expect(dataPoint?.clubCounts.vulnerable).toBe(
      healthData.vulnerableClubs.length
    )
    expect(dataPoint?.clubCounts.interventionRequired).toBe(
      healthData.interventionRequiredClubs.length
    )
  })

  it('should use same snapshot data as other analytics (Requirement 9.2)', async () => {
    const date = '2024-01-15'
    const districtId = '1'
    const stats = createSampleDistrictStatistics(districtId, date)

    await writeDistrictSnapshot(testCache.path, date, districtId, stats)

    await analyticsComputeService.computeDistrictAnalytics(date, districtId)

    // Read the time-series data point
    const programYear = '2023-2024'
    const indexPath = path.join(
      testCache.path,
      'time-series',
      `district_${districtId}`,
      `${programYear}.json`
    )
    const indexContent = await fs.readFile(indexPath, 'utf-8')
    const indexFile = JSON.parse(indexContent) as {
      dataPoints: Array<{
        membership: number
      }>
    }

    const dataPoint = indexFile.dataPoints[0]

    // The membership should match the totals from the snapshot
    // (stats.totals.totalMembership = 48 from createSampleDistrictStatistics)
    expect(dataPoint?.membership).toBe(stats.totals.totalMembership)
  })

  it('should update index metadata with available program years (Requirement 4.5)', async () => {
    const date = '2024-01-15'
    const districtId = '1'
    const stats = createSampleDistrictStatistics(districtId, date)

    await writeDistrictSnapshot(testCache.path, date, districtId, stats)

    await analyticsComputeService.computeDistrictAnalytics(date, districtId)

    // Read the metadata file
    const metadataPath = path.join(
      testCache.path,
      'time-series',
      `district_${districtId}`,
      'index-metadata.json'
    )
    const metadataContent = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(metadataContent) as {
      districtId: string
      lastUpdated: string
      availableProgramYears: string[]
      totalDataPoints: number
    }

    expect(metadata.districtId).toBe(districtId)
    expect(metadata.availableProgramYears).toContain('2023-2024')
    expect(metadata.totalDataPoints).toBe(1)
    expect(metadata.lastUpdated).toBeDefined()
  })

  it('should continue processing when time-series write fails (Requirement 9.4)', async () => {
    const date = '2024-01-15'
    const districtId = '1'
    const stats = createSampleDistrictStatistics(districtId, date)

    await writeDistrictSnapshot(testCache.path, date, districtId, stats)

    // Create a file where the time-series directory should be to cause a write failure
    const timeSeriesDir = path.join(testCache.path, 'time-series')
    await fs.mkdir(timeSeriesDir, { recursive: true })
    // Create a file that will block directory creation
    await fs.writeFile(
      path.join(timeSeriesDir, `district_${districtId}`),
      'blocking file'
    )

    const result = await analyticsComputeService.computeDistrictAnalytics(
      date,
      districtId
    )

    // Analytics should still succeed even if time-series fails
    expect(result.success).toBe(true)
    expect(result.analyticsPath).toBeDefined()

    // Time-series should have failed but not blocked the operation
    expect(result.timeSeriesWritten).toBe(false)
    expect(result.timeSeriesError).toBeDefined()
  })

  it('should generate time-series for multiple districts in compute operation', async () => {
    const date = '2024-01-15'

    // Write multiple district snapshots
    await writeDistrictSnapshot(
      testCache.path,
      date,
      '1',
      createSampleDistrictStatistics('1', date)
    )
    await writeDistrictSnapshot(
      testCache.path,
      date,
      '2',
      createSampleDistrictStatistics('2', date)
    )

    const result = await analyticsComputeService.compute({ date })

    expect(result.success).toBe(true)
    expect(result.districtsSucceeded).toContain('1')
    expect(result.districtsSucceeded).toContain('2')

    // Verify time-series files exist for both districts
    for (const districtId of ['1', '2']) {
      const metadataPath = path.join(
        testCache.path,
        'time-series',
        `district_${districtId}`,
        'index-metadata.json'
      )
      const metadataExists = await fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false)
      expect(metadataExists).toBe(true)
    }
  })

  it('should write to correct program year based on date', async () => {
    const districtId = '1'

    // Test date in first half of program year (July-December)
    const date1 = '2023-09-15' // Should be in 2023-2024
    const stats1 = createSampleDistrictStatistics(districtId, date1)
    await writeDistrictSnapshot(testCache.path, date1, districtId, stats1)
    await analyticsComputeService.computeDistrictAnalytics(date1, districtId, {
      force: true,
    })

    // Test date in second half of program year (January-June)
    const date2 = '2024-03-15' // Should also be in 2023-2024
    const stats2 = createSampleDistrictStatistics(districtId, date2)
    await writeDistrictSnapshot(testCache.path, date2, districtId, stats2)
    await analyticsComputeService.computeDistrictAnalytics(date2, districtId, {
      force: true,
    })

    // Both should be in the same program year file
    const indexPath = path.join(
      testCache.path,
      'time-series',
      `district_${districtId}`,
      '2023-2024.json'
    )
    const indexContent = await fs.readFile(indexPath, 'utf-8')
    const indexFile = JSON.parse(indexContent) as {
      dataPoints: Array<{ date: string }>
    }

    expect(indexFile.dataPoints.length).toBe(2)
    expect(indexFile.dataPoints.map(dp => dp.date).sort()).toEqual([
      '2023-09-15',
      '2024-03-15',
    ])
  })
})
