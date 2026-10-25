/**
 * AnalyticsComputeService - Computes analytics from snapshot data.
 *
 * This service loads snapshot data from disk, uses the shared AnalyticsComputer
 * from analytics-core to compute analytics, and writes the results using
 * AnalyticsWriter.
 *
 * Requirements:
 * - 1.2: WHEN snapshots are created, THE Collector_CLI SHALL compute analytics
 *        for each district using the same algorithms as the Analytics_Engine
 * - 1.3: WHEN computing analytics, THE Collector_CLI SHALL generate membership
 *        trends, club health scores, distinguished club projections,
 *        division/area comparisons, and year-over-year metrics
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import {
  AnalyticsComputer,
  buildGlobalClubRace,
  buildClubsByRegion,
  buildGlobalTotals,
  buildRegionMembershipSeries,
  buildRegionRollups,
  canonicalDistrictId,
  findPreviousProgramYearDate,
  getCSPStatus,
  OFFICER_TRAINING_ROUND_COLUMNS,
  programYearForSnapshotDate,
  readSnapshotRankings,
  readSnapshotRollupInput,
  readRegionRollupInput,
  readClubsByRegionInput,
  buildMeetingTimes,
  readMeetingTimesInput,
  type Logger,
  type ClubStatistics,
  type DistrictStatistics,
  type AnalyticsManifestEntry,
  type PreComputedAnalyticsFile,
  type DistrictAnalytics,
  type RegionSeriesDistrictInput,
} from '@taverns-red/analytics-core'
import type {
  DistrictStatisticsInput,
  ScrapedRecord,
} from '@taverns-red/analytics-core'
import type {
  AllDistrictsRankingsData,
  DistrictRanking,
} from '@taverns-red/shared-contracts'
import {
  CLUBS_BY_REGION_DIR,
  CLUBS_BY_REGION_WORLD_FILE_NAME,
  CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME,
  clubsByRegionShardFileName,
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
  GLOBAL_CLUB_RACE_FILE_NAME,
  GLOBAL_TOTALS_FILE_NAME,
  DistrictRegionHistorySchema,
  MEETING_TIMES_FILE_NAME,
  normalizeClubId,
  REGION_ROLLUPS_FILE_NAME,
  REGION_ROLLUPS_REGION_SOURCE,
  RegionMembershipSeriesSchema,
  regionMembershipSeriesPath,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import { readStoreFileText } from '../utils/gzipLayers.js'
import { AnalyticsWriter } from './AnalyticsWriter.js'
import {
  ClubRaceStore,
  updateClubRaceStore,
  type ClubRaceDistrictObservation,
} from './ClubRaceStore.js'
import { TimeSeriesIndexWriter } from './TimeSeriesIndexWriter.js'
import { validateDistrictId } from '../utils/validateDistrictId.js'
import {
  dateLevelRefusal,
  missingDistricts as unrecordedDistricts,
  recordedFailedDistricts,
  recordedFailureReasons,
  recordedSourceGapDistricts,
} from '../utils/dateLevelCoverage.js'
import type { CacheMetadata } from '../types/collector.js'
import {
  ClosingPeriodDetector,
  type ClosingPeriodInfo,
} from '../utils/ClosingPeriodDetector.js'

/**
 * What folding a date into the club-race store produced (#1556): the store
 * and the exact scoped inputs it read, so the artifact projection is built
 * from the same view and cannot disagree with it.
 */
interface ClubRaceFoldResult {
  path?: string
  failed: boolean
  folded?: {
    store: ClubRaceStore
    rankings: DistrictRanking[]
    districts: ClubRaceDistrictObservation[]
  }
}

/**
 * Configuration for AnalyticsComputeService
 */
export interface AnalyticsComputeServiceConfig {
  /** Base cache directory */
  cacheDir: string
  /** Optional logger for diagnostic output */
  logger?: Logger
}

/**
 * Options for compute operation
 */
export interface ComputeOperationOptions {
  /** Target date in YYYY-MM-DD format */
  date: string
  /** Specific districts to compute analytics for (if not provided, computes for all available) */
  districts?: string[]
  /** Force re-compute even if analytics exist */
  force?: boolean
  /** Enable verbose logging */
  verbose?: boolean
}

/**
 * Result of computing analytics for a single district
 */
export interface DistrictComputeResult {
  districtId: string
  success: boolean
  analyticsPath?: string
  /** Path to performance targets file (NEW - Requirement 7.1) */
  performanceTargetsPath?: string
  /** Whether time-series data point was written (NEW - Requirement 4.1, 9.1) */
  timeSeriesWritten?: boolean
  /** Error message if time-series write failed (non-fatal) */
  timeSeriesError?: string
  /** Whether the club-trends store was updated for this district (#1708) */
  clubTrendsUpdated?: boolean
  error?: string
  skipped?: boolean
}

/**
 * Result of the compute operation
 *
 * Requirements:
 * - 8.2: WHEN computing analytics for closing period data THEN the JSON output
 *        SHALL report the actual snapshot date used (not the requested date)
 */
export interface ComputeOperationResult {
  success: boolean
  /** The actual snapshot date used for analytics computation (may differ from requestedDate for closing periods) */
  date: string
  /** The original date that was requested for analytics computation */
  requestedDate: string
  /** Whether a closing period adjustment was made */
  isClosingPeriod: boolean
  /** The data month in YYYY-MM format (only present for closing periods) */
  dataMonth?: string
  districtsProcessed: string[]
  districtsSucceeded: string[]
  districtsFailed: string[]
  districtsSkipped: string[]
  analyticsLocations: string[]
  /**
   * Path to the worldwide rollup written for this date (#1498), or undefined
   * when the date carried no `all-districts-rankings.json` — without that
   * file there is no authoritative district set, and an unscoped rollup is
   * refused rather than guessed at (#1466).
   */
  globalTotalsPath?: string
  /**
   * True when the rollup THREW on a date that HAD a district set (#1498).
   * Distinct from `globalTotalsPath === undefined`, which is also the state
   * of a date legitimately skipped for having no rankings file. The CLI's
   * exit code keys on this: an error recorded against districtId 'N/A' never
   * reaches `districtsFailed`, so without the flag a broken rollup exits 0.
   */
  globalTotalsFailed: boolean
  /**
   * Path of the club-race crossing store this date was folded into (#1556),
   * or undefined when the date had no `all-districts-rankings.json` to
   * scope the district set by (same skip rule as the rollup).
   */
  clubRaceStorePath?: string
  /**
   * True when folding the date into the crossing store THREW (#1556).
   * Reported in `errors` and here, but deliberately NOT publish-blocking:
   * the store publishes nothing itself, and a missed capture must not stop
   * the day's snapshot — which the next daily run would never recompute —
   * from being uploaded.
   */
  clubRaceStoreFailed: boolean
  /**
   * Path of `snapshots/{date}/global-club-race.json` (#1556), the published
   * projection of the crossing store, or undefined when the date was skipped
   * (no rankings file) or the store fold failed.
   */
  globalClubRacePath?: string
  /**
   * True when the projection could not be written (#1556) — including when
   * the store fold it depends on failed. Reported, never publish-blocking: an
   * absent artifact renders as "not available for this date", a wrong day's
   * snapshot never recomputes.
   */
  globalClubRaceFailed: boolean
  /**
   * Path of `snapshots/{date}/region-rollups.json` (#1799), or undefined when
   * the date was skipped (no rankings file) or the artifact was refused.
   */
  regionRollupsPath?: string
  /**
   * True when the region rollups were refused (a listed district had no
   * file, ADR-015 P3) or threw. Reported, never publish-blocking: a missing
   * artifact reads "not available for this date".
   */
  regionRollupsFailed: boolean
  /**
   * Paths written under `snapshots/{date}/clubs-by-region/` (#1800): one
   * shard per region, then `world.json` and `world-points.json`. Undefined when the date was
   * skipped (no rankings file) or the files were refused.
   */
  clubsByRegionPaths?: string[]
  /**
   * True when the club shards were refused (a listed district had no file,
   * ADR-015 P3) or threw. Reported, never publish-blocking.
   */
  clubsByRegionFailed: boolean
  /**
   * Path of `snapshots/{date}/meeting-times.json` (#1814), or undefined when
   * the date was skipped (no rankings file) or the file was refused.
   */
  meetingTimesPath?: string
  /**
   * True when the meeting-time counts were refused (a listed district had
   * no file, ADR-015 P3) or threw. Reported, never publish-blocking.
   */
  meetingTimesFailed: boolean
  /**
   * Path of `time-series/regions/{PY}.json` (#2127), or undefined when no
   * district series exists for the date's program year.
   */
  regionSeriesPath?: string
  /**
   * True when the region membership series could not be built or written
   * (#2127). Recorded in `errors`; the store keeps its previous copy.
   */
  regionSeriesFailed: boolean
  /**
   * Districts whose time-series data point was not written (#1702). The
   * loop still continues to the next district, but the run fails: Trends
   * reads nothing else, so a skipped write is a stale page, not a detail.
   */
  timeSeriesFailed: string[]
  /** Districts whose time-series data point was written (#1708 counters). */
  timeSeriesWritten: string[]
  /** Districts whose club-trends store was updated (#1708 counters). */
  clubTrendsUpdated: string[]
  /** Computed (not skipped) districts whose club-trends store was not updated (#1708). */
  clubTrendsFailed: string[]
  errors: Array<{
    districtId: string
    error: string
    timestamp: string
  }>
  duration_ms: number
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
 * Result of checking if analytics need recomputation
 */
interface AnalyticsCheckResult {
  /** Whether analytics exist for this district */
  exists: boolean
  /** Whether recomputation is needed (checksum changed) */
  needsRecomputation: boolean
  /** The stored source snapshot checksum (if analytics exist) */
  storedChecksum?: string
  /** The current source snapshot checksum */
  currentChecksum?: string
}

/**
 * AnalyticsComputeService computes analytics from snapshot data.
 *
 * The service reads snapshot files from:
 *   CACHE_DIR/snapshots/{date}/district_{id}.json
 *
 * And writes analytics to:
 *   CACHE_DIR/snapshots/{date}/analytics/district_{id}_analytics.json
 *   CACHE_DIR/snapshots/{date}/analytics/district_{id}_performance-targets.json
 *   CACHE_DIR/snapshots/{date}/analytics/manifest.json
 *
 * And writes time-series data to:
 *   CACHE_DIR/time-series/district_{id}/{program-year}.json
 *   CACHE_DIR/time-series/district_{id}/index-metadata.json
 *
 * Requirements:
 * - 4.1: Generate time-series data points for each district
 * - 9.1: Integrate time-series generation with analytics pipeline
 * - 9.2: Use same snapshot data as other analytics
 * - 9.4: If time-series fails for a district, log error and continue
 */
export class AnalyticsComputeService {
  private readonly cacheDir: string
  private readonly logger: Logger
  private readonly analyticsComputer: AnalyticsComputer
  private readonly analyticsWriter: AnalyticsWriter
  private readonly timeSeriesWriter: TimeSeriesIndexWriter
  private readonly closingPeriodDetector: ClosingPeriodDetector

  constructor(config: AnalyticsComputeServiceConfig) {
    this.cacheDir = config.cacheDir
    this.logger = config.logger ?? noopLogger
    this.analyticsComputer = new AnalyticsComputer()
    this.analyticsWriter = new AnalyticsWriter({
      cacheDir: config.cacheDir,
      logger: config.logger,
    })
    this.timeSeriesWriter = new TimeSeriesIndexWriter({
      cacheDir: config.cacheDir,
      logger: config.logger,
    })
    this.closingPeriodDetector = new ClosingPeriodDetector()
  }

  /**
   * Get the snapshot directory path for a date
   */
  private getSnapshotDir(date: string): string {
    return path.join(this.cacheDir, 'snapshots', date)
  }

  /**
   * Get the district snapshot file path
   */
  private getDistrictSnapshotPath(date: string, districtId: string): string {
    validateDistrictId(districtId)
    return path.join(this.getSnapshotDir(date), `district_${districtId}.json`)
  }

  /**
   * Get the per-district analytics file path. Validates districtId (#1111)
   * before interpolating it into the path (active path-traversal tripwire).
   */
  private getDistrictAnalyticsPath(date: string, districtId: string): string {
    validateDistrictId(districtId)
    return path.join(
      this.getAnalyticsDir(date),
      `district_${districtId}_analytics.json`
    )
  }

  /**
   * Get the analytics directory path for a date
   */
  getAnalyticsDir(date: string): string {
    return this.analyticsWriter.getAnalyticsDir(date)
  }

  /**
   * Get the raw CSV directory path for a date
   */
  private getRawCsvDir(date: string): string {
    return path.join(this.cacheDir, 'raw-csv', date)
  }

  /**
   * Read cache metadata for a given date.
   *
   * Reads the metadata.json file from the raw-csv directory to detect
   * closing period information. This is used to determine the correct
   * snapshot location when computing analytics.
   *
   * @param date - The date to read metadata for (YYYY-MM-DD format)
   * @returns CacheMetadata if found and valid, null otherwise
   *
   * Requirements:
   * - 6.1: WHEN computing analytics for a date THEN read cache metadata from CACHE_DIR/raw-csv/{date}/metadata.json
   * - 6.2: WHEN cache metadata exists with isClosingPeriod: true THEN extract isClosingPeriod and dataMonth fields
   * - 6.3: WHEN cache metadata does not exist THEN look for snapshots at the requested date
   * - 6.4: IF reading cache metadata fails THEN log a warning and continue with non-closing-period behavior
   */
  async readCacheMetadata(date: string): Promise<CacheMetadata | null> {
    const metadataPath = path.join(this.getRawCsvDir(date), 'metadata.json')

    try {
      const content = await fs.readFile(metadataPath, 'utf-8')
      const parsed: unknown = JSON.parse(content)

      // Validate the parsed object has the expected structure
      if (typeof parsed !== 'object' || parsed === null) {
        this.logger.warn('Cache metadata is not a valid object', {
          date,
          path: metadataPath,
        })
        return null
      }

      const metadata = parsed as Record<string, unknown>

      // Extract and return the CacheMetadata fields
      return {
        date: typeof metadata['date'] === 'string' ? metadata['date'] : date,
        isClosingPeriod:
          typeof metadata['isClosingPeriod'] === 'boolean'
            ? metadata['isClosingPeriod']
            : undefined,
        dataMonth:
          typeof metadata['dataMonth'] === 'string'
            ? metadata['dataMonth']
            : undefined,
      }
    } catch (error) {
      const err = error as { code?: string }

      // File not found is expected - return null without warning
      if (err.code === 'ENOENT') {
        return null
      }

      // Log warning for parse errors or other issues
      this.logger.warn('Failed to read cache metadata', {
        date,
        path: metadataPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Determine the actual snapshot date to use based on closing period detection.
   *
   * Uses ClosingPeriodDetector to detect if the data represents a closing period
   * and returns the appropriate snapshot date (last day of data month for closing
   * periods, or the requested date for non-closing periods).
   *
   * @param requestedDate - The date that was requested for analytics computation (YYYY-MM-DD)
   * @param metadata - Cache metadata containing isClosingPeriod and dataMonth fields
   * @returns ClosingPeriodInfo with appropriate snapshot date
   *
   * Requirements:
   * - 7.1: WHEN `isClosingPeriod` is true THEN calculate the last day of the data month using the existing ClosingPeriodDetector utility
   */
  determineSnapshotDate(
    requestedDate: string,
    metadata: CacheMetadata | null
  ): ClosingPeriodInfo {
    return this.closingPeriodDetector.detect(requestedDate, metadata)
  }

  /**
   * Convert DistrictStatistics to DistrictStatisticsInput format.
   *
   * The TimeSeriesDataPointBuilder expects raw CSV-like data with clubPerformance array.
   * This method converts the transformed ClubStatistics[] to ScrapedRecord[] format.
   *
   * @param snapshot - The district statistics in transformed format
   * @returns DistrictStatisticsInput for TimeSeriesDataPointBuilder
   *
   * @see Requirements 9.2: Use same snapshot data as other analytics
   */
  private convertToDistrictStatisticsInput(
    snapshot: DistrictStatistics
  ): DistrictStatisticsInput {
    // Officer training (#2296) has no transformed field: carry the raw
    // goal-9 cells across from the club's own clubPerformance row. Raw rows
    // hold TI's zero-padded number; clubs hold the canonical one (#1440).
    const officerTrainingKeys = OFFICER_TRAINING_ROUND_COLUMNS.flatMap(
      column => column.aliases
    )
    const rawOfficerTraining = new Map<string, ScrapedRecord>()
    for (const row of snapshot.clubPerformance ?? []) {
      const cells: ScrapedRecord = {}
      for (const key of officerTrainingKeys) {
        if (!(key in row)) continue
        const value = row[key]
        cells[key] =
          typeof value === 'string' || typeof value === 'number' ? value : null
      }
      if (Object.keys(cells).length === 0) continue
      rawOfficerTraining.set(normalizeClubId(row['Club Number']), cells)
    }

    // Convert ClubStatistics[] to ScrapedRecord[] format
    // Map the transformed fields back to the raw CSV column names
    const clubPerformance: ScrapedRecord[] = snapshot.clubs.map(club => ({
      // Officers trained per round (#2296), when the export carries them
      ...rawOfficerTraining.get(normalizeClubId(club.clubId)),

      // Membership fields
      'Active Members': club.membershipCount,
      'Active Membership': club.membershipCount,
      Membership: club.membershipCount,
      'Mem. Base': club.membershipBase,

      // Payment fields
      'Oct. Ren.': club.octoberRenewals,
      'Oct. Ren': club.octoberRenewals,
      'Apr. Ren.': club.aprilRenewals,
      'Apr. Ren': club.aprilRenewals,
      'New Members': club.newMembers,
      New: club.newMembers,

      // DCP Goals
      'Goals Met': club.dcpGoals,

      // Club identification
      'Club Number': club.clubId,
      'Club ID': club.clubId,
      ClubID: club.clubId,
      'Club Name': club.clubName,

      // Status field. clubStatus is the OPERATIONAL status (Active,
      // Suspended, …) — mapping it into 'Club Distinguished Status' was
      // the #1120 corruption; pass the true distinguished value through.
      'Club Distinguished Status': club.distinguishedStatus ?? '',

      // CSP field - normalized via getCSPStatus (pre-2025 defaults to true)
      CSP: getCSPStatus(club) ? 'Yes' : 'No',
    }))

    // Calculate total membership from totals if available
    const membershipTotal = snapshot.totals?.totalMembership ?? 0

    return {
      districtId: snapshot.districtId,
      asOfDate: snapshot.snapshotDate,
      membership: {
        total: membershipTotal,
      },
      clubPerformance,
    }
  }

  /**
   * Check if snapshot exists for a date
   */
  async snapshotExists(date: string): Promise<boolean> {
    const snapshotDir = this.getSnapshotDir(date)
    try {
      await fs.access(snapshotDir)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if analytics already exist for a district
   */
  async analyticsExist(date: string, districtId: string): Promise<boolean> {
    const analyticsPath = this.getDistrictAnalyticsPath(date, districtId)
    try {
      await fs.access(analyticsPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Calculate SHA256 checksum of a file's content
   *
   * Requirement 5.1: Track checksums of source snapshot files
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * Calculate the checksum of a snapshot file
   *
   * Requirement 5.1: Track checksums of source snapshot files
   */
  async calculateSnapshotChecksum(
    date: string,
    districtId: string
  ): Promise<string | null> {
    const snapshotPath = this.getDistrictSnapshotPath(date, districtId)
    try {
      const content = await fs.readFile(snapshotPath, 'utf-8')
      return this.calculateChecksum(content)
    } catch {
      return null
    }
  }

  /**
   * Get the stored source snapshot checksum from existing analytics
   *
   * Requirement 5.2: Compare the current snapshot checksum with the checksum
   * used in the last computation
   */
  async getStoredSnapshotChecksum(
    date: string,
    districtId: string
  ): Promise<string | null> {
    const analyticsPath = this.getDistrictAnalyticsPath(date, districtId)

    try {
      const content = await fs.readFile(analyticsPath, 'utf-8')
      const parsed = JSON.parse(
        content
      ) as PreComputedAnalyticsFile<DistrictAnalytics>
      return parsed.metadata.sourceSnapshotChecksum ?? null
    } catch {
      return null
    }
  }

  /**
   * Check if analytics need recomputation based on snapshot checksum
   *
   * Requirements:
   * - 5.1: Track checksums of source snapshot files
   * - 5.2: Compare the current snapshot checksum with the checksum used in the last computation
   * - 5.3: Skip analytics recomputation if snapshot checksum is unchanged
   */
  async checkAnalyticsStatus(
    date: string,
    districtId: string
  ): Promise<AnalyticsCheckResult> {
    const exists = await this.analyticsExist(date, districtId)

    if (!exists) {
      // Analytics don't exist, need to compute
      const currentChecksum = await this.calculateSnapshotChecksum(
        date,
        districtId
      )
      return {
        exists: false,
        needsRecomputation: true,
        currentChecksum: currentChecksum ?? undefined,
      }
    }

    // Analytics exist, check if snapshot has changed
    const currentChecksum = await this.calculateSnapshotChecksum(
      date,
      districtId
    )
    const storedChecksum = await this.getStoredSnapshotChecksum(
      date,
      districtId
    )

    // If we can't calculate current checksum, something is wrong
    if (!currentChecksum) {
      return {
        exists: true,
        needsRecomputation: false, // Can't recompute without snapshot
        storedChecksum: storedChecksum ?? undefined,
      }
    }

    // If no stored checksum (legacy analytics), need to recompute to add it
    if (!storedChecksum) {
      this.logger.debug('No stored checksum found, recomputation needed', {
        date,
        districtId,
      })
      return {
        exists: true,
        needsRecomputation: true,
        currentChecksum,
      }
    }

    // Compare checksums
    const needsRecomputation = currentChecksum !== storedChecksum

    if (needsRecomputation) {
      this.logger.debug('Snapshot checksum changed, recomputation needed', {
        date,
        districtId,
        storedChecksum,
        currentChecksum,
      })
    }

    return {
      exists: true,
      needsRecomputation,
      storedChecksum,
      currentChecksum,
    }
  }

  /**
   * Load district snapshot from disk
   *
   * Handles both formats:
   * - PerDistrictData wrapper format (from TransformService): { districtId, data: DistrictStatistics }
   * - Direct DistrictStatistics format (legacy/test format): { districtId, snapshotDate, clubs, ... }
   */
  async loadDistrictSnapshot(
    date: string,
    districtId: string
  ): Promise<DistrictStatistics | null> {
    const snapshotPath = this.getDistrictSnapshotPath(date, districtId)

    try {
      const content = await fs.readFile(snapshotPath, 'utf-8')
      const parsed = JSON.parse(content) as Record<string, unknown>

      // Check if this is a PerDistrictData wrapper (has 'data' field with nested structure)
      // or direct DistrictStatistics format (has 'snapshotDate' at top level)
      const dataField = parsed['data']
      if (
        'data' in parsed &&
        typeof dataField === 'object' &&
        dataField !== null
      ) {
        // PerDistrictData wrapper format - extract the nested data
        const wrapper = parsed as { data: DistrictStatistics }
        return wrapper.data
      } else if ('snapshotDate' in parsed) {
        // Direct DistrictStatistics format
        return parsed as unknown as DistrictStatistics
      } else {
        // Unknown format - log warning and try to use as-is
        this.logger.warn(
          'Unknown snapshot format, attempting to use as DistrictStatistics',
          {
            date,
            districtId,
            hasData: 'data' in parsed,
            hasSnapshotDate: 'snapshotDate' in parsed,
          }
        )
        return parsed as unknown as DistrictStatistics
      }
    } catch (error) {
      const err = error as { code?: string }
      if (err.code === 'ENOENT') {
        this.logger.debug('District snapshot not found', {
          date,
          districtId,
          path: snapshotPath,
        })
        return null
      }
      // Re-throw other errors (including JSON parse errors)
      throw error
    }
  }

  /**
   * Load all-districts rankings from disk
   *
   * Requirements:
   * - 5.1: Load the all-districts-rankings.json file for the snapshot date
   * - 5.3: If the all-districts-rankings.json file is not available, log a warning
   *        and compute performance targets with null rankings
   * - 5.4: The Analytics_Compute_Service SHALL NOT fail if all-districts-rankings.json is missing
   *
   * @param date - Snapshot date in YYYY-MM-DD format
   * @returns AllDistrictsRankingsData or null if not found
   */
  async loadAllDistrictsRankings(
    date: string
  ): Promise<AllDistrictsRankingsData | null> {
    const rankingsPath = path.join(
      this.getSnapshotDir(date),
      'all-districts-rankings.json'
    )

    try {
      const content = await fs.readFile(rankingsPath, 'utf-8')
      return JSON.parse(content) as AllDistrictsRankingsData
    } catch (error) {
      const err = error as { code?: string }
      if (err.code === 'ENOENT') {
        // Requirement 5.3: Log warning when file not found
        this.logger.warn('All-districts rankings not found', {
          date,
          path: rankingsPath,
        })
        return null
      }
      // Re-throw other errors (e.g., JSON parse errors, permission errors)
      throw error
    }
  }

  /**
   * Mark every #1671 source-gap district of `snapshotDate` as not measured in
   * its time series (#2070): drop that date's point, if any, and record the
   * date in the program-year file's `sourceGapDates`. A district with no
   * series file gets none created. Failures are returned, not thrown.
   */
  private async recordTimeSeriesSourceGaps(snapshotDate: string): Promise<{
    districts: string[]
    failed: Array<{ districtId: string; error: string }>
  }> {
    const districts = await recordedSourceGapDistricts(
      this.getSnapshotDir(snapshotDate)
    )
    const failed: Array<{ districtId: string; error: string }> = []
    for (const districtId of districts) {
      try {
        const changed = await this.timeSeriesWriter.recordSourceGap(
          districtId,
          snapshotDate
        )
        if (changed) await this.timeSeriesWriter.updateMetadata(districtId)
      } catch (error) {
        failed.push({
          districtId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
    return { districts, failed }
  }

  /**
   * Discover available districts from snapshot directory
   */
  async discoverAvailableDistricts(date: string): Promise<string[]> {
    const snapshotDir = this.getSnapshotDir(date)
    const districts: string[] = []

    try {
      const entries = await fs.readdir(snapshotDir)

      for (const entry of entries) {
        // Match district_<id>.json — and NOT the daily-reports sidecar
        // district_<id>_reports.json that shares the directory (#1428).
        const districtId = districtIdFromSnapshotFileName(entry)
        if (districtId !== null) {
          districts.push(districtId)
        }
      }

      // Sort districts numerically if possible, otherwise alphabetically
      districts.sort((a, b) => {
        const numA = parseInt(a, 10)
        const numB = parseInt(b, 10)
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB
        }
        return a.localeCompare(b)
      })

      return districts
    } catch (error) {
      const err = error as { code?: string }
      if (err.code === 'ENOENT') {
        this.logger.warn('Snapshot directory not found', { date, snapshotDir })
        return []
      }
      throw error
    }
  }

  /**
   * Compute analytics for a single district
   *
   * Requirements:
   * - 1.2: Compute analytics using the same algorithms as the Analytics_Engine
   * - 1.3: Generate membership trends, club health scores, etc.
   * - 5.1: Track checksums of source snapshot files
   * - 5.2: Compare the current snapshot checksum with the checksum used in the last computation
   * - 5.3: Skip analytics recomputation if snapshot checksum is unchanged
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   * - 5.5: The `--force-analytics` flag bypasses checksum comparison
   * - 5.2 (per-metric-rankings): Pass all-districts rankings data to computePerformanceTargets
   */
  async computeDistrictAnalytics(
    date: string,
    districtId: string,
    options?: {
      force?: boolean
      allDistrictsRankings?: AllDistrictsRankingsData | null
    }
  ): Promise<DistrictComputeResult> {
    const force = options?.force ?? false

    this.logger.info('Computing analytics for district', {
      date,
      districtId,
      force,
    })

    // Check analytics status (existence and checksum comparison)
    const status = await this.checkAnalyticsStatus(date, districtId)

    // Requirement 5.5: --force-analytics bypasses checksum comparison
    if (!force) {
      // Requirement 5.3: Skip if analytics exist and snapshot unchanged
      if (status.exists && !status.needsRecomputation) {
        this.logger.info('Analytics exist and snapshot unchanged, skipping', {
          date,
          districtId,
          storedChecksum: status.storedChecksum,
        })
        return {
          districtId,
          success: true,
          skipped: true,
        }
      }

      // Log why we're recomputing
      if (status.exists && status.needsRecomputation) {
        this.logger.info('Snapshot changed, recomputing analytics', {
          date,
          districtId,
          storedChecksum: status.storedChecksum,
          currentChecksum: status.currentChecksum,
        })
      }
    }

    try {
      // Load district snapshot
      const snapshot = await this.loadDistrictSnapshot(date, districtId)
      if (!snapshot) {
        return {
          districtId,
          success: false,
          error: `Snapshot not found for district ${districtId} on ${date}`,
        }
      }

      // Requirement 3.1: Load previous program year's snapshot for YoY comparison
      const previousYearDate = findPreviousProgramYearDate(date)
      let previousSnapshot: DistrictStatistics | null = null
      try {
        previousSnapshot = await this.loadDistrictSnapshot(
          previousYearDate,
          districtId
        )
        if (previousSnapshot) {
          this.logger.info('Loaded previous year snapshot for YoY comparison', {
            date,
            districtId,
            previousYearDate,
          })
        } else {
          this.logger.info(
            'No previous year snapshot found, YoY will use single snapshot',
            {
              date,
              districtId,
              previousYearDate,
            }
          )
        }
      } catch (error) {
        // Requirement 3.4: Log warning and continue with single snapshot
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        this.logger.warn(
          'Failed to load previous year snapshot, continuing with single snapshot',
          {
            date,
            districtId,
            previousYearDate,
            error: errorMessage,
          }
        )
      }

      // ── Dense club trend history via ClubTrendsStore (#144) ──────────────
      // Instead of loading all program-year snapshots (which don't exist on the
      // ephemeral runner), we maintain a persistent per-district store that
      // accumulates one data point per pipeline run. The store is synced from
      // GCS before analytics compute and pushed back after (see data-pipeline.yml
      // Step 3c and Step 5).
      const { updateClubTrendsStore, clubTrendsAsOf } =
        await import('./ClubTrendsStore.js')
      const clubTrendsStore = await updateClubTrendsStore(
        this.cacheDir,
        date,
        districtId,
        snapshot
      )

      this.logger.info('Updated club trends store', {
        date,
        districtId,
        clubCount: Object.keys(clubTrendsStore.clubs).length,
        programYear: clubTrendsStore.programYear,
      })

      // Build snapshots array: previous year (if available) + today
      // (YoY comparison still uses the prev-year snapshot synced in Step 3b)
      const snapshots = previousSnapshot
        ? [previousSnapshot, snapshot]
        : [snapshot]

      // Requirement 5.1: Calculate checksum of source snapshot
      const sourceSnapshotChecksum =
        status.currentChecksum ??
        (await this.calculateSnapshotChecksum(date, districtId))

      // Requirement 5.2 (per-metric-rankings): Load all-districts rankings if not provided
      // Rankings are loaded once per compute operation and passed to each district computation
      let allDistrictsRankings = options?.allDistrictsRankings
      if (allDistrictsRankings === undefined) {
        // Load rankings if not already provided (for single-district computation)
        allDistrictsRankings = await this.loadAllDistrictsRankings(date)
        if (!allDistrictsRankings) {
          this.logger.warn(
            'All-districts rankings not available, rankings will be null',
            {
              date,
              districtId,
            }
          )
        }
      }

      // Compute analytics using shared AnalyticsComputer.
      // preloadedClubTrends supplies the accumulated full-year trend arrays
      // from the ClubTrendsStore, giving ClubHealthAnalyticsModule dense
      // multi-point trend data without loading historical snapshots. The
      // store spans the whole program year, so it is capped at `date` (the
      // snapshot's logical date): a re-derived past date must not see its
      // future (ADR-015 P4, #1759).
      // Requirement 5.2 (per-metric-rankings): Pass allDistrictsRankings via options
      const computationResult =
        await this.analyticsComputer.computeDistrictAnalytics(
          districtId,
          snapshots,
          {
            allDistrictsRankings: allDistrictsRankings ?? undefined,
            preloadedClubTrends: clubTrendsAsOf(clubTrendsStore.clubs, date),
          }
        )

      // Requirement 5.4: Pass source snapshot checksum to AnalyticsWriter
      const writeOptions = sourceSnapshotChecksum
        ? { sourceSnapshotChecksum }
        : undefined

      // Write analytics files using AnalyticsWriter
      // Base analytics files (existing)
      const analyticsPath = await this.analyticsWriter.writeDistrictAnalytics(
        date,
        districtId,
        computationResult.districtAnalytics,
        writeOptions
      )

      // Only `analytics` and `performance-targets` have readers. The other
      // 8 per-district files (membership, clubhealth, …, club-trends-index)
      // were re-serialisations of `analytics` or unconsumed, and are no
      // longer written (#1798, utils/retiredAnalyticsFiles.ts).
      const performanceTargetsPath =
        await this.analyticsWriter.writePerformanceTargets(
          date,
          districtId,
          computationResult.performanceTargets,
          writeOptions
        )

      // NEW: Write time-series data point (Requirements 4.1, 9.1, 9.2, 9.4)
      // Build and write time-series data point using the same snapshot data
      // Errors are handled gracefully - log and continue, don't fail the whole operation
      let timeSeriesWritten = false
      let timeSeriesError: string | undefined

      try {
        // Get the builder from TimeSeriesIndexWriter
        const builder = this.timeSeriesWriter.getBuilder()

        // Convert the DistrictStatistics to DistrictStatisticsInput format
        // The builder expects raw CSV-like data with clubPerformance array
        const districtInput = this.convertToDistrictStatisticsInput(snapshot)

        // Build the time-series data point
        const dataPoint = builder.build(date, districtInput)

        // Write the data point to the time-series index
        await this.timeSeriesWriter.writeDataPoint(districtId, dataPoint)

        // Update the index metadata for this district
        await this.timeSeriesWriter.updateMetadata(districtId)

        timeSeriesWritten = true

        this.logger.info('Time-series data point written', {
          date,
          districtId,
          membership: dataPoint.membership,
          payments: dataPoint.payments,
          dcpGoals: dataPoint.dcpGoals,
          distinguishedTotal: dataPoint.distinguishedTotal,
        })

        // ── Patch paymentsTrend in already-written analytics files (#206) ──
        // The analytics were computed and written above using only 1-2 snapshots,
        // producing a paymentsTrend with just 1 data point. Now that the time-series
        // data point has been appended, read back the full accumulated trend and
        // inject it into the analytics JSON file on disk.
        try {
          const accumulatedTrend = await this.timeSeriesWriter.getPaymentsTrend(
            districtId,
            date
          )
          if (accumulatedTrend.length > 1) {
            const patchFiles = [analyticsPath].filter(Boolean)
            for (const filePath of patchFiles) {
              const raw = await fs.readFile(filePath, 'utf-8')
              const json = JSON.parse(raw)
              if (json.data) {
                json.data.paymentsTrend = accumulatedTrend
                // Compact, as AnalyticsWriter writes it (#1901).
                await fs.writeFile(filePath, JSON.stringify(json), 'utf-8')
              }
            }
            this.logger.info('Patched paymentsTrend from time-series', {
              date,
              districtId,
              dataPoints: accumulatedTrend.length,
            })
          }
        } catch (patchError) {
          // Non-fatal — the analytics files already have a 1-point trend
          const msg =
            patchError instanceof Error ? patchError.message : 'Unknown error'
          this.logger.warn(
            'Failed to patch paymentsTrend from time-series (continuing)',
            { date, districtId, error: msg }
          )
        }
      } catch (error) {
        // Requirement 9.4: Log error and continue with other districts
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        timeSeriesError = errorMessage
        this.logger.error(
          'Failed to write time-series data point (continuing to the next district; the run will fail, #1702)',
          {
            date,
            districtId,
            error: errorMessage,
          }
        )
      }

      this.logger.info('Analytics computed and written', {
        date,
        districtId,
        analyticsPath,
        performanceTargetsPath,
        timeSeriesWritten,
        sourceSnapshotChecksum,
      })

      return {
        districtId,
        success: true,
        analyticsPath,
        performanceTargetsPath,
        timeSeriesWritten,
        timeSeriesError,
        clubTrendsUpdated: true,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to compute analytics for district', {
        date,
        districtId,
        error: errorMessage,
      })
      return {
        districtId,
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Compute analytics for all available districts
   *
   * Requirements:
   * - 1.2: Compute analytics for each district
   * - 1.3: Generate all analytics types
   * - 1.5: IF analytics computation fails for a district, THEN continue processing
   */
  /**
   * Compute analytics for all available districts
   *
   * Requirements:
   * - 1.2: Compute analytics for each district
   * - 1.3: Generate all analytics types
   * - 1.5: IF analytics computation fails for a district, THEN continue processing
   * - 7.1: WHEN `isClosingPeriod` is true THEN calculate the last day of the data month using ClosingPeriodDetector
   * - 7.2: WHEN `isClosingPeriod` is true THEN look for snapshots at `CACHE_DIR/snapshots/{lastDayOfDataMonth}/`
   * - 7.3: WHEN the data month is December and collection date is in January THEN look for snapshots dated December 31 of prior year
   * - 7.4: WHEN `isClosingPeriod` is false or undefined THEN look for snapshots at the requested date
   * - 8.1: WHEN computing analytics for closing period data THEN write analytics to `CACHE_DIR/snapshots/{lastDayOfDataMonth}/analytics/`
   * - 8.3: WHEN computing analytics for non-closing-period data THEN write analytics to `CACHE_DIR/snapshots/{requestedDate}/analytics/`
   */
  async compute(
    options: ComputeOperationOptions
  ): Promise<ComputeOperationResult> {
    const startTime = Date.now()
    const { date, districts: requestedDistricts, force, verbose } = options

    if (verbose) {
      this.logger.info('Starting compute-analytics operation', {
        date,
        requestedDistricts,
        force,
      })
    }

    // Step 1: Read cache metadata to detect closing periods (Requirement 6.1, 6.2, 6.3, 6.4)
    const cacheMetadata = await this.readCacheMetadata(date)

    // Step 2: Determine the correct snapshot date based on closing period detection
    // (Requirements 7.1, 7.2, 7.3, 7.4)
    const closingPeriodInfo = this.determineSnapshotDate(date, cacheMetadata)
    const snapshotDate = closingPeriodInfo.snapshotDate

    // Requirement 8.2: Log the date adjustment when verbose mode is enabled
    if (closingPeriodInfo.isClosingPeriod && verbose) {
      this.logger.info('Closing period detected - date adjustment applied', {
        requestedDate: date,
        actualSnapshotDate: snapshotDate,
        dataMonth: closingPeriodInfo.dataMonth,
        collectionDate: closingPeriodInfo.collectionDate,
      })
    }

    // Check if snapshot exists for the adjusted date (Requirement 7.2)
    const snapshotExists = await this.snapshotExists(snapshotDate)
    if (!snapshotExists) {
      this.logger.error('Snapshot not found for date', {
        requestedDate: date,
        snapshotDate,
        isClosingPeriod: closingPeriodInfo.isClosingPeriod,
      })
      return {
        success: false,
        date: snapshotDate,
        requestedDate: date,
        isClosingPeriod: closingPeriodInfo.isClosingPeriod,
        dataMonth: closingPeriodInfo.isClosingPeriod
          ? closingPeriodInfo.dataMonth
          : undefined,
        districtsProcessed: [],
        districtsSucceeded: [],
        districtsFailed: [],
        districtsSkipped: [],
        analyticsLocations: [],
        // The rollup never ran; "did not run" is not "failed".
        globalTotalsFailed: false,
        clubRaceStoreFailed: false,
        globalClubRaceFailed: false,
        regionRollupsFailed: false,
        clubsByRegionFailed: false,
        meetingTimesFailed: false,
        regionSeriesFailed: false,
        timeSeriesFailed: [],
        timeSeriesWritten: [],
        clubTrendsUpdated: [],
        clubTrendsFailed: [],
        errors: [
          {
            districtId: 'N/A',
            error: closingPeriodInfo.isClosingPeriod
              ? `Snapshot not found for closing period date ${snapshotDate} (requested: ${date}). Run transform first.`
              : `Snapshot not found for date ${snapshotDate}`,
            timestamp: new Date().toISOString(),
          },
        ],
        duration_ms: Date.now() - startTime,
      }
    }

    // Discover available districts if not specified (using adjusted snapshot date)
    let districtsToCompute: string[]
    if (requestedDistricts && requestedDistricts.length > 0) {
      districtsToCompute = requestedDistricts
    } else {
      districtsToCompute = await this.discoverAvailableDistricts(snapshotDate)
    }

    if (districtsToCompute.length === 0) {
      this.logger.warn('No districts found to compute analytics for', {
        requestedDate: date,
        snapshotDate,
      })
      return {
        success: false,
        date: snapshotDate,
        requestedDate: date,
        isClosingPeriod: closingPeriodInfo.isClosingPeriod,
        dataMonth: closingPeriodInfo.isClosingPeriod
          ? closingPeriodInfo.dataMonth
          : undefined,
        districtsProcessed: [],
        districtsSucceeded: [],
        districtsFailed: [],
        districtsSkipped: [],
        analyticsLocations: [],
        // The rollup never ran; "did not run" is not "failed".
        globalTotalsFailed: false,
        clubRaceStoreFailed: false,
        globalClubRaceFailed: false,
        regionRollupsFailed: false,
        clubsByRegionFailed: false,
        meetingTimesFailed: false,
        regionSeriesFailed: false,
        timeSeriesFailed: [],
        timeSeriesWritten: [],
        clubTrendsUpdated: [],
        clubTrendsFailed: [],
        errors: [
          {
            districtId: 'N/A',
            error: `No district snapshots found for date ${snapshotDate}`,
            timestamp: new Date().toISOString(),
          },
        ],
        duration_ms: Date.now() - startTime,
      }
    }

    // Compute analytics for each district
    const results: DistrictComputeResult[] = []
    const errors: Array<{
      districtId: string
      error: string
      timestamp: string
    }> = []
    const analyticsLocations: string[] = []
    const manifestEntries: AnalyticsManifestEntry[] = []

    // Requirement 5.2 (per-metric-rankings): Load rankings once per compute operation
    // This is more efficient than loading for each district
    // Use snapshotDate for loading rankings (Requirement 8.1)
    const allDistrictsRankings =
      await this.loadAllDistrictsRankings(snapshotDate)
    if (!allDistrictsRankings) {
      this.logger.warn(
        'All-districts rankings not available, per-metric rankings will be null',
        { snapshotDate }
      )
    }

    for (const districtId of districtsToCompute) {
      // Use snapshotDate for all computeDistrictAnalytics calls (Requirement 8.1, 8.3)
      const result = await this.computeDistrictAnalytics(
        snapshotDate,
        districtId,
        {
          force,
          allDistrictsRankings,
        }
      )
      results.push(result)

      if (result.success && !result.skipped) {
        // Collect analytics file paths
        // Base analytics files (existing)
        if (result.analyticsPath) {
          analyticsLocations.push(result.analyticsPath)
          const entry = await this.analyticsWriter.createManifestEntry(
            result.analyticsPath,
            districtId,
            'analytics'
          )
          manifestEntries.push(entry)
        }
        if (result.performanceTargetsPath) {
          analyticsLocations.push(result.performanceTargetsPath)
          const entry = await this.analyticsWriter.createManifestEntry(
            result.performanceTargetsPath,
            districtId,
            'performance-targets'
          )
          manifestEntries.push(entry)
        }
      } else if (!result.success && result.error) {
        // Requirement 1.5: Log error and continue processing
        errors.push({
          districtId,
          error: result.error,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Write analytics manifest if we have any successful computations
    // Use snapshotDate for analytics output directory (Requirement 8.1, 8.3)
    const successfulResults = results.filter(r => r.success && !r.skipped)
    if (successfulResults.length > 0 && manifestEntries.length > 0) {
      try {
        await this.analyticsWriter.writeAnalyticsManifest(
          snapshotDate,
          manifestEntries
        )
        const manifestPath = path.join(
          this.getAnalyticsDir(snapshotDate),
          'manifest.json'
        )
        analyticsLocations.push(manifestPath)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        this.logger.error('Failed to write analytics manifest', {
          snapshotDate,
          error: errorMessage,
        })
        errors.push({
          districtId: 'N/A',
          error: `Failed to write analytics manifest: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Write the worldwide rollup for this date (#1498, epic #1496). It reads
    // the SNAPSHOT files on disk rather than the per-district analytics above,
    // so it is independent of whether any single district's compute failed.
    const globalTotals = await this.writeGlobalTotals(snapshotDate, errors)

    // Fold the date into the club-race crossing store (#1556). Same input
    // surface as the rollup — the snapshot files scoped by the date's own
    // rankings — and the same independence from per-district compute.
    const clubRace = await this.writeClubRaceStore(snapshotDate, errors)

    // Project the folded store into the published race artifact (#1556).
    const globalClubRace = await this.writeGlobalClubRace(
      snapshotDate,
      clubRace,
      errors
    )

    // Region and world rollups (#1799): the same input surface as the
    // worldwide rollup, regions from the synced config/ history.
    const regionRollups = await this.writeRegionRollups(snapshotDate, errors)

    // Per-region club shards + world file (#1800): the same input surface
    // and refusal rule as the region rollups, the same region membership.
    const clubsByRegion = await this.writeClubsByRegion(snapshotDate, errors)

    // Per-district meeting-time counts (#1814): the same input surface,
    // refusal rule and region membership as the region rollups.
    const meetingTimes = await this.writeMeetingTimes(snapshotDate, errors)

    // A time-series write failure is recorded per district but must fail the
    // run (#1702): it is the only writer behind Trends.
    const timeSeriesFailed: string[] = []
    for (const result of results) {
      if (result.timeSeriesError === undefined) continue
      timeSeriesFailed.push(result.districtId)
      errors.push({
        districtId: result.districtId,
        error: `Failed to write time-series data point: ${result.timeSeriesError}`,
        timestamp: new Date().toISOString(),
      })
    }

    // A #1671 source-gap district was not measured on this date, so its
    // series gets no point here, never a 0 one (#2070). An earlier run's 0
    // point (or one just built from a stale 0-club district file) is removed
    // and the date is recorded as not measured. Same failure rule (#1702).
    const sourceGaps = await this.recordTimeSeriesSourceGaps(snapshotDate)
    for (const failure of sourceGaps.failed) {
      timeSeriesFailed.push(failure.districtId)
      errors.push({
        districtId: failure.districtId,
        error: `Failed to record time-series source gap: ${failure.error}`,
        timestamp: new Date().toISOString(),
      })
    }

    // The region and world membership series for this program year
    // (#2127), summed from the district series just written.
    const regionSeries = await this.writeRegionMembershipSeries(
      snapshotDate,
      errors
    )

    // Store write counters for the step summary (#1708)
    const computed = results.filter(r => !r.skipped)
    const timeSeriesWritten = computed
      .filter(r => r.timeSeriesWritten === true)
      .filter(r => !sourceGaps.districts.includes(r.districtId))
      .map(r => r.districtId)
    const clubTrendsUpdated = computed
      .filter(r => r.clubTrendsUpdated === true)
      .map(r => r.districtId)
    const clubTrendsFailed = computed
      .filter(r => r.clubTrendsUpdated !== true)
      .map(r => r.districtId)

    // Calculate result statistics
    const districtsProcessed = districtsToCompute
    const districtsSucceeded = results
      .filter(r => r.success && !r.skipped)
      .map(r => r.districtId)
    const districtsFailed = results
      .filter(r => !r.success)
      .map(r => r.districtId)
    const districtsSkipped = results
      .filter(r => r.success && r.skipped)
      .map(r => r.districtId)

    const success = districtsFailed.length === 0 && errors.length === 0

    if (verbose) {
      this.logger.info('Compute-analytics operation completed', {
        requestedDate: date,
        snapshotDate,
        success,
        processed: districtsProcessed.length,
        succeeded: districtsSucceeded.length,
        failed: districtsFailed.length,
        skipped: districtsSkipped.length,
        isClosingPeriod: closingPeriodInfo.isClosingPeriod,
      })
    }

    // Return snapshotDate as the date in the result (Requirement 8.2)
    // Include requestedDate and closing period info so consumers know if an adjustment was made
    return {
      success,
      date: snapshotDate,
      requestedDate: date,
      isClosingPeriod: closingPeriodInfo.isClosingPeriod,
      dataMonth: closingPeriodInfo.isClosingPeriod
        ? closingPeriodInfo.dataMonth
        : undefined,
      districtsProcessed,
      districtsSucceeded,
      districtsFailed,
      districtsSkipped,
      analyticsLocations,
      globalTotalsPath: globalTotals.path,
      globalTotalsFailed: globalTotals.failed,
      clubRaceStorePath: clubRace.path,
      clubRaceStoreFailed: clubRace.failed,
      globalClubRacePath: globalClubRace.path,
      globalClubRaceFailed: globalClubRace.failed,
      regionRollupsPath: regionRollups.path,
      regionRollupsFailed: regionRollups.failed,
      clubsByRegionPaths: clubsByRegion.paths,
      clubsByRegionFailed: clubsByRegion.failed,
      meetingTimesPath: meetingTimes.path,
      meetingTimesFailed: meetingTimes.failed,
      regionSeriesPath: regionSeries.path,
      regionSeriesFailed: regionSeries.failed,
      timeSeriesFailed,
      timeSeriesWritten,
      clubTrendsUpdated,
      clubTrendsFailed,
      errors,
      duration_ms: Date.now() - startTime,
    }
  }

  /**
   * Write `snapshots/{date}/global-totals.json` — the worldwide rollup for
   * one snapshot date (#1498, epic #1496, ruled on #1426).
   *
   * This step is where it belongs because it is the only point in the
   * pipeline that already holds the whole date on disk: every district file
   * plus that date's own `all-districts-rankings.json`. The upload step then
   * copies `snapshots/${DATE}/*.json` wholesale, so no upload wiring is
   * needed, and the #1125 schema gate validates the file before it goes.
   *
   * Three failure modes, deliberately different:
   *
   * - **No rankings file** → skip, quietly. Without it there is no
   *   authoritative district set for the date, and `rollUpGlobal` refuses an
   *   unscoped rollup rather than emitting a plausible wrong number (#1466).
   *   That is a legitimate state for historical dates, not an error.
   * - **A listed district with no file** → refused, recorded in `errors`
   *   (#1756). Summing what is on disk would publish a subset as the world.
   * - **Anything else** → recorded in `errors`, which fails the run. A rollup
   *   that throws on a directory that HAS a district set means the directory
   *   is broken, and a broken worldwide number must not be published quietly.
   *
   * The two are reported SEPARATELY — `path: undefined, failed: false` for a
   * skip, `failed: true` for a throw or a refusal — because "no rollup" and
   * "broken rollup" must not collapse into one indistinguishable state at
   * the exit code.
   *
   * @returns the path written (undefined if none) and whether it failed.
   */
  private async writeGlobalTotals(
    snapshotDate: string,
    errors: Array<{ districtId: string; error: string; timestamp: string }>
  ): Promise<{ path?: string; failed: boolean }> {
    const snapshotDir = this.getSnapshotDir(snapshotDate)
    const rankingsPath = path.join(snapshotDir, 'all-districts-rankings.json')

    try {
      await fs.access(rankingsPath)
    } catch {
      this.logger.warn(
        'No all-districts-rankings.json for this date — skipping the worldwide rollup',
        { snapshotDate }
      )
      return { failed: false }
    }

    try {
      const rankings = readSnapshotRankings(snapshotDir)
      const input = readSnapshotRollupInput(snapshotDir, snapshotDate)
      const totals = buildGlobalTotals({
        snapshotDate,
        districts: input.districts,
        rankings,
        uncountedReasons: await recordedFailureReasons(snapshotDir),
      })

      // A listed district with no file would be summed as nothing: one
      // district's clubs published as the world's (#1756). Refuse, like the
      // sibling runner scripts/build-global-totals.ts.
      // A district metadata records as failed or a gap is accounted for
      // (#2035); it is left out of the club sums and stated in
      // uncountedDistricts with its recorded reason and size (#2042).
      const missing = unrecordedDistricts(
        totals.districts.missingDistricts,
        await recordedFailedDistricts(snapshotDir)
      )
      if (missing.length > 0) {
        const message = dateLevelRefusal(
          GLOBAL_TOTALS_FILE_NAME,
          snapshotDate,
          rankings.length,
          missing
        )
        this.logger.error(message, { snapshotDate, missing })
        errors.push({
          districtId: 'N/A',
          error: message,
          timestamp: new Date().toISOString(),
        })
        return { failed: true }
      }

      const outputPath = path.join(snapshotDir, GLOBAL_TOTALS_FILE_NAME)
      await fs.writeFile(
        outputPath,
        JSON.stringify(totals, null, 2) + '\n',
        'utf-8'
      )

      this.logger.info('Wrote worldwide rollup', {
        snapshotDate,
        path: outputPath,
        districts: totals.districts.total,
        clubs: totals.membership.clubsCounted,
        // Contamination stays visible in the log as well as in the file.
        excludedDistricts: totals.districts.excludedDistricts.length,
        duplicateClubs: totals.districts.duplicateClubs.length,
      })
      return { path: outputPath, failed: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write worldwide rollup', {
        snapshotDate,
        error: message,
      })
      errors.push({
        districtId: 'N/A',
        error: `Failed to write ${GLOBAL_TOTALS_FILE_NAME}: ${message}`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
  }

  /**
   * Fold this date into `club-race/{PY}/first-reached.json` — the crossing
   * store behind the worldwide race to Distinguished (#1556, R9).
   *
   * Why here: the prune policy keeps two snapshots a month, so the day a
   * club first met a tier's requirements survives only if it is captured at
   * collection time. The compute step already holds every district file for
   * the date; the pipeline syncs `club-race/` from GCS before it and pushes
   * the store back after, exactly like `club-trends/`.
   *
   * Scope is the date's own `all-districts-rankings.json` district set
   * (#1465) — a stray district file in the directory is not read. A listed
   * district whose file is missing refuses the fold (#1756): a subset would
   * mark the date observed over a fraction of the world's clubs. No rankings
   * file → skipped quietly, like the rollup.
   *
   * The program year is resolved ONCE here from the (closing-period
   * remapped) snapshot date and threaded into the store; the store refuses a
   * date that does not belong to it.
   *
   * Failure is loud — logged, in `errors`, flagged on the result — but NOT
   * publish-blocking (see `clubRaceStoreFailed`): the store publishes
   * nothing, and blocking the upload would lose the whole day, not one
   * crossing date.
   */
  private async writeClubRaceStore(
    snapshotDate: string,
    errors: Array<{ districtId: string; error: string; timestamp: string }>
  ): Promise<ClubRaceFoldResult> {
    const snapshotDir = this.getSnapshotDir(snapshotDate)
    const rankingsPath = path.join(snapshotDir, 'all-districts-rankings.json')

    try {
      await fs.access(rankingsPath)
    } catch {
      this.logger.warn(
        'No all-districts-rankings.json for this date — skipping the club-race store',
        { snapshotDate }
      )
      return { failed: false }
    }

    try {
      const rankings = readSnapshotRankings(snapshotDir)
      const inScope = new Set(
        rankings.map(row => canonicalDistrictId(row.districtId))
      )
      const districts: ClubRaceDistrictObservation[] = []
      for (const fileName of (await fs.readdir(snapshotDir)).sort()) {
        if (!isDistrictSnapshotFile(fileName)) continue
        const districtId = districtIdFromSnapshotFileName(fileName)
        if (!districtId || !inScope.has(canonicalDistrictId(districtId))) {
          continue
        }
        const parsed = JSON.parse(
          await fs.readFile(path.join(snapshotDir, fileName), 'utf-8')
        ) as { data?: { clubs?: ClubStatistics[] } }
        districts.push({ districtId, clubs: parsed.data?.clubs ?? [] })
      }

      // Folding a subset would mark the date observed and project a race
      // scanned over one district's clubs (#1756): refuse the fold instead.
      const seen = new Set(
        districts.map(d => canonicalDistrictId(d.districtId))
      )
      // ...unless metadata records the district as failed or a gap (#2035).
      const missing = unrecordedDistricts(
        rankings
          .map(row => row.districtId)
          .filter(id => !seen.has(canonicalDistrictId(id))),
        await recordedFailedDistricts(snapshotDir)
      )
      if (missing.length > 0) {
        const message = dateLevelRefusal(
          'club-race/first-reached.json',
          snapshotDate,
          rankings.length,
          missing
        )
        this.logger.error(message, { snapshotDate, missing })
        errors.push({
          districtId: 'N/A',
          error: message,
          timestamp: new Date().toISOString(),
        })
        return { failed: true }
      }

      const programYear = programYearForSnapshotDate(snapshotDate)
      const { store, summary } = await updateClubRaceStore(
        this.cacheDir,
        snapshotDate,
        programYear,
        districts
      )
      const storePath = ClubRaceStore.getPath(this.cacheDir, programYear)

      this.logger.info('Updated club-race crossing store', {
        snapshotDate,
        programYear,
        path: storePath,
        districts: districts.length,
        clubsObserved: summary.clubsObserved,
        newCrossings: summary.newCrossings,
        observedDates: store.observedDates.length,
      })
      return {
        path: storePath,
        failed: false,
        folded: { store, rankings, districts },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to update club-race crossing store', {
        snapshotDate,
        error: message,
      })
      errors.push({
        districtId: 'N/A',
        error: `Failed to update club-race/first-reached.json: ${message}`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
  }

  /**
   * Write `snapshots/{date}/global-club-race.json` — the published
   * projection of the crossing store for this date (#1556, phase 2).
   *
   * Built from exactly what the fold just read (same rankings scope, same
   * district files, the store as folded), so the artifact and the store can
   * never disagree about a crossing. Writing it beside the district
   * snapshots is the whole publish wiring: the upload step copies
   * `snapshots/${DATE}/*.json` wholesale, gzipped, with the CDN TTL.
   *
   * A skipped fold (no rankings) is a skipped artifact; a FAILED fold is a
   * failed artifact — recorded, because projecting a store that did not
   * take today's date would publish a race that is silently one day stale.
   * Neither blocks the day's publish (see `globalClubRaceFailed`).
   */
  private async writeGlobalClubRace(
    snapshotDate: string,
    fold: ClubRaceFoldResult,
    errors: Array<{ districtId: string; error: string; timestamp: string }>
  ): Promise<{ path?: string; failed: boolean }> {
    if (fold.failed) {
      errors.push({
        districtId: 'N/A',
        error: `Failed to write ${GLOBAL_CLUB_RACE_FILE_NAME}: the club-race store did not fold this date`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
    if (!fold.folded) return { failed: false }

    try {
      const race = buildGlobalClubRace({
        snapshotDate,
        rankings: fold.folded.rankings,
        districts: fold.folded.districts,
        store: fold.folded.store.toJSON(),
      })
      const outputPath = path.join(
        this.getSnapshotDir(snapshotDate),
        GLOBAL_CLUB_RACE_FILE_NAME
      )
      await fs.writeFile(
        outputPath,
        JSON.stringify(race, null, 2) + '\n',
        'utf-8'
      )
      this.logger.info('Wrote worldwide club race', {
        snapshotDate,
        path: outputPath,
        reached: race.reached.length,
        clubsScanned: race.scope.clubsScanned,
        resolution: race.observation.resolution,
      })
      return { path: outputPath, failed: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write worldwide club race', {
        snapshotDate,
        error: message,
      })
      errors.push({
        districtId: 'N/A',
        error: `Failed to write ${GLOBAL_CLUB_RACE_FILE_NAME}: ${message}`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
  }

  /**
   * Write `snapshots/{date}/region-rollups.json` — region and world rollups
   * of the district figures for this date (#1799, epic #1781).
   *
   * Placed with `global-totals.json` for the same reason: this step holds
   * every district file and the date's own rankings on disk, and the
   * per-date upload copies `snapshots/${DATE}/*.json` wholesale, so the
   * artifact is in the run manifest and promoted with its date.
   *
   * Region membership is `<cache>/config/district-region-history.json`
   * (#1820), pulled from staging before compute by
   * `sync-stores.sh district-region-history`. Absent or invalid, the
   * artifact is still written — world and district rows, `regions: null`
   * and the reason — because a missing region list is visible, not a
   * plausible wrong number.
   *
   * - No rankings file → skipped quietly, like the worldwide rollup.
   * - A listed district with no file → refused and recorded (ADR-015 P3):
   *   summing a subset would publish part of a region as all of it.
   * - Never publish-blocking (`regionRollupsFailed` does not move the exit
   *   code): a missing artifact reads "not available for this date".
   */
  private async writeRegionRollups(
    snapshotDate: string,
    errors: Array<{ districtId: string; error: string; timestamp: string }>
  ): Promise<{ path?: string; failed: boolean }> {
    const snapshotDir = this.getSnapshotDir(snapshotDate)
    try {
      await fs.access(path.join(snapshotDir, 'all-districts-rankings.json'))
    } catch {
      this.logger.warn(
        'No all-districts-rankings.json for this date — skipping the region rollups',
        { snapshotDate }
      )
      return { failed: false }
    }

    try {
      const { regionHistory, note } = await this.readRegionHistory()
      const { rankings, districts } = readRegionRollupInput(snapshotDir)
      const { rollups, missingDistricts: withoutFile } = buildRegionRollups({
        snapshotDate,
        rankings,
        districts,
        regionHistory,
        ...(note !== undefined && { regionHistoryNote: note }),
      })
      // A district metadata records as failed or a gap is accounted for
      // (#2035); any other ranked district without a file is a shortfall.
      const missingDistricts = unrecordedDistricts(
        withoutFile,
        await recordedFailedDistricts(snapshotDir)
      )

      if (missingDistricts.length > 0) {
        const message = dateLevelRefusal(
          REGION_ROLLUPS_FILE_NAME,
          snapshotDate,
          rankings.length,
          missingDistricts
        )
        this.logger.error(message, { snapshotDate, missingDistricts })
        errors.push({
          districtId: 'N/A',
          error: message,
          timestamp: new Date().toISOString(),
        })
        return { failed: true }
      }

      if (rollups.regions === null) {
        this.logger.warn('Region rollups written without regions', {
          snapshotDate,
          reason: rollups.regionMembershipNote,
        })
      }
      const outputPath = path.join(snapshotDir, REGION_ROLLUPS_FILE_NAME)
      await fs.writeFile(
        outputPath,
        JSON.stringify(rollups, null, 2) + '\n',
        'utf-8'
      )
      this.logger.info('Wrote region rollups', {
        snapshotDate,
        path: outputPath,
        programYear: rollups.programYear,
        districts: rollups.world.districts,
        regions: rollups.regions ? Object.keys(rollups.regions).length : null,
        unassigned: rollups.scope.unassignedDistricts.length,
        excludedDistricts: rollups.scope.excludedDistricts.length,
      })
      return { path: outputPath, failed: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write region rollups', {
        snapshotDate,
        error: message,
      })
      errors.push({
        districtId: 'N/A',
        error: `Failed to write ${REGION_ROLLUPS_FILE_NAME}: ${message}`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
  }

  /**
   * Write `snapshots/{date}/clubs-by-region/` — one shard per region with
   * every club the region and world explorers draw or list, plus
   * `world.json` (#1800, epic #1781).
   *
   * - Same inputs as `region-rollups.json`: the date's rankings scope the
   *   district files on disk; regions come from the synced history for the
   *   logical date's program year.
   * - No rankings file → skipped quietly, like the rollups.
   * - A listed district with no file → every file refused and recorded
   *   (ADR-015 P3): a shard missing a district would show part of a region
   *   as all of it.
   * - The directory is rewritten whole, so a region the history no longer
   *   has leaves no stale shard behind locally (staging keeps an old object
   *   until the date is pruned; `world.json` lists the current shards).
   * - Compact JSON: the points file feeds a ~15k-pin map.
   * - Never publish-blocking (`clubsByRegionFailed` does not move the exit
   *   code).
   */
  private async writeClubsByRegion(
    snapshotDate: string,
    errors: Array<{ districtId: string; error: string; timestamp: string }>
  ): Promise<{ paths?: string[]; failed: boolean }> {
    const snapshotDir = this.getSnapshotDir(snapshotDate)
    try {
      await fs.access(path.join(snapshotDir, 'all-districts-rankings.json'))
    } catch {
      this.logger.warn(
        'No all-districts-rankings.json for this date — skipping the club shards',
        { snapshotDate }
      )
      return { failed: false }
    }

    try {
      const { regionHistory, note } = await this.readRegionHistory()
      const { rankings, districts } = readClubsByRegionInput(snapshotDir)
      const {
        world,
        worldPoints,
        shards,
        missingDistricts: withoutFile,
      } = buildClubsByRegion({
        snapshotDate,
        rankings,
        districts,
        regionHistory,
        ...(note !== undefined && { regionHistoryNote: note }),
      })
      const missingDistricts = unrecordedDistricts(
        withoutFile,
        await recordedFailedDistricts(snapshotDir)
      )
      if (missingDistricts.length > 0) {
        const message = dateLevelRefusal(
          `${CLUBS_BY_REGION_DIR}/`,
          snapshotDate,
          rankings.length,
          missingDistricts
        )
        this.logger.error(message, { snapshotDate, missingDistricts })
        errors.push({
          districtId: 'N/A',
          error: message,
          timestamp: new Date().toISOString(),
        })
        return { failed: true }
      }

      const outDir = path.join(snapshotDir, CLUBS_BY_REGION_DIR)
      await fs.rm(outDir, { recursive: true, force: true })
      await fs.mkdir(outDir, { recursive: true })
      const paths: string[] = []
      for (const shard of shards) {
        const shardPath = path.join(
          outDir,
          clubsByRegionShardFileName(shard.region)
        )
        await fs.writeFile(shardPath, JSON.stringify(shard) + '\n', 'utf-8')
        paths.push(shardPath)
      }
      const worldPath = path.join(outDir, CLUBS_BY_REGION_WORLD_FILE_NAME)
      await fs.writeFile(worldPath, JSON.stringify(world) + '\n', 'utf-8')
      paths.push(worldPath)
      const pointsPath = path.join(
        outDir,
        CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME
      )
      await fs.writeFile(
        pointsPath,
        JSON.stringify(worldPoints) + '\n',
        'utf-8'
      )
      paths.push(pointsPath)

      if (world.shards === null) {
        this.logger.warn('Club shards not written: no region membership', {
          snapshotDate,
          reason: world.regionMembershipNote,
        })
      }
      this.logger.info('Wrote club shards', {
        snapshotDate,
        dir: outDir,
        programYear: world.programYear,
        shards: shards.length,
        clubs: world.totals.clubs,
        unmapped: world.totals.unmapped,
      })
      return { paths, failed: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write club shards', {
        snapshotDate,
        error: message,
      })
      errors.push({
        districtId: 'N/A',
        error: `Failed to write ${CLUBS_BY_REGION_DIR}/: ${message}`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
  }

  /**
   * Write `snapshots/{date}/meeting-times.json` — per-district weekday ×
   * start-hour counts of the clubs' parsed meeting schedules, for the region
   * and world meeting-time heatmaps (#1814, epic #1781).
   *
   * - Same inputs as `region-rollups.json`: the date's rankings scope the
   *   district files on disk; regions come from the synced history for the
   *   logical date's program year.
   * - No rankings file → skipped quietly, like the rollups.
   * - A listed district with no file → refused and recorded (ADR-015 P3): a
   *   region grid missing a district would show part of a region as all of
   *   it. A previous run's file for the date is removed, never left stale.
   * - Compact JSON (counts only; ~190 KB raw at ~130 districts).
   * - Never publish-blocking (`meetingTimesFailed` does not move the exit
   *   code): a missing file reads "not available yet" on the pages.
   */
  private async writeMeetingTimes(
    snapshotDate: string,
    errors: Array<{ districtId: string; error: string; timestamp: string }>
  ): Promise<{ path?: string; failed: boolean }> {
    const snapshotDir = this.getSnapshotDir(snapshotDate)
    const outputPath = path.join(snapshotDir, MEETING_TIMES_FILE_NAME)
    try {
      await fs.access(path.join(snapshotDir, 'all-districts-rankings.json'))
    } catch {
      this.logger.warn(
        'No all-districts-rankings.json for this date — skipping the meeting times',
        { snapshotDate }
      )
      return { failed: false }
    }

    try {
      const { regionHistory, note } = await this.readRegionHistory()
      const { rankings, districts } = readMeetingTimesInput(snapshotDir)
      const { meetingTimes, missingDistricts: withoutFile } = buildMeetingTimes(
        {
          snapshotDate,
          rankings,
          districts,
          regionHistory,
          ...(note !== undefined && { regionHistoryNote: note }),
        }
      )
      const missingDistricts = unrecordedDistricts(
        withoutFile,
        await recordedFailedDistricts(snapshotDir)
      )
      if (missingDistricts.length > 0) {
        const message = dateLevelRefusal(
          MEETING_TIMES_FILE_NAME,
          snapshotDate,
          rankings.length,
          missingDistricts
        )
        this.logger.error(message, { snapshotDate, missingDistricts })
        errors.push({
          districtId: 'N/A',
          error: message,
          timestamp: new Date().toISOString(),
        })
        await fs.rm(outputPath, { force: true })
        return { failed: true }
      }

      if (meetingTimes.regionMembership === null) {
        this.logger.warn('Meeting times written without regions', {
          snapshotDate,
          reason: meetingTimes.regionMembershipNote,
        })
      }
      await fs.writeFile(
        outputPath,
        JSON.stringify(meetingTimes) + '\n',
        'utf-8'
      )
      this.logger.info('Wrote meeting times', {
        snapshotDate,
        path: outputPath,
        programYear: meetingTimes.programYear,
        districts: meetingTimes.totals.districts,
        clubs: meetingTimes.totals.clubs,
        scheduled: meetingTimes.totals.scheduled,
      })
      return { path: outputPath, failed: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write meeting times', {
        snapshotDate,
        error: message,
      })
      errors.push({
        districtId: 'N/A',
        error: `Failed to write ${MEETING_TIMES_FILE_NAME}: ${message}`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
  }

  /**
   * The synced district → region history (#1820), or null with the reason.
   * An unreadable file is reported, never trusted: regions are then null.
   */
  private async readRegionHistory(): Promise<{
    regionHistory: DistrictRegionHistory | null
    note?: string
  }> {
    const historyPath = path.join(this.cacheDir, REGION_ROLLUPS_REGION_SOURCE)
    let raw: string
    try {
      raw = await fs.readFile(historyPath, 'utf-8')
    } catch {
      return { regionHistory: null }
    }
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      return {
        regionHistory: null,
        note: `${REGION_ROLLUPS_REGION_SOURCE} is not a valid history (not JSON); region membership is unknown`,
      }
    }
    const parsed = DistrictRegionHistorySchema.safeParse(value)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      const where = first?.path.join('.') || '(root)'
      return {
        regionHistory: null,
        note: `${REGION_ROLLUPS_REGION_SOURCE} is not a valid history (${where}: ${first?.message ?? 'schema'}); region membership is unknown`,
      }
    }
    return { regionHistory: parsed.data }
  }

  /**
   * Write `time-series/regions/{PY}.json` — the region and world membership
   * series for this date's program year (#2127), behind the /regions
   * sparklines.
   *
   * Derived whole from every `time-series/district_{id}/{PY}.json` on disk,
   * read AFTER this date's points and source gaps are written, so it always
   * matches the district series it sums and needs no store of its own (the
   * pipeline syncs the whole time-series store before compute). It sits
   * inside that store, so publish-stores.sh uploads it when its bytes
   * change, records it in the run manifest, and promotion copies it with
   * `time-series/`. Regions come from the same synced history as the
   * region rollups; the program year from the snapshot's logical date.
   *
   * - No district series for the year → skipped quietly (no file).
   * - Anything else that throws → recorded in `errors`; the store keeps its
   *   previous copy.
   */
  private async writeRegionMembershipSeries(
    snapshotDate: string,
    errors: Array<{ districtId: string; error: string; timestamp: string }>
  ): Promise<{ path?: string; failed: boolean }> {
    const programYear = programYearForSnapshotDate(snapshotDate)
    const timeSeriesDir = path.join(this.cacheDir, 'time-series')
    try {
      let entries: string[]
      try {
        entries = await fs.readdir(timeSeriesDir)
      } catch {
        return { failed: false }
      }
      const districts: RegionSeriesDistrictInput[] = []
      for (const entry of entries.sort()) {
        const match = /^district_([A-Za-z0-9]+)$/.exec(entry)
        if (!match) continue
        const file = path.join(timeSeriesDir, entry, `${programYear}.json`)
        let text: string
        try {
          text = await readStoreFileText(file)
        } catch (error) {
          // No series for this year; anything else is a broken store.
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw error
        }
        const parsed = JSON.parse(text) as {
          dataPoints?: Array<{ date: string; membership: number }>
          sourceGapDates?: string[]
        }
        districts.push({
          districtId: match[1]!,
          dataPoints: (parsed.dataPoints ?? []).map(p => ({
            date: p.date,
            membership: p.membership,
          })),
          ...(parsed.sourceGapDates && {
            sourceGapDates: parsed.sourceGapDates,
          }),
        })
      }
      if (districts.length === 0) return { failed: false }

      const { regionHistory, note } = await this.readRegionHistory()
      const series = RegionMembershipSeriesSchema.parse(
        buildRegionMembershipSeries({
          programYear,
          districts,
          regionHistory,
          ...(note !== undefined && { regionHistoryNote: note }),
        })
      )
      const outputPath = path.join(
        this.cacheDir,
        regionMembershipSeriesPath(programYear)
      )
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      // Compact: the CDN serves it on every /regions view (#2127).
      await fs.writeFile(outputPath, JSON.stringify(series) + '\n', 'utf-8')
      this.logger.info('Wrote region membership series', {
        snapshotDate,
        programYear,
        path: outputPath,
        dates: series.dates.length,
        regions: series.regions ? Object.keys(series.regions).length : null,
        uncounted: series.uncountedDistricts.length,
        unassigned: series.unassignedDistricts.length,
      })
      return { path: outputPath, failed: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Failed to write region membership series', {
        snapshotDate,
        programYear,
        error: message,
      })
      errors.push({
        districtId: 'N/A',
        error: `Failed to write ${regionMembershipSeriesPath(programYear)}: ${message}`,
        timestamp: new Date().toISOString(),
      })
      return { failed: true }
    }
  }

  // ========== Dense Club Trends Enrichment (#79b) ==========

  /**
   * List all snapshot dates within the program year that contain
   * a snapshot for the given district.
   *
   * The Toastmasters program year runs July 1 to June 30.
   *
   * @param currentDate - The current date (YYYY-MM-DD)
   * @param districtId - The district to check snapshots for
   * @returns Array of YYYY-MM-DD date strings sorted ascending
   */
  async listProgramYearSnapshotDates(
    currentDate: string,
    districtId: string
  ): Promise<string[]> {
    validateDistrictId(districtId) // #1111: guards the path.join below
    // Calculate program year boundaries
    const d = new Date(currentDate + 'T00:00:00Z')
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() // 0-indexed

    // Program year starts July 1. If month >= 6 (July), start = July 1 of this year.
    // Otherwise start = July 1 of previous year.
    const programYearStart = month >= 6 ? `${year}-07-01` : `${year - 1}-07-01`

    const snapshotsDir = path.join(this.cacheDir, 'snapshots')

    let dateEntries: string[]
    try {
      const entries = await fs.readdir(snapshotsDir)
      dateEntries = entries.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e))
    } catch {
      this.logger.debug('No snapshots directory found for dense trends', {
        snapshotsDir,
      })
      return []
    }

    // Filter to program year dates that have a snapshot for this district
    const results: string[] = []
    for (const dateEntry of dateEntries) {
      if (dateEntry < programYearStart || dateEntry > currentDate) continue

      const districtFile = path.join(
        snapshotsDir,
        dateEntry,
        `district_${districtId}.json`
      )
      try {
        await fs.access(districtFile)
        results.push(dateEntry)
      } catch {
        // Snapshot doesn't exist for this district on this date
      }
    }

    return results.sort()
  }
}
