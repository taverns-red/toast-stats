/**
 * AnalyticsWriter - Writes pre-computed analytics to the file system.
 *
 * This service writes computed analytics to the `analytics/` subdirectory
 * within each snapshot directory. Each file includes metadata with schema
 * version, computation timestamp, and checksum for validation.
 *
 * Requirements:
 * - 1.6: WHEN analytics are computed, THE Collector_CLI SHALL store them in an
 *        `analytics/` subdirectory within the snapshot directory
 * - 3.1: THE Collector_CLI SHALL store pre-computed analytics in the structure:
 *        `CACHE_DIR/snapshots/{date}/analytics/`
 * - 3.2: WHEN writing analytics files, THE Collector_CLI SHALL include a schema
 *        version and computation timestamp in each file
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import {
  ANALYTICS_SCHEMA_VERSION,
  type Logger,
  type DistrictAnalytics,
  type MembershipTrendData,
  type ClubHealthData,
  type MembershipAnalyticsData,
  type VulnerableClubsData,
  type LeadershipInsightsData,
  type DistinguishedClubAnalyticsData,
  type YearOverYearData,
  type PerformanceTargetsData,
  type ClubTrendsIndex,
  type PreComputedAnalyticsFile,
  type AnalyticsMetadata,
  type AnalyticsManifest,
  type AnalyticsManifestEntry,
} from '@taverns-red/analytics-core'

/**
 * Configuration for AnalyticsWriter
 */
export interface AnalyticsWriterConfig {
  /** Base cache directory */
  cacheDir: string
  /** Optional logger for diagnostic output */
  logger?: Logger
}

/**
 * Result of writing an analytics file
 */
export interface WriteResult {
  /** Path to the written file */
  filePath: string
  /** Size of the file in bytes */
  size: number
  /** SHA256 checksum of the data */
  checksum: string
}

/**
 * Options for writing analytics files
 */
export interface WriteAnalyticsOptions {
  /** SHA256 checksum of the source snapshot file (Requirement 5.4) */
  sourceSnapshotChecksum?: string
}

/**
 * Interface for analytics file writing operations.
 */
export interface IAnalyticsWriter {
  /**
   * Writes district analytics to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param analytics - The district analytics data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   */
  writeDistrictAnalytics(
    snapshotDate: string,
    districtId: string,
    analytics: DistrictAnalytics,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes membership trends to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param trends - The membership trend data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   */
  writeMembershipTrends(
    snapshotDate: string,
    districtId: string,
    trends: MembershipTrendData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes club health data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param health - The club health data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   */
  writeClubHealth(
    snapshotDate: string,
    districtId: string,
    health: ClubHealthData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes membership analytics data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The membership analytics data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   *
   * Requirements:
   * - 1.1: Generate membership-analytics.json file for each district
   * - 1.3: Follow PreComputedAnalyticsFile structure with metadata
   */
  writeMembershipAnalytics(
    snapshotDate: string,
    districtId: string,
    data: MembershipAnalyticsData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes vulnerable clubs data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The vulnerable clubs data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   *
   * Requirements:
   * - 3.1: Generate vulnerable-clubs.json file for each district
   * - 3.2: Include clubs categorized as vulnerable and intervention-required
   * - 3.3: Include risk factors and health scores for each club
   */
  writeVulnerableClubs(
    snapshotDate: string,
    districtId: string,
    data: VulnerableClubsData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes leadership insights data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The leadership insights data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   *
   * Requirements:
   * - 4.1: Generate leadership-insights.json file for each district
   * - 4.2: Include leadership effectiveness metrics and officer performance data
   */
  writeLeadershipInsights(
    snapshotDate: string,
    districtId: string,
    data: LeadershipInsightsData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes distinguished club analytics data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The distinguished club analytics data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   *
   * Requirements:
   * - 5.1: Generate distinguished-club-analytics.json file for each district
   * - 5.2: Include progress tracking, projections, and detailed club data
   */
  writeDistinguishedClubAnalytics(
    snapshotDate: string,
    districtId: string,
    data: DistinguishedClubAnalyticsData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes year-over-year comparison data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The year-over-year comparison data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   *
   * Requirements:
   * - 6.1: Generate year-over-year.json file for each district
   * - 6.2: Include comparison metrics between current and previous program year
   * - 6.3: Include membership, distinguished clubs, and club health comparisons
   */
  writeYearOverYear(
    snapshotDate: string,
    districtId: string,
    data: YearOverYearData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes performance targets data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The performance targets data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   *
   * Requirements:
   * - 7.1: Generate performance-targets.json file for each district
   * - 7.2: Include DAP, DDP, and other recognition level targets
   */
  writePerformanceTargets(
    snapshotDate: string,
    districtId: string,
    data: PerformanceTargetsData,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes club trends index data to a file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The club trends index data
   * @param options - Optional write options including source snapshot checksum
   * @returns Promise resolving to the file path
   *
   * Requirements:
   * - 2.1: Generate club trend data for each club in each district
   * - 2.2: Store in a format that allows efficient retrieval by club ID
   */
  writeClubTrendsIndex(
    snapshotDate: string,
    districtId: string,
    data: ClubTrendsIndex,
    options?: WriteAnalyticsOptions
  ): Promise<string>

  /**
   * Writes the analytics manifest file.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param files - Array of manifest entries for all analytics files
   * @returns Promise resolving when manifest is written
   */
  writeAnalyticsManifest(
    snapshotDate: string,
    files: AnalyticsManifestEntry[]
  ): Promise<void>

  /**
   * Gets the analytics directory path for a snapshot date.
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @returns The path to the analytics directory
   */
  getAnalyticsDir(snapshotDate: string): string
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
 * AnalyticsWriter writes pre-computed analytics to the file system.
 *
 * The service writes analytics files to:
 *   CACHE_DIR/snapshots/{date}/analytics/
 *     ├── manifest.json
 *     ├── district_{id}_analytics.json
 *     ├── district_{id}_membership.json
 *     └── district_{id}_clubhealth.json
 *
 * Each file follows the PreComputedAnalyticsFile structure with metadata
 * including schemaVersion, computedAt, snapshotDate, districtId, and checksum.
 */
export class AnalyticsWriter implements IAnalyticsWriter {
  private readonly cacheDir: string
  private readonly logger: Logger

  constructor(config: AnalyticsWriterConfig) {
    this.cacheDir = config.cacheDir
    this.logger = config.logger ?? noopLogger
  }

  /**
   * Get the snapshot directory path for a date
   */
  private getSnapshotDir(snapshotDate: string): string {
    return path.join(this.cacheDir, 'snapshots', snapshotDate)
  }

  /**
   * Get the analytics directory path for a date
   */
  getAnalyticsDir(snapshotDate: string): string {
    return path.join(this.getSnapshotDir(snapshotDate), 'analytics')
  }

  /**
   * Calculate SHA256 checksum of content
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * Create metadata for an analytics file
   *
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param dataChecksum - SHA256 checksum of the data field
   * @param sourceSnapshotChecksum - Optional SHA256 checksum of the source snapshot file (Requirement 5.4)
   */
  private createMetadata(
    snapshotDate: string,
    districtId: string,
    dataChecksum: string,
    sourceSnapshotChecksum?: string
  ): AnalyticsMetadata {
    const metadata: AnalyticsMetadata = {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      computedAt: new Date().toISOString(),
      snapshotDate,
      districtId,
      checksum: dataChecksum,
    }

    // Requirement 5.4: Store the source snapshot checksum in the analytics metadata
    if (sourceSnapshotChecksum) {
      metadata.sourceSnapshotChecksum = sourceSnapshotChecksum
    }

    return metadata
  }

  /**
   * Write a pre-computed analytics file atomically
   *
   * Uses a temporary file and rename for atomic writes to prevent
   * partial file corruption if the process is interrupted.
   *
   * @param filePath - Path to write the file
   * @param snapshotDate - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param data - The analytics data to write
   * @param sourceSnapshotChecksum - Optional SHA256 checksum of the source snapshot file (Requirement 5.4)
   */
  private async writeAnalyticsFile<T>(
    filePath: string,
    snapshotDate: string,
    districtId: string,
    data: T,
    sourceSnapshotChecksum?: string
  ): Promise<WriteResult> {
    // Ensure the analytics directory exists
    const analyticsDir = path.dirname(filePath)
    await fs.mkdir(analyticsDir, { recursive: true })

    // Calculate checksum of the data
    const dataJson = JSON.stringify(data)
    const checksum = this.calculateChecksum(dataJson)

    // Create the file structure with metadata
    const metadata = this.createMetadata(
      snapshotDate,
      districtId,
      checksum,
      sourceSnapshotChecksum
    )
    const fileContent: PreComputedAnalyticsFile<T> = {
      metadata,
      data,
    }

    // Serialize to JSON with pretty printing
    const content = JSON.stringify(fileContent, null, 2)
    const size = Buffer.byteLength(content, 'utf-8')

    // Write atomically using temp file and rename
    const tempPath = `${filePath}.tmp.${Date.now()}`
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, filePath)

    this.logger.debug('Analytics file written', {
      filePath,
      size,
      checksum,
      sourceSnapshotChecksum,
    })

    return {
      filePath,
      size,
      checksum,
    }
  }

  /**
   * Writes district analytics to a file.
   *
   * Requirements:
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeDistrictAnalytics(
    snapshotDate: string,
    districtId: string,
    analytics: DistrictAnalytics,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_analytics.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing district analytics', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      analytics,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('District analytics written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes membership trends to a file.
   *
   * Requirements:
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeMembershipTrends(
    snapshotDate: string,
    districtId: string,
    trends: MembershipTrendData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_membership.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing membership trends', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      trends,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Membership trends written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes club health data to a file.
   *
   * Requirements:
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeClubHealth(
    snapshotDate: string,
    districtId: string,
    health: ClubHealthData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_clubhealth.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing club health data', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      health,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Club health data written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes membership analytics data to a file.
   *
   * This file contains comprehensive membership analytics including
   * trends, year-over-year comparisons, growth rates, and retention rates.
   *
   * Requirements:
   * - 1.1: Generate membership-analytics.json file for each district
   * - 1.3: Follow PreComputedAnalyticsFile structure with metadata
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeMembershipAnalytics(
    snapshotDate: string,
    districtId: string,
    data: MembershipAnalyticsData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_membership-analytics.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing membership analytics', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      data,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Membership analytics written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes vulnerable clubs data to a file.
   *
   * This file contains clubs categorized as vulnerable and intervention-required,
   * including risk factors and health scores for each club.
   *
   * Requirements:
   * - 3.1: Generate vulnerable-clubs.json file for each district
   * - 3.2: Include clubs categorized as vulnerable and intervention-required
   * - 3.3: Include risk factors and health scores for each club
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeVulnerableClubs(
    snapshotDate: string,
    districtId: string,
    data: VulnerableClubsData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_vulnerable-clubs.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing vulnerable clubs data', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      data,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Vulnerable clubs data written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes leadership insights data to a file.
   *
   * This file contains leadership effectiveness metrics and officer performance data,
   * including top performing divisions and areas needing support.
   *
   * Requirements:
   * - 4.1: Generate leadership-insights.json file for each district
   * - 4.2: Include leadership effectiveness metrics and officer performance data
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeLeadershipInsights(
    snapshotDate: string,
    districtId: string,
    data: LeadershipInsightsData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_leadership-insights.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing leadership insights data', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      data,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Leadership insights data written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes distinguished club analytics data to a file.
   *
   * This file contains comprehensive distinguished club progress and projections,
   * including progress by recognition level with current, projected, and trend data.
   *
   * Requirements:
   * - 5.1: Generate distinguished-club-analytics.json file for each district
   * - 5.2: Include progress tracking, projections, and detailed club data
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeDistinguishedClubAnalytics(
    snapshotDate: string,
    districtId: string,
    data: DistinguishedClubAnalyticsData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_distinguished-analytics.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing distinguished club analytics data', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      data,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Distinguished club analytics data written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes year-over-year comparison data to a file.
   *
   * This file contains comparison metrics between current and previous program year,
   * including membership, distinguished clubs, and club health comparisons.
   *
   * Requirements:
   * - 6.1: Generate year-over-year.json file for each district
   * - 6.2: Include comparison metrics between current and previous program year
   * - 6.3: Include membership, distinguished clubs, and club health comparisons
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeYearOverYear(
    snapshotDate: string,
    districtId: string,
    data: YearOverYearData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_year-over-year.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing year-over-year data', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      data,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Year-over-year data written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes performance targets data to a file.
   *
   * This file contains recognition level targets (DAP, DDP, etc.) for districts,
   * including current progress and projected achievement status.
   *
   * Requirements:
   * - 7.1: Generate performance-targets.json file for each district
   * - 7.2: Include DAP, DDP, and other recognition level targets
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writePerformanceTargets(
    snapshotDate: string,
    districtId: string,
    data: PerformanceTargetsData,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_performance-targets.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing performance targets data', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      data,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Performance targets data written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes club trends index data to a file.
   *
   * This file contains a map of club IDs to ClubTrend data for efficient O(1) lookup.
   * Enables the backend to quickly retrieve individual club trend data without
   * loading the entire club health dataset.
   *
   * Requirements:
   * - 2.1: Generate club trend data for each club in each district
   * - 2.2: Store in a format that allows efficient retrieval by club ID
   * - 1.6: Store analytics in `analytics/` subdirectory
   * - 3.1: Store in `CACHE_DIR/snapshots/{date}/analytics/`
   * - 3.2: Include schema version and computation timestamp
   * - 5.4: Store the source snapshot checksum in the analytics metadata
   */
  async writeClubTrendsIndex(
    snapshotDate: string,
    districtId: string,
    data: ClubTrendsIndex,
    options?: WriteAnalyticsOptions
  ): Promise<string> {
    const filename = `district_${districtId}_club-trends-index.json`
    const filePath = path.join(this.getAnalyticsDir(snapshotDate), filename)

    this.logger.info('Writing club trends index data', {
      snapshotDate,
      districtId,
      filePath,
    })

    const result = await this.writeAnalyticsFile(
      filePath,
      snapshotDate,
      districtId,
      data,
      options?.sourceSnapshotChecksum
    )

    this.logger.info('Club trends index data written', {
      snapshotDate,
      districtId,
      filePath: result.filePath,
      size: result.size,
    })

    return result.filePath
  }

  /**
   * Writes the analytics manifest file.
   *
   * The manifest lists all analytics files with their checksums,
   * enabling validation and incremental updates.
   *
   * Requirements:
   * - 3.5: Write an analytics manifest file listing all generated
   *        analytics files with their checksums
   */
  async writeAnalyticsManifest(
    snapshotDate: string,
    files: AnalyticsManifestEntry[]
  ): Promise<void> {
    const analyticsDir = this.getAnalyticsDir(snapshotDate)
    const manifestPath = path.join(analyticsDir, 'manifest.json')

    // Ensure the analytics directory exists
    await fs.mkdir(analyticsDir, { recursive: true })

    // Calculate totals
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)

    const manifest: AnalyticsManifest = {
      snapshotDate,
      generatedAt: new Date().toISOString(),
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      files,
      totalFiles: files.length,
      totalSize,
    }

    // Serialize to JSON with pretty printing
    const content = JSON.stringify(manifest, null, 2)

    // Write atomically using temp file and rename
    const tempPath = `${manifestPath}.tmp.${Date.now()}`
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, manifestPath)

    this.logger.info('Analytics manifest written', {
      snapshotDate,
      manifestPath,
      totalFiles: manifest.totalFiles,
      totalSize: manifest.totalSize,
    })
  }

  /**
   * Creates a manifest entry for a written analytics file.
   *
   * This is a helper method to create manifest entries after writing files.
   *
   * @param filePath - Path to the written file
   * @param districtId - The district identifier
   * @param type - The type of analytics file
   * @returns Promise resolving to the manifest entry
   */
  async createManifestEntry(
    filePath: string,
    districtId: string,
    type:
      | 'analytics'
      | 'membership'
      | 'clubhealth'
      | 'rankings'
      | 'membership-analytics'
      | 'vulnerable-clubs'
      | 'leadership-insights'
      | 'distinguished-analytics'
      | 'year-over-year'
      | 'performance-targets'
      | 'club-trends-index'
  ): Promise<AnalyticsManifestEntry> {
    const content = await fs.readFile(filePath, 'utf-8')
    const stat = await fs.stat(filePath)

    // Parse the file to get the checksum from metadata
    const parsed = JSON.parse(content) as PreComputedAnalyticsFile<unknown>

    return {
      filename: path.basename(filePath),
      districtId,
      type,
      size: stat.size,
      checksum: parsed.metadata.checksum,
    }
  }
}
