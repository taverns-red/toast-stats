/**
 * Unit Tests for TransformService
 *
 * Tests the CSV-to-snapshot transformation functionality.
 *
 * Requirements:
 * - 2.2: WHEN transforming raw CSVs, THE Collector_CLI SHALL use the same
 *        DataTransformationService logic as the Backend
 * - 2.3: THE Collector_CLI SHALL store snapshots in the same directory structure
 *        as the Backend expects: `CACHE_DIR/snapshots/{date}/`
 * - 2.4: WHEN a snapshot is created, THE Collector_CLI SHALL write district JSON
 *        files, metadata.json, and manifest.json
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'
import { ANALYTICS_SCHEMA_VERSION } from '@toastmasters/analytics-core'

/**
 * Create an isolated test cache directory
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(os.tmpdir(), `transform-service-test-${uniqueId}`)

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Sample club performance CSV content
 */
const SAMPLE_CLUB_CSV = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
1234,Test Club One,A,1,25,30,5,Active
5678,Test Club Two,A,2,18,22,3,Active
9012,Test Club Three,B,1,12,15,2,Distinguished`

/**
 * Sample division performance CSV content
 */
const SAMPLE_DIVISION_CSV = `Division,Division Name,Club Count,Membership,Total to Date
A,Division Alpha,2,43,52
B,Division Beta,1,12,15`

/**
 * Sample district performance CSV content
 */
const SAMPLE_DISTRICT_CSV = `District,Distinguished Clubs,Select Distinguished,President's Distinguished
1,1,0,0`

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

describe('TransformService', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    transformService = new TransformService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  /**
   * Unit tests for readCacheMetadata method
   *
   * Requirements:
   * - 1.1: WHEN transforming raw CSVs THEN the TransformService SHALL read the cache metadata
   *        from `CACHE_DIR/raw-csv/{date}/metadata.json`
   * - 1.2: WHEN cache metadata exists THEN the TransformService SHALL extract `isClosingPeriod`
   *        and `dataMonth` fields
   * - 1.3: WHEN cache metadata does not exist THEN the TransformService SHALL treat the data
   *        as non-closing-period data
   * - 1.4: IF reading cache metadata fails THEN the TransformService SHALL log a warning
   *        and continue with non-closing-period behavior
   */
  describe('readCacheMetadata', () => {
    it('should read valid metadata with isClosingPeriod and dataMonth fields', async () => {
      // Requirement 1.1, 1.2: Read cache metadata and extract fields
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      const metadata = {
        date: '2024-01-15',
        isClosingPeriod: true,
        dataMonth: '2024-12',
      }
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata)
      )

      const result = await transformService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2024-01-15')
      expect(result?.isClosingPeriod).toBe(true)
      expect(result?.dataMonth).toBe('2024-12')
    })

    it('should read valid metadata with isClosingPeriod false', async () => {
      // Requirement 1.2: Extract isClosingPeriod field when false
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      const metadata = {
        date: '2024-01-15',
        isClosingPeriod: false,
      }
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify(metadata)
      )

      const result = await transformService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2024-01-15')
      expect(result?.isClosingPeriod).toBe(false)
      expect(result?.dataMonth).toBeUndefined()
    })

    it('should return null when metadata file does not exist', async () => {
      // Requirement 1.3: Treat missing metadata as non-closing-period data
      const date = '2024-01-15'
      // Don't create the metadata file

      const result = await transformService.readCacheMetadata(date)

      expect(result).toBeNull()
    })

    it('should return null and log warning when metadata contains invalid JSON', async () => {
      // Requirement 1.4: Log warning and continue with non-closing-period behavior
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
      const serviceWithLogger = new TransformService({
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
      // Requirement 1.2: Extract fields when some are missing
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

      const result = await transformService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2024-01-15')
      expect(result?.isClosingPeriod).toBeUndefined()
      expect(result?.dataMonth).toBeUndefined()
    })

    it('should use requested date when metadata date field is missing', async () => {
      // Requirement 1.2: Handle edge case where date field is missing
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

      const result = await transformService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe(date) // Falls back to requested date
      expect(result?.isClosingPeriod).toBe(true)
      expect(result?.dataMonth).toBe('2024-12')
    })

    it('should handle JSON array by extracting no valid fields', async () => {
      // Requirement 1.4: Handle non-object JSON values gracefully
      // Arrays are technically objects in JavaScript, so the implementation
      // extracts fields (which will be undefined) and returns a result with defaults
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      // Write a JSON array instead of object
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        '["not", "an", "object"]'
      )

      const result = await transformService.readCacheMetadata(date)

      // Arrays are objects in JS, so the implementation extracts fields
      // which results in undefined values for isClosingPeriod and dataMonth
      expect(result).not.toBeNull()
      expect(result?.date).toBe(date) // Falls back to requested date
      expect(result?.isClosingPeriod).toBeUndefined()
      expect(result?.dataMonth).toBeUndefined()
    })

    it('should return null and log warning when metadata is null JSON', async () => {
      // Requirement 1.4: Handle null JSON value
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      await fs.writeFile(path.join(rawCsvDir, 'metadata.json'), 'null')

      const mockLogger = createMockLogger()
      const serviceWithLogger = new TransformService({
        cacheDir: testCache.path,
        logger: mockLogger.logger,
      })

      const result = await serviceWithLogger.readCacheMetadata(date)

      expect(result).toBeNull()
      expect(mockLogger.warnings.length).toBeGreaterThan(0)
    })

    it('should ignore fields with wrong types', async () => {
      // Requirement 1.2: Type validation for extracted fields
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

      const result = await transformService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2024-01-15')
      // Wrong types should result in undefined
      expect(result?.isClosingPeriod).toBeUndefined()
      expect(result?.dataMonth).toBeUndefined()
    })
  })

  describe('readCacheMetadata — CSV footer fallback (#292)', () => {
    // @ts-expect-error -- Red phase
    it.fails(
      'should parse CSV footer when metadata.json is missing',
      async () => {
        const date = '2026-04-01'
        const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
        await fs.mkdir(rawCsvDir, { recursive: true })

        // No metadata.json, but CSV has closing period footer
        await fs.writeFile(
          path.join(rawCsvDir, 'all-districts.csv'),
          'Header\nRow1\nMonth of Mar, As of 04/01/2026'
        )

        const result = await transformService.readCacheMetadata(date)

        expect(result).not.toBeNull()
        expect(result?.isClosingPeriod).toBe(true)
        expect(result?.dataMonth).toBe('2026-03')
      }
    )

    // @ts-expect-error -- Red phase
    it.fails(
      'should parse CSV footer when metadata has undefined isClosingPeriod',
      async () => {
        const date = '2026-04-02'
        const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
        await fs.mkdir(rawCsvDir, { recursive: true })

        // metadata exists but isClosingPeriod not set
        await fs.writeFile(
          path.join(rawCsvDir, 'metadata.json'),
          JSON.stringify({ date: '2026-04-02' })
        )
        await fs.writeFile(
          path.join(rawCsvDir, 'all-districts.csv'),
          'Header\nRow1\nMonth of Mar, As of 04/02/2026'
        )

        const result = await transformService.readCacheMetadata(date)

        expect(result).not.toBeNull()
        expect(result?.isClosingPeriod).toBe(true)
        expect(result?.dataMonth).toBe('2026-03')
      }
    )

    it('should trust existing metadata when isClosingPeriod is explicitly set', async () => {
      const date = '2026-03-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify({
          date: '2026-03-15',
          isClosingPeriod: false,
        })
      )

      const result = await transformService.readCacheMetadata(date)

      expect(result).not.toBeNull()
      expect(result?.isClosingPeriod).toBe(false)
    })

    // @ts-expect-error -- Red phase
    it.fails('should return non-closing when CSV has no footer', async () => {
      const date = '2026-03-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
      await fs.mkdir(rawCsvDir, { recursive: true })

      // No metadata, no footer in CSV
      await fs.writeFile(
        path.join(rawCsvDir, 'all-districts.csv'),
        'Header\nRow1\nRow2'
      )

      const result = await transformService.readCacheMetadata(date)

      // Should return metadata (not null) with isClosingPeriod: false
      expect(result).not.toBeNull()
      expect(result?.isClosingPeriod).toBe(false)
    })
  })

  describe('discoverAvailableDistricts', () => {
    it('should return empty array when raw-csv directory does not exist', async () => {
      const districts =
        await transformService.discoverAvailableDistricts('2024-01-15')
      expect(districts).toEqual([])
    })

    it('should discover districts from raw-csv directory structure', async () => {
      // Create raw-csv directory structure
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)

      await fs.mkdir(path.join(rawCsvDir, 'district-1'), { recursive: true })
      await fs.mkdir(path.join(rawCsvDir, 'district-42'), { recursive: true })
      await fs.mkdir(path.join(rawCsvDir, 'district-100'), { recursive: true })

      const districts = await transformService.discoverAvailableDistricts(date)

      // Should be sorted numerically
      expect(districts).toEqual(['1', '42', '100'])
    })

    it('should ignore non-district directories', async () => {
      const date = '2024-01-15'
      const rawCsvDir = path.join(testCache.path, 'raw-csv', date)

      await fs.mkdir(path.join(rawCsvDir, 'district-1'), { recursive: true })
      await fs.mkdir(path.join(rawCsvDir, 'other-folder'), { recursive: true })
      await fs.writeFile(path.join(rawCsvDir, 'all-districts.csv'), 'test')

      const districts = await transformService.discoverAvailableDistricts(date)

      expect(districts).toEqual(['1'])
    })
  })

  describe('snapshotExists', () => {
    it('should return false when snapshot does not exist', async () => {
      const exists = await transformService.snapshotExists('2024-01-15', '1')
      expect(exists).toBe(false)
    })

    it('should return true when snapshot exists', async () => {
      const date = '2024-01-15'
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      await fs.mkdir(snapshotDir, { recursive: true })
      await fs.writeFile(
        path.join(snapshotDir, 'district_1.json'),
        JSON.stringify({ districtId: '1' })
      )

      const exists = await transformService.snapshotExists(date, '1')
      expect(exists).toBe(true)
    })
  })

  describe('transformDistrict', () => {
    it('should return error when raw CSV data not found', async () => {
      const result = await transformService.transformDistrict('2024-01-15', '1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Raw CSV data not found')
    })

    it('should skip transformation when snapshot exists and force is false', async () => {
      const date = '2024-01-15'

      // Create existing snapshot
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      await fs.mkdir(snapshotDir, { recursive: true })
      await fs.writeFile(
        path.join(snapshotDir, 'district_1.json'),
        JSON.stringify({ districtId: '1' })
      )

      const result = await transformService.transformDistrict(date, '1', {
        force: false,
      })

      expect(result.success).toBe(true)
      expect(result.skipped).toBe(true)
    })

    it('should transform raw CSV data into snapshot format', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      // Create raw CSV files
      const districtDir = path.join(
        testCache.path,
        'raw-csv',
        date,
        `district-${districtId}`
      )
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )
      await fs.writeFile(
        path.join(districtDir, 'division-performance.csv'),
        SAMPLE_DIVISION_CSV
      )
      await fs.writeFile(
        path.join(districtDir, 'district-performance.csv'),
        SAMPLE_DISTRICT_CSV
      )

      const result = await transformService.transformDistrict(date, districtId)

      expect(result.success).toBe(true)
      expect(result.skipped).toBeFalsy()
      expect(result.snapshotPath).toBeDefined()

      // Verify snapshot file was created
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const snapshot = JSON.parse(snapshotContent)

      // Verify PerDistrictData wrapper structure
      expect(snapshot.districtId).toBe(districtId)
      expect(snapshot.districtName).toBe(`District ${districtId}`)
      expect(snapshot.status).toBe('success')
      expect(snapshot.collectedAt).toBeDefined()

      // Verify the actual district data inside the wrapper
      expect(snapshot.data.districtId).toBe(districtId)
      expect(snapshot.data.snapshotDate).toBe(date)
      expect(snapshot.data.clubs).toHaveLength(3)
      expect(snapshot.data.divisions).toHaveLength(2)
    })

    it('should force re-transform when force option is true', async () => {
      const date = '2024-01-15'
      const districtId = '1'

      // Create existing snapshot with old data
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      await fs.mkdir(snapshotDir, { recursive: true })
      await fs.writeFile(
        path.join(snapshotDir, `district_${districtId}.json`),
        JSON.stringify({ districtId, clubs: [] })
      )

      // Create raw CSV files with new data
      const districtDir = path.join(
        testCache.path,
        'raw-csv',
        date,
        `district-${districtId}`
      )
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )

      const result = await transformService.transformDistrict(
        date,
        districtId,
        {
          force: true,
        }
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBeFalsy()

      // Verify snapshot was updated
      const snapshotContent = await fs.readFile(
        path.join(snapshotDir, `district_${districtId}.json`),
        'utf-8'
      )
      const snapshot = JSON.parse(snapshotContent)
      // Verify the data inside the PerDistrictData wrapper
      expect(snapshot.data.clubs).toHaveLength(3)
    })
  })

  describe('transform', () => {
    it('should return error when no districts found', async () => {
      const result = await transformService.transform({
        date: '2024-01-15',
      })

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]?.error).toContain('No raw CSV data found')
    })

    it('should transform all available districts', async () => {
      const date = '2024-01-15'

      // Create raw CSV files for two districts
      for (const districtId of ['1', '2']) {
        const districtDir = path.join(
          testCache.path,
          'raw-csv',
          date,
          `district-${districtId}`
        )
        await fs.mkdir(districtDir, { recursive: true })
        await fs.writeFile(
          path.join(districtDir, 'club-performance.csv'),
          SAMPLE_CLUB_CSV
        )
      }

      const result = await transformService.transform({ date })

      expect(result.success).toBe(true)
      expect(result.districtsProcessed).toEqual(['1', '2'])
      expect(result.districtsSucceeded).toEqual(['1', '2'])
      expect(result.districtsFailed).toEqual([])
    })

    it('should transform only specified districts', async () => {
      const date = '2024-01-15'

      // Create raw CSV files for three districts
      for (const districtId of ['1', '2', '3']) {
        const districtDir = path.join(
          testCache.path,
          'raw-csv',
          date,
          `district-${districtId}`
        )
        await fs.mkdir(districtDir, { recursive: true })
        await fs.writeFile(
          path.join(districtDir, 'club-performance.csv'),
          SAMPLE_CLUB_CSV
        )
      }

      const result = await transformService.transform({
        date,
        districts: ['1', '3'],
      })

      expect(result.success).toBe(true)
      expect(result.districtsProcessed).toEqual(['1', '3'])
      expect(result.districtsSucceeded).toEqual(['1', '3'])
    })

    it('should write metadata.json with correct structure', async () => {
      const date = '2024-01-15'

      // Create raw CSV files
      const districtDir = path.join(
        testCache.path,
        'raw-csv',
        date,
        'district-1'
      )
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )

      await transformService.transform({ date })

      // Verify metadata.json - now uses backend-compatible structure
      const metadataPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'metadata.json'
      )
      const metadataContent = await fs.readFile(metadataPath, 'utf-8')
      const metadata = JSON.parse(metadataContent)

      expect(metadata.snapshotId).toBe(date)
      expect(metadata.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(metadata.calculationVersion).toBe(ANALYTICS_SCHEMA_VERSION)
      expect(metadata.status).toBe('success')
      expect(metadata.source).toBe('collector-cli')
      expect(metadata.successfulDistricts).toEqual(['1'])
      expect(metadata.failedDistricts).toEqual([])
      expect(metadata.configuredDistricts).toEqual(['1'])
      expect(metadata.dataAsOfDate).toBe(date)
      expect(metadata.createdAt).toBeDefined()
      expect(metadata.processingDuration).toBeGreaterThanOrEqual(0)
    })

    it('should write manifest.json with district entries', async () => {
      const date = '2024-01-15'

      // Create raw CSV files for two districts
      for (const districtId of ['1', '2']) {
        const districtDir = path.join(
          testCache.path,
          'raw-csv',
          date,
          `district-${districtId}`
        )
        await fs.mkdir(districtDir, { recursive: true })
        await fs.writeFile(
          path.join(districtDir, 'club-performance.csv'),
          SAMPLE_CLUB_CSV
        )
      }

      await transformService.transform({ date })

      // Verify manifest.json - now uses backend-compatible structure
      const manifestPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'manifest.json'
      )
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      expect(manifest.snapshotId).toBe(date)
      expect(manifest.totalDistricts).toBe(2)
      expect(manifest.successfulDistricts).toBe(2)
      expect(manifest.failedDistricts).toBe(0)
      expect(manifest.districts).toHaveLength(2)

      // Verify district entries have required fields
      for (const district of manifest.districts) {
        expect(district.districtId).toBeDefined()
        expect(district.fileName).toBeDefined()
        expect(district.status).toBe('success')
        expect(district.fileSize).toBeGreaterThan(0)
        expect(district.lastModified).toBeDefined()
      }

      // Verify district files are present
      const districtIds = manifest.districts.map(
        (d: { districtId: string }) => d.districtId
      )
      expect(districtIds).toContain('1')
      expect(districtIds).toContain('2')
    })

    it('should continue processing when one district fails', async () => {
      const date = '2024-01-15'

      // Create valid raw CSV for district 1
      const district1Dir = path.join(
        testCache.path,
        'raw-csv',
        date,
        'district-1'
      )
      await fs.mkdir(district1Dir, { recursive: true })
      await fs.writeFile(
        path.join(district1Dir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )

      // Create invalid raw CSV for district 2 (empty directory, no club-performance.csv)
      const district2Dir = path.join(
        testCache.path,
        'raw-csv',
        date,
        'district-2'
      )
      await fs.mkdir(district2Dir, { recursive: true })

      const result = await transformService.transform({ date })

      // Should have partial success
      expect(result.districtsProcessed).toEqual(['1', '2'])
      expect(result.districtsSucceeded).toEqual(['1'])
      expect(result.districtsFailed).toEqual(['2'])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]?.districtId).toBe('2')
    })

    it('should skip already transformed districts when force is false', async () => {
      const date = '2024-01-15'

      // Create raw CSV files
      const districtDir = path.join(
        testCache.path,
        'raw-csv',
        date,
        'district-1'
      )
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )

      // First transform
      await transformService.transform({ date })

      // Second transform without force
      const result = await transformService.transform({ date, force: false })

      expect(result.success).toBe(true)
      expect(result.districtsSkipped).toEqual(['1'])
      expect(result.districtsSucceeded).toEqual([])
    })

    it('should re-transform all districts when force is true', async () => {
      const date = '2024-01-15'

      // Create raw CSV files
      const districtDir = path.join(
        testCache.path,
        'raw-csv',
        date,
        'district-1'
      )
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )

      // First transform
      await transformService.transform({ date })

      // Second transform with force
      const result = await transformService.transform({ date, force: true })

      expect(result.success).toBe(true)
      expect(result.districtsSkipped).toEqual([])
      expect(result.districtsSucceeded).toEqual(['1'])
    })
  })

  describe('snapshot directory structure', () => {
    it('should create snapshots in CACHE_DIR/snapshots/{date}/ structure', async () => {
      const date = '2024-01-15'

      // Create raw CSV files
      const districtDir = path.join(
        testCache.path,
        'raw-csv',
        date,
        'district-1'
      )
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )

      await transformService.transform({ date })

      // Verify directory structure
      const snapshotDir = path.join(testCache.path, 'snapshots', date)
      const files = await fs.readdir(snapshotDir)

      expect(files).toContain('district_1.json')
      expect(files).toContain('metadata.json')
      expect(files).toContain('manifest.json')
    })
  })
})

/**
 * Unit tests for determineSnapshotDate method
 *
 * Tests the snapshot date determination logic based on closing period detection.
 *
 * Requirements:
 * - 2.2: WHEN `isClosingPeriod` is true THEN the TransformService SHALL write the snapshot
 *        to `CACHE_DIR/snapshots/{lastDayOfDataMonth}/` instead of `CACHE_DIR/snapshots/{requestedDate}/`
 * - 2.3: WHEN the data month is December and the collection date is in January THEN the snapshot
 *        SHALL be dated December 31 of the prior year
 * - 2.4: WHEN `isClosingPeriod` is false or undefined THEN the TransformService SHALL use
 *        the requested date as the snapshot date
 */
describe('determineSnapshotDate', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    transformService = new TransformService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  /**
   * Requirement 2.2: Closing period returns last day of data month
   */
  it('should return last day of data month when isClosingPeriod is true', () => {
    // Scenario: Data for December 2024 collected on January 5, 2025
    const requestedDate = '2025-01-05'
    const metadata = {
      date: '2025-01-05',
      isClosingPeriod: true,
      dataMonth: '2024-12',
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(true)
    expect(result.snapshotDate).toBe('2024-12-31')
    expect(result.logicalDate).toBe('2024-12-31')
    expect(result.collectionDate).toBe('2025-01-05')
    expect(result.dataMonth).toBe('2024-12')
  })

  /**
   * Requirement 2.2: Closing period with different month (not December)
   */
  it('should return last day of data month for non-December closing period', () => {
    // Scenario: Data for June 2024 collected on July 3, 2024
    const requestedDate = '2024-07-03'
    const metadata = {
      date: '2024-07-03',
      isClosingPeriod: true,
      dataMonth: '2024-06',
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(true)
    expect(result.snapshotDate).toBe('2024-06-30')
    expect(result.logicalDate).toBe('2024-06-30')
    expect(result.collectionDate).toBe('2024-07-03')
    expect(result.dataMonth).toBe('2024-06')
  })

  /**
   * Requirement 2.2: Closing period for February (handles varying month lengths)
   */
  it('should return correct last day for February in non-leap year', () => {
    // Scenario: Data for February 2023 (non-leap year) collected on March 2, 2023
    const requestedDate = '2023-03-02'
    const metadata = {
      date: '2023-03-02',
      isClosingPeriod: true,
      dataMonth: '2023-02',
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(true)
    expect(result.snapshotDate).toBe('2023-02-28')
    expect(result.logicalDate).toBe('2023-02-28')
  })

  /**
   * Requirement 2.2: Closing period for February in leap year
   */
  it('should return correct last day for February in leap year', () => {
    // Scenario: Data for February 2024 (leap year) collected on March 2, 2024
    const requestedDate = '2024-03-02'
    const metadata = {
      date: '2024-03-02',
      isClosingPeriod: true,
      dataMonth: '2024-02',
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(true)
    expect(result.snapshotDate).toBe('2024-02-29')
    expect(result.logicalDate).toBe('2024-02-29')
  })

  /**
   * Requirement 2.4: Non-closing period returns requested date
   */
  it('should return requested date when isClosingPeriod is false', () => {
    const requestedDate = '2024-06-15'
    const metadata = {
      date: '2024-06-15',
      isClosingPeriod: false,
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(false)
    expect(result.snapshotDate).toBe('2024-06-15')
    expect(result.logicalDate).toBe('2024-06-15')
    expect(result.collectionDate).toBe('2024-06-15')
  })

  /**
   * Requirement 2.4: Undefined isClosingPeriod returns requested date
   */
  it('should return requested date when isClosingPeriod is undefined', () => {
    const requestedDate = '2024-06-15'
    const metadata = {
      date: '2024-06-15',
      // isClosingPeriod is undefined
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(false)
    expect(result.snapshotDate).toBe('2024-06-15')
    expect(result.logicalDate).toBe('2024-06-15')
  })

  /**
   * Requirement 2.4: Null metadata returns requested date
   */
  it('should return requested date when metadata is null', () => {
    const requestedDate = '2024-06-15'

    const result = transformService.determineSnapshotDate(requestedDate, null)

    expect(result.isClosingPeriod).toBe(false)
    expect(result.snapshotDate).toBe('2024-06-15')
    expect(result.logicalDate).toBe('2024-06-15')
    expect(result.collectionDate).toBe('2024-06-15')
    expect(result.dataMonth).toBe('2024-06')
  })

  /**
   * Requirement 2.3: Cross-year scenario - December data collected in January
   */
  it('should return December 31 of prior year for December data collected in January', () => {
    // Scenario: Data for December 2024 collected on January 5, 2025
    const requestedDate = '2025-01-05'
    const metadata = {
      date: '2025-01-05',
      isClosingPeriod: true,
      dataMonth: '2024-12',
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(true)
    expect(result.snapshotDate).toBe('2024-12-31')
    expect(result.logicalDate).toBe('2024-12-31')
    expect(result.collectionDate).toBe('2025-01-05')
    expect(result.dataMonth).toBe('2024-12')
  })

  /**
   * Requirement 2.3: Cross-year scenario with MM format dataMonth
   * When dataMonth is just "12" and collection is in January, should infer prior year
   */
  it('should handle cross-year scenario with MM format dataMonth', () => {
    // Scenario: Data month is "12" (December), collected on January 3, 2025
    // Should infer December 2024 (prior year)
    const requestedDate = '2025-01-03'
    const metadata = {
      date: '2025-01-03',
      isClosingPeriod: true,
      dataMonth: '12', // MM format without year
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(true)
    expect(result.snapshotDate).toBe('2024-12-31')
    expect(result.logicalDate).toBe('2024-12-31')
    expect(result.dataMonth).toBe('2024-12')
  })

  /**
   * Edge case: Closing period with missing dataMonth should fall back to requested date
   */
  it('should return requested date when isClosingPeriod is true but dataMonth is missing', () => {
    const requestedDate = '2024-07-03'
    const metadata = {
      date: '2024-07-03',
      isClosingPeriod: true,
      // dataMonth is missing
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    // Without dataMonth, cannot determine closing period date, falls back to non-closing behavior
    expect(result.isClosingPeriod).toBe(false)
    expect(result.snapshotDate).toBe('2024-07-03')
    expect(result.logicalDate).toBe('2024-07-03')
  })

  /**
   * Edge case: Closing period for 31-day month
   */
  it('should return correct last day for 31-day month', () => {
    // Scenario: Data for July 2024 collected on August 2, 2024
    const requestedDate = '2024-08-02'
    const metadata = {
      date: '2024-08-02',
      isClosingPeriod: true,
      dataMonth: '2024-07',
    }

    const result = transformService.determineSnapshotDate(
      requestedDate,
      metadata
    )

    expect(result.isClosingPeriod).toBe(true)
    expect(result.snapshotDate).toBe('2024-07-31')
    expect(result.logicalDate).toBe('2024-07-31')
  })
})

/**
 * Unit tests for shouldUpdateSnapshot method
 *
 * Tests the "newer data wins" logic for closing period snapshot updates.
 *
 * Requirements:
 * - 4.1: WHEN a closing period snapshot already exists THEN the TransformService SHALL read
 *        the existing snapshot's collection date
 * - 4.2: WHEN the new data has a strictly newer collection date THEN the TransformService
 *        SHALL overwrite the existing snapshot
 * - 4.3: WHEN the new data has an equal or older collection date THEN the TransformService
 *        SHALL skip the update and log a message
 * - 4.4: WHEN the existing snapshot has no collection date metadata THEN the TransformService
 *        SHALL allow the update
 */
describe('shouldUpdateSnapshot', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    transformService = new TransformService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  /**
   * Requirement 4.2: New data is strictly newer → returns true (allow update)
   */
  it('should return true when new data has a strictly newer collection date', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Create existing snapshot metadata with older collection date
    const existingMetadata = {
      snapshotId: snapshotDate,
      createdAt: '2025-01-03T10:00:00Z',
      collectionDate: '2025-01-03', // Older date
      schemaVersion: '1.0.0',
      status: 'success',
    }
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(existingMetadata)
    )

    // New data has a newer collection date
    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    expect(result).toBe(true)
  })

  /**
   * Requirement 4.3: New data has equal collection date → returns false (skip update)
   */
  it('should return false when new data has an equal collection date', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Create existing snapshot metadata with same collection date
    const existingMetadata = {
      snapshotId: snapshotDate,
      createdAt: '2025-01-05T10:00:00Z',
      collectionDate: '2025-01-05', // Same date
      schemaVersion: '1.0.0',
      status: 'success',
    }
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(existingMetadata)
    )

    // New data has the same collection date
    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    expect(result).toBe(false)
  })

  /**
   * Requirement 4.3: New data has older collection date → returns false (skip update)
   */
  it('should return false when new data has an older collection date', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Create existing snapshot metadata with newer collection date
    const existingMetadata = {
      snapshotId: snapshotDate,
      createdAt: '2025-01-07T10:00:00Z',
      collectionDate: '2025-01-07', // Newer date
      schemaVersion: '1.0.0',
      status: 'success',
    }
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(existingMetadata)
    )

    // New data has an older collection date
    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    expect(result).toBe(false)
  })

  /**
   * Requirement 4.1, 4.2: No existing snapshot → returns true (allow update)
   */
  it('should return true when no existing snapshot exists', async () => {
    const snapshotDate = '2024-12-31'
    // Don't create any snapshot directory or metadata

    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    expect(result).toBe(true)
  })

  /**
   * Requirement 4.4: Existing snapshot has no collectionDate → returns true (allow update)
   */
  it('should return true when existing snapshot has no collectionDate metadata', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Create existing snapshot metadata WITHOUT collectionDate or dataAsOfDate
    const existingMetadata = {
      snapshotId: snapshotDate,
      createdAt: '2025-01-03T10:00:00Z',
      schemaVersion: '1.0.0',
      status: 'success',
      // No collectionDate field
      // No dataAsOfDate field
    }
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(existingMetadata)
    )

    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    expect(result).toBe(true)
  })

  /**
   * Requirement 4.4: Fallback to dataAsOfDate when collectionDate is missing
   *
   * When collectionDate is not present but dataAsOfDate is, the method should
   * use dataAsOfDate for comparison.
   */
  it('should fall back to dataAsOfDate when collectionDate is missing', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Create existing snapshot metadata with dataAsOfDate but no collectionDate
    const existingMetadata = {
      snapshotId: snapshotDate,
      createdAt: '2025-01-03T10:00:00Z',
      dataAsOfDate: '2025-01-03', // Older date, used as fallback
      schemaVersion: '1.0.0',
      status: 'success',
      // No collectionDate field
    }
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(existingMetadata)
    )

    // New data has a newer collection date
    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    // Should return true because new data (2025-01-05) is newer than existing (2025-01-03)
    expect(result).toBe(true)
  })

  /**
   * Requirement 4.4: Fallback to dataAsOfDate - equal dates should skip update
   */
  it('should return false when dataAsOfDate equals new collection date', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Create existing snapshot metadata with dataAsOfDate but no collectionDate
    const existingMetadata = {
      snapshotId: snapshotDate,
      createdAt: '2025-01-05T10:00:00Z',
      dataAsOfDate: '2025-01-05', // Same date as new data
      schemaVersion: '1.0.0',
      status: 'success',
    }
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(existingMetadata)
    )

    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    // Should return false because dates are equal
    expect(result).toBe(false)
  })

  /**
   * Edge case: Invalid JSON in metadata file → returns true (allow update)
   */
  it('should return true when metadata file contains invalid JSON', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Write invalid JSON to metadata file
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      '{ invalid json content'
    )

    const mockLogger = createMockLogger()
    const serviceWithLogger = new TransformService({
      cacheDir: testCache.path,
      logger: mockLogger.logger,
    })

    const newCollectionDate = '2025-01-05'

    const result = await serviceWithLogger.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    // Should return true and log a warning
    expect(result).toBe(true)
    expect(mockLogger.warnings.length).toBeGreaterThan(0)
  })

  /**
   * Edge case: Metadata is not a valid object (e.g., null JSON) → returns true
   */
  it('should return true when metadata is null JSON', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Write null JSON to metadata file
    await fs.writeFile(path.join(snapshotDir, 'metadata.json'), 'null')

    const mockLogger = createMockLogger()
    const serviceWithLogger = new TransformService({
      cacheDir: testCache.path,
      logger: mockLogger.logger,
    })

    const newCollectionDate = '2025-01-05'

    const result = await serviceWithLogger.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    // Should return true and log a warning
    expect(result).toBe(true)
    expect(mockLogger.warnings.length).toBeGreaterThan(0)
  })

  /**
   * Edge case: collectionDate has wrong type → falls back to dataAsOfDate
   */
  it('should fall back to dataAsOfDate when collectionDate has wrong type', async () => {
    const snapshotDate = '2024-12-31'
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    await fs.mkdir(snapshotDir, { recursive: true })

    // Create metadata with collectionDate as number (wrong type)
    const existingMetadata = {
      snapshotId: snapshotDate,
      createdAt: '2025-01-03T10:00:00Z',
      collectionDate: 20250103, // Wrong type - should be string
      dataAsOfDate: '2025-01-03', // Fallback
      schemaVersion: '1.0.0',
      status: 'success',
    }
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(existingMetadata)
    )

    const newCollectionDate = '2025-01-05'

    const result = await transformService.shouldUpdateSnapshot(
      snapshotDate,
      newCollectionDate
    )

    // Should use dataAsOfDate as fallback and return true (new is newer)
    expect(result).toBe(true)
  })
})

/**
 * Unit tests for closing period metadata in snapshots
 *
 * Tests that the transform operation correctly includes closing period fields
 * in snapshot metadata when processing closing period data.
 *
 * Requirements:
 * - 3.1: WHEN creating a closing period snapshot THEN the metadata SHALL include `isClosingPeriodData: true`
 * - 3.2: WHEN creating a closing period snapshot THEN the metadata SHALL include `collectionDate`
 * - 3.3: WHEN creating a closing period snapshot THEN the metadata SHALL include `logicalDate`
 * - 3.4: WHEN creating a non-closing-period snapshot THEN the metadata SHALL NOT include closing period fields
 */
describe('closing period metadata in snapshots', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    transformService = new TransformService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  /**
   * Requirements 3.1, 3.2, 3.3: Closing period snapshot has all three fields
   */
  it('should include isClosingPeriodData, collectionDate, and logicalDate for closing period snapshot', async () => {
    const collectionDate = '2025-01-05'
    const dataMonth = '2024-12'
    const expectedSnapshotDate = '2024-12-31'

    // Create raw CSV directory with closing period metadata
    const rawCsvDir = path.join(testCache.path, 'raw-csv', collectionDate)
    await fs.mkdir(rawCsvDir, { recursive: true })

    // Write cache metadata indicating closing period
    const cacheMetadata = {
      date: collectionDate,
      isClosingPeriod: true,
      dataMonth: dataMonth,
    }
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify(cacheMetadata)
    )

    // Create district directory with sample CSV
    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    // Run transform
    const result = await transformService.transform({ date: collectionDate })

    expect(result.success).toBe(true)

    // Read the snapshot metadata from the correct location (last day of data month)
    const metadataPath = path.join(
      testCache.path,
      'snapshots',
      expectedSnapshotDate,
      'metadata.json'
    )
    const metadataContent = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(metadataContent)

    // Verify closing period fields are present (Requirements 3.1, 3.2, 3.3)
    expect(metadata.isClosingPeriodData).toBe(true)
    expect(metadata.collectionDate).toBe(collectionDate)
    expect(metadata.logicalDate).toBe(expectedSnapshotDate)

    // Verify snapshot is at the correct date
    expect(metadata.snapshotId).toBe(expectedSnapshotDate)
  })

  /**
   * Requirement 3.4: Non-closing period snapshot omits closing period fields
   */
  it('should NOT include closing period fields for non-closing period snapshot', async () => {
    const date = '2024-06-15'

    // Create raw CSV directory WITHOUT closing period metadata
    const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
    await fs.mkdir(rawCsvDir, { recursive: true })

    // Write cache metadata indicating NOT a closing period
    const cacheMetadata = {
      date: date,
      isClosingPeriod: false,
    }
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify(cacheMetadata)
    )

    // Create district directory with sample CSV
    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    // Run transform
    const result = await transformService.transform({ date })

    expect(result.success).toBe(true)

    // Read the snapshot metadata
    const metadataPath = path.join(
      testCache.path,
      'snapshots',
      date,
      'metadata.json'
    )
    const metadataContent = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(metadataContent)

    // Verify closing period fields are NOT present (Requirement 3.4)
    expect(metadata.isClosingPeriodData).toBeUndefined()
    expect(metadata.collectionDate).toBeUndefined()
    expect(metadata.logicalDate).toBeUndefined()

    // Verify snapshot is at the requested date
    expect(metadata.snapshotId).toBe(date)
  })

  /**
   * Requirement 3.4: Missing cache metadata results in non-closing period behavior
   */
  it('should NOT include closing period fields when cache metadata is missing', async () => {
    const date = '2024-06-15'

    // Create raw CSV directory WITHOUT metadata.json
    const rawCsvDir = path.join(testCache.path, 'raw-csv', date)
    await fs.mkdir(rawCsvDir, { recursive: true })

    // Create district directory with sample CSV (no metadata.json)
    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    // Run transform
    const result = await transformService.transform({ date })

    expect(result.success).toBe(true)

    // Read the snapshot metadata
    const metadataPath = path.join(
      testCache.path,
      'snapshots',
      date,
      'metadata.json'
    )
    const metadataContent = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(metadataContent)

    // Verify closing period fields are NOT present (Requirement 3.4)
    expect(metadata.isClosingPeriodData).toBeUndefined()
    expect(metadata.collectionDate).toBeUndefined()
    expect(metadata.logicalDate).toBeUndefined()
  })

  /**
   * Cross-year scenario: December data collected in January
   */
  it('should correctly handle cross-year closing period (December data in January)', async () => {
    const collectionDate = '2025-01-03'
    const dataMonth = '2024-12'
    const expectedSnapshotDate = '2024-12-31'

    // Create raw CSV directory with closing period metadata
    const rawCsvDir = path.join(testCache.path, 'raw-csv', collectionDate)
    await fs.mkdir(rawCsvDir, { recursive: true })

    // Write cache metadata indicating closing period for December
    const cacheMetadata = {
      date: collectionDate,
      isClosingPeriod: true,
      dataMonth: dataMonth,
    }
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify(cacheMetadata)
    )

    // Create district directory with sample CSV
    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    // Run transform
    const result = await transformService.transform({ date: collectionDate })

    expect(result.success).toBe(true)

    // Verify snapshot was created at December 31, 2024 (prior year)
    const snapshotDir = path.join(
      testCache.path,
      'snapshots',
      expectedSnapshotDate
    )
    const files = await fs.readdir(snapshotDir)
    expect(files).toContain('metadata.json')
    expect(files).toContain('district_1.json')

    // Read and verify metadata
    const metadataPath = path.join(snapshotDir, 'metadata.json')
    const metadataContent = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(metadataContent)

    expect(metadata.snapshotId).toBe(expectedSnapshotDate)
    expect(metadata.isClosingPeriodData).toBe(true)
    expect(metadata.collectionDate).toBe(collectionDate)
    expect(metadata.logicalDate).toBe(expectedSnapshotDate)
  })

  /**
   * Verify dataAsOfDate is set correctly for closing period snapshots
   */
  it('should set dataAsOfDate to snapshot date for closing period', async () => {
    const collectionDate = '2025-01-05'
    const dataMonth = '2024-12'
    const expectedSnapshotDate = '2024-12-31'

    // Create raw CSV directory with closing period metadata
    const rawCsvDir = path.join(testCache.path, 'raw-csv', collectionDate)
    await fs.mkdir(rawCsvDir, { recursive: true })

    const cacheMetadata = {
      date: collectionDate,
      isClosingPeriod: true,
      dataMonth: dataMonth,
    }
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify(cacheMetadata)
    )

    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    await transformService.transform({ date: collectionDate })

    const metadataPath = path.join(
      testCache.path,
      'snapshots',
      expectedSnapshotDate,
      'metadata.json'
    )
    const metadataContent = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(metadataContent)

    // dataAsOfDate should be the snapshot date (logical date)
    expect(metadata.dataAsOfDate).toBe(expectedSnapshotDate)
  })
})

/**
 * Integration tests for full transform flow with closing period
 *
 * These tests verify the complete end-to-end transform flow including:
 * - Reading cache metadata
 * - Determining snapshot date
 * - Creating snapshots at the correct location
 * - Including closing period metadata
 *
 * Requirements:
 * - 2.2: WHEN `isClosingPeriod` is true THEN write snapshot to lastDayOfDataMonth
 * - 3.1, 3.2, 3.3: Closing period metadata fields
 * - 5.1, 5.2: Snapshot directory structure
 */
describe('Integration: full transform flow with closing period', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    transformService = new TransformService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  /**
   * Full integration test: Closing period transform creates snapshot at correct date
   * with all required metadata fields
   */
  it('should create snapshot at last day of data month with closing period metadata', async () => {
    const collectionDate = '2025-01-05'
    const dataMonth = '2024-12'
    const expectedSnapshotDate = '2024-12-31'

    // Setup: Create raw CSV directory structure
    const rawCsvDir = path.join(testCache.path, 'raw-csv', collectionDate)
    await fs.mkdir(rawCsvDir, { recursive: true })

    // Setup: Write cache metadata indicating closing period
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify({
        date: collectionDate,
        isClosingPeriod: true,
        dataMonth: dataMonth,
      })
    )

    // Setup: Create multiple district directories with CSV data
    for (const districtId of ['1', '42']) {
      const districtDir = path.join(rawCsvDir, `district-${districtId}`)
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_CSV
      )
    }

    // Execute: Run transform
    const result = await transformService.transform({ date: collectionDate })

    // Verify: Transform succeeded
    expect(result.success).toBe(true)
    expect(result.districtsSucceeded).toContain('1')
    expect(result.districtsSucceeded).toContain('42')

    // Verify: Snapshot created at expected date (last day of data month)
    const snapshotDir = path.join(
      testCache.path,
      'snapshots',
      expectedSnapshotDate
    )
    const snapshotFiles = await fs.readdir(snapshotDir)

    expect(snapshotFiles).toContain('metadata.json')
    expect(snapshotFiles).toContain('manifest.json')
    expect(snapshotFiles).toContain('district_1.json')
    expect(snapshotFiles).toContain('district_42.json')

    // Verify: Metadata has correct closing period fields
    const metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(metadata.snapshotId).toBe(expectedSnapshotDate)
    expect(metadata.isClosingPeriodData).toBe(true)
    expect(metadata.collectionDate).toBe(collectionDate)
    expect(metadata.logicalDate).toBe(expectedSnapshotDate)
    expect(metadata.dataAsOfDate).toBe(expectedSnapshotDate)
    expect(metadata.successfulDistricts).toEqual(['1', '42'])

    // Verify: Manifest has correct structure
    const manifest = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'manifest.json'), 'utf-8')
    )
    expect(manifest.snapshotId).toBe(expectedSnapshotDate)
    expect(manifest.totalDistricts).toBe(2)
    expect(manifest.successfulDistricts).toBe(2)

    // Verify: District snapshots have correct data
    const district1 = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'district_1.json'), 'utf-8')
    )
    expect(district1.districtId).toBe('1')
    expect(district1.data.snapshotDate).toBe(expectedSnapshotDate)
  })

  /**
   * Integration test: Non-closing period transform creates snapshot at requested date
   */
  it('should create snapshot at requested date for non-closing period', async () => {
    const requestedDate = '2024-06-15'

    // Setup: Create raw CSV directory structure
    const rawCsvDir = path.join(testCache.path, 'raw-csv', requestedDate)
    await fs.mkdir(rawCsvDir, { recursive: true })

    // Setup: Write cache metadata indicating NOT a closing period
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify({
        date: requestedDate,
        isClosingPeriod: false,
      })
    )

    // Setup: Create district directory with CSV data
    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    // Execute: Run transform
    const result = await transformService.transform({ date: requestedDate })

    // Verify: Transform succeeded
    expect(result.success).toBe(true)

    // Verify: Snapshot created at requested date (not modified)
    const snapshotDir = path.join(testCache.path, 'snapshots', requestedDate)
    const snapshotFiles = await fs.readdir(snapshotDir)

    expect(snapshotFiles).toContain('metadata.json')
    expect(snapshotFiles).toContain('district_1.json')

    // Verify: Metadata does NOT have closing period fields
    const metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(metadata.snapshotId).toBe(requestedDate)
    expect(metadata.isClosingPeriodData).toBeUndefined()
    expect(metadata.collectionDate).toBeUndefined()
    expect(metadata.logicalDate).toBeUndefined()
  })

  /**
   * Integration test: Cross-year closing period (December data in January)
   */
  it('should handle cross-year closing period correctly', async () => {
    const collectionDate = '2025-01-03'
    const dataMonth = '2024-12'
    const expectedSnapshotDate = '2024-12-31'

    // Setup
    const rawCsvDir = path.join(testCache.path, 'raw-csv', collectionDate)
    await fs.mkdir(rawCsvDir, { recursive: true })

    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify({
        date: collectionDate,
        isClosingPeriod: true,
        dataMonth: dataMonth,
      })
    )

    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    // Execute
    const result = await transformService.transform({ date: collectionDate })

    // Verify
    expect(result.success).toBe(true)

    // Snapshot should be at December 31, 2024 (prior year)
    const snapshotDir = path.join(
      testCache.path,
      'snapshots',
      expectedSnapshotDate
    )
    const metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )

    expect(metadata.snapshotId).toBe('2024-12-31')
    expect(metadata.isClosingPeriodData).toBe(true)
    expect(metadata.collectionDate).toBe('2025-01-03')
    expect(metadata.logicalDate).toBe('2024-12-31')
  })
})

/**
 * Integration tests for "newer data wins" logic
 *
 * These tests verify that closing period snapshots are only updated
 * when the new data has a strictly newer collection date.
 *
 * Requirements:
 * - 4.2: WHEN new data has strictly newer collection date THEN overwrite
 * - 4.3: WHEN new data has equal or older collection date THEN skip
 */
describe('Integration: newer data wins', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    transformService = new TransformService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  /**
   * Helper to create raw CSV data for a collection date
   */
  async function setupRawCsvData(
    cacheDir: string,
    collectionDate: string,
    dataMonth: string,
    isClosingPeriod: boolean
  ): Promise<void> {
    const rawCsvDir = path.join(cacheDir, 'raw-csv', collectionDate)
    await fs.mkdir(rawCsvDir, { recursive: true })

    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify({
        date: collectionDate,
        isClosingPeriod,
        dataMonth,
      })
    )

    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )
  }

  /**
   * Requirement 4.2: New data is newer → snapshot is updated
   */
  it('should update snapshot when new data has newer collection date', async () => {
    const snapshotDate = '2024-12-31'
    const olderCollectionDate = '2025-01-03'
    const newerCollectionDate = '2025-01-05'

    // Setup: Create initial snapshot with older collection date
    await setupRawCsvData(testCache.path, olderCollectionDate, '2024-12', true)
    await transformService.transform({ date: olderCollectionDate })

    // Verify initial snapshot exists
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    let metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(metadata.collectionDate).toBe(olderCollectionDate)

    // Setup: Create new raw CSV data with newer collection date
    await setupRawCsvData(testCache.path, newerCollectionDate, '2024-12', true)

    // Execute: Run transform with newer data
    const result = await transformService.transform({
      date: newerCollectionDate,
    })

    // Verify: Transform succeeded and snapshot was updated
    expect(result.success).toBe(true)
    // Districts are processed and succeed (not skipped) because new data is newer
    expect(result.districtsProcessed).toContain('1')

    // Verify: Metadata now has newer collection date
    metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(metadata.collectionDate).toBe(newerCollectionDate)
  })

  /**
   * Requirement 4.3: New data has equal collection date → snapshot is NOT updated
   *
   * When shouldUpdateSnapshot returns false, the entire transform is skipped early
   * and returns empty arrays (not districtsSkipped). This is the expected behavior
   * for closing period "newer data wins" logic.
   */
  it('should skip update when new data has equal collection date', async () => {
    const snapshotDate = '2024-12-31'
    const collectionDate = '2025-01-05'

    // Setup: Create initial snapshot
    await setupRawCsvData(testCache.path, collectionDate, '2024-12', true)
    await transformService.transform({ date: collectionDate })

    // Get initial metadata timestamp
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    const initialMetadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    const initialCreatedAt = initialMetadata.createdAt

    // Wait a bit to ensure timestamp would be different if updated
    await new Promise(resolve => setTimeout(resolve, 10))

    // Execute: Run transform again with same collection date
    const result = await transformService.transform({ date: collectionDate })

    // Verify: Transform succeeded but entire operation was skipped early
    // (shouldUpdateSnapshot returned false, so no districts were processed)
    expect(result.success).toBe(true)
    expect(result.districtsProcessed).toEqual([])
    expect(result.districtsSucceeded).toEqual([])
    expect(result.districtsSkipped).toEqual([])

    // Verify: Metadata was NOT updated (createdAt unchanged)
    const finalMetadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(finalMetadata.createdAt).toBe(initialCreatedAt)
  })

  /**
   * Requirement 4.3: New data has older collection date → snapshot is NOT updated
   *
   * When shouldUpdateSnapshot returns false, the entire transform is skipped early
   * and returns empty arrays. This is the expected behavior for closing period
   * "newer data wins" logic.
   */
  it('should skip update when new data has older collection date', async () => {
    const snapshotDate = '2024-12-31'
    const newerCollectionDate = '2025-01-07'
    const olderCollectionDate = '2025-01-03'

    // Setup: Create initial snapshot with newer collection date
    await setupRawCsvData(testCache.path, newerCollectionDate, '2024-12', true)
    await transformService.transform({ date: newerCollectionDate })

    // Verify initial snapshot has newer date
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    let metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(metadata.collectionDate).toBe(newerCollectionDate)

    // Setup: Create raw CSV data with older collection date
    await setupRawCsvData(testCache.path, olderCollectionDate, '2024-12', true)

    // Execute: Run transform with older data
    const result = await transformService.transform({
      date: olderCollectionDate,
    })

    // Verify: Transform succeeded but entire operation was skipped early
    // (shouldUpdateSnapshot returned false, so no districts were processed)
    expect(result.success).toBe(true)
    expect(result.districtsProcessed).toEqual([])
    expect(result.districtsSucceeded).toEqual([])
    expect(result.districtsSkipped).toEqual([])

    // Verify: Metadata still has newer collection date (not overwritten)
    metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(metadata.collectionDate).toBe(newerCollectionDate)
  })

  /**
   * Edge case: Force flag overrides newer data wins logic
   */
  it('should update snapshot when force flag is true regardless of collection date', async () => {
    const snapshotDate = '2024-12-31'
    const newerCollectionDate = '2025-01-07'
    const olderCollectionDate = '2025-01-03'

    // Setup: Create initial snapshot with newer collection date
    await setupRawCsvData(testCache.path, newerCollectionDate, '2024-12', true)
    await transformService.transform({ date: newerCollectionDate })

    // Setup: Create raw CSV data with older collection date
    await setupRawCsvData(testCache.path, olderCollectionDate, '2024-12', true)

    // Execute: Run transform with force flag
    const result = await transformService.transform({
      date: olderCollectionDate,
      force: true,
    })

    // Verify: Transform succeeded and snapshot was updated despite older date
    expect(result.success).toBe(true)
    expect(result.districtsSucceeded).toContain('1')
    expect(result.districtsSkipped).toEqual([])

    // Verify: Metadata now has older collection date (force overrode protection)
    const snapshotDir = path.join(testCache.path, 'snapshots', snapshotDate)
    const metadata = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    expect(metadata.collectionDate).toBe(olderCollectionDate)
  })

  /**
   * Edge case: Non-closing period data doesn't use newer data wins logic
   */
  it('should not apply newer data wins logic to non-closing period snapshots', async () => {
    const requestedDate = '2024-06-15'

    // Setup: Create initial snapshot (non-closing period)
    const rawCsvDir = path.join(testCache.path, 'raw-csv', requestedDate)
    await fs.mkdir(rawCsvDir, { recursive: true })
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify({ date: requestedDate, isClosingPeriod: false })
    )
    const districtDir = path.join(rawCsvDir, 'district-1')
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      SAMPLE_CLUB_CSV
    )

    // First transform
    await transformService.transform({ date: requestedDate })

    // Second transform (without force) - should skip because snapshot exists
    const result = await transformService.transform({ date: requestedDate })

    // For non-closing period, standard skip logic applies (snapshot exists)
    expect(result.success).toBe(true)
    expect(result.districtsSkipped).toContain('1')
  })
})
