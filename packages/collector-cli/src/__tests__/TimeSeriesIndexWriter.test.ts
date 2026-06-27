/**
 * Unit Tests for TimeSeriesIndexWriter
 *
 * Tests the time-series index file writing functionality for the compute-analytics pipeline.
 *
 * Requirements:
 * - 4.1: WHEN the collector-cli compute-analytics command runs, THE System SHALL generate
 *        time-series data points for each district
 * - 4.2: THE time-series data points SHALL be written to program-year-partitioned index files
 * - 4.5: THE compute-analytics command SHALL update the index-metadata.json file for each district
 *
 * @module __tests__/TimeSeriesIndexWriter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  TimeSeriesIndexWriter,
  createTimeSeriesIndexWriter,
  type TimeSeriesIndexWriterConfig,
  type TimeSeriesIndexWriterLogger,
} from '../services/TimeSeriesIndexWriter.js'
import type {
  TimeSeriesDataPoint,
  ProgramYearIndexFile,
  TimeSeriesIndexMetadata,
} from '@taverns-red/shared-contracts'

// ========== Test Utilities ==========

/**
 * Create an isolated test cache directory with unique naming
 * to ensure test isolation and prevent conflicts in parallel execution.
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(os.tmpdir(), `timeseries-writer-test-${uniqueId}`)

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Create a sample TimeSeriesDataPoint for testing
 */
function createSampleDataPoint(
  date: string,
  snapshotId: string,
  membership: number = 1000
): TimeSeriesDataPoint {
  return {
    date,
    snapshotId,
    membership,
    payments: Math.floor(membership * 0.9),
    dcpGoals: Math.floor(membership / 10),
    distinguishedTotal: Math.floor(membership / 50),
    clubCounts: {
      total: Math.floor(membership / 20),
      thriving: Math.floor(membership / 40),
      vulnerable: Math.floor(membership / 100),
      interventionRequired: Math.floor(membership / 200),
    },
  }
}

/**
 * Create a mock logger that captures log messages for verification
 */
function createMockLogger(): TimeSeriesIndexWriterLogger & {
  logs: { level: string; message: string; context?: Record<string, unknown> }[]
} {
  const logs: {
    level: string
    message: string
    context?: Record<string, unknown>
  }[] = []
  return {
    logs,
    info: (message: string, context?: Record<string, unknown>) => {
      logs.push({ level: 'info', message, context })
    },
    debug: (message: string, context?: Record<string, unknown>) => {
      logs.push({ level: 'debug', message, context })
    },
    warn: (message: string, context?: Record<string, unknown>) => {
      logs.push({ level: 'warn', message, context })
    },
    error: (message: string, context?: Record<string, unknown>) => {
      logs.push({ level: 'error', message, context })
    },
  }
}

/**
 * Read a program year index file directly from disk
 */
async function readProgramYearFile(
  cacheDir: string,
  districtId: string,
  programYear: string
): Promise<ProgramYearIndexFile | null> {
  const filePath = path.join(
    cacheDir,
    'time-series',
    `district_${districtId}`,
    `${programYear}.json`
  )
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as ProgramYearIndexFile
  } catch {
    return null
  }
}

/**
 * Read the index metadata file directly from disk
 */
async function readMetadataFile(
  cacheDir: string,
  districtId: string
): Promise<TimeSeriesIndexMetadata | null> {
  const filePath = path.join(
    cacheDir,
    'time-series',
    `district_${districtId}`,
    'index-metadata.json'
  )
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as TimeSeriesIndexMetadata
  } catch {
    return null
  }
}

// ========== Test Suite ==========

describe('TimeSeriesIndexWriter', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let writer: TimeSeriesIndexWriter
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })
    mockLogger = createMockLogger()

    writer = new TimeSeriesIndexWriter({
      cacheDir: testCache.path,
      logger: mockLogger,
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  // ========== Factory Function Tests ==========

  describe('createTimeSeriesIndexWriter', () => {
    it('should create a TimeSeriesIndexWriter instance', () => {
      const config: TimeSeriesIndexWriterConfig = {
        cacheDir: testCache.path,
      }
      const instance = createTimeSeriesIndexWriter(config)
      expect(instance).toBeInstanceOf(TimeSeriesIndexWriter)
    })

    it('should create instance with logger', () => {
      const config: TimeSeriesIndexWriterConfig = {
        cacheDir: testCache.path,
        logger: mockLogger,
      }
      const instance = createTimeSeriesIndexWriter(config)
      expect(instance).toBeInstanceOf(TimeSeriesIndexWriter)
    })
  })

  // ========== getBuilder Tests ==========

  describe('getBuilder', () => {
    it('should return a TimeSeriesDataPointBuilder instance', () => {
      const builder = writer.getBuilder()
      expect(builder).toBeDefined()
      expect(typeof builder.build).toBe('function')
    })
  })

  // ========== getProgramYearForDate Tests ==========

  describe('getProgramYearForDate', () => {
    it('should return correct program year for date in July (start of program year)', () => {
      expect(writer.getProgramYearForDate('2023-07-01')).toBe('2023-2024')
      expect(writer.getProgramYearForDate('2024-07-15')).toBe('2024-2025')
    })

    it('should return correct program year for date in December (middle of program year)', () => {
      expect(writer.getProgramYearForDate('2023-12-15')).toBe('2023-2024')
      expect(writer.getProgramYearForDate('2024-12-01')).toBe('2024-2025')
    })

    it('should return correct program year for date in January (second half of program year)', () => {
      expect(writer.getProgramYearForDate('2024-01-15')).toBe('2023-2024')
      expect(writer.getProgramYearForDate('2025-01-01')).toBe('2024-2025')
    })

    it('should return correct program year for date in June (end of program year)', () => {
      expect(writer.getProgramYearForDate('2024-06-30')).toBe('2023-2024')
      expect(writer.getProgramYearForDate('2025-06-15')).toBe('2024-2025')
    })

    it('should handle boundary between program years correctly', () => {
      // June 30 is last day of 2023-2024
      expect(writer.getProgramYearForDate('2024-06-30')).toBe('2023-2024')
      // July 1 is first day of 2024-2025
      expect(writer.getProgramYearForDate('2024-07-01')).toBe('2024-2025')
    })
  })

  // ========== getProgramYearStartDate Tests ==========

  describe('getProgramYearStartDate', () => {
    it('should return July 1 of the start year', () => {
      expect(writer.getProgramYearStartDate('2023-2024')).toBe('2023-07-01')
      expect(writer.getProgramYearStartDate('2024-2025')).toBe('2024-07-01')
      expect(writer.getProgramYearStartDate('2022-2023')).toBe('2022-07-01')
    })
  })

  // ========== getProgramYearEndDate Tests ==========

  describe('getProgramYearEndDate', () => {
    it('should return June 30 of the end year', () => {
      expect(writer.getProgramYearEndDate('2023-2024')).toBe('2024-06-30')
      expect(writer.getProgramYearEndDate('2024-2025')).toBe('2025-06-30')
      expect(writer.getProgramYearEndDate('2022-2023')).toBe('2023-06-30')
    })
  })

  // ========== getProgramYearsInRange Tests ==========

  describe('getProgramYearsInRange', () => {
    it('should return single program year when range is within one year', () => {
      const result = writer.getProgramYearsInRange('2024-01-01', '2024-03-15')
      expect(result).toEqual(['2023-2024'])
    })

    it('should return multiple program years when range spans years', () => {
      const result = writer.getProgramYearsInRange('2023-08-01', '2024-08-01')
      expect(result).toEqual(['2023-2024', '2024-2025'])
    })

    it('should return three program years for multi-year range', () => {
      const result = writer.getProgramYearsInRange('2022-09-01', '2024-09-01')
      expect(result).toEqual(['2022-2023', '2023-2024', '2024-2025'])
    })
  })

  // ========== calculateProgramYearSummary Tests ==========

  describe('calculateProgramYearSummary', () => {
    it('should return zero values for empty data points array', () => {
      const summary = writer.calculateProgramYearSummary([])
      expect(summary).toEqual({
        totalDataPoints: 0,
        membershipStart: 0,
        membershipEnd: 0,
        membershipPeak: 0,
        membershipLow: 0,
      })
    })

    it('should calculate correct summary for single data point', () => {
      const dataPoints = [createSampleDataPoint('2024-01-15', 'snap-1', 1000)]
      const summary = writer.calculateProgramYearSummary(dataPoints)

      expect(summary).toEqual({
        totalDataPoints: 1,
        membershipStart: 1000,
        membershipEnd: 1000,
        membershipPeak: 1000,
        membershipLow: 1000,
      })
    })

    it('should calculate correct summary for multiple data points', () => {
      const dataPoints = [
        createSampleDataPoint('2024-01-01', 'snap-1', 900),
        createSampleDataPoint('2024-01-15', 'snap-2', 1100),
        createSampleDataPoint('2024-02-01', 'snap-3', 1000),
      ]
      const summary = writer.calculateProgramYearSummary(dataPoints)

      expect(summary).toEqual({
        totalDataPoints: 3,
        membershipStart: 900,
        membershipEnd: 1000,
        membershipPeak: 1100,
        membershipLow: 900,
      })
    })

    it('should identify peak and low correctly with varying membership', () => {
      const dataPoints = [
        createSampleDataPoint('2024-01-01', 'snap-1', 500),
        createSampleDataPoint('2024-02-01', 'snap-2', 1500),
        createSampleDataPoint('2024-03-01', 'snap-3', 200),
        createSampleDataPoint('2024-04-01', 'snap-4', 800),
      ]
      const summary = writer.calculateProgramYearSummary(dataPoints)

      expect(summary.membershipPeak).toBe(1500)
      expect(summary.membershipLow).toBe(200)
      expect(summary.membershipStart).toBe(500)
      expect(summary.membershipEnd).toBe(800)
    })
  })

  // ========== writeDataPoint Tests ==========

  describe('writeDataPoint', () => {
    it('should create new program year index file when none exists', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      await writer.writeDataPoint(districtId, dataPoint)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile).not.toBeNull()
      expect(indexFile?.districtId).toBe(districtId)
      expect(indexFile?.programYear).toBe('2023-2024')
      expect(indexFile?.dataPoints).toHaveLength(1)
      expect(indexFile?.dataPoints[0]).toEqual(dataPoint)
    })

    it('should set correct start and end dates for program year', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      await writer.writeDataPoint(districtId, dataPoint)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.startDate).toBe('2023-07-01')
      expect(indexFile?.endDate).toBe('2024-06-30')
    })

    it('should append data point to existing index file', async () => {
      const districtId = '42'
      const dataPoint1 = createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      const dataPoint2 = createSampleDataPoint('2024-02-15', 'snap-2', 1100)

      await writer.writeDataPoint(districtId, dataPoint1)
      await writer.writeDataPoint(districtId, dataPoint2)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.dataPoints).toHaveLength(2)
      expect(indexFile?.dataPoints[0]).toEqual(dataPoint1)
      expect(indexFile?.dataPoints[1]).toEqual(dataPoint2)
    })

    it('should update existing data point with same date', async () => {
      const districtId = '42'
      const dataPoint1 = createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      const dataPoint2 = createSampleDataPoint('2024-01-15', 'snap-2', 1200)

      await writer.writeDataPoint(districtId, dataPoint1)
      await writer.writeDataPoint(districtId, dataPoint2)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.dataPoints).toHaveLength(1)
      expect(indexFile?.dataPoints[0]).toEqual(dataPoint2)
    })

    it('should sort data points chronologically', async () => {
      const districtId = '42'
      // Write out of order
      const dataPoint1 = createSampleDataPoint('2024-03-15', 'snap-3', 1200)
      const dataPoint2 = createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      const dataPoint3 = createSampleDataPoint('2024-02-15', 'snap-2', 1100)

      await writer.writeDataPoint(districtId, dataPoint1)
      await writer.writeDataPoint(districtId, dataPoint2)
      await writer.writeDataPoint(districtId, dataPoint3)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.dataPoints[0]?.date).toBe('2024-01-15')
      expect(indexFile?.dataPoints[1]?.date).toBe('2024-02-15')
      expect(indexFile?.dataPoints[2]?.date).toBe('2024-03-15')
    })

    it('should update summary when writing data points', async () => {
      const districtId = '42'
      const dataPoint1 = createSampleDataPoint('2024-01-15', 'snap-1', 900)
      const dataPoint2 = createSampleDataPoint('2024-02-15', 'snap-2', 1100)

      await writer.writeDataPoint(districtId, dataPoint1)
      await writer.writeDataPoint(districtId, dataPoint2)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.summary.totalDataPoints).toBe(2)
      expect(indexFile?.summary.membershipStart).toBe(900)
      expect(indexFile?.summary.membershipEnd).toBe(1100)
      expect(indexFile?.summary.membershipPeak).toBe(1100)
      expect(indexFile?.summary.membershipLow).toBe(900)
    })

    it('should update lastUpdated timestamp', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      const beforeWrite = new Date()
      await writer.writeDataPoint(districtId, dataPoint)
      const afterWrite = new Date()

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      const lastUpdated = new Date(indexFile?.lastUpdated ?? '')

      expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(
        beforeWrite.getTime()
      )
      expect(lastUpdated.getTime()).toBeLessThanOrEqual(afterWrite.getTime())
    })

    it('should write to different program year files based on date', async () => {
      const districtId = '42'
      const dataPoint2023 = createSampleDataPoint('2024-01-15', 'snap-1', 1000) // 2023-2024
      const dataPoint2024 = createSampleDataPoint('2024-08-15', 'snap-2', 1100) // 2024-2025

      await writer.writeDataPoint(districtId, dataPoint2023)
      await writer.writeDataPoint(districtId, dataPoint2024)

      const indexFile2023 = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      const indexFile2024 = await readProgramYearFile(
        testCache.path,
        districtId,
        '2024-2025'
      )

      expect(indexFile2023?.dataPoints).toHaveLength(1)
      expect(indexFile2024?.dataPoints).toHaveLength(1)
      expect(indexFile2023?.dataPoints[0]?.date).toBe('2024-01-15')
      expect(indexFile2024?.dataPoints[0]?.date).toBe('2024-08-15')
    })

    it('should handle multiple districts independently', async () => {
      const dataPoint42 = createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      const dataPoint61 = createSampleDataPoint('2024-01-15', 'snap-2', 2000)

      await writer.writeDataPoint('42', dataPoint42)
      await writer.writeDataPoint('61', dataPoint61)

      const indexFile42 = await readProgramYearFile(
        testCache.path,
        '42',
        '2023-2024'
      )
      const indexFile61 = await readProgramYearFile(
        testCache.path,
        '61',
        '2023-2024'
      )

      expect(indexFile42?.districtId).toBe('42')
      expect(indexFile61?.districtId).toBe('61')
      expect(indexFile42?.dataPoints[0]?.membership).toBe(1000)
      expect(indexFile61?.dataPoints[0]?.membership).toBe(2000)
    })

    it('should log info message when writing data point', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      await writer.writeDataPoint(districtId, dataPoint)

      const infoLogs = mockLogger.logs.filter(l => l.level === 'info')
      expect(infoLogs.some(l => l.message.includes('Writing data point'))).toBe(
        true
      )
      expect(infoLogs.some(l => l.message.includes('Successfully wrote'))).toBe(
        true
      )
    })
  })

  // ========== updateMetadata Tests ==========

  describe('updateMetadata', () => {
    it('should create metadata file with empty program years when no index files exist', async () => {
      const districtId = '42'

      await writer.updateMetadata(districtId)

      const metadata = await readMetadataFile(testCache.path, districtId)
      expect(metadata).not.toBeNull()
      expect(metadata?.districtId).toBe(districtId)
      expect(metadata?.availableProgramYears).toEqual([])
      expect(metadata?.totalDataPoints).toBe(0)
    })

    it('should list available program years from index files', async () => {
      const districtId = '42'
      // Write data points to create index files
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-08-15', 'snap-2', 1100)
      )

      await writer.updateMetadata(districtId)

      const metadata = await readMetadataFile(testCache.path, districtId)
      expect(metadata?.availableProgramYears).toContain('2023-2024')
      expect(metadata?.availableProgramYears).toContain('2024-2025')
    })

    it('should sort program years chronologically', async () => {
      const districtId = '42'
      // Write in reverse order
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2025-01-15', 'snap-3', 1200)
      )
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2023-08-15', 'snap-1', 1000)
      )
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-08-15', 'snap-2', 1100)
      )

      await writer.updateMetadata(districtId)

      const metadata = await readMetadataFile(testCache.path, districtId)
      expect(metadata?.availableProgramYears).toEqual([
        '2023-2024',
        '2024-2025',
      ])
    })

    it('should calculate total data points across all program years', async () => {
      const districtId = '42'
      // Write 2 data points to 2023-2024
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-02-15', 'snap-2', 1100)
      )
      // Write 1 data point to 2024-2025
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-08-15', 'snap-3', 1200)
      )

      await writer.updateMetadata(districtId)

      const metadata = await readMetadataFile(testCache.path, districtId)
      expect(metadata?.totalDataPoints).toBe(3)
    })

    it('should update lastUpdated timestamp', async () => {
      const districtId = '42'
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )

      const beforeUpdate = new Date()
      await writer.updateMetadata(districtId)
      const afterUpdate = new Date()

      const metadata = await readMetadataFile(testCache.path, districtId)
      const lastUpdated = new Date(metadata?.lastUpdated ?? '')

      expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(
        beforeUpdate.getTime()
      )
      expect(lastUpdated.getTime()).toBeLessThanOrEqual(afterUpdate.getTime())
    })

    it('should handle multiple districts independently', async () => {
      // District 42: 2 data points
      await writer.writeDataPoint(
        '42',
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )
      await writer.writeDataPoint(
        '42',
        createSampleDataPoint('2024-02-15', 'snap-2', 1100)
      )
      // District 61: 1 data point
      await writer.writeDataPoint(
        '61',
        createSampleDataPoint('2024-01-15', 'snap-3', 2000)
      )

      await writer.updateMetadata('42')
      await writer.updateMetadata('61')

      const metadata42 = await readMetadataFile(testCache.path, '42')
      const metadata61 = await readMetadataFile(testCache.path, '61')

      expect(metadata42?.totalDataPoints).toBe(2)
      expect(metadata61?.totalDataPoints).toBe(1)
    })

    it('should log info message when updating metadata', async () => {
      const districtId = '42'
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )

      await writer.updateMetadata(districtId)

      const infoLogs = mockLogger.logs.filter(l => l.level === 'info')
      expect(
        infoLogs.some(l => l.message.includes('Updating index metadata'))
      ).toBe(true)
      expect(
        infoLogs.some(l => l.message.includes('Successfully updated'))
      ).toBe(true)
    })
  })

  // ========== Validation Error Tests ==========

  describe('validation errors', () => {
    describe('district ID validation', () => {
      it('should throw error for empty district ID', async () => {
        const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

        await expect(writer.writeDataPoint('', dataPoint)).rejects.toThrow(
          'Invalid district ID: empty or non-string value'
        )
      })

      it('should throw error for district ID with special characters', async () => {
        const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

        await expect(writer.writeDataPoint('42/..', dataPoint)).rejects.toThrow(
          'Invalid district ID format: only alphanumeric characters allowed'
        )
      })

      it('should throw error for district ID with path traversal attempt', async () => {
        const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

        await expect(
          writer.writeDataPoint('../etc', dataPoint)
        ).rejects.toThrow(
          'Invalid district ID format: only alphanumeric characters allowed'
        )
      })

      it('should accept alphanumeric district IDs', async () => {
        const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

        // Should not throw
        await writer.writeDataPoint('42', dataPoint)
        await writer.writeDataPoint('F', dataPoint)
        await writer.writeDataPoint('District1', dataPoint)
      })
    })

    describe('date validation', () => {
      it('should throw error for empty date', async () => {
        const dataPoint = {
          ...createSampleDataPoint('2024-01-15', 'snap-1', 1000),
          date: '',
        }

        await expect(writer.writeDataPoint('42', dataPoint)).rejects.toThrow(
          'Invalid dataPoint.date: empty or non-string value'
        )
      })

      it('should throw error for invalid date format', async () => {
        const dataPoint = {
          ...createSampleDataPoint('2024-01-15', 'snap-1', 1000),
          date: '01-15-2024',
        }

        await expect(writer.writeDataPoint('42', dataPoint)).rejects.toThrow(
          'Invalid dataPoint.date format: expected YYYY-MM-DD'
        )
      })

      it('should throw error for date with invalid characters', async () => {
        const dataPoint = {
          ...createSampleDataPoint('2024-01-15', 'snap-1', 1000),
          date: '2024/01/15',
        }

        await expect(writer.writeDataPoint('42', dataPoint)).rejects.toThrow(
          'Invalid dataPoint.date format: expected YYYY-MM-DD'
        )
      })
    })

    describe('updateMetadata validation', () => {
      it('should throw error for empty district ID', async () => {
        await expect(writer.updateMetadata('')).rejects.toThrow(
          'Invalid district ID: empty or non-string value'
        )
      })

      it('should throw error for district ID with special characters', async () => {
        await expect(writer.updateMetadata('42/../')).rejects.toThrow(
          'Invalid district ID format: only alphanumeric characters allowed'
        )
      })
    })
  })

  // ========== Atomic Write Tests ==========

  describe('atomic writes', () => {
    it('should write program year index atomically (no temp file left behind)', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      await writer.writeDataPoint(districtId, dataPoint)

      // Check that no .tmp file exists
      const districtDir = path.join(
        testCache.path,
        'time-series',
        `district_${districtId}`
      )
      const files = await fs.readdir(districtDir)
      const tmpFiles = files.filter(f => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })

    it('should write metadata atomically (no temp file left behind)', async () => {
      const districtId = '42'
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )

      await writer.updateMetadata(districtId)

      // Check that no .tmp file exists
      const districtDir = path.join(
        testCache.path,
        'time-series',
        `district_${districtId}`
      )
      const files = await fs.readdir(districtDir)
      const tmpFiles = files.filter(f => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })

    it('should produce valid JSON in program year index file', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      await writer.writeDataPoint(districtId, dataPoint)

      const filePath = path.join(
        testCache.path,
        'time-series',
        `district_${districtId}`,
        '2023-2024.json'
      )
      const content = await fs.readFile(filePath, 'utf-8')

      // Should not throw
      expect(() => JSON.parse(content)).not.toThrow()
    })

    it('should produce valid JSON in metadata file', async () => {
      const districtId = '42'
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )

      await writer.updateMetadata(districtId)

      const filePath = path.join(
        testCache.path,
        'time-series',
        `district_${districtId}`,
        'index-metadata.json'
      )
      const content = await fs.readFile(filePath, 'utf-8')

      // Should not throw
      expect(() => JSON.parse(content)).not.toThrow()
    })
  })

  // ========== File Structure Tests ==========

  describe('file structure', () => {
    it('should create correct directory structure', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      await writer.writeDataPoint(districtId, dataPoint)

      // Verify directory structure
      const timeSeriesDir = path.join(testCache.path, 'time-series')
      const districtDir = path.join(timeSeriesDir, `district_${districtId}`)

      const timeSeriesStat = await fs.stat(timeSeriesDir)
      const districtStat = await fs.stat(districtDir)

      expect(timeSeriesStat.isDirectory()).toBe(true)
      expect(districtStat.isDirectory()).toBe(true)
    })

    it('should name program year files correctly', async () => {
      const districtId = '42'
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-08-15', 'snap-2', 1100)
      )

      const districtDir = path.join(
        testCache.path,
        'time-series',
        `district_${districtId}`
      )
      const files = await fs.readdir(districtDir)

      expect(files).toContain('2023-2024.json')
      expect(files).toContain('2024-2025.json')
    })

    it('should name metadata file correctly', async () => {
      const districtId = '42'
      await writer.writeDataPoint(
        districtId,
        createSampleDataPoint('2024-01-15', 'snap-1', 1000)
      )
      await writer.updateMetadata(districtId)

      const districtDir = path.join(
        testCache.path,
        'time-series',
        `district_${districtId}`
      )
      const files = await fs.readdir(districtDir)

      expect(files).toContain('index-metadata.json')
    })
  })

  // ========== Edge Cases ==========

  describe('edge cases', () => {
    it('should handle district ID with letters (e.g., "F" for undistricted)', async () => {
      const districtId = 'F'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 1000)

      await writer.writeDataPoint(districtId, dataPoint)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.districtId).toBe('F')
    })

    it('should handle very large membership numbers', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 999999)

      await writer.writeDataPoint(districtId, dataPoint)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.dataPoints[0]?.membership).toBe(999999)
    })

    it('should handle zero membership', async () => {
      const districtId = '42'
      const dataPoint = createSampleDataPoint('2024-01-15', 'snap-1', 0)

      await writer.writeDataPoint(districtId, dataPoint)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.dataPoints[0]?.membership).toBe(0)
    })

    it('should handle dates at program year boundaries', async () => {
      const districtId = '42'
      // Last day of 2023-2024
      const dataPointJune30 = createSampleDataPoint(
        '2024-06-30',
        'snap-1',
        1000
      )
      // First day of 2024-2025
      const dataPointJuly1 = createSampleDataPoint('2024-07-01', 'snap-2', 1100)

      await writer.writeDataPoint(districtId, dataPointJune30)
      await writer.writeDataPoint(districtId, dataPointJuly1)

      const indexFile2023 = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      const indexFile2024 = await readProgramYearFile(
        testCache.path,
        districtId,
        '2024-2025'
      )

      expect(indexFile2023?.dataPoints).toHaveLength(1)
      expect(indexFile2024?.dataPoints).toHaveLength(1)
      expect(indexFile2023?.dataPoints[0]?.date).toBe('2024-06-30')
      expect(indexFile2024?.dataPoints[0]?.date).toBe('2024-07-01')
    })

    it('should preserve all data point fields', async () => {
      const districtId = '42'
      const dataPoint: TimeSeriesDataPoint = {
        date: '2024-01-15',
        snapshotId: 'snap-unique-123',
        membership: 1234,
        payments: 1100,
        dcpGoals: 567,
        distinguishedTotal: 89,
        clubCounts: {
          total: 100,
          thriving: 60,
          vulnerable: 30,
          interventionRequired: 10,
        },
      }

      await writer.writeDataPoint(districtId, dataPoint)

      const indexFile = await readProgramYearFile(
        testCache.path,
        districtId,
        '2023-2024'
      )
      expect(indexFile?.dataPoints[0]).toEqual(dataPoint)
    })
  })
})
