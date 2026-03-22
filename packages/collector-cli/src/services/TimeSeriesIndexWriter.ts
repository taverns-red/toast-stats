/**
 * TimeSeriesIndexWriter
 *
 * Writes time-series index files during the compute-analytics pipeline.
 * This service generates program-year-partitioned index files for each district,
 * enabling efficient range queries in the backend without on-demand computation.
 *
 * Storage structure:
 * CACHE_DIR/time-series/
 * ├── district_42/
 * │   ├── 2023-2024.json            # Program year index
 * │   ├── 2022-2023.json
 * │   └── index-metadata.json
 * └── district_61/
 *     └── ...
 *
 * @module services
 * @see Requirements 4.1, 4.2, 4.5, 9.3, 10.2, 16.3
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { TimeSeriesDataPointBuilder } from '@toastmasters/analytics-core'
import type {
  TimeSeriesDataPoint,
  ProgramYearIndexFile,
  ProgramYearSummary,
  TimeSeriesIndexMetadata,
} from '@toastmasters/shared-contracts'

/**
 * Logger interface for TimeSeriesIndexWriter
 */
export interface TimeSeriesIndexWriterLogger {
  info(message: string, context?: Record<string, unknown>): void
  debug(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

/**
 * Configuration for TimeSeriesIndexWriter
 */
export interface TimeSeriesIndexWriterConfig {
  /** Base directory for cache storage */
  cacheDir: string
  /** Optional logger instance */
  logger?: TimeSeriesIndexWriterLogger
}

/**
 * Pattern for valid district IDs - only alphanumeric characters allowed
 */
const VALID_DISTRICT_ID_PATTERN = /^[A-Za-z0-9]+$/

/**
 * Pattern for valid program year format (e.g., "2023-2024")
 */
const VALID_PROGRAM_YEAR_PATTERN = /^\d{4}-\d{4}$/

/**
 * Default no-op logger for when no logger is provided
 */
const noopLogger: TimeSeriesIndexWriterLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
}

/**
 * Writes time-series index files during the compute-analytics pipeline.
 *
 * This service is responsible for:
 * - Writing time-series data points to program-year-partitioned index files
 * - Updating index metadata for each district
 * - Pre-computing program year summaries
 *
 * @see Requirements 4.1, 4.2
 */
export class TimeSeriesIndexWriter {
  private readonly cacheDir: string
  private readonly timeSeriesDir: string
  private readonly logger: TimeSeriesIndexWriterLogger
  private readonly builder: TimeSeriesDataPointBuilder

  constructor(config: TimeSeriesIndexWriterConfig) {
    this.cacheDir = config.cacheDir
    this.timeSeriesDir = path.join(this.cacheDir, 'time-series')
    this.logger = config.logger ?? noopLogger
    this.builder = new TimeSeriesDataPointBuilder()
  }

  /**
   * Get the TimeSeriesDataPointBuilder instance.
   * Useful for building data points before writing.
   *
   * @returns The TimeSeriesDataPointBuilder instance
   */
  getBuilder(): TimeSeriesDataPointBuilder {
    return this.builder
  }

  /**
   * Write time-series data point to the appropriate program year index.
   *
   * This method:
   * 1. Determines the program year for the data point's date
   * 2. Reads or creates the program year index file
   * 3. Adds or updates the data point in the index
   * 4. Recalculates the program year summary
   * 5. Writes the updated index file atomically
   *
   * @param districtId - The district ID to write data for
   * @param dataPoint - The time-series data point to write
   *
   * @see Requirements 4.2, 9.3
   */
  async writeDataPoint(
    districtId: string,
    dataPoint: TimeSeriesDataPoint
  ): Promise<void> {
    // Validate inputs
    this.validateDistrictId(districtId)
    this.validateDate(dataPoint.date, 'dataPoint.date')

    this.logger.info('Writing data point to time-series index', {
      operation: 'writeDataPoint',
      districtId,
      date: dataPoint.date,
      snapshotId: dataPoint.snapshotId,
    })

    try {
      // 1. Determine the program year for the data point's date
      const programYear = this.getProgramYearForDate(dataPoint.date)

      // 2. Ensure district directory exists
      await this.ensureDistrictDirectory(districtId)

      // 3. Read or create the program year index file
      let indexFile = await this.readProgramYearIndex(districtId, programYear)

      if (!indexFile) {
        // Create new index file
        indexFile = {
          districtId,
          programYear,
          startDate: this.getProgramYearStartDate(programYear),
          endDate: this.getProgramYearEndDate(programYear),
          lastUpdated: new Date().toISOString(),
          dataPoints: [],
          summary: {
            totalDataPoints: 0,
            membershipStart: 0,
            membershipEnd: 0,
            membershipPeak: 0,
            membershipLow: 0,
          },
        }

        this.logger.debug('Created new program year index file', {
          operation: 'writeDataPoint',
          districtId,
          programYear,
        })
      }

      // 4. Add or update the data point in the index (replace if same date exists)
      const existingIndex = indexFile.dataPoints.findIndex(
        dp => dp.date === dataPoint.date
      )

      if (existingIndex >= 0) {
        // Update existing data point
        indexFile.dataPoints[existingIndex] = dataPoint
        this.logger.debug('Updated existing data point in index', {
          operation: 'writeDataPoint',
          districtId,
          programYear,
          date: dataPoint.date,
        })
      } else {
        // Append new data point
        indexFile.dataPoints.push(dataPoint)
        this.logger.debug('Appended new data point to index', {
          operation: 'writeDataPoint',
          districtId,
          programYear,
          date: dataPoint.date,
        })
      }

      // Sort data points by date (chronological order)
      indexFile.dataPoints.sort((a, b) => a.date.localeCompare(b.date))

      // 5. Recalculate the program year summary
      indexFile.summary = this.calculateProgramYearSummary(indexFile.dataPoints)
      indexFile.lastUpdated = new Date().toISOString()

      // 6. Write the updated index file atomically
      await this.writeProgramYearIndex(districtId, programYear, indexFile)

      this.logger.info('Successfully wrote data point to time-series index', {
        operation: 'writeDataPoint',
        districtId,
        programYear,
        date: dataPoint.date,
        totalDataPoints: indexFile.dataPoints.length,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write data point to time-series index', {
        operation: 'writeDataPoint',
        districtId,
        date: dataPoint.date,
        error: errorMessage,
      })
      throw new Error(`Failed to write data point: ${errorMessage}`, {
        cause: error,
      })
    }
  }

  /**
   * Get accumulated payments trend for a district from the time-series index.
   *
   * Reads the program year index for the given date and returns all data points
   * as {date, payments} pairs. Called after writeDataPoint to get the full trend
   * history, which is then patched into analytics files (#206).
   *
   * @param districtId - The district ID
   * @param date - A date string (YYYY-MM-DD) used to determine the program year
   * @returns Array of {date, payments} pairs sorted chronologically, or empty array on error
   */
  async getPaymentsTrend(
    districtId: string,
    date: string
  ): Promise<Array<{ date: string; payments: number }>> {
    try {
      const programYear = this.getProgramYearForDate(date)
      const indexFile = await this.readProgramYearIndex(districtId, programYear)
      if (!indexFile) return []

      return indexFile.dataPoints.map(dp => ({
        date: dp.date,
        payments: dp.payments,
      }))
    } catch {
      this.logger.warn('Failed to read payments trend from time-series', {
        districtId,
        date,
      })
      return []
    }
  }

  /**
   * Update index metadata for a district.
   *
   * This method scans the district's time-series directory for all program year
   * index files and updates the index-metadata.json file with:
   * - List of available program years
   * - Total data points across all program years
   * - Last updated timestamp
   *
   * @param districtId - The district ID to update metadata for
   *
   * @see Requirements 4.5
   */
  async updateMetadata(districtId: string): Promise<void> {
    // Validate inputs
    this.validateDistrictId(districtId)

    this.logger.info('Updating index metadata for district', {
      operation: 'updateMetadata',
      districtId,
    })

    try {
      // 1. Ensure district directory exists
      const districtDir = await this.ensureDistrictDirectory(districtId)

      // 2. Scan for program year index files
      const programYears = await this.scanProgramYearFiles(districtDir)

      // 3. Collect metadata from each program year file
      let totalDataPoints = 0
      const availableProgramYears: string[] = []

      for (const programYear of programYears) {
        const indexFile = await this.readProgramYearIndex(
          districtId,
          programYear
        )
        if (indexFile) {
          availableProgramYears.push(programYear)
          totalDataPoints += indexFile.dataPoints.length
        }
      }

      // Sort program years chronologically
      availableProgramYears.sort()

      // 4. Build metadata object
      const metadata: TimeSeriesIndexMetadata = {
        districtId,
        lastUpdated: new Date().toISOString(),
        availableProgramYears,
        totalDataPoints,
      }

      // 5. Write metadata file atomically
      await this.writeMetadataFile(districtDir, metadata)

      this.logger.info('Successfully updated index metadata for district', {
        operation: 'updateMetadata',
        districtId,
        availableProgramYears: availableProgramYears.length,
        totalDataPoints,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to update index metadata for district', {
        operation: 'updateMetadata',
        districtId,
        error: errorMessage,
      })
      throw new Error(`Failed to update metadata: ${errorMessage}`, {
        cause: error,
      })
    }
  }

  /**
   * Scan a district directory for program year index files.
   *
   * @param districtDir - Path to the district directory
   * @returns Array of program year strings found (e.g., ["2022-2023", "2023-2024"])
   */
  protected async scanProgramYearFiles(districtDir: string): Promise<string[]> {
    const programYears: string[] = []

    try {
      const entries = await fs.readdir(districtDir, { withFileTypes: true })

      for (const entry of entries) {
        // Only process .json files (not directories or other files)
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue
        }

        // Skip metadata file
        if (entry.name === 'index-metadata.json') {
          continue
        }

        // Extract program year from filename (e.g., "2023-2024.json" -> "2023-2024")
        const programYear = entry.name.replace('.json', '')

        // Validate program year format
        if (VALID_PROGRAM_YEAR_PATTERN.test(programYear)) {
          programYears.push(programYear)
        }
      }

      this.logger.debug('Scanned district directory for program year files', {
        operation: 'scanProgramYearFiles',
        districtDir,
        programYearsFound: programYears.length,
      })

      return programYears
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        // Directory doesn't exist yet - return empty array
        this.logger.debug('District directory does not exist', {
          operation: 'scanProgramYearFiles',
          districtDir,
        })
        return []
      }

      throw error
    }
  }

  /**
   * Write the index metadata file atomically.
   *
   * @param districtDir - Path to the district directory
   * @param metadata - The metadata to write
   */
  protected async writeMetadataFile(
    districtDir: string,
    metadata: TimeSeriesIndexMetadata
  ): Promise<void> {
    const finalPath = path.join(districtDir, 'index-metadata.json')
    const tempPath = path.join(districtDir, 'index-metadata.json.tmp')

    try {
      // Write to temp file first
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf-8')

      // Rename to final path (atomic operation)
      await fs.rename(tempPath, finalPath)

      this.logger.debug('Wrote index metadata file', {
        operation: 'writeMetadataFile',
        filePath: finalPath,
        availableProgramYears: metadata.availableProgramYears.length,
        totalDataPoints: metadata.totalDataPoints,
      })
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write index metadata file', {
        operation: 'writeMetadataFile',
        filePath: finalPath,
        error: errorMessage,
      })
      throw new Error(`Failed to write metadata file: ${errorMessage}`, {
        cause: error,
      })
    }
  }

  // ========== Program Year Calculation Methods ==========
  // Migrated from backend/src/services/TimeSeriesIndexService.ts
  // @see Requirements 10.2

  /**
   * Get the program year for a given date.
   *
   * Toastmasters program years run from July 1 to June 30.
   * For example:
   * - 2023-07-01 to 2024-06-30 is program year "2023-2024"
   * - 2024-01-15 is in program year "2023-2024"
   * - 2024-07-01 is in program year "2024-2025"
   *
   * MIGRATED from backend TimeSeriesIndexService.getProgramYearForDate
   *
   * @param dateStr - Date string in YYYY-MM-DD format
   * @returns Program year string (e.g., "2023-2024")
   *
   * @see Requirements 10.2
   */
  getProgramYearForDate(dateStr: string): string {
    // Parse date string directly to avoid timezone issues
    // Expected format: YYYY-MM-DD
    const parts = dateStr.split('-')
    const year = parseInt(parts[0] ?? '0', 10)
    const month = parseInt(parts[1] ?? '0', 10)

    // If month is July (7) or later, program year starts this year
    // If month is before July, program year started last year
    if (month >= 7) {
      return `${year}-${year + 1}`
    } else {
      return `${year - 1}-${year}`
    }
  }

  /**
   * Get the start date of a program year.
   *
   * MIGRATED from backend TimeSeriesIndexService.getProgramYearStartDate
   *
   * @param programYear - Program year string (e.g., "2023-2024")
   * @returns Start date in YYYY-MM-DD format (e.g., "2023-07-01")
   *
   * @see Requirements 10.2
   */
  getProgramYearStartDate(programYear: string): string {
    const startYear = parseInt(programYear.split('-')[0] ?? '0', 10)
    return `${startYear}-07-01`
  }

  /**
   * Get the end date of a program year.
   *
   * MIGRATED from backend TimeSeriesIndexService.getProgramYearEndDate
   *
   * @param programYear - Program year string (e.g., "2023-2024")
   * @returns End date in YYYY-MM-DD format (e.g., "2024-06-30")
   *
   * @see Requirements 10.2
   */
  getProgramYearEndDate(programYear: string): string {
    const endYear = parseInt(programYear.split('-')[1] ?? '0', 10)
    return `${endYear}-06-30`
  }

  /**
   * Get all program years that overlap with a date range.
   *
   * MIGRATED from backend TimeSeriesIndexService.getProgramYearsInRange
   *
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   * @returns Array of program year strings
   *
   * @see Requirements 10.2
   */
  getProgramYearsInRange(startDate: string, endDate: string): string[] {
    const programYears: string[] = []

    const startProgramYear = this.getProgramYearForDate(startDate)
    const endProgramYear = this.getProgramYearForDate(endDate)

    // Extract start years
    const startYearNum = parseInt(startProgramYear.split('-')[0] ?? '0', 10)
    const endYearNum = parseInt(endProgramYear.split('-')[0] ?? '0', 10)

    // Generate all program years in range
    for (let year = startYearNum; year <= endYearNum; year++) {
      programYears.push(`${year}-${year + 1}`)
    }

    return programYears
  }

  // ========== Summary Calculation Methods ==========

  /**
   * Calculate summary statistics for a program year.
   *
   * Pre-computes summary statistics when writing index files,
   * so the backend doesn't need to compute them on-demand.
   *
   * MIGRATED from backend TimeSeriesIndexService.calculateProgramYearSummary
   *
   * @param dataPoints - Array of time-series data points
   * @returns Program year summary statistics
   *
   * @see Requirements 16.3
   */
  calculateProgramYearSummary(
    dataPoints: TimeSeriesDataPoint[]
  ): ProgramYearSummary {
    if (dataPoints.length === 0) {
      return {
        totalDataPoints: 0,
        membershipStart: 0,
        membershipEnd: 0,
        membershipPeak: 0,
        membershipLow: 0,
      }
    }

    const memberships = dataPoints.map(dp => dp.membership)
    const firstDataPoint = dataPoints[0]
    const lastDataPoint = dataPoints[dataPoints.length - 1]

    return {
      totalDataPoints: dataPoints.length,
      membershipStart: firstDataPoint?.membership ?? 0,
      membershipEnd: lastDataPoint?.membership ?? 0,
      membershipPeak: Math.max(...memberships),
      membershipLow: Math.min(...memberships),
    }
  }

  // ========== File I/O Methods (Protected for testing) ==========

  /**
   * Ensure the district directory exists.
   *
   * @param districtId - The district ID
   * @returns Path to the district directory
   */
  protected async ensureDistrictDirectory(districtId: string): Promise<string> {
    const districtDir = path.join(this.timeSeriesDir, `district_${districtId}`)
    await fs.mkdir(districtDir, { recursive: true })
    return districtDir
  }

  /**
   * Read a program year index file.
   *
   * @param districtId - The district ID
   * @param programYear - The program year (e.g., "2023-2024")
   * @returns The program year index file or null if not found
   */
  protected async readProgramYearIndex(
    districtId: string,
    programYear: string
  ): Promise<ProgramYearIndexFile | null> {
    const filePath = path.join(
      this.timeSeriesDir,
      `district_${districtId}`,
      `${programYear}.json`
    )

    // Normalize and ensure the resolved path stays within the timeSeriesDir
    const resolvedRoot = path.resolve(this.timeSeriesDir)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
      this.logger.error(
        'Resolved index file path is outside of timeSeriesDir',
        {
          operation: 'readProgramYearIndex',
          districtId,
          programYear,
          timeSeriesDir: resolvedRoot,
          resolvedPath,
        }
      )
      // Treat as not found to avoid exposing filesystem details
      return null
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf-8')
      const indexFile = JSON.parse(content) as ProgramYearIndexFile

      this.logger.debug('Read program year index file', {
        operation: 'readProgramYearIndex',
        districtId,
        programYear,
        filePath: resolvedPath,
        dataPointCount: indexFile.dataPoints.length,
      })

      return indexFile
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        this.logger.debug('Program year index file not found', {
          operation: 'readProgramYearIndex',
          districtId,
          programYear,
          filePath: resolvedPath,
        })
        return null
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to read program year index file', {
        operation: 'readProgramYearIndex',
        districtId,
        programYear,
        filePath: resolvedPath,
        error: errorMessage,
      })
      throw new Error(`Failed to read program year index: ${errorMessage}`, {
        cause: error,
      })
    }
  }

  /**
   * Write a program year index file atomically.
   *
   * Writes to a temp file first, then renames to ensure atomic operation.
   *
   * @param districtId - The district ID
   * @param programYear - The program year (e.g., "2023-2024")
   * @param indexFile - The program year index file to write
   *
   * @see Requirements 9.3
   */
  protected async writeProgramYearIndex(
    districtId: string,
    programYear: string,
    indexFile: ProgramYearIndexFile
  ): Promise<void> {
    const districtDir = path.join(this.timeSeriesDir, `district_${districtId}`)
    const finalPath = path.join(districtDir, `${programYear}.json`)
    const tempPath = path.join(districtDir, `${programYear}.json.tmp`)

    try {
      // Write to temp file first
      await fs.writeFile(tempPath, JSON.stringify(indexFile, null, 2), 'utf-8')

      // Rename to final path (atomic operation)
      await fs.rename(tempPath, finalPath)

      this.logger.debug('Wrote program year index file', {
        operation: 'writeProgramYearIndex',
        districtId,
        programYear,
        filePath: finalPath,
        dataPointCount: indexFile.dataPoints.length,
      })
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write program year index file', {
        operation: 'writeProgramYearIndex',
        districtId,
        programYear,
        filePath: finalPath,
        error: errorMessage,
      })
      throw new Error(`Failed to write program year index: ${errorMessage}`, {
        cause: error,
      })
    }
  }

  // ========== Validation Methods ==========

  /**
   * Validate a district ID.
   *
   * @param districtId - The district ID to validate
   * @throws Error if the district ID is invalid
   */
  protected validateDistrictId(districtId: string): void {
    if (typeof districtId !== 'string' || districtId.length === 0) {
      throw new Error('Invalid district ID: empty or non-string value')
    }

    if (!VALID_DISTRICT_ID_PATTERN.test(districtId)) {
      throw new Error(
        'Invalid district ID format: only alphanumeric characters allowed'
      )
    }
  }

  /**
   * Validate a program year string.
   *
   * @param programYear - The program year to validate
   * @throws Error if the program year is invalid
   */
  protected validateProgramYear(programYear: string): void {
    if (!VALID_PROGRAM_YEAR_PATTERN.test(programYear)) {
      throw new Error(
        'Invalid program year format: expected YYYY-YYYY (e.g., "2023-2024")'
      )
    }

    const parts = programYear.split('-')
    const startYear = parseInt(parts[0] ?? '0', 10)
    const endYear = parseInt(parts[1] ?? '0', 10)

    if (endYear !== startYear + 1) {
      throw new Error('Invalid program year: end year must be start year + 1')
    }
  }

  /**
   * Validate a date string.
   *
   * @param dateStr - The date string to validate
   * @param fieldName - The field name for error messages
   * @throws Error if the date is invalid
   */
  protected validateDate(dateStr: string, fieldName: string): void {
    if (typeof dateStr !== 'string' || dateStr.length === 0) {
      throw new Error(`Invalid ${fieldName}: empty or non-string value`)
    }

    // Check format YYYY-MM-DD
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!datePattern.test(dateStr)) {
      throw new Error(`Invalid ${fieldName} format: expected YYYY-MM-DD`)
    }
  }
}

/**
 * Factory function to create a TimeSeriesIndexWriter instance.
 *
 * @param config - Configuration for the writer
 * @returns A new TimeSeriesIndexWriter instance
 */
export function createTimeSeriesIndexWriter(
  config: TimeSeriesIndexWriterConfig
): TimeSeriesIndexWriter {
  return new TimeSeriesIndexWriter(config)
}
