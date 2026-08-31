/**
 * Type definitions for the Collector CLI
 *
 * These types define the interfaces for the collector orchestrator,
 * CLI options, and output formats.
 *
 * Requirements:
 * - 1.9: JSON output format specification
 * - 1.11: Exit code definitions
 * - 8.3: Shared types for collector
 */

// Re-export collector types for convenience
export type {
  ScrapedRecord,
  DistrictInfo,
  ICollectorCache,
  CacheMetadata,
  ClubPerformanceRecord,
  DivisionPerformanceRecord,
  DistrictPerformanceRecord,
  AllDistrictsCSVRecord,
} from './collector.js'

export { CSVType } from './collector.js'

/**
 * Configuration for the CollectorOrchestrator
 */
export interface CollectorOrchestratorConfig {
  /** Directory where cached CSV files are stored */
  cacheDir: string
  /** Path to the district configuration file */
  districtConfigPath: string
  /** Maximum timeout for scraping operations in seconds */
  timeout: number
  /** Enable verbose logging output */
  verbose: boolean
}

/**
 * Options for a scrape operation
 */
export interface ScrapeOptions {
  /** Target date in YYYY-MM-DD format, defaults to current date */
  date?: string
  /** Specific districts to scrape, defaults to all configured */
  districts?: string[]
  /** Force re-scrape even if cache exists */
  force?: boolean
}

/**
 * Result of a scrape operation
 */
export interface ScrapeResult {
  /** Whether the overall operation succeeded */
  success: boolean
  /** The date that was scraped */
  date: string
  /** All districts that were processed */
  districtsProcessed: string[]
  /** Districts that were successfully scraped */
  districtsSucceeded: string[]
  /** Districts that failed to scrape */
  districtsFailed: string[]
  /**
   * Requested districts that did not exist on the scraped date, and were
   * therefore never fetched (#1465). Absent when the date's districtsummary
   * could not be read as a district list — undecided, not "none skipped".
   */
  districtsSkipped?: string[]
  /** Paths to created cache files */
  cacheLocations: string[]
  /** Detailed error information for failed districts */
  errors: Array<{
    districtId: string
    error: string
    timestamp: string
  }>
  /** Total duration of the scrape operation in milliseconds */
  duration_ms: number
  /**
   * Fallback cache metrics for the scrape session
   *
   * Requirements:
   * - 7.3: WHEN the scrape session completes, THE Orchestrator SHALL log a summary
   *        including cache hit/miss statistics
   */
  fallbackMetrics?: {
    /** Number of times cached fallback knowledge was reused */
    cacheHits: number
    /** Number of times fallback was discovered fresh (cache miss) */
    cacheMisses: number
    /** Number of unique dates that required fallback navigation */
    fallbackDatesDiscovered: number
  }
}

/**
 * JSON output summary for CLI
 * Requirement 1.9: JSON summary output format
 */
export interface ScrapeSummary {
  /** ISO timestamp when scrape completed */
  timestamp: string
  /** Date that was scraped */
  date: string
  /** Overall status: success, partial, or failed */
  status: 'success' | 'partial' | 'failed'
  /** District processing statistics */
  districts: {
    total: number
    succeeded: number
    failed: number
    skipped: number
  }
  /** Cache information */
  cache: {
    directory: string
    filesCreated: number
    totalSize: number
  }
  /** Error details for failed districts */
  errors: Array<{
    districtId: string
    error: string
  }>
  /** Total duration in milliseconds */
  duration_ms: number
}

/**
 * Exit codes for the CLI
 * Requirement 1.11: Exit code specification
 */
export enum ExitCode {
  /** All districts scraped successfully */
  SUCCESS = 0,
  /** Some districts failed, others succeeded */
  PARTIAL_FAILURE = 1,
  /** All districts failed or fatal error occurred */
  COMPLETE_FAILURE = 2,
}

/**
 * CLI command options parsed from command line arguments
 */
export interface CLIOptions {
  /** Target date in YYYY-MM-DD format */
  date?: string
  /** Parsed list of district IDs */
  districts?: string[]
  /** Force re-scrape even if cache exists */
  force: boolean
  /** Enable verbose logging */
  verbose: boolean
  /** Maximum timeout in seconds */
  timeout: number
  /** Path to alternative configuration file */
  config?: string
  /**
   * Run transformation after scraping
   * Requirement 2.5: THE `scrape` command SHALL optionally run transformation automatically with a `--transform` flag
   */
  transform?: boolean
}

/**
 * Cache status for a specific date
 */
export interface CacheStatus {
  /** The date being checked */
  date: string
  /** Districts that have cached data */
  cachedDistricts: string[]
  /** Districts that are missing from cache */
  missingDistricts: string[]
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  isValid: boolean
  /** List of validation errors */
  errors: string[]
}

/**
 * Options for the transform command
 * Requirement 2.1: Transform command options
 */
export interface TransformOptions {
  /** Target date in YYYY-MM-DD format */
  date?: string
  /** Specific districts to transform, defaults to all available */
  districts?: string[]
  /** Force re-transform even if snapshots exist */
  force: boolean
  /** Enable verbose logging */
  verbose: boolean
  /** Path to alternative configuration file */
  config?: string
}

/**
 * Result of a transform operation
 */
export interface TransformResult {
  /** Whether the overall operation succeeded */
  success: boolean
  /** The date that was transformed */
  date: string
  /** All districts that were processed */
  districtsProcessed: string[]
  /** Districts that were successfully transformed */
  districtsSucceeded: string[]
  /** Districts that failed to transform */
  districtsFailed: string[]
  /** Districts that were skipped (already exist and not forced) */
  districtsSkipped: string[]
  /** Paths to created snapshot files */
  snapshotLocations: string[]
  /** Detailed error information for failed districts */
  errors: Array<{
    districtId: string
    error: string
    timestamp: string
  }>
  /** Total duration of the transform operation in milliseconds */
  duration_ms: number
}

/**
 * JSON output summary for transform command
 */
export interface TransformSummary {
  /** ISO timestamp when transform completed */
  timestamp: string
  /** Date that was transformed */
  date: string
  /** Overall status: success, partial, or failed */
  status: 'success' | 'partial' | 'failed'
  /** District processing statistics */
  districts: {
    total: number
    succeeded: number
    failed: number
    skipped: number
  }
  /** Snapshot information */
  snapshots: {
    directory: string
    filesCreated: number
  }
  /** Error details for failed districts */
  errors: Array<{
    districtId: string
    error: string
  }>
  /** Total duration in milliseconds */
  duration_ms: number
}

/**
 * Combined summary for scrape with --transform flag
 * Requirement 2.5: THE `scrape` command SHALL optionally run transformation automatically with a `--transform` flag
 */
export interface ScrapeWithTransformSummary extends ScrapeSummary {
  /**
   * Actual snapshot date after closing-period remap (#309)
   * May differ from the requested date when CSV footer indicates a closing period.
   */
  snapshotDate?: string
  /** Transform results when --transform flag is used */
  transform?: {
    /** Overall status of transformation */
    status: 'success' | 'partial' | 'failed' | 'skipped'
    /** District processing statistics */
    districts: {
      total: number
      succeeded: number
      failed: number
      skipped: number
    }
    /** Snapshot information */
    snapshots: {
      directory: string
      filesCreated: number
    }
    /** Error details for failed districts */
    errors: Array<{
      districtId: string
      error: string
    }>
    /** Duration of transform operation in milliseconds */
    duration_ms: number
  }
}

/**
 * Options for the compute-analytics command
 * Requirement 8.1: THE Collector_CLI SHALL provide a `compute-analytics` command
 * Requirement 8.2: WHEN the `compute-analytics` command is invoked with a date
 * Requirement 8.3: THE `compute-analytics` command SHALL support a `--districts` option
 */
export interface ComputeAnalyticsOptions {
  /** Target date in YYYY-MM-DD format */
  date?: string
  /** Specific districts to compute analytics for, defaults to all available */
  districts?: string[]
  /** Force re-compute even if analytics exist */
  forceAnalytics: boolean
  /** Enable verbose logging */
  verbose: boolean
  /** Path to alternative configuration file */
  config?: string
}

/**
 * Result of a compute-analytics operation
 *
 * Requirements:
 * - 8.2: WHEN computing analytics for closing period data THEN the JSON output
 *        SHALL report the actual snapshot date used (not the requested date)
 */
export interface ComputeAnalyticsResult {
  /** Whether the overall operation succeeded */
  success: boolean
  /** The actual snapshot date that was processed (may differ from requestedDate for closing periods) */
  date: string
  /** The original date that was requested for analytics computation */
  requestedDate: string
  /** Whether a closing period adjustment was made */
  isClosingPeriod: boolean
  /** The data month in YYYY-MM format (only present for closing periods) */
  dataMonth?: string
  /** All districts that were processed */
  districtsProcessed: string[]
  /** Districts that were successfully computed */
  districtsSucceeded: string[]
  /** Districts that failed to compute */
  districtsFailed: string[]
  /** Districts that were skipped (already exist and not forced) */
  districtsSkipped: string[]
  /** Paths to created analytics files */
  analyticsLocations: string[]
  /** Detailed error information for failed districts */
  errors: Array<{
    districtId: string
    error: string
    timestamp: string
  }>
  /** Total duration of the compute operation in milliseconds */
  duration_ms: number
}

/**
 * JSON output summary for compute-analytics command
 * Requirement 8.4: THE `compute-analytics` command SHALL output a JSON summary
 * Requirement 8.2: Report the actual snapshot date used (not the requested date)
 */
export interface ComputeAnalyticsSummary {
  /** ISO timestamp when computation completed */
  timestamp: string
  /** The actual snapshot date that was processed (may differ from requestedDate for closing periods) */
  date: string
  /** The original date that was requested for analytics computation */
  requestedDate: string
  /** Whether a closing period adjustment was made */
  isClosingPeriod: boolean
  /** The data month in YYYY-MM format (only present for closing periods) */
  dataMonth?: string
  /** Overall status: success, partial, or failed */
  status: 'success' | 'partial' | 'failed'
  /** District processing statistics */
  districts: {
    total: number
    succeeded: number
    failed: number
    skipped: number
  }
  /** Analytics information */
  analytics: {
    directory: string
    filesCreated: number
  }
  /** Error details for failed districts */
  errors: Array<{
    districtId: string
    error: string
  }>
  /** Total duration in milliseconds */
  duration_ms: number
}

/**
 * Options for the upload command
 * Requirement 6.1: THE Collector_CLI SHALL provide an `upload` command to sync local snapshots and analytics to Google Cloud Storage
 */
export interface UploadOptions {
  /** Target date in YYYY-MM-DD format, if not specified uploads all available dates */
  date?: string
  /** Inclusive start date in YYYY-MM-DD format for date range filtering */
  since?: string
  /** Inclusive end date in YYYY-MM-DD format for date range filtering */
  until?: string
  /** Only upload files that have changed (compare checksums) */
  incremental: boolean
  /** Show what would be uploaded without actually uploading */
  dryRun: boolean
  /** Enable verbose logging */
  verbose: boolean
  /** Path to alternative configuration file */
  config?: string
  /** Maximum number of concurrent GCS uploads (default: 10) */
  concurrency?: number
}

/**
 * Result of an upload operation
 */
export interface UploadResult {
  /** Whether the overall operation succeeded */
  success: boolean
  /** The date(s) that were uploaded */
  dates: string[]
  /** All files that were processed */
  filesProcessed: string[]
  /** Files that were successfully uploaded */
  filesUploaded: string[]
  /** Files that failed to upload */
  filesFailed: string[]
  /** Files that were skipped (unchanged in incremental mode) */
  filesSkipped: string[]
  /** Detailed error information for failed files */
  errors: Array<{
    file: string
    error: string
    timestamp: string
  }>
  /** Total duration of the upload operation in milliseconds */
  duration_ms: number
  /**
   * Indicates a GCS authentication/authorization failure occurred.
   * When true, the CLI should exit with code 2 (complete failure).
   * Requirement 6.4: GCS authentication failure should exit with code 2.
   */
  authError?: boolean
  /**
   * Indicates that the upload manifest failed to write to disk after retry.
   * When true, the next incremental run may re-upload files from this run.
   * Requirement 4.9: Surface manifest write failures in the summary.
   */
  manifestWriteError?: boolean
}

/**
 * JSON output summary for upload command
 * Requirement 6.5: WHEN upload completes, THE Collector_CLI SHALL output a summary of uploaded files and any errors
 */
export interface UploadSummary {
  /** ISO timestamp when upload completed */
  timestamp: string
  /** Date(s) that were uploaded */
  dates: string[]
  /** Overall status: success, partial, or failed */
  status: 'success' | 'partial' | 'failed'
  /** Whether this was a dry run */
  dryRun: boolean
  /** File processing statistics */
  files: {
    total: number
    uploaded: number
    failed: number
    skipped: number
  }
  /** Upload destination information */
  destination: {
    bucket: string
    prefix: string
  }
  /** Error details for failed files */
  errors: Array<{
    file: string
    error: string
  }>
  /** Total duration in milliseconds */
  duration_ms: number
  /**
   * Indicates a GCS authentication/authorization failure occurred.
   * When true, the status will be 'failed' and exit code will be 2.
   */
  authError?: boolean
}
