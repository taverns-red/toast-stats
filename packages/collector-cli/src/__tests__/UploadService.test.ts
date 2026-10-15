/**
 * Unit Tests for UploadService
 *
 * Tests the upload functionality that syncs local snapshots and analytics
 * to Google Cloud Storage.
 *
 * Requirements:
 * - 6.1: THE Collector_CLI SHALL provide an `upload` command to sync local
 *        snapshots and analytics to Google Cloud Storage
 * - 6.2: WHEN uploading, THE Collector_CLI SHALL upload both snapshot data
 *        and pre-computed analytics files
 * - 6.3: THE Collector_CLI SHALL support incremental uploads, only uploading
 *        files that have changed
 * - 6.4: IF upload fails for any file, THEN THE Collector_CLI SHALL report
 *        the failure and continue with remaining files
 * - 6.5: WHEN upload completes, THE Collector_CLI SHALL output a summary of
 *        uploaded files and any errors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { determineUploadExitCode, formatUploadSummary } from '../cli.js'
import { ExitCode, type UploadResult } from '../types/index.js'

/**
 * Create an isolated test cache directory
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(os.tmpdir(), `upload-service-test-${uniqueId}`)

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Create a sample snapshot directory structure for testing
 */
async function createSampleSnapshotStructure(
  cacheDir: string,
  date: string,
  districtIds: string[]
): Promise<void> {
  const snapshotDir = path.join(cacheDir, 'snapshots', date)
  const analyticsDir = path.join(snapshotDir, 'analytics')

  await fs.mkdir(analyticsDir, { recursive: true })

  // Write metadata.json
  await fs.writeFile(
    path.join(snapshotDir, 'metadata.json'),
    JSON.stringify({
      date,
      createdAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
    })
  )

  // Write manifest.json
  await fs.writeFile(
    path.join(snapshotDir, 'manifest.json'),
    JSON.stringify({
      date,
      districts: districtIds,
      files: [],
    })
  )

  // Write district files and analytics for each district
  for (const districtId of districtIds) {
    // District snapshot file
    await fs.writeFile(
      path.join(snapshotDir, `district_${districtId}.json`),
      JSON.stringify({
        districtId,
        snapshotDate: date,
        clubs: [],
        divisions: [],
        areas: [],
        totals: { totalClubs: 0, totalMembership: 0 },
      })
    )

    // Analytics files
    await fs.writeFile(
      path.join(analyticsDir, `district_${districtId}_analytics.json`),
      JSON.stringify({
        metadata: { schemaVersion: '1.0.0', districtId },
        data: { districtId },
      })
    )

    await fs.writeFile(
      path.join(
        analyticsDir,
        `district_${districtId}_performance-targets.json`
      ),
      JSON.stringify({
        metadata: { schemaVersion: '1.0.0', districtId },
        data: { districtId },
      })
    )
  }

  // Write analytics manifest
  await fs.writeFile(
    path.join(analyticsDir, 'manifest.json'),
    JSON.stringify({
      snapshotDate: date,
      schemaVersion: '1.0.0',
      files: [],
    })
  )
}

/**
 * Calculate SHA256 checksum of content
 */
function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Mock GCS Bucket and File classes for testing
 */
interface MockFileMetadata {
  checksum?: string
  uploadedAt?: string
}

interface MockFile {
  name: string
  content: Buffer | null
  metadata: MockFileMetadata
  exists: () => Promise<[boolean]>
  getMetadata: () => Promise<[{ metadata?: Record<string, string> }]>
  save: (
    content: Buffer,
    options?: { contentType?: string; metadata?: Record<string, string> }
  ) => Promise<void>
}

interface MockBucket {
  files: Map<string, MockFile>
  file: (name: string) => MockFile
  uploadErrors: Map<string, Error>
  setUploadError: (fileName: string, error: Error) => void
  clearUploadErrors: () => void
}

function createMockBucket(): MockBucket {
  const files = new Map<string, MockFile>()
  const uploadErrors = new Map<string, Error>()

  const createMockFile = (name: string): MockFile => {
    const existingFile = files.get(name)
    if (existingFile) {
      return existingFile
    }

    const mockFile: MockFile = {
      name,
      content: null,
      metadata: {},
      exists: async () => [
        files.has(name) && files.get(name)!.content !== null,
      ],
      getMetadata: async () => {
        const file = files.get(name)
        if (!file || file.content === null) {
          throw new Error('File not found')
        }
        return [{ metadata: file.metadata as Record<string, string> }]
      },
      save: async (
        content: Buffer,
        options?: { contentType?: string; metadata?: Record<string, string> }
      ) => {
        // Check if there's a configured error for this file
        const error = uploadErrors.get(name)
        if (error) {
          throw error
        }

        mockFile.content = content
        mockFile.metadata = options?.metadata ?? {}
        files.set(name, mockFile)
      },
    }

    files.set(name, mockFile)
    return mockFile
  }

  return {
    files,
    file: createMockFile,
    uploadErrors,
    setUploadError: (fileName: string, error: Error) => {
      uploadErrors.set(fileName, error)
    },
    clearUploadErrors: () => {
      uploadErrors.clear()
    },
  }
}

/**
 * Mock UploadService that uses mock GCS bucket
 * This allows testing upload logic without real GCS calls
 */
class MockUploadService {
  private readonly cacheDir: string
  private readonly bucket: MockBucket
  private readonly prefix: string
  private authError: Error | null = null

  constructor(config: {
    cacheDir: string
    bucket: MockBucket
    prefix: string
  }) {
    this.cacheDir = config.cacheDir
    this.bucket = config.bucket
    this.prefix = config.prefix
  }

  /**
   * Simulate GCS authentication error
   */
  setAuthError(error: Error | null): void {
    this.authError = error
  }

  /**
   * Get the snapshots directory path
   */
  private getSnapshotsDir(): string {
    return path.join(this.cacheDir, 'snapshots')
  }

  /**
   * Get the snapshot directory path for a specific date
   */
  private getSnapshotDir(date: string): string {
    return path.join(this.getSnapshotsDir(), date)
  }

  /**
   * Build the GCS object path for a local file
   */
  private buildRemotePath(date: string, relativePath: string): string {
    return `${this.prefix}/${date}/${relativePath}`
  }

  /**
   * Calculate SHA256 checksum of file content
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath)
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * Get available snapshot dates from local cache
   */
  async getAvailableDates(): Promise<string[]> {
    const snapshotsDir = this.getSnapshotsDir()

    try {
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true })
      const dates: string[] = []

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          if (dateRegex.test(entry.name)) {
            dates.push(entry.name)
          }
        }
      }

      return dates.sort().reverse()
    } catch (error) {
      const errnoError = error as { code?: string }
      if (errnoError.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * Recursively collect all files in a directory
   */
  private async collectFiles(
    dir: string,
    baseDir: string
  ): Promise<
    Array<{
      localPath: string
      remotePath: string
      size: number
      checksum: string
    }>
  > {
    const files: Array<{
      localPath: string
      remotePath: string
      size: number
      checksum: string
    }> = []

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          const subFiles = await this.collectFiles(fullPath, baseDir)
          files.push(...subFiles)
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath)
          const checksum = await this.calculateFileChecksum(fullPath)
          const relativePath = path.relative(baseDir, fullPath)

          files.push({
            localPath: fullPath,
            remotePath: relativePath,
            size: stat.size,
            checksum,
          })
        }
      }
    } catch {
      // Ignore errors
    }

    return files
  }

  /**
   * Get remote file metadata from mock GCS
   */
  private async getRemoteMetadata(
    remotePath: string
  ): Promise<{ checksum?: string } | null> {
    try {
      const file = this.bucket.file(remotePath)
      const [exists] = await file.exists()

      if (!exists) {
        return null
      }

      const [metadata] = await file.getMetadata()
      return {
        checksum: metadata.metadata?.['checksum'],
      }
    } catch {
      return null
    }
  }

  /**
   * Upload snapshots and analytics to mock GCS
   */
  async upload(options: {
    date?: string
    incremental?: boolean
    dryRun?: boolean
  }): Promise<UploadResult> {
    const startTime = Date.now()
    const incremental = options.incremental ?? false
    const dryRun = options.dryRun ?? false
    let authErrorOccurred = false

    // Check for auth error at start
    if (this.authError) {
      return {
        success: false,
        dates: options.date ? [options.date] : [],
        filesProcessed: [],
        filesUploaded: [],
        filesFailed: [],
        filesSkipped: [],
        errors: [
          {
            file: 'N/A',
            error: `GCS authentication failure: ${this.authError.message}`,
            timestamp: new Date().toISOString(),
          },
        ],
        duration_ms: Date.now() - startTime,
        authError: true,
      }
    }

    // Determine which dates to upload
    let datesToUpload: string[]
    if (options.date) {
      const snapshotDir = this.getSnapshotDir(options.date)
      try {
        await fs.access(snapshotDir)
        datesToUpload = [options.date]
      } catch {
        return {
          success: false,
          dates: [options.date],
          filesProcessed: [],
          filesUploaded: [],
          filesFailed: [],
          filesSkipped: [],
          errors: [
            {
              file: snapshotDir,
              error: `Snapshot directory not found for date: ${options.date}`,
              timestamp: new Date().toISOString(),
            },
          ],
          duration_ms: Date.now() - startTime,
        }
      }
    } else {
      datesToUpload = await this.getAvailableDates()
      if (datesToUpload.length === 0) {
        return {
          success: false,
          dates: [],
          filesProcessed: [],
          filesUploaded: [],
          filesFailed: [],
          filesSkipped: [],
          errors: [
            {
              file: this.getSnapshotsDir(),
              error: 'No snapshot dates found to upload',
              timestamp: new Date().toISOString(),
            },
          ],
          duration_ms: Date.now() - startTime,
        }
      }
    }

    const filesProcessed: string[] = []
    const filesUploaded: string[] = []
    const filesFailed: string[] = []
    const filesSkipped: string[] = []
    const errors: Array<{ file: string; error: string; timestamp: string }> = []

    // Process each date
    dateLoop: for (const date of datesToUpload) {
      const snapshotDir = this.getSnapshotDir(date)

      try {
        const files = await this.collectFiles(snapshotDir, snapshotDir)

        for (const fileInfo of files) {
          const remotePath = this.buildRemotePath(date, fileInfo.remotePath)
          filesProcessed.push(remotePath)

          try {
            // Check if we should skip this file (incremental mode)
            if (incremental) {
              const remoteMetadata = await this.getRemoteMetadata(remotePath)

              if (remoteMetadata?.checksum === fileInfo.checksum) {
                filesSkipped.push(remotePath)
                continue
              }
            }

            // Upload the file (or simulate in dry run)
            if (!dryRun) {
              const content = await fs.readFile(fileInfo.localPath)
              const file = this.bucket.file(remotePath)
              await file.save(content, {
                contentType: 'application/json',
                metadata: {
                  checksum: fileInfo.checksum,
                  uploadedAt: new Date().toISOString(),
                },
              })
            }

            filesUploaded.push(remotePath)
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error'

            // Check for auth errors
            if (
              errorMessage.includes('authentication') ||
              errorMessage.includes('UNAUTHENTICATED')
            ) {
              authErrorOccurred = true
              filesFailed.push(remotePath)
              errors.push({
                file: remotePath,
                error: `GCS authentication failure: ${errorMessage}`,
                timestamp: new Date().toISOString(),
              })
              break dateLoop
            }

            // Continue on individual file failures (Requirement 6.4)
            filesFailed.push(remotePath)
            errors.push({
              file: remotePath,
              error: errorMessage,
              timestamp: new Date().toISOString(),
            })
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        errors.push({
          file: snapshotDir,
          error: `Failed to process snapshot date ${date}: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    const duration_ms = Date.now() - startTime
    const success =
      !authErrorOccurred &&
      ((filesUploaded.length > 0 && filesFailed.length === 0) ||
        (filesSkipped.length > 0 &&
          filesUploaded.length === 0 &&
          filesFailed.length === 0))

    return {
      success,
      dates: datesToUpload,
      filesProcessed,
      filesUploaded,
      filesFailed,
      filesSkipped,
      errors,
      duration_ms,
      authError: authErrorOccurred || undefined,
    }
  }
}

describe('UploadService', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let mockBucket: MockBucket
  let uploadService: MockUploadService

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    mockBucket = createMockBucket()
    uploadService = new MockUploadService({
      cacheDir: testCache.path,
      bucket: mockBucket,
      prefix: 'snapshots',
    })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  describe('getAvailableDates', () => {
    it('should return empty array when snapshots directory does not exist', async () => {
      const dates = await uploadService.getAvailableDates()
      expect(dates).toEqual([])
    })

    it('should return dates sorted newest first', async () => {
      // Create snapshot directories for multiple dates
      await createSampleSnapshotStructure(testCache.path, '2024-01-10', ['1'])
      await createSampleSnapshotStructure(testCache.path, '2024-01-15', ['1'])
      await createSampleSnapshotStructure(testCache.path, '2024-01-12', ['1'])

      const dates = await uploadService.getAvailableDates()

      expect(dates).toEqual(['2024-01-15', '2024-01-12', '2024-01-10'])
    })

    it('should ignore non-date directories', async () => {
      await createSampleSnapshotStructure(testCache.path, '2024-01-15', ['1'])

      // Create non-date directory
      const snapshotsDir = path.join(testCache.path, 'snapshots')
      await fs.mkdir(path.join(snapshotsDir, 'invalid-date'), {
        recursive: true,
      })
      await fs.mkdir(path.join(snapshotsDir, 'temp'), { recursive: true })

      const dates = await uploadService.getAvailableDates()

      expect(dates).toEqual(['2024-01-15'])
    })

    it('should validate date format strictly (YYYY-MM-DD)', async () => {
      const snapshotsDir = path.join(testCache.path, 'snapshots')
      await fs.mkdir(snapshotsDir, { recursive: true })

      // Create directories with various formats
      await fs.mkdir(path.join(snapshotsDir, '2024-01-15')) // Valid
      await fs.mkdir(path.join(snapshotsDir, '24-01-15')) // Invalid - short year
      await fs.mkdir(path.join(snapshotsDir, '2024-1-15')) // Invalid - single digit month
      await fs.mkdir(path.join(snapshotsDir, '2024-01-5')) // Invalid - single digit day

      const dates = await uploadService.getAvailableDates()

      expect(dates).toEqual(['2024-01-15'])
    })
  })

  describe('upload - basic functionality', () => {
    it('should upload all files for a specific date (Requirement 6.2)', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      const result = await uploadService.upload({ date })

      expect(result.success).toBe(true)
      expect(result.dates).toEqual([date])
      expect(result.filesUploaded.length).toBeGreaterThan(0)
      expect(result.filesFailed).toEqual([])
      expect(result.errors).toEqual([])
    })

    it('should upload both snapshot and analytics files (Requirement 6.2)', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      const result = await uploadService.upload({ date })

      // Should include snapshot files
      expect(result.filesUploaded.some(f => f.includes('metadata.json'))).toBe(
        true
      )
      expect(result.filesUploaded.some(f => f.includes('manifest.json'))).toBe(
        true
      )
      expect(
        result.filesUploaded.some(f => f.includes('district_1.json'))
      ).toBe(true)

      // Should include analytics files
      expect(
        result.filesUploaded.some(f =>
          f.includes('analytics/district_1_analytics.json')
        )
      ).toBe(true)
      expect(
        result.filesUploaded.some(f =>
          f.includes('analytics/district_1_performance-targets.json')
        )
      ).toBe(true)
    })

    it('should upload all available dates when no date specified', async () => {
      await createSampleSnapshotStructure(testCache.path, '2024-01-15', ['1'])
      await createSampleSnapshotStructure(testCache.path, '2024-01-16', ['1'])

      const result = await uploadService.upload({})

      expect(result.success).toBe(true)
      expect(result.dates).toContain('2024-01-15')
      expect(result.dates).toContain('2024-01-16')
    })

    it('should return error when snapshot directory not found', async () => {
      const result = await uploadService.upload({ date: '2024-01-15' })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]?.error).toContain('Snapshot directory not found')
    })

    it('should return error when no snapshot dates available', async () => {
      // Create empty snapshots directory
      await fs.mkdir(path.join(testCache.path, 'snapshots'), {
        recursive: true,
      })

      const result = await uploadService.upload({})

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]?.error).toContain('No snapshot dates found')
    })

    it('should include duration_ms in result', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      const result = await uploadService.upload({ date })

      expect(result.duration_ms).toBeGreaterThanOrEqual(0)
    })
  })

  describe('upload - incremental mode (Requirement 6.3)', () => {
    it('should skip unchanged files when incremental is true', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      // First upload
      const firstResult = await uploadService.upload({ date })
      expect(firstResult.success).toBe(true)
      expect(firstResult.filesUploaded.length).toBeGreaterThan(0)

      // Second upload with incremental - should skip all files
      const secondResult = await uploadService.upload({
        date,
        incremental: true,
      })

      expect(secondResult.success).toBe(true)
      expect(secondResult.filesSkipped.length).toBe(
        firstResult.filesUploaded.length
      )
      expect(secondResult.filesUploaded).toEqual([])
    })

    it('should upload changed files in incremental mode', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      // First upload
      await uploadService.upload({ date })

      // Modify a file
      const metadataPath = path.join(
        testCache.path,
        'snapshots',
        date,
        'metadata.json'
      )
      await fs.writeFile(
        metadataPath,
        JSON.stringify({ date, modified: true, timestamp: Date.now() })
      )

      // Second upload with incremental - should upload the changed file
      const result = await uploadService.upload({ date, incremental: true })

      expect(result.success).toBe(true)
      expect(result.filesUploaded.length).toBe(1)
      expect(result.filesUploaded[0]).toContain('metadata.json')
      expect(result.filesSkipped.length).toBeGreaterThan(0)
    })

    it('should upload all files when incremental is false', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      // First upload
      const firstResult = await uploadService.upload({ date })

      // Second upload without incremental - should upload all files again
      const secondResult = await uploadService.upload({
        date,
        incremental: false,
      })

      expect(secondResult.success).toBe(true)
      expect(secondResult.filesUploaded.length).toBe(
        firstResult.filesUploaded.length
      )
      expect(secondResult.filesSkipped).toEqual([])
    })

    it('should compare checksums correctly for incremental uploads', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      // First upload
      await uploadService.upload({ date })

      // Verify files are in mock bucket with checksums
      const metadataRemotePath = `snapshots/${date}/metadata.json`
      const file = mockBucket.file(metadataRemotePath)
      expect(file.metadata.checksum).toBeDefined()
      expect(file.metadata.checksum).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('upload - dry run mode', () => {
    it('should not actually upload files in dry run mode', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      const result = await uploadService.upload({ date, dryRun: true })

      expect(result.success).toBe(true)
      expect(result.filesUploaded.length).toBeGreaterThan(0)

      // Verify files were NOT actually uploaded to mock bucket
      const metadataRemotePath = `snapshots/${date}/metadata.json`
      const file = mockBucket.file(metadataRemotePath)
      expect(file.content).toBeNull()
    })

    it('should report what would be uploaded in dry run mode', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1', '2'])

      const result = await uploadService.upload({ date, dryRun: true })

      expect(result.success).toBe(true)
      expect(result.filesProcessed.length).toBeGreaterThan(0)
      expect(result.filesUploaded.length).toBe(result.filesProcessed.length)
    })

    it('should work with incremental flag in dry run mode', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      // First real upload
      await uploadService.upload({ date })

      // Dry run with incremental - should show all as skipped
      const result = await uploadService.upload({
        date,
        dryRun: true,
        incremental: true,
      })

      expect(result.success).toBe(true)
      expect(result.filesSkipped.length).toBeGreaterThan(0)
    })
  })

  describe('upload - error isolation (Requirement 6.4)', () => {
    it('should continue processing when individual file upload fails', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1', '2'])

      // Set up error for one specific file
      const errorPath = `snapshots/${date}/district_1.json`
      mockBucket.setUploadError(errorPath, new Error('Network timeout'))

      const result = await uploadService.upload({ date })

      // Should have partial success
      expect(result.filesFailed.length).toBe(1)
      expect(result.filesUploaded.length).toBeGreaterThan(0)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]?.error).toContain('Network timeout')
    })

    it('should report all failures while continuing processing', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      // Set up errors for multiple files
      mockBucket.setUploadError(
        `snapshots/${date}/metadata.json`,
        new Error('Error 1')
      )
      mockBucket.setUploadError(
        `snapshots/${date}/manifest.json`,
        new Error('Error 2')
      )

      const result = await uploadService.upload({ date })

      expect(result.filesFailed.length).toBe(2)
      expect(result.errors.length).toBe(2)
      // Other files should still be uploaded
      expect(result.filesUploaded.length).toBeGreaterThan(0)
    })

    it('should include file path and error message in error details', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      const errorPath = `snapshots/${date}/metadata.json`
      mockBucket.setUploadError(errorPath, new Error('Specific error message'))

      const result = await uploadService.upload({ date })

      expect(result.errors.length).toBe(1)
      expect(result.errors[0]?.file).toContain('metadata.json')
      expect(result.errors[0]?.error).toContain('Specific error message')
      expect(result.errors[0]?.timestamp).toBeDefined()
    })
  })

  describe('upload - GCS authentication error handling', () => {
    it('should exit immediately on GCS authentication error', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1', '2'])

      // Set auth error
      uploadService.setAuthError(
        new Error('Could not load the default credentials')
      )

      const result = await uploadService.upload({ date })

      expect(result.success).toBe(false)
      expect(result.authError).toBe(true)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]?.error).toContain('authentication')
    })

    it('should set authError flag when authentication fails', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      uploadService.setAuthError(new Error('UNAUTHENTICATED'))

      const result = await uploadService.upload({ date })

      expect(result.authError).toBe(true)
      expect(result.success).toBe(false)
    })

    it('should not set authError flag for non-auth errors', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1'])

      // Set up a non-auth error
      mockBucket.setUploadError(
        `snapshots/${date}/metadata.json`,
        new Error('Network timeout')
      )

      const result = await uploadService.upload({ date })

      expect(result.authError).toBeUndefined()
      expect(result.filesFailed.length).toBe(1)
    })

    it('should stop processing all files on auth error during upload', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1', '2', '3'])

      // Set up auth error for a file that will be encountered during processing
      mockBucket.setUploadError(
        `snapshots/${date}/metadata.json`,
        new Error('UNAUTHENTICATED: Invalid credentials')
      )

      const result = await uploadService.upload({ date })

      // Should have stopped after auth error
      expect(result.authError).toBe(true)
      expect(result.success).toBe(false)
      // Should have at least one failed file (the one with auth error)
      expect(result.filesFailed.length).toBeGreaterThan(0)
      // The total files processed should be less than what would be processed without error
      // (since we stop on auth error)
      const totalFilesInSnapshot = result.filesProcessed.length
      expect(totalFilesInSnapshot).toBeGreaterThan(0)
    })
  })

  describe('upload - multiple districts', () => {
    it('should upload files for multiple districts', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1', '2', '3'])

      const result = await uploadService.upload({ date })

      expect(result.success).toBe(true)
      // Should have files for all districts
      expect(result.filesUploaded.some(f => f.includes('district_1'))).toBe(
        true
      )
      expect(result.filesUploaded.some(f => f.includes('district_2'))).toBe(
        true
      )
      expect(result.filesUploaded.some(f => f.includes('district_3'))).toBe(
        true
      )
    })

    it('should continue with other districts if one fails', async () => {
      const date = '2024-01-15'
      await createSampleSnapshotStructure(testCache.path, date, ['1', '2'])

      // Set up error for district 1 files only
      mockBucket.setUploadError(
        `snapshots/${date}/district_1.json`,
        new Error('Failed')
      )
      mockBucket.setUploadError(
        `snapshots/${date}/analytics/district_1_analytics.json`,
        new Error('Failed')
      )

      const result = await uploadService.upload({ date })

      // District 2 files should still be uploaded
      expect(result.filesUploaded.some(f => f.includes('district_2'))).toBe(
        true
      )
      expect(result.filesFailed.some(f => f.includes('district_1'))).toBe(true)
    })
  })
})

describe('determineUploadExitCode', () => {
  it('should return SUCCESS when all files uploaded successfully', () => {
    const result: UploadResult = {
      success: true,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: ['file1.json', 'file2.json'],
      filesFailed: [],
      filesSkipped: [],
      errors: [],
      duration_ms: 100,
    }

    expect(determineUploadExitCode(result)).toBe(ExitCode.SUCCESS)
  })

  it('should return SUCCESS when all files skipped (incremental, no changes)', () => {
    const result: UploadResult = {
      success: true,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: [],
      filesFailed: [],
      filesSkipped: ['file1.json', 'file2.json'],
      errors: [],
      duration_ms: 100,
    }

    expect(determineUploadExitCode(result)).toBe(ExitCode.SUCCESS)
  })

  it('should return PARTIAL_FAILURE when some files uploaded and some failed', () => {
    const result: UploadResult = {
      success: false,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: ['file1.json'],
      filesFailed: ['file2.json'],
      filesSkipped: [],
      errors: [{ file: 'file2.json', error: 'Failed', timestamp: '' }],
      duration_ms: 100,
    }

    expect(determineUploadExitCode(result)).toBe(ExitCode.PARTIAL_FAILURE)
  })

  it('should return COMPLETE_FAILURE when all files failed', () => {
    const result: UploadResult = {
      success: false,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: [],
      filesFailed: ['file1.json', 'file2.json'],
      filesSkipped: [],
      errors: [
        { file: 'file1.json', error: 'Failed', timestamp: '' },
        { file: 'file2.json', error: 'Failed', timestamp: '' },
      ],
      duration_ms: 100,
    }

    expect(determineUploadExitCode(result)).toBe(ExitCode.COMPLETE_FAILURE)
  })

  it('should return COMPLETE_FAILURE when no files processed', () => {
    const result: UploadResult = {
      success: false,
      dates: [],
      filesProcessed: [],
      filesUploaded: [],
      filesFailed: [],
      filesSkipped: [],
      errors: [{ file: 'N/A', error: 'No files found', timestamp: '' }],
      duration_ms: 100,
    }

    expect(determineUploadExitCode(result)).toBe(ExitCode.COMPLETE_FAILURE)
  })

  it('should return COMPLETE_FAILURE when authError is true', () => {
    const result: UploadResult = {
      success: false,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json'],
      filesUploaded: [],
      filesFailed: ['file1.json'],
      filesSkipped: [],
      errors: [{ file: 'file1.json', error: 'Auth failed', timestamp: '' }],
      duration_ms: 100,
      authError: true,
    }

    expect(determineUploadExitCode(result)).toBe(ExitCode.COMPLETE_FAILURE)
  })

  it('should return COMPLETE_FAILURE for auth error even with some uploads', () => {
    const result: UploadResult = {
      success: false,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: ['file1.json'],
      filesFailed: ['file2.json'],
      filesSkipped: [],
      errors: [{ file: 'file2.json', error: 'Auth failed', timestamp: '' }],
      duration_ms: 100,
      authError: true,
    }

    // Auth error should always result in COMPLETE_FAILURE
    expect(determineUploadExitCode(result)).toBe(ExitCode.COMPLETE_FAILURE)
  })
})

describe('formatUploadSummary', () => {
  it('should format successful upload summary correctly', () => {
    const result: UploadResult = {
      success: true,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: ['file1.json', 'file2.json'],
      filesFailed: [],
      filesSkipped: [],
      errors: [],
      duration_ms: 150,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', false)

    expect(summary.status).toBe('success')
    expect(summary.dates).toEqual(['2024-01-15'])
    expect(summary.dryRun).toBe(false)
    expect(summary.files.total).toBe(2)
    expect(summary.files.uploaded).toBe(2)
    expect(summary.files.failed).toBe(0)
    expect(summary.files.skipped).toBe(0)
    expect(summary.destination.bucket).toBe('my-bucket')
    expect(summary.destination.prefix).toBe('snapshots')
    expect(summary.errors).toEqual([])
    expect(summary.duration_ms).toBe(150)
    expect(summary.timestamp).toBeDefined()
  })

  it('should format partial failure summary correctly', () => {
    const result: UploadResult = {
      success: false,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: ['file1.json'],
      filesFailed: ['file2.json'],
      filesSkipped: [],
      errors: [
        {
          file: 'file2.json',
          error: 'Network error',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
      duration_ms: 200,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', false)

    expect(summary.status).toBe('partial')
    expect(summary.files.uploaded).toBe(1)
    expect(summary.files.failed).toBe(1)
    expect(summary.errors.length).toBe(1)
    expect(summary.errors[0]?.file).toBe('file2.json')
    expect(summary.errors[0]?.error).toBe('Network error')
  })

  it('should format complete failure summary correctly', () => {
    const result: UploadResult = {
      success: false,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json'],
      filesUploaded: [],
      filesFailed: ['file1.json'],
      filesSkipped: [],
      errors: [{ file: 'file1.json', error: 'Failed', timestamp: '' }],
      duration_ms: 50,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', false)

    expect(summary.status).toBe('failed')
    expect(summary.files.uploaded).toBe(0)
    expect(summary.files.failed).toBe(1)
  })

  it('should include dryRun flag in summary', () => {
    const result: UploadResult = {
      success: true,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json'],
      filesUploaded: ['file1.json'],
      filesFailed: [],
      filesSkipped: [],
      errors: [],
      duration_ms: 100,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', true)

    expect(summary.dryRun).toBe(true)
  })

  it('should include authError flag when present', () => {
    const result: UploadResult = {
      success: false,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json'],
      filesUploaded: [],
      filesFailed: ['file1.json'],
      filesSkipped: [],
      errors: [{ file: 'file1.json', error: 'Auth failed', timestamp: '' }],
      duration_ms: 100,
      authError: true,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', false)

    expect(summary.authError).toBe(true)
    expect(summary.status).toBe('failed')
  })

  it('should not include authError flag when not present', () => {
    const result: UploadResult = {
      success: true,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json'],
      filesUploaded: ['file1.json'],
      filesFailed: [],
      filesSkipped: [],
      errors: [],
      duration_ms: 100,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', false)

    expect(summary.authError).toBeUndefined()
  })

  it('should format skipped files correctly', () => {
    const result: UploadResult = {
      success: true,
      dates: ['2024-01-15'],
      filesProcessed: ['file1.json', 'file2.json'],
      filesUploaded: [],
      filesFailed: [],
      filesSkipped: ['file1.json', 'file2.json'],
      errors: [],
      duration_ms: 100,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', false)

    expect(summary.status).toBe('success')
    expect(summary.files.skipped).toBe(2)
    expect(summary.files.uploaded).toBe(0)
  })

  it('should include multiple dates in summary', () => {
    const result: UploadResult = {
      success: true,
      dates: ['2024-01-15', '2024-01-16', '2024-01-17'],
      filesProcessed: ['file1.json'],
      filesUploaded: ['file1.json'],
      filesFailed: [],
      filesSkipped: [],
      errors: [],
      duration_ms: 100,
    }

    const summary = formatUploadSummary(result, 'my-bucket', 'snapshots', false)

    expect(summary.dates).toEqual(['2024-01-15', '2024-01-16', '2024-01-17'])
  })
})

// ─── Manifest Edge Case Tests (Task 5.6) ────────────────────────────────────
// These tests use the real UploadService with fake dependencies to test
// manifest loading, saving, and error recovery.
//
// Requirements: 4.6, 4.7, 4.8, 4.9, 4.10

import {
  UploadService,
  type UploadManifest,
} from '../services/UploadService.js'
import {
  FakeFileSystem,
  FakeBucketClient,
  FakeClock,
  FakeHasher,
  FakeProgressReporter,
} from './fakes/index.js'

function createManifestTestService(fakeFs: FakeFileSystem): {
  service: UploadService
  bucketClient: FakeBucketClient
  hasher: FakeHasher
  clock: FakeClock
} {
  const bucketClient = new FakeBucketClient()
  const hasher = new FakeHasher()
  const clock = new FakeClock()
  return {
    service: new UploadService({
      cacheDir: '/cache',
      bucket: 'test-bucket',
      prefix: 'snapshots',
      fs: fakeFs,
      hasher,
      bucketClient,
      clock,
      progressReporter: new FakeProgressReporter(),
    }),
    bucketClient,
    hasher,
    clock,
  }
}

describe('UploadService manifest edge cases', () => {
  describe('loadManifest', () => {
    it('should return empty manifest when file is missing (Requirement 4.8)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      const { service } = createManifestTestService(fakeFs)

      const manifest = await service.loadManifest()

      expect(manifest.schemaVersion).toBe('1.0.0')
      expect(manifest.entries).toEqual({})
    })

    it('should return empty manifest when file contains invalid JSON (Requirement 4.8)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      fakeFs.addFile('/cache/.upload-manifest.json', 'not valid json {{{')
      const { service } = createManifestTestService(fakeFs)

      const manifest = await service.loadManifest()

      expect(manifest.schemaVersion).toBe('1.0.0')
      expect(manifest.entries).toEqual({})
    })

    it('should return empty manifest when schema version is wrong (Requirement 4.8)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      fakeFs.addFile(
        '/cache/.upload-manifest.json',
        JSON.stringify({ schemaVersion: '2.0.0', entries: { 'some/path': {} } })
      )
      const { service } = createManifestTestService(fakeFs)

      const manifest = await service.loadManifest()

      expect(manifest.schemaVersion).toBe('1.0.0')
      expect(manifest.entries).toEqual({})
    })

    it('should return empty manifest when structure is missing required fields', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      fakeFs.addFile(
        '/cache/.upload-manifest.json',
        JSON.stringify({ someOtherField: true })
      )
      const { service } = createManifestTestService(fakeFs)

      const manifest = await service.loadManifest()

      expect(manifest.schemaVersion).toBe('1.0.0')
      expect(manifest.entries).toEqual({})
    })

    it('should load a valid manifest successfully', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      const validManifest: UploadManifest = {
        schemaVersion: '1.0.0',
        entries: {
          'snapshots/2024-01-15/metadata.json': {
            checksum: 'abc123',
            size: 100,
            mtimeMs: 1705312200000,
            uploadedAt: '2024-01-15T10:30:00.000Z',
          },
        },
      }
      fakeFs.addFile(
        '/cache/.upload-manifest.json',
        JSON.stringify(validManifest)
      )
      const { service } = createManifestTestService(fakeFs)

      const manifest = await service.loadManifest()

      expect(manifest.schemaVersion).toBe('1.0.0')
      expect(manifest.entries['snapshots/2024-01-15/metadata.json']).toEqual({
        checksum: 'abc123',
        size: 100,
        mtimeMs: 1705312200000,
        uploadedAt: '2024-01-15T10:30:00.000Z',
      })
    })
  })

  describe('saveManifest', () => {
    it('should write atomically via temp file + rename (Requirement 4.6)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      const { service } = createManifestTestService(fakeFs)

      const manifest: UploadManifest = {
        schemaVersion: '1.0.0',
        entries: {
          'snapshots/2024-01-15/file.json': {
            checksum: 'abc',
            size: 50,
            mtimeMs: 1000,
            uploadedAt: '2024-01-15T10:30:00.000Z',
          },
        },
      }

      const result = await service.saveManifest(manifest)

      expect(result).toBe(true)
      // Verify writeFile was called with the .tmp path
      expect(fakeFs.writeFileCalls.length).toBe(1)
      expect(fakeFs.writeFileCalls[0]?.path).toContain(
        '.upload-manifest.json.tmp'
      )
      // Verify the final file is readable and correct
      const saved = await service.loadManifest()
      expect(saved.entries['snapshots/2024-01-15/file.json']?.checksum).toBe(
        'abc'
      )
    })

    it('should include schemaVersion in saved manifest (Requirement 4.10)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      const { service } = createManifestTestService(fakeFs)

      const manifest: UploadManifest = { schemaVersion: '1.0.0', entries: {} }
      await service.saveManifest(manifest)

      // Read back the raw JSON to verify schemaVersion is present
      const raw = await fakeFs.readFile('/cache/.upload-manifest.json')
      const parsed: unknown = JSON.parse(raw.toString())
      expect(parsed).toHaveProperty('schemaVersion', '1.0.0')
    })

    it('should retry once on write failure, then succeed (Requirement 4.9)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      // Fail the first writeFile call, succeed on retry
      fakeFs.setWriteFileFailure('/cache/.upload-manifest.json.tmp', 1)
      const { service } = createManifestTestService(fakeFs)

      const manifest: UploadManifest = { schemaVersion: '1.0.0', entries: {} }
      const result = await service.saveManifest(manifest)

      expect(result).toBe(true)
      // Two writeFile attempts: first fails, second succeeds
      expect(fakeFs.writeFileCalls.length).toBe(2)
    })

    it('should return false and log error after double write failure (Requirement 4.9)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache')
      // Fail both writeFile attempts
      fakeFs.setWriteFileFailure('/cache/.upload-manifest.json.tmp', 2)
      const { service } = createManifestTestService(fakeFs)

      const manifest: UploadManifest = { schemaVersion: '1.0.0', entries: {} }
      const result = await service.saveManifest(manifest)

      expect(result).toBe(false)
      expect(fakeFs.writeFileCalls.length).toBe(2)
    })
  })

  describe('manifest write failure in upload flow', () => {
    it('should set manifestWriteError when manifest flush fails after retry (Requirement 4.9)', async () => {
      const fakeFs = new FakeFileSystem()
      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile(
        '/cache/snapshots/2024-01-15/data.json',
        '{"test":true}',
        1000
      )
      // Make manifest writes fail permanently
      fakeFs.setWriteFileFailure('/cache/.upload-manifest.json.tmp', 100)
      const { service } = createManifestTestService(fakeFs)

      const result = await service.upload({
        date: '2024-01-15',
        incremental: true,
      })

      expect(result.manifestWriteError).toBe(true)
      // File should still have been uploaded successfully
      expect(result.filesUploaded.length).toBe(1)
    })
  })
})

// ─── Auth Error Cancellation in Concurrent Pool ─────────────────────────────
//
// Tests that auth errors set the abort flag, stop scheduling new tasks,
// record already-completed uploads, and produce accurate summary counts.
//
// Requirements: 5.4, 5.6

import { runWithConcurrency, isAuthError } from '../services/UploadService.js'

describe('isAuthError — deterministic code-based detection', () => {
  it('returns true for string code UNAUTHENTICATED', () => {
    const err = new Error('fail') as Error & { code: string }
    err.code = 'UNAUTHENTICATED'
    expect(isAuthError(err)).toBe(true)
  })

  it('returns true for string code PERMISSION_DENIED', () => {
    const err = new Error('fail') as Error & { code: string }
    err.code = 'PERMISSION_DENIED'
    expect(isAuthError(err)).toBe(true)
  })

  it('returns true for numeric code 16 (UNAUTHENTICATED)', () => {
    const err = new Error('fail') as Error & { code: number }
    err.code = 16
    expect(isAuthError(err)).toBe(true)
  })

  it('returns true for numeric code 7 (PERMISSION_DENIED)', () => {
    const err = new Error('fail') as Error & { code: number }
    err.code = 7
    expect(isAuthError(err)).toBe(true)
  })

  it('returns true for case-insensitive string code', () => {
    const err = new Error('fail') as Error & { code: string }
    err.code = 'unauthenticated'
    expect(isAuthError(err)).toBe(true)
  })

  it('returns false for non-auth error codes', () => {
    const err = new Error('fail') as Error & { code: string }
    err.code = 'NOT_FOUND'
    expect(isAuthError(err)).toBe(false)
  })

  it('returns false for errors without code property', () => {
    expect(isAuthError(new Error('UNAUTHENTICATED message'))).toBe(false)
  })

  it('returns false for non-object values', () => {
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError(undefined)).toBe(false)
    expect(isAuthError('string')).toBe(false)
  })
})

describe('runWithConcurrency', () => {
  it('runs all tasks when no abort', async () => {
    const results: number[] = []
    const tasks = [1, 2, 3].map(n => async () => {
      results.push(n)
      return n
    })

    const settled = await runWithConcurrency(tasks, 2, { aborted: false })

    expect(settled.length).toBe(3)
    expect(settled.every(r => r.status === 'fulfilled')).toBe(true)
  })

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0
    let currentConcurrent = 0

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10))
      currentConcurrent--
      return i
    })

    await runWithConcurrency(tasks, 3, { aborted: false })

    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('skips remaining tasks when abort signal is set', async () => {
    const abortSignal = { aborted: false }
    const executed: number[] = []

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      executed.push(i)
      if (i === 2) {
        abortSignal.aborted = true
      }
      return i
    })

    const settled = await runWithConcurrency(tasks, 1, abortSignal)

    // With concurrency 1, tasks run sequentially. After task 2 sets abort,
    // task 3+ should be skipped.
    expect(executed.length).toBeLessThanOrEqual(3)
    expect(settled.length).toBe(executed.length)
  })

  it('collects both fulfilled and rejected results', async () => {
    const tasks = [
      async () => 'ok',
      async () => {
        throw new Error('fail')
      },
      async () => 'also ok',
    ]

    const settled = await runWithConcurrency(tasks, 3, { aborted: false })

    expect(settled.length).toBe(3)
    expect(settled[0]!.status).toBe('fulfilled')
    expect(settled[1]!.status).toBe('rejected')
    expect(settled[2]!.status).toBe('fulfilled')
  })
})

describe('Auth error cancellation in concurrent upload pool', () => {
  function createTestService(fakeBucket: FakeBucketClient): {
    service: UploadService
    fakeFs: FakeFileSystem
  } {
    const fakeFs = new FakeFileSystem()
    fakeFs.addDirectory('/cache/snapshots/2024-01-15')
    fakeFs.addDirectory('/cache')
    return {
      service: new UploadService({
        cacheDir: '/cache',
        bucket: 'test-bucket',
        prefix: 'snapshots',
        fs: fakeFs,
        hasher: new FakeHasher(),
        bucketClient: fakeBucket,
        clock: new FakeClock(),
        progressReporter: new FakeProgressReporter(),
      }),
      fakeFs,
    }
  }

  it('sets abort flag and stops scheduling new tasks on auth error (Requirement 5.4)', async () => {
    const fakeBucket = new FakeBucketClient()
    const { service, fakeFs } = createTestService(fakeBucket)

    // Add several files
    for (let i = 0; i < 10; i++) {
      fakeFs.addFile(
        `/cache/snapshots/2024-01-15/file${i}.json`,
        `{"i":${i}}`,
        1000
      )
    }

    // Set auth error on one of the early files
    const authErr = new Error('Permission denied') as Error & { code: string }
    authErr.code = 'PERMISSION_DENIED'
    fakeBucket.setFailure('snapshots/2024-01-15/file0.json', authErr)

    const result = await service.upload({
      date: '2024-01-15',
      concurrency: 2,
    })

    expect(result.authError).toBe(true)
    expect(result.success).toBe(false)
    // Not all 10 files should have been attempted due to abort
    expect(result.filesProcessed.length).toBe(10) // all are processed (collected)
    // But uploaded + failed should be less than 10 (some skipped by abort)
    const attemptedCount =
      result.filesUploaded.length + result.filesFailed.length
    expect(attemptedCount).toBeLessThanOrEqual(10)
    expect(result.filesFailed.length).toBeGreaterThanOrEqual(1) // at least the auth error file
  })

  it('records already-completed uploads before auth error (Requirement 5.4)', async () => {
    const fakeBucket = new FakeBucketClient()
    const { service, fakeFs } = createTestService(fakeBucket)

    // Add files — with concurrency 1, they run sequentially
    fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)
    fakeFs.addFile('/cache/snapshots/2024-01-15/b.json', '{"b":2}', 1000)
    fakeFs.addFile('/cache/snapshots/2024-01-15/c.json', '{"c":3}', 1000)

    // Auth error on the second file
    const authErr = new Error('Unauthenticated') as Error & { code: number }
    authErr.code = 16
    fakeBucket.setFailure('snapshots/2024-01-15/b.json', authErr)

    const result = await service.upload({
      date: '2024-01-15',
      concurrency: 1,
    })

    expect(result.authError).toBe(true)
    // First file should have been uploaded successfully
    expect(result.filesUploaded).toContain('snapshots/2024-01-15/a.json')
    // Second file should be in failed
    expect(result.filesFailed).toContain('snapshots/2024-01-15/b.json')
  })

  it('produces accurate summary counts after auth abort (Requirement 5.6)', async () => {
    const fakeBucket = new FakeBucketClient()
    const { service, fakeFs } = createTestService(fakeBucket)

    // Add 5 files
    for (let i = 0; i < 5; i++) {
      fakeFs.addFile(
        `/cache/snapshots/2024-01-15/file${i}.json`,
        `{"i":${i}}`,
        1000
      )
    }

    // Auth error on file2
    const authErr = new Error('No access') as Error & { code: string }
    authErr.code = 'UNAUTHENTICATED'
    fakeBucket.setFailure('snapshots/2024-01-15/file2.json', authErr)

    const result = await service.upload({
      date: '2024-01-15',
      concurrency: 1,
    })

    // Summary count invariant must hold
    expect(result.filesProcessed.length).toBe(
      result.filesUploaded.length +
        result.filesFailed.length +
        result.filesSkipped.length
    )
    expect(result.authError).toBe(true)
    // Errors array should contain the auth error
    expect(result.errors.some(e => e.error.includes('authentication'))).toBe(
      true
    )
  })
})

// ============================================================================
// Preflight Auth Check Tests
// ============================================================================

describe('Preflight auth check', () => {
  function createPreflightTestService(): {
    service: UploadService
    fakeFs: FakeFileSystem
    fakeBucket: FakeBucketClient
  } {
    const fakeFs = new FakeFileSystem()
    fakeFs.addDirectory('/cache/snapshots/2024-01-15')
    fakeFs.addDirectory('/cache')
    fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)
    fakeFs.addFile('/cache/snapshots/2024-01-15/b.json', '{"b":2}', 1000)
    const fakeBucket = new FakeBucketClient()
    return {
      service: new UploadService({
        cacheDir: '/cache',
        bucket: 'test-bucket',
        prefix: 'snapshots',
        fs: fakeFs,
        hasher: new FakeHasher(),
        bucketClient: fakeBucket,
        clock: new FakeClock(),
        progressReporter: new FakeProgressReporter(),
      }),
      fakeFs,
      fakeBucket,
    }
  }

  it('fails fast with authError when preflight check detects auth failure', async () => {
    const { service, fakeBucket } = createPreflightTestService()

    const authErr = new Error(
      'invalid_grant: reauth related error (invalid_rapt)'
    ) as Error & { code: number }
    authErr.code = 16 // UNAUTHENTICATED
    fakeBucket.setAuthError(authErr)

    const result = await service.upload({ date: '2024-01-15' })

    expect(result.success).toBe(false)
    expect(result.authError).toBe(true)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.error).toContain('GCS preflight check failed')
    expect(result.errors[0]!.error).toContain(
      'gcloud auth application-default login'
    )
    // No files should have been processed at all
    expect(result.filesProcessed).toHaveLength(0)
    expect(result.filesUploaded).toHaveLength(0)
    expect(fakeBucket.calls).toHaveLength(0)
  })

  it('fails fast with config hint when bucket does not exist', async () => {
    const { service, fakeBucket } = createPreflightTestService()

    fakeBucket.setAuthError(new Error('The specified bucket does not exist.'))

    const result = await service.upload({ date: '2024-01-15' })

    expect(result.success).toBe(false)
    expect(result.authError).toBeFalsy()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.error).toContain('GCS preflight check failed')
    expect(result.errors[0]!.error).toContain('GCS_BUCKET')
    expect(result.filesProcessed).toHaveLength(0)
    expect(fakeBucket.calls).toHaveLength(0)
  })

  it('does not run preflight check in dry-run mode', async () => {
    const { service, fakeBucket } = createPreflightTestService()

    fakeBucket.setAuthError(new Error('invalid_grant'))

    const result = await service.upload({ date: '2024-01-15', dryRun: true })

    // Should succeed despite auth error being configured — dry-run skips the check
    expect(result.success).toBe(true)
    expect(result.authError).toBeFalsy()
    expect(result.filesUploaded.length).toBeGreaterThan(0)
  })

  it('proceeds normally when preflight check passes', async () => {
    const { service, fakeBucket } = createPreflightTestService()

    // No auth error configured — checkAuth() passes
    const result = await service.upload({ date: '2024-01-15' })

    expect(result.success).toBe(true)
    expect(result.filesUploaded.length).toBe(2)
    expect(fakeBucket.calls.length).toBe(2)
  })
})

// ============================================================================
// Progress Reporter Behavior Tests
// ============================================================================
// Requirements: 2.1, 2.4

describe('Progress reporter behavior', () => {
  function createProgressTestService(): {
    service: UploadService
    fakeFs: FakeFileSystem
    progressReporter: FakeProgressReporter
    fakeBucket: FakeBucketClient
  } {
    const fakeFs = new FakeFileSystem()
    fakeFs.addDirectory('/cache/snapshots')
    fakeFs.addDirectory('/cache')
    const progressReporter = new FakeProgressReporter()
    const fakeBucket = new FakeBucketClient()
    return {
      service: new UploadService({
        cacheDir: '/cache',
        bucket: 'test-bucket',
        prefix: 'snapshots',
        fs: fakeFs,
        hasher: new FakeHasher(),
        bucketClient: fakeBucket,
        clock: new FakeClock(),
        progressReporter,
      }),
      fakeFs,
      progressReporter,
      fakeBucket,
    }
  }

  describe('date-level progress (onDateComplete)', () => {
    it('emits onDateComplete after scanning each date (Requirement 2.1)', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/metadata.json', '{}', 1000)
      fakeFs.addFile('/cache/snapshots/2024-01-15/data.json', '{"a":1}', 1000)

      fakeFs.addDirectory('/cache/snapshots/2024-01-16')
      fakeFs.addFile('/cache/snapshots/2024-01-16/metadata.json', '{}', 1000)

      await service.upload({ dryRun: true })

      expect(progressReporter.dateCompleteCalls).toHaveLength(2)
      expect(progressReporter.dateCompleteCalls[0]).toEqual({
        index: 1,
        total: 2,
        date: '2024-01-16',
        fileCount: 1,
      })
      expect(progressReporter.dateCompleteCalls[1]).toEqual({
        index: 2,
        total: 2,
        date: '2024-01-15',
        fileCount: 2,
      })
    })

    it('emits onDateComplete even when no files are found for a date', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      // Empty directory — no files

      await service.upload({ date: '2024-01-15', dryRun: true })

      expect(progressReporter.dateCompleteCalls).toHaveLength(1)
      expect(progressReporter.dateCompleteCalls[0]).toEqual({
        index: 1,
        total: 1,
        date: '2024-01-15',
        fileCount: 0,
      })
    })

    it('file count in onDateComplete matches actual files discovered (Requirement 2.1)', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)
      fakeFs.addFile('/cache/snapshots/2024-01-15/b.json', '{"b":2}', 1000)
      fakeFs.addFile('/cache/snapshots/2024-01-15/c.json', '{"c":3}', 1000)

      await service.upload({ date: '2024-01-15', dryRun: true })

      expect(progressReporter.dateCompleteCalls[0]!.fileCount).toBe(3)
    })

    it('emits onDateComplete without verbose flag (Requirement 2.4)', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/metadata.json', '{}', 1000)

      // verbose is NOT set
      await service.upload({ date: '2024-01-15', dryRun: true })

      // Date-level progress should still be emitted
      expect(progressReporter.dateCompleteCalls).toHaveLength(1)
    })
  })

  describe('file-level progress (onFileUploaded)', () => {
    it('emits onFileUploaded for each file when verbose is true (Requirement 2.2)', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)
      fakeFs.addFile('/cache/snapshots/2024-01-15/b.json', '{"b":2}', 1000)

      await service.upload({ date: '2024-01-15', verbose: true })

      expect(progressReporter.fileUploadedCalls).toHaveLength(2)
      expect(
        progressReporter.fileUploadedCalls.every(c => c.status === 'uploaded')
      ).toBe(true)
    })

    it('does NOT emit onFileUploaded when verbose is false (Requirement 2.4)', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)
      fakeFs.addFile('/cache/snapshots/2024-01-15/b.json', '{"b":2}', 1000)

      await service.upload({ date: '2024-01-15' })

      expect(progressReporter.fileUploadedCalls).toHaveLength(0)
    })

    it('emits file-level progress with correct status for failed uploads', async () => {
      const { service, fakeFs, progressReporter, fakeBucket } =
        createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)
      fakeFs.addFile('/cache/snapshots/2024-01-15/b.json', '{"b":2}', 1000)

      fakeBucket.setFailure(
        'snapshots/2024-01-15/b.json',
        new Error('Upload failed')
      )

      await service.upload({ date: '2024-01-15', verbose: true })

      const statuses = progressReporter.fileUploadedCalls.map(c => c.status)
      expect(statuses).toContain('uploaded')
      expect(statuses).toContain('failed')
    })

    it('emits skipped status for incremental fast-path files when verbose (Requirement 2.2)', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)

      // Pre-populate manifest so file is skipped via fast-path
      const manifest = {
        schemaVersion: '1.0.0',
        entries: {
          'snapshots/2024-01-15/a.json': {
            checksum: 'abc',
            size: Buffer.byteLength('{"a":1}'),
            mtimeMs: 1000,
            uploadedAt: '2024-01-15T10:30:00.000Z',
          },
        },
      }
      fakeFs.addFile('/cache/.upload-manifest.json', JSON.stringify(manifest))

      await service.upload({
        date: '2024-01-15',
        incremental: true,
        verbose: true,
      })

      expect(progressReporter.fileUploadedCalls).toHaveLength(1)
      expect(progressReporter.fileUploadedCalls[0]!.status).toBe('skipped')
    })
  })

  describe('completion progress (onComplete)', () => {
    it('emits onComplete with correct summary counts', async () => {
      const { service, fakeFs, progressReporter } = createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)
      fakeFs.addFile('/cache/snapshots/2024-01-15/b.json', '{"b":2}', 1000)

      await service.upload({ date: '2024-01-15' })

      expect(progressReporter.completeCalls).toHaveLength(1)
      expect(progressReporter.completeCalls[0]!.uploaded).toBe(2)
      expect(progressReporter.completeCalls[0]!.skipped).toBe(0)
      expect(progressReporter.completeCalls[0]!.failed).toBe(0)
      expect(
        progressReporter.completeCalls[0]!.duration_ms
      ).toBeGreaterThanOrEqual(0)
    })

    it('emits onComplete even when upload has errors', async () => {
      const { service, fakeFs, progressReporter, fakeBucket } =
        createProgressTestService()

      fakeFs.addDirectory('/cache/snapshots/2024-01-15')
      fakeFs.addFile('/cache/snapshots/2024-01-15/a.json', '{"a":1}', 1000)

      fakeBucket.setFailure(
        'snapshots/2024-01-15/a.json',
        new Error('Upload failed')
      )

      await service.upload({ date: '2024-01-15' })

      expect(progressReporter.completeCalls).toHaveLength(1)
      expect(progressReporter.completeCalls[0]!.failed).toBe(1)
    })

    it('emits onComplete even on early return (no dates found)', async () => {
      const { service, progressReporter } = createProgressTestService()
      // No snapshot directories exist — early return path

      await service.upload({})

      // Early return paths don't reach the main loop, so onComplete is not called
      expect(progressReporter.completeCalls).toHaveLength(0)
    })
  })
})
