/**
 * UploadService - Uploads snapshots and analytics to Google Cloud Storage.
 *
 * This service handles uploading local snapshot and analytics files to GCS,
 * supporting incremental uploads by comparing local file checksums with
 * remote metadata.
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
 *
 * Error Handling (from design.md):
 * - Upload failure (single file): Log error, continue with others, exit code 1 (partial)
 * - GCS authentication failure: Log error, exit code 2 (complete failure)
 */

import { Storage, Bucket } from '@google-cloud/storage'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { type Dirent } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Logger } from '@taverns-red/analytics-core'
import type { UploadResult } from '../types/index.js'

// ─── Injectable Dependency Interfaces ────────────────────────────────────────

/**
 * Minimal filesystem interface for upload operations.
 * Enables unit tests to use fakes without real IO.
 *
 * Requirements: 8.1, 8.3
 */
export interface FileSystem {
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  stat(path: string): Promise<{ size: number; mtimeMs: number }>
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  access(path: string): Promise<void>
}

/**
 * SHA256 hashing interface.
 * Enables deterministic test behavior.
 *
 * Requirements: 8.1, 8.3
 */
export interface Hasher {
  sha256(filePath: string): Promise<string>
}

/**
 * GCS upload operations interface — stream-based, no remote reads.
 * BucketClient SHALL NOT include an `exists()` method; incremental mode
 * uses the local manifest exclusively and never queries remote state.
 *
 * Requirements: 8.1, 8.3
 */
export interface BucketClient {
  uploadStream(
    remotePath: string,
    stream: Readable,
    contentType: string,
    metadata: Record<string, string>
  ): Promise<void>
  /** Lightweight auth check — throws on auth/permission failure */
  checkAuth(): Promise<void>
}

/**
 * Clock interface for timestamps.
 * Enables deterministic test behavior.
 *
 * Requirements: 8.1, 8.3
 */
export interface Clock {
  now(): string
}

/**
 * Progress reporter interface for streaming progress to stderr.
 * Date-level progress is emitted after scanning completes for each date
 * (so file count is known); file-level only under verbose.
 *
 * Requirements: 8.1, 8.3
 */
export interface ProgressReporter {
  onDateComplete(
    index: number,
    total: number,
    date: string,
    fileCount: number
  ): void
  onFileUploaded(
    remotePath: string,
    status: 'uploaded' | 'skipped' | 'failed'
  ): void
  onComplete(summary: {
    uploaded: number
    skipped: number
    failed: number
    duration_ms: number
  }): void
}

// ─── Upload Manifest Types ───────────────────────────────────────────────────

/**
 * A single entry in the upload manifest, recording metadata about a
 * successfully uploaded file.
 *
 * Requirements: 4.9
 */
export interface UploadManifestEntry {
  /** SHA256 checksum of the file content at upload time */
  checksum: string
  /** File size in bytes at upload time */
  size: number
  /** File modification time in milliseconds at upload time */
  mtimeMs: number
  /** ISO timestamp when the file was uploaded */
  uploadedAt: string
}

/**
 * Local upload manifest stored at `{cacheDir}/.upload-manifest.json`.
 * Keyed by GCS remote path for O(1) lookups.
 *
 * Requirements: 4.9, 4.10
 */
export interface UploadManifest {
  schemaVersion: '1.0.0'
  entries: Record<string, UploadManifestEntry>
}

// ─── Default Production Implementations ──────────────────────────────────────

/**
 * Default filesystem implementation wrapping `fs/promises`.
 *
 * Requirements: 8.2
 */
export class DefaultFileSystem implements FileSystem {
  async readdir(
    dirPath: string,
    options: { withFileTypes: true }
  ): Promise<Dirent[]> {
    return fs.readdir(dirPath, options)
  }

  async stat(filePath: string): Promise<{ size: number; mtimeMs: number }> {
    return fs.stat(filePath)
  }

  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath)
  }

  async writeFile(filePath: string, data: string): Promise<void> {
    await fs.writeFile(filePath, data)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath)
  }

  async access(filePath: string): Promise<void> {
    await fs.access(filePath)
  }
}

/**
 * Default hasher implementation wrapping `crypto.createHash('sha256')`.
 * Reads the file via the injected FileSystem to stay consistent.
 *
 * Requirements: 8.2
 */
export class DefaultHasher implements Hasher {
  private readonly fs: FileSystem

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem
  }

  async sha256(filePath: string): Promise<string> {
    const content = await this.fs.readFile(filePath)
    return crypto.createHash('sha256').update(content).digest('hex')
  }
}

/**
 * Default GCS bucket client wrapping `createWriteStream` for stream-based upload.
 *
 * Requirements: 8.2
 */
export class DefaultBucketClient implements BucketClient {
  private readonly bucket: Bucket

  constructor(bucket: Bucket) {
    this.bucket = bucket
  }

  async uploadStream(
    remotePath: string,
    stream: Readable,
    contentType: string,
    metadata: Record<string, string>
  ): Promise<void> {
    const file = this.bucket.file(remotePath)
    const writeStream = file.createWriteStream({
      contentType,
      metadata: { metadata },
    })
    await pipeline(stream, writeStream)
  }

  async checkAuth(): Promise<void> {
    await this.bucket.getMetadata()
  }
}

/**
 * Default clock implementation wrapping `new Date().toISOString()`.
 *
 * Requirements: 8.2
 */
export class DefaultClock implements Clock {
  now(): string {
    return new Date().toISOString()
  }
}

/**
 * Default progress reporter that writes to `process.stderr`.
 *
 * Requirements: 8.2
 */
export class DefaultProgressReporter implements ProgressReporter {
  onDateComplete(
    index: number,
    total: number,
    date: string,
    fileCount: number
  ): void {
    process.stderr.write(`[${index}/${total}] ${date}: ${fileCount} files\n`)
  }

  onFileUploaded(
    remotePath: string,
    status: 'uploaded' | 'skipped' | 'failed'
  ): void {
    process.stderr.write(`  ${status}: ${remotePath}\n`)
  }

  onComplete(summary: {
    uploaded: number
    skipped: number
    failed: number
    duration_ms: number
  }): void {
    process.stderr.write(
      `Upload complete: ${summary.uploaded} uploaded, ${summary.skipped} skipped, ${summary.failed} failed (${summary.duration_ms}ms)\n`
    )
  }
}

// ─── Auth Error Detection ────────────────────────────────────────────────────

/**
 * Error codes that indicate GCS authentication/authorization failures.
 * These errors should cause immediate termination with exit code 2.
 */
const GCS_AUTH_ERROR_CODES = [
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'INVALID_ARGUMENT', // Often indicates credential issues
]

/**
 * Error message patterns that indicate authentication failures
 */
const GCS_AUTH_ERROR_PATTERNS = [
  /authentication/i,
  /credential/i,
  /permission denied/i,
  /unauthenticated/i,
  /unauthorized/i,
  /access denied/i,
  /invalid.*token/i,
  /could not load the default credentials/i,
  /application default credentials/i,
]

/**
 * Check if an error is a GCS authentication/authorization failure
 */
function isGCSAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  // Check error code property (GCS errors often have this)
  const errorWithCode = error as Error & { code?: string | number }
  if (errorWithCode.code) {
    const codeStr = String(errorWithCode.code).toUpperCase()
    if (GCS_AUTH_ERROR_CODES.some(authCode => codeStr.includes(authCode))) {
      return true
    }
    // GCS uses numeric codes: 7 = PERMISSION_DENIED, 16 = UNAUTHENTICATED
    if (errorWithCode.code === 7 || errorWithCode.code === 16) {
      return true
    }
  }

  // Check error message patterns
  const message = error.message
  return GCS_AUTH_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

// ─── Deterministic Auth Error Detection (for concurrent uploads) ─────────────

/**
 * Deterministic, code-based auth error detection for the concurrent upload path.
 * Uses ONLY error `code` property matching — no message-pattern heuristics.
 *
 * Checks:
 * - String code: 'UNAUTHENTICATED' or 'PERMISSION_DENIED' (exact match, case-insensitive)
 * - Numeric code: 7 (PERMISSION_DENIED) or 16 (UNAUTHENTICATED)
 *
 * Requirements: 5.4
 */
export function isAuthError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const errorWithCode = error as { code?: string | number }
  if (errorWithCode.code === undefined) {
    return false
  }

  // Numeric codes: 7 = PERMISSION_DENIED, 16 = UNAUTHENTICATED
  if (errorWithCode.code === 7 || errorWithCode.code === 16) {
    return true
  }

  // String codes: exact match (case-insensitive)
  if (typeof errorWithCode.code === 'string') {
    const upper = errorWithCode.code.toUpperCase()
    return upper === 'UNAUTHENTICATED' || upper === 'PERMISSION_DENIED'
  }

  return false
}

// ─── Concurrency Pool ────────────────────────────────────────────────────────

/**
 * Run an array of async task functions with a concurrency limit.
 * Uses a semaphore pattern: maintains a pool of active promises,
 * starting new ones as others complete.
 *
 * Before starting each task, checks `abortSignal.aborted` — if true,
 * skips remaining tasks (they won't appear in the results array).
 *
 * @param tasks - Array of zero-argument async functions to execute
 * @param limit - Maximum number of concurrent tasks
 * @param abortSignal - Shared abort flag; set `.aborted = true` to skip remaining tasks
 * @returns PromiseSettledResult array for all tasks that were started
 *
 * Requirements: 5.1, 5.3, 5.4
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  abortSignal: { aborted: boolean }
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = []
  const active: Set<Promise<void>> = new Set()

  for (let i = 0; i < tasks.length; i++) {
    // Check abort before starting each task
    if (abortSignal.aborted) {
      break
    }

    const task = tasks[i]!
    const index = i

    const wrapped = (async () => {
      try {
        const value = await task()
        results[index] = { status: 'fulfilled', value }
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason }
      }
    })()

    active.add(wrapped)
    wrapped.then(
      () => active.delete(wrapped),
      () => active.delete(wrapped)
    )

    // When pool is full, wait for one to complete before starting next
    if (active.size >= limit) {
      await Promise.race(active)
    }
  }

  // Wait for all remaining active tasks to complete
  await Promise.allSettled([...active])

  // Compact results: remove undefined slots from skipped tasks
  return results.filter((r): r is PromiseSettledResult<T> => r !== undefined)
}

/**
 * Configuration for UploadService
 */
export interface UploadServiceConfig {
  /** Base cache directory containing snapshots */
  cacheDir: string
  /** GCS bucket name */
  bucket: string
  /** GCS object prefix (e.g., 'snapshots') */
  prefix: string
  /** Optional GCP project ID */
  projectId?: string
  /** Optional logger for diagnostic output */
  logger?: Logger
  /** Optional injectable filesystem (defaults to real fs/promises) */
  fs?: FileSystem
  /** Optional injectable hasher (defaults to crypto SHA256) */
  hasher?: Hasher
  /** Optional injectable GCS client (defaults to real GCS bucket) */
  bucketClient?: BucketClient
  /** Optional injectable clock (defaults to Date) */
  clock?: Clock
  /** Optional injectable progress reporter (defaults to stderr writer) */
  progressReporter?: ProgressReporter
}

/**
 * Options for upload operations
 */
export interface UploadOperationOptions {
  /** Target date in YYYY-MM-DD format, if not specified uploads all available dates */
  date?: string
  /** Inclusive start date in YYYY-MM-DD format for date range filtering */
  since?: string
  /** Inclusive end date in YYYY-MM-DD format for date range filtering */
  until?: string
  /** Only upload files that have changed (compare checksums) */
  incremental?: boolean
  /** Show what would be uploaded without actually uploading */
  dryRun?: boolean
  /** Enable verbose logging */
  verbose?: boolean
  /** Maximum number of concurrent GCS uploads (default: 10) */
  concurrency?: number
}

/**
 * Information about a file to be uploaded
 */
interface FileInfo {
  /** Local file path */
  localPath: string
  /** GCS object path */
  remotePath: string
  /** File size in bytes */
  size: number
  /** File modification time in milliseconds */
  mtimeMs: number
  /** SHA256 checksum of file content — undefined when not computed */
  checksum: string | undefined
}

/**
 * Default no-op logger
 */
const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * Interface for upload service operations.
 */
export interface IUploadService {
  /**
   * Upload snapshots and analytics to GCS.
   *
   * @param options - Upload operation options
   * @returns Promise resolving to the upload result
   */
  upload(options: UploadOperationOptions): Promise<UploadResult>

  /**
   * Get available snapshot dates from local cache.
   *
   * @returns Promise resolving to array of dates in YYYY-MM-DD format
   */
  getAvailableDates(): Promise<string[]>
}

/**
 * UploadService uploads snapshots and analytics to Google Cloud Storage.
 *
 * Supports injectable dependencies for FileSystem, Hasher, BucketClient,
 * Clock, and ProgressReporter to enable unit testing with fakes.
 */
export class UploadService implements IUploadService {
  private readonly cacheDir: string
  private readonly prefix: string
  private readonly logger: Logger
  private readonly fs: FileSystem
  private readonly hasher: Hasher
  private readonly bucketClient: BucketClient
  private readonly clock: Clock
  private readonly progressReporter: ProgressReporter

  constructor(config: UploadServiceConfig) {
    this.cacheDir = config.cacheDir
    this.prefix = config.prefix
    this.logger = config.logger ?? noopLogger

    // Wire injectable dependencies with production defaults
    const fileSystem = config.fs ?? new DefaultFileSystem()
    this.fs = fileSystem
    this.hasher = config.hasher ?? new DefaultHasher(fileSystem)
    this.clock = config.clock ?? new DefaultClock()
    this.progressReporter =
      config.progressReporter ?? new DefaultProgressReporter()

    // Initialize GCS bucket client — use injected or create default from real GCS
    if (config.bucketClient) {
      this.bucketClient = config.bucketClient
    } else {
      const storage = new Storage({ projectId: config.projectId })
      const bucket = storage.bucket(config.bucket)
      this.bucketClient = new DefaultBucketClient(bucket)
    }

    this.logger.info('UploadService initialized', {
      cacheDir: config.cacheDir,
      bucket: config.bucket,
      prefix: config.prefix,
    })
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
   * Calculate SHA256 checksum of file content using injected Hasher
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    return this.hasher.sha256(filePath)
  }

  /**
   * Get the path to the upload manifest file.
   */
  private getManifestPath(): string {
    return path.join(this.cacheDir, '.upload-manifest.json')
  }

  /**
   * Load the upload manifest from disk.
   * Returns an empty manifest if the file is missing or corrupted.
   * Logs a warning on corruption.
   *
   * Requirements: 4.6, 4.7, 4.8, 4.9
   */
  async loadManifest(): Promise<UploadManifest> {
    const manifestPath = this.getManifestPath()
    const emptyManifest: UploadManifest = {
      schemaVersion: '1.0.0',
      entries: {},
    }

    try {
      await this.fs.access(manifestPath)
    } catch {
      // File doesn't exist — not an error, just start fresh
      this.logger.debug('No upload manifest found, starting fresh', {
        manifestPath,
      })
      return emptyManifest
    }

    try {
      const raw = await this.fs.readFile(manifestPath)
      const parsed: unknown = JSON.parse(raw.toString())

      // Validate basic structure
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('schemaVersion' in parsed) ||
        !('entries' in parsed)
      ) {
        this.logger.warn(
          'Upload manifest has invalid structure, treating as empty',
          { manifestPath }
        )
        return emptyManifest
      }

      const manifest = parsed as { schemaVersion: unknown; entries: unknown }

      if (manifest.schemaVersion !== '1.0.0') {
        this.logger.warn(
          'Upload manifest has unsupported schema version, treating as empty',
          {
            manifestPath,
            schemaVersion: String(manifest.schemaVersion),
          }
        )
        return emptyManifest
      }

      if (typeof manifest.entries !== 'object' || manifest.entries === null) {
        this.logger.warn(
          'Upload manifest entries field is invalid, treating as empty',
          { manifestPath }
        )
        return emptyManifest
      }

      return parsed as UploadManifest
    } catch {
      this.logger.warn(
        'Upload manifest is corrupted (invalid JSON), treating as empty',
        { manifestPath }
      )
      return emptyManifest
    }
  }

  /**
   * Save the upload manifest to disk atomically (write to tmp, then rename).
   * Retries once on failure. Returns true on success, false on double failure.
   * On double failure, logs an error.
   *
   * Requirements: 4.6, 4.7, 4.9
   */
  async saveManifest(manifest: UploadManifest): Promise<boolean> {
    const manifestPath = this.getManifestPath()
    const tmpPath = manifestPath + '.tmp'
    const data = JSON.stringify(manifest, null, 2)

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.fs.writeFile(tmpPath, data)
        await this.fs.rename(tmpPath, manifestPath)
        return true
      } catch (error) {
        if (attempt === 0) {
          this.logger.warn('Manifest write failed, retrying', {
            manifestPath,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        } else {
          this.logger.error('Manifest write failed after retry', {
            manifestPath,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }

    return false
  }

  /**
   * Fast-path check: compare file size and mtimeMs against manifest entry.
   * Returns true if both match (skip without hashing).
   * Returns false if either differs or no entry exists.
   *
   * Requirements: 4.2, 4.3
   */
  shouldSkipFastPath(
    fileInfo: { size: number; mtimeMs: number },
    manifestEntry: UploadManifestEntry | undefined
  ): boolean {
    if (manifestEntry === undefined) {
      return false
    }
    return (
      fileInfo.size === manifestEntry.size &&
      fileInfo.mtimeMs === manifestEntry.mtimeMs
    )
  }

  /**
   * Get available snapshot dates from local cache
   *
   * @returns Array of dates in YYYY-MM-DD format, sorted newest first
   */
  async getAvailableDates(): Promise<string[]> {
    const snapshotsDir = this.getSnapshotsDir()

    try {
      const entries = await this.fs.readdir(snapshotsDir, {
        withFileTypes: true,
      })
      const dates: string[] = []

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Validate date format (YYYY-MM-DD)
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          if (dateRegex.test(entry.name)) {
            dates.push(entry.name)
          }
        }
      }

      // Sort newest first
      return dates.sort().reverse()
    } catch (error) {
      const errnoError = error as { code?: string }
      if (errnoError.code === 'ENOENT') {
        this.logger.warn('Snapshots directory does not exist', {
          snapshotsDir,
        })
        return []
      }
      throw error
    }
  }

  /**
   * Filter dates by an inclusive range using lexicographic comparison.
   * Handles cases where only since, only until, or both are provided.
   *
   * @param dates - Sorted array of YYYY-MM-DD date strings
   * @param since - Optional inclusive start date (YYYY-MM-DD)
   * @param until - Optional inclusive end date (YYYY-MM-DD)
   * @returns Filtered array of dates within the specified range
   */
  filterDatesByRange(
    dates: string[],
    since?: string,
    until?: string
  ): string[] {
    return dates.filter(date => {
      if (since !== undefined && date < since) return false
      if (until !== undefined && date > until) return false
      return true
    })
  }

  /**
   * Recursively collect all files in a directory
   */
  /**
   * Recursively collect all files in a directory using an async generator.
   * Yields FileInfo one at a time instead of buffering into an array.
   *
   * @param dir - Current directory to scan
   * @param baseDir - Root directory for computing relative paths
   * @param computeChecksums - When true, compute SHA256 via injected Hasher; when false, yield with checksum: undefined
   *
   * Requirements: 1.1, 1.2, 1.4, 1.5, 6.1
   */
  private async *collectFiles(
    dir: string,
    baseDir: string,
    computeChecksums: boolean
  ): AsyncGenerator<FileInfo> {
    try {
      const entries = await this.fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Use yield* for recursive subdirectories
          yield* this.collectFiles(fullPath, baseDir, computeChecksums)
        } else if (entry.isFile()) {
          // Get file info using injected FileSystem
          const stat = await this.fs.stat(fullPath)
          const checksum = computeChecksums
            ? await this.calculateFileChecksum(fullPath)
            : undefined
          const relativePath = path.relative(baseDir, fullPath)

          yield {
            localPath: fullPath,
            remotePath: relativePath,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            checksum,
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to collect files from directory', {
        dir,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Upload a single file to GCS using injected BucketClient
   */
  private async uploadFile(
    fileInfo: FileInfo,
    date: string,
    dryRun: boolean
  ): Promise<void> {
    const remotePath = this.buildRemotePath(date, fileInfo.remotePath)

    if (dryRun) {
      this.logger.info('Would upload file (dry run)', {
        localPath: fileInfo.localPath,
        remotePath,
        size: fileInfo.size,
        checksum: fileInfo.checksum,
      })
      return
    }

    // Determine content type based on file extension
    const ext = path.extname(fileInfo.localPath).toLowerCase()
    let contentType = 'application/octet-stream'
    if (ext === '.json') {
      contentType = 'application/json'
    } else if (ext === '.csv') {
      contentType = 'text/csv'
    }

    // Create a readable stream from the file content
    const content = await this.fs.readFile(fileInfo.localPath)
    const stream = Readable.from(content)

    // Upload via injected BucketClient with stream
    await this.bucketClient.uploadStream(remotePath, stream, contentType, {
      checksum: fileInfo.checksum ?? '',
      uploadedAt: this.clock.now(),
      localPath: fileInfo.remotePath,
    })

    this.logger.info('File uploaded successfully', {
      localPath: fileInfo.localPath,
      remotePath,
      size: fileInfo.size,
    })
  }

  /**
   * Upload a batch of files concurrently using the concurrency pool.
   * Uses deterministic code-based auth error detection (no message heuristics).
   * On auth error, sets abort flag to stop scheduling new tasks.
   *
   * @param files - Files to upload (already filtered for incremental/dry-run)
   * @param date - Snapshot date for building remote paths
   * @param concurrency - Maximum concurrent uploads
   * @returns Batch result with uploaded/failed/error arrays and authError flag
   *
   * Requirements: 5.1, 5.3, 5.4
   */
  private async uploadBatch(
    files: FileInfo[],
    date: string,
    concurrency: number
  ): Promise<{
    uploaded: string[]
    failed: string[]
    errors: Array<{ file: string; error: string; timestamp: string }>
    authError: boolean
  }> {
    const uploaded: string[] = []
    const failed: string[] = []
    const errors: Array<{ file: string; error: string; timestamp: string }> = []
    let authError = false
    const abortSignal = { aborted: false }

    // Build task functions — each wraps a single file upload via BucketClient.uploadStream
    const tasks = files.map(fileInfo => {
      const remotePath = this.buildRemotePath(date, fileInfo.remotePath)
      return async (): Promise<{ remotePath: string; fileInfo: FileInfo }> => {
        // Determine content type based on file extension
        const ext = path.extname(fileInfo.localPath).toLowerCase()
        let contentType = 'application/octet-stream'
        if (ext === '.json') {
          contentType = 'application/json'
        } else if (ext === '.csv') {
          contentType = 'text/csv'
        }

        // Create a readable stream from the file content
        const content = await this.fs.readFile(fileInfo.localPath)
        const stream = Readable.from(content)

        // Upload via injected BucketClient with stream
        await this.bucketClient.uploadStream(remotePath, stream, contentType, {
          checksum: fileInfo.checksum ?? '',
          uploadedAt: this.clock.now(),
          localPath: fileInfo.remotePath,
        })

        return { remotePath, fileInfo }
      }
    })

    const results = await runWithConcurrency(tasks, concurrency, abortSignal)

    // Process results — results array is compacted (no undefined slots),
    // but indices correspond to the original tasks array positions for started tasks only.
    // We need to match results back to files by tracking which tasks were started.
    // Since runWithConcurrency filters out undefined, results[i] corresponds to the i-th started task.
    // Tasks are started in order until abort, so results map to files[0..results.length-1].
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!
      const fileInfo = files[i]!
      const remotePath = this.buildRemotePath(date, fileInfo.remotePath)

      if (result.status === 'fulfilled') {
        uploaded.push(remotePath)
        this.logger.info('File uploaded successfully', {
          localPath: fileInfo.localPath,
          remotePath,
          size: fileInfo.size,
        })
      } else {
        const error = result.reason
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'

        // Deterministic code-based auth error detection (Requirement 5.4)
        if (isAuthError(error)) {
          this.logger.error('GCS authentication/authorization failure', {
            localPath: fileInfo.localPath,
            remotePath,
            error: errorMessage,
          })
          authError = true
          abortSignal.aborted = true
          failed.push(remotePath)
          errors.push({
            file: remotePath,
            error: `GCS authentication failure: ${errorMessage}`,
            timestamp: this.clock.now(),
          })
        } else {
          // Non-auth error: record and continue (Requirement 5.3)
          this.logger.error('Failed to upload file', {
            localPath: fileInfo.localPath,
            remotePath,
            error: errorMessage,
          })
          failed.push(remotePath)
          errors.push({
            file: remotePath,
            error: errorMessage,
            timestamp: this.clock.now(),
          })
        }
      }
    }

    return { uploaded, failed, errors, authError }
  }

  /**
   * Upload snapshots and analytics to GCS.
   *
   * Requirements:
   * - 6.2: Upload both snapshot data and pre-computed analytics files
   * - 6.3: Support incremental uploads (compare checksums)
   * - 6.4: Continue on individual file failures, but exit on auth failures
   * - 6.5: Output summary of uploaded files and errors
   *
   * Error Handling (from design.md):
   * - Upload failure (single file): Log error, continue with others, exit code 1
   * - GCS authentication failure: Log error, exit immediately, exit code 2
   */
  async upload(options: UploadOperationOptions): Promise<UploadResult> {
    const startTime = Date.now()
    const incremental = options.incremental ?? false
    const dryRun = options.dryRun ?? false
    let authError = false

    this.logger.info('Starting upload operation', {
      date: options.date ?? 'all',
      incremental,
      dryRun,
    })

    // Determine which dates to upload
    let datesToUpload: string[]
    if (options.date) {
      // Verify the specified date exists
      const snapshotDir = this.getSnapshotDir(options.date)
      try {
        await this.fs.access(snapshotDir)
        datesToUpload = [options.date]
      } catch {
        this.logger.error('Snapshot directory not found for date', {
          date: options.date,
          snapshotDir,
        })
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
              timestamp: this.clock.now(),
            },
          ],
          duration_ms: Date.now() - startTime,
        }
      }
    } else {
      // Get all available dates
      datesToUpload = await this.getAvailableDates()
      if (datesToUpload.length === 0) {
        this.logger.warn('No snapshot dates found to upload')
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
              timestamp: this.clock.now(),
            },
          ],
          duration_ms: Date.now() - startTime,
        }
      }
    }

    // Apply date range filtering if since/until provided
    if (options.since !== undefined || options.until !== undefined) {
      datesToUpload = this.filterDatesByRange(
        datesToUpload,
        options.since,
        options.until
      )
      if (datesToUpload.length === 0) {
        this.logger.warn('No snapshot dates found within the specified range', {
          since: options.since,
          until: options.until,
        })
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
              error: 'No snapshot dates found within the specified range',
              timestamp: this.clock.now(),
            },
          ],
          duration_ms: Date.now() - startTime,
        }
      }
    }

    // Preflight check: verify GCS bucket is accessible before processing any files.
    // Fails fast with a clear message instead of failing on every file upload.
    if (!dryRun) {
      try {
        await this.bucketClient.checkAuth()
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        const isAuth = isAuthError(error) || isGCSAuthError(error)
        const hint = isAuth
          ? 'Run "gcloud auth application-default login" to re-authenticate, then retry.'
          : 'Check that the GCS_BUCKET environment variable is correct and the bucket exists.'

        this.logger.error('GCS preflight check failed', {
          error: errorMessage,
          isAuthError: isAuth,
        })
        return {
          success: false,
          dates: datesToUpload,
          filesProcessed: [],
          filesUploaded: [],
          filesFailed: [],
          filesSkipped: [],
          errors: [
            {
              file: 'preflight-check',
              error: `GCS preflight check failed: ${errorMessage}. ${hint}`,
              timestamp: this.clock.now(),
            },
          ],
          duration_ms: Date.now() - startTime,
          authError: isAuth,
        }
      }
    }

    const filesProcessed: string[] = []
    const filesUploaded: string[] = []
    const filesFailed: string[] = []
    const filesSkipped: string[] = []
    const errors: Array<{ file: string; error: string; timestamp: string }> = []
    let manifestWriteError = false

    // Load manifest at start if incremental (Requirements 4.1–4.5)
    let manifest: UploadManifest = { schemaVersion: '1.0.0', entries: {} }
    if (incremental && !dryRun) {
      manifest = await this.loadManifest()
    }

    // Process each date
    dateLoop: for (const date of datesToUpload) {
      const snapshotDir = this.getSnapshotDir(date)

      this.logger.info('Processing snapshot date', { date, snapshotDir })

      try {
        // Conditional checksum logic (Requirements 1.1, 1.3, 1.4, 1.5):
        // - dryRun: no checksums needed (skip hashing entirely)
        // - incremental && !dryRun: no checksums at collection time (computed selectively after fast-path)
        // - !incremental && !dryRun: no checksums needed (non-incremental uploads don't hash)
        const computeChecksums = false

        // Collect files from async generator into per-date batch (Requirement 6.2)
        const files: FileInfo[] = []
        for await (const fileInfo of this.collectFiles(
          snapshotDir,
          snapshotDir,
          computeChecksums
        )) {
          files.push(fileInfo)
        }

        // Emit date-level progress after scanning completes (Requirement 2.1)
        const dateIndex = datesToUpload.indexOf(date)
        this.progressReporter.onDateComplete(
          dateIndex + 1,
          datesToUpload.length,
          date,
          files.length
        )

        let manifestUpdatedThisDate = false

        // Separate files into: those to upload vs those to skip (incremental)
        const filesToUpload: FileInfo[] = []

        for (const fileInfo of files) {
          const remotePath = this.buildRemotePath(date, fileInfo.remotePath)
          filesProcessed.push(remotePath)

          // Incremental mode: manifest-based fast-path + selective hashing
          // Requirement 1.3: dryRun && incremental => skip manifest comparison, treat all as candidates
          if (incremental && !dryRun) {
            const manifestEntry = manifest.entries[remotePath]

            // Fast-path: size + mtime match => skip without hashing (Requirement 4.2)
            if (this.shouldSkipFastPath(fileInfo, manifestEntry)) {
              this.logger.debug('Skipping unchanged file (fast-path)', {
                localPath: fileInfo.localPath,
                remotePath,
              })
              filesSkipped.push(remotePath)
              // File-level progress only when verbose (Requirement 2.2, 2.4)
              if (options.verbose) {
                this.progressReporter.onFileUploaded(remotePath, 'skipped')
              }
              continue
            }

            // Fast-path failed — compute checksum selectively (Requirement 4.3)
            const checksum = await this.calculateFileChecksum(
              fileInfo.localPath
            )

            // Checksum matches manifest => skip without network (Requirement 4.4)
            if (
              manifestEntry !== undefined &&
              manifestEntry.checksum === checksum
            ) {
              this.logger.debug('Skipping unchanged file (checksum match)', {
                localPath: fileInfo.localPath,
                remotePath,
                checksum,
              })
              filesSkipped.push(remotePath)
              // File-level progress only when verbose (Requirement 2.2, 2.4)
              if (options.verbose) {
                this.progressReporter.onFileUploaded(remotePath, 'skipped')
              }
              // Update manifest entry with current size/mtime so future fast-path works
              manifest.entries[remotePath] = {
                checksum,
                size: fileInfo.size,
                mtimeMs: fileInfo.mtimeMs,
                uploadedAt: manifestEntry.uploadedAt,
              }
              manifestUpdatedThisDate = true
              continue
            }

            // Checksum differs or no entry — need to upload (Requirement 4.5)
            fileInfo.checksum = checksum
          }

          // Dry-run: log what would be uploaded, don't actually upload
          if (dryRun) {
            await this.uploadFile(fileInfo, date, true)
            filesUploaded.push(remotePath)
            // File-level progress only when verbose (Requirement 2.2, 2.4)
            if (options.verbose) {
              this.progressReporter.onFileUploaded(remotePath, 'uploaded')
            }
            continue
          }

          filesToUpload.push(fileInfo)
        }

        // Upload batch concurrently (Requirements 5.1, 5.3, 5.4)
        if (filesToUpload.length > 0) {
          const concurrency = options.concurrency ?? 10
          const batchResult = await this.uploadBatch(
            filesToUpload,
            date,
            concurrency
          )

          filesUploaded.push(...batchResult.uploaded)
          filesFailed.push(...batchResult.failed)
          errors.push(...batchResult.errors)

          // File-level progress after batch results, only when verbose (Requirement 2.2, 2.4)
          if (options.verbose) {
            for (const uploadedPath of batchResult.uploaded) {
              this.progressReporter.onFileUploaded(uploadedPath, 'uploaded')
            }
            for (const failedPath of batchResult.failed) {
              this.progressReporter.onFileUploaded(failedPath, 'failed')
            }
          }

          // Update manifest entries for successfully uploaded files (Requirement 4.1)
          if (incremental && !dryRun) {
            for (const uploadedPath of batchResult.uploaded) {
              const fileInfo = filesToUpload.find(
                f => this.buildRemotePath(date, f.remotePath) === uploadedPath
              )
              if (fileInfo) {
                manifest.entries[uploadedPath] = {
                  checksum: fileInfo.checksum ?? '',
                  size: fileInfo.size,
                  mtimeMs: fileInfo.mtimeMs,
                  uploadedAt: this.clock.now(),
                }
                manifestUpdatedThisDate = true
              }
            }
          }

          if (batchResult.authError) {
            authError = true
            break dateLoop
          }
        }

        // Flush manifest to disk after each date completes (Requirement 4.7)
        if (incremental && !dryRun && manifestUpdatedThisDate) {
          const saved = await this.saveManifest(manifest)
          if (!saved) {
            manifestWriteError = true
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'

        // Check if this is a GCS authentication/authorization failure
        if (isGCSAuthError(error)) {
          this.logger.error(
            'GCS authentication/authorization failure during date processing',
            {
              date,
              error: errorMessage,
            }
          )
          authError = true
          errors.push({
            file: snapshotDir,
            error: `GCS authentication failure: ${errorMessage}`,
            timestamp: this.clock.now(),
          })
          // Break out - auth errors are fatal
          break dateLoop
        }

        // Error collecting files for this date
        this.logger.error('Failed to process snapshot date', {
          date,
          error: errorMessage,
        })
        errors.push({
          file: snapshotDir,
          error: `Failed to process snapshot date ${date}: ${errorMessage}`,
          timestamp: this.clock.now(),
        })
      }
    }

    const duration_ms = Date.now() - startTime

    // Emit completion progress (Requirement 2.3)
    this.progressReporter.onComplete({
      uploaded: filesUploaded.length,
      skipped: filesSkipped.length,
      failed: filesFailed.length,
      duration_ms,
    })

    // Determine overall success
    // Success if at least one file was uploaded and no failures
    // Or if all files were skipped (nothing to do)
    // Auth errors always mean failure
    const success =
      !authError &&
      ((filesUploaded.length > 0 && filesFailed.length === 0) ||
        (filesSkipped.length > 0 &&
          filesUploaded.length === 0 &&
          filesFailed.length === 0))

    this.logger.info('Upload operation completed', {
      success,
      authError,
      dates: datesToUpload,
      filesProcessed: filesProcessed.length,
      filesUploaded: filesUploaded.length,
      filesFailed: filesFailed.length,
      filesSkipped: filesSkipped.length,
      duration_ms,
    })

    return {
      success,
      dates: datesToUpload,
      filesProcessed,
      filesUploaded,
      filesFailed,
      filesSkipped,
      errors,
      duration_ms,
      authError,
      manifestWriteError: manifestWriteError || undefined,
    }
  }
}
