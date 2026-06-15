/**
 * CLI Helper Functions
 *
 * Pure utility functions for date validation, exit code determination,
 * and result summary formatting. Extracted from cli.ts for
 * single-responsibility compliance and independent testability.
 */

import {
  ExitCode,
  ScrapeSummary,
  ScrapeResult,
  TransformResult,
  TransformSummary,
  ComputeAnalyticsResult,
  ComputeAnalyticsSummary,
  UploadResult,
  UploadSummary,
} from './types/index.js'
import { validateDistrictId } from './utils/validateDistrictId.js'

// ============================================================================
// Structured-output Termination
// ============================================================================

/**
 * Print a structured JSON summary to stdout and exit — but only after that
 * write has fully drained.
 *
 * `process.exit()` terminates synchronously and discards any stdout bytes
 * still buffered for an async pipe, so a large summary gets cut at the ~64KB
 * highWaterMark when the command runs through `| tee`/`| jq` (the #1070
 * 768-result dry-run died mid-record), while the same data prints intact to a
 * file or TTY (#1182). Deferring the exit to the write's drain callback
 * guarantees every byte reaches the OS first.
 *
 * Use this for the *terminal* JSON-summary emit at the end of a command — it
 * both emits and exits, so nothing should run after it. (Fail-fast option
 * validators stay on `process.exit()`: they write only small stderr and must
 * stop the world immediately, which a deferred exit would not do.)
 *
 * R4 is unaffected: structured JSON goes to stdout, logs to stderr. Output is
 * byte-identical to the previous `console.log(JSON.stringify(payload, null,
 * 2))` (trailing newline included).
 *
 * Because the exit is deferred, this function returns control synchronously —
 * so it must be the last thing a code path does. Inside a `catch` (or any
 * block with code after it), call it as `return emitJsonAndExit(...)`, or the
 * handler keeps running past the "exit" on the same tick.
 */
export function emitJsonAndExit(payload: unknown, exitCode: number): never {
  // A closed reader (e.g. `| head`) makes stdout emit 'error'; the drain
  // callback isn't guaranteed to fire then, so exit on error too rather than
  // hang. (The pre-fix synchronous process.exit could never hang.)
  process.stdout.once('error', () => process.exit(exitCode))
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n', () =>
    process.exit(exitCode)
  )
  // The drain callback owns termination; `never` lets callers treat this as
  // the end of the command.
  return undefined as never
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Validate date string format (YYYY-MM-DD)
 * Requirement 1.3: Date format validation
 *
 * Property 1: CLI Date Parsing Validity
 * For any valid date string in YYYY-MM-DD format, this function returns true.
 * For any invalid date string, this function returns false.
 */
export function validateDateFormat(dateStr: string): boolean {
  // Must match YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateStr)) {
    return false
  }

  // Parse and validate the date components
  const parts = dateStr.split('-')
  const year = parseInt(parts[0]!, 10)
  const month = parseInt(parts[1]!, 10)
  const day = parseInt(parts[2]!, 10)

  // Check ranges
  if (year < 1900 || year > 2100) {
    return false
  }
  if (month < 1 || month > 12) {
    return false
  }
  if (day < 1 || day > 31) {
    return false
  }

  // Validate the date is real (handles leap years, month lengths)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  )
}

/**
 * Get current date in YYYY-MM-DD format
 * Requirement 1.4: Default to current date
 */
export function getCurrentDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse comma-separated district list
 * Requirement 1.5: Comma-separated district parsing
 *
 * Each id is validated as the single CLI chokepoint (#1111): a district id is
 * interpolated into file/GCS paths downstream, so a non-alphanumeric value
 * (e.g. `--districts '../x'`) must be rejected here before any path is built.
 */
export function parseDistrictList(value: string): string[] {
  const ids = value
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0)
  ids.forEach(validateDistrictId)
  return ids
}

// ============================================================================
// Exit Code Determination
// ============================================================================

/**
 * Determine the exit code based on scrape result
 * Requirement 1.11: Exit code logic
 *
 * Property 4: Exit Code Consistency
 * - Exit 0 on full success (all districts succeeded)
 * - Exit 1 on partial failure (some succeeded, some failed)
 * - Exit 2 on complete failure (all failed or fatal error)
 */
export function determineExitCode(result: ScrapeResult): ExitCode {
  const totalProcessed = result.districtsProcessed.length
  const succeeded = result.districtsSucceeded.length
  const failed = result.districtsFailed.length

  // No districts processed = complete failure
  if (totalProcessed === 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // All succeeded = success
  if (failed === 0 && succeeded > 0) {
    return ExitCode.SUCCESS
  }

  // All failed = complete failure
  if (succeeded === 0 && failed > 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // Some succeeded, some failed = partial failure
  if (succeeded > 0 && failed > 0) {
    return ExitCode.PARTIAL_FAILURE
  }

  // Edge case: no successes and no failures (shouldn't happen)
  return ExitCode.COMPLETE_FAILURE
}

/**
 * Determine the exit code based on transform result
 * Requirement 2.1: Transform command exit codes
 *
 * Uses the same exit code logic as scrape:
 * - Exit 0 on full success (all districts transformed)
 * - Exit 1 on partial failure (some succeeded, some failed)
 * - Exit 2 on complete failure (all failed or fatal error)
 */
export function determineTransformExitCode(result: TransformResult): ExitCode {
  const totalProcessed = result.districtsProcessed.length
  const succeeded = result.districtsSucceeded.length
  const failed = result.districtsFailed.length

  // No districts processed = complete failure
  if (totalProcessed === 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // All succeeded (including skipped) = success
  if (failed === 0 && succeeded > 0) {
    return ExitCode.SUCCESS
  }

  // All failed = complete failure
  if (succeeded === 0 && failed > 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // Some succeeded, some failed = partial failure
  if (succeeded > 0 && failed > 0) {
    return ExitCode.PARTIAL_FAILURE
  }

  // Edge case: all skipped (no successes, no failures) = success
  if (result.districtsSkipped.length > 0 && succeeded === 0 && failed === 0) {
    return ExitCode.SUCCESS
  }

  // Edge case: no successes and no failures (shouldn't happen)
  return ExitCode.COMPLETE_FAILURE
}

/**
 * Determine the exit code based on compute-analytics result
 * Requirement 8.1: compute-analytics command exit codes
 *
 * Uses the same exit code logic as scrape and transform:
 * - Exit 0 on full success (all districts computed)
 * - Exit 1 on partial failure (some succeeded, some failed)
 * - Exit 2 on complete failure (all failed or fatal error)
 */
export function determineComputeAnalyticsExitCode(
  result: ComputeAnalyticsResult
): ExitCode {
  const totalProcessed = result.districtsProcessed.length
  const succeeded = result.districtsSucceeded.length
  const failed = result.districtsFailed.length

  // No districts processed = complete failure
  if (totalProcessed === 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // All succeeded (including skipped) = success
  if (failed === 0 && succeeded > 0) {
    return ExitCode.SUCCESS
  }

  // All failed = complete failure
  if (succeeded === 0 && failed > 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // Some succeeded, some failed = partial failure
  if (succeeded > 0 && failed > 0) {
    return ExitCode.PARTIAL_FAILURE
  }

  // Edge case: all skipped (no successes, no failures) = success
  if (result.districtsSkipped.length > 0 && succeeded === 0 && failed === 0) {
    return ExitCode.SUCCESS
  }

  // Edge case: no successes and no failures (shouldn't happen)
  return ExitCode.COMPLETE_FAILURE
}

/**
 * Determine the exit code based on upload result
 * Requirement 6.1: upload command exit codes
 *
 * Uses the same exit code logic as other commands:
 * - Exit 0 on full success (all files uploaded)
 * - Exit 1 on partial failure (some succeeded, some failed)
 * - Exit 2 on complete failure (all failed or fatal error)
 *
 * From design.md Error Handling:
 * - Upload failure (single file): exit code 1 (partial)
 * - GCS authentication failure: exit code 2 (complete failure)
 */
export function determineUploadExitCode(result: UploadResult): ExitCode {
  // GCS authentication failure always results in complete failure (exit code 2)
  if (result.authError) {
    return ExitCode.COMPLETE_FAILURE
  }

  const totalProcessed = result.filesProcessed.length
  const uploaded = result.filesUploaded.length
  const failed = result.filesFailed.length

  // No files processed = complete failure
  if (totalProcessed === 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // All uploaded (including skipped) = success
  if (failed === 0 && uploaded > 0) {
    return ExitCode.SUCCESS
  }

  // All failed = complete failure
  if (uploaded === 0 && failed > 0) {
    return ExitCode.COMPLETE_FAILURE
  }

  // Some uploaded, some failed = partial failure
  if (uploaded > 0 && failed > 0) {
    return ExitCode.PARTIAL_FAILURE
  }

  // Edge case: all skipped (no uploads, no failures) = success
  if (result.filesSkipped.length > 0 && uploaded === 0 && failed === 0) {
    return ExitCode.SUCCESS
  }

  // Edge case: no uploads and no failures (shouldn't happen)
  return ExitCode.COMPLETE_FAILURE
}

// ============================================================================
// Summary Formatters
// ============================================================================

/**
 * Convert ScrapeResult to ScrapeSummary for JSON output
 * Requirement 1.9: JSON output format
 */
export function formatScrapeSummary(
  result: ScrapeResult,
  cacheDir: string
): ScrapeSummary {
  const exitCode = determineExitCode(result)

  let status: 'success' | 'partial' | 'failed'
  if (exitCode === ExitCode.SUCCESS) {
    status = 'success'
  } else if (exitCode === ExitCode.PARTIAL_FAILURE) {
    status = 'partial'
  } else {
    status = 'failed'
  }

  // Calculate skipped (processed but neither succeeded nor failed - e.g., cache hit)
  const skipped =
    result.districtsProcessed.length -
    result.districtsSucceeded.length -
    result.districtsFailed.length

  return {
    timestamp: new Date().toISOString(),
    date: result.date,
    status,
    districts: {
      total: result.districtsProcessed.length,
      succeeded: result.districtsSucceeded.length,
      failed: result.districtsFailed.length,
      skipped: Math.max(0, skipped),
    },
    cache: {
      directory: cacheDir,
      filesCreated: result.cacheLocations.length,
      totalSize: 0, // Size calculation would require file system access
    },
    errors: result.errors.map(e => ({
      districtId: e.districtId,
      error: e.error,
    })),
    duration_ms: result.duration_ms,
  }
}

/**
 * Convert TransformResult to TransformSummary for JSON output
 * Requirement 2.1: Transform command JSON output
 */
export function formatTransformSummary(
  result: TransformResult,
  snapshotDir: string
): TransformSummary {
  const exitCode = determineTransformExitCode(result)

  let status: 'success' | 'partial' | 'failed'
  if (exitCode === ExitCode.SUCCESS) {
    status = 'success'
  } else if (exitCode === ExitCode.PARTIAL_FAILURE) {
    status = 'partial'
  } else {
    status = 'failed'
  }

  return {
    timestamp: new Date().toISOString(),
    date: result.date,
    status,
    districts: {
      total: result.districtsProcessed.length,
      succeeded: result.districtsSucceeded.length,
      failed: result.districtsFailed.length,
      skipped: result.districtsSkipped.length,
    },
    snapshots: {
      directory: snapshotDir,
      filesCreated: result.snapshotLocations.length,
    },
    errors: result.errors.map(e => ({
      districtId: e.districtId,
      error: e.error,
    })),
    duration_ms: result.duration_ms,
  }
}

/**
 * Convert ComputeAnalyticsResult to ComputeAnalyticsSummary for JSON output
 * Requirement 8.4: compute-analytics command JSON output
 * Requirement 8.2: Report the actual snapshot date used (not the requested date)
 */
export function formatComputeAnalyticsSummary(
  result: ComputeAnalyticsResult,
  analyticsDir: string
): ComputeAnalyticsSummary {
  const exitCode = determineComputeAnalyticsExitCode(result)

  let status: 'success' | 'partial' | 'failed'
  if (exitCode === ExitCode.SUCCESS) {
    status = 'success'
  } else if (exitCode === ExitCode.PARTIAL_FAILURE) {
    status = 'partial'
  } else {
    status = 'failed'
  }

  return {
    timestamp: new Date().toISOString(),
    date: result.date,
    requestedDate: result.requestedDate,
    isClosingPeriod: result.isClosingPeriod,
    dataMonth: result.dataMonth,
    status,
    districts: {
      total: result.districtsProcessed.length,
      succeeded: result.districtsSucceeded.length,
      failed: result.districtsFailed.length,
      skipped: result.districtsSkipped.length,
    },
    analytics: {
      directory: analyticsDir,
      filesCreated: result.analyticsLocations.length,
    },
    errors: result.errors.map(e => ({
      districtId: e.districtId,
      error: e.error,
    })),
    duration_ms: result.duration_ms,
  }
}

/**
 * Convert UploadResult to UploadSummary for JSON output
 * Requirement 6.5: WHEN upload completes, THE Collector_CLI SHALL output a summary
 */
export function formatUploadSummary(
  result: UploadResult,
  bucket: string,
  prefix: string,
  dryRun: boolean
): UploadSummary {
  const exitCode = determineUploadExitCode(result)

  let status: 'success' | 'partial' | 'failed'
  if (exitCode === ExitCode.SUCCESS) {
    status = 'success'
  } else if (exitCode === ExitCode.PARTIAL_FAILURE) {
    status = 'partial'
  } else {
    status = 'failed'
  }

  const summary: UploadSummary = {
    timestamp: new Date().toISOString(),
    dates: result.dates,
    status,
    dryRun,
    files: {
      total: result.filesProcessed.length,
      uploaded: result.filesUploaded.length,
      failed: result.filesFailed.length,
      skipped: result.filesSkipped.length,
    },
    destination: {
      bucket,
      prefix,
    },
    errors: result.errors.map(e => ({
      file: e.file,
      error: e.error,
    })),
    duration_ms: result.duration_ms,
  }

  // Include authError flag if present
  if (result.authError) {
    summary.authError = true
  }

  return summary
}
