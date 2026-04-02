/**
 * Collector Orchestrator
 *
 * Orchestrates scraping operations across multiple districts with resilient
 * error handling and partial failure support.
 *
 * Requirements:
 * - 1.2: WHEN the Collector_CLI is invoked, THE Collector_CLI SHALL scrape data
 *        from the Toastmasters dashboard and store it in the Raw_CSV_Cache
 * - 1.10: IF scraping fails for any district, THEN THE Collector_CLI SHALL
 *         continue processing remaining districts and report failures in the summary
 * - 6.1: IF the Collector_CLI encounters a network error, THEN THE Collector_CLI SHALL
 *        retry with exponential backoff before failing
 * - 7.1: THE Collector_CLI SHALL read district configuration from the same source as the Backend
 * - 7.2: THE Collector_CLI SHALL use the same cache directory configuration as the Backend
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { logger } from './utils/logger.js'
import { CircuitBreaker, CircuitState } from './utils/CircuitBreaker.js'
import { RetryManager } from './utils/RetryManager.js'
import {
  HttpCsvDownloader,
  parseClosingPeriodFromCsv,
  type ReportType as HttpReportType,
  type CsvClosingPeriodInfo,
} from './services/HttpCsvDownloader.js'
import type {
  CollectorOrchestratorConfig,
  ScrapeOptions,
  ScrapeResult,
  ConfigValidationResult,
  CacheStatus,
} from './types/index.js'
import { CSVType } from './types/collector.js'
import { OrchestratorCacheAdapter } from './OrchestratorCacheAdapter.js'
import {
  buildCsvPath,
  buildMetadataPath,
  calculateProgramYear,
} from './utils/CachePaths.js'
import { parseClosingPeriodFromCsv } from './utils/csvFooterParser.js'

/**
 * District configuration file structure
 * Matches the backend's DistrictConfigurationService format
 */
interface DistrictConfiguration {
  configuredDistricts: string[]
  lastUpdated: string
  updatedBy: string
  version: number
}

/**
 * Result of scraping a single district
 */
interface DistrictScrapeResult {
  districtId: string
  success: boolean
  cacheLocations: string[]
  error?: string
  timestamp: string
  duration_ms: number
  closingPeriodInfo?: CsvClosingPeriodInfo
}

/**
 * Collector Orchestrator
 *
 * Coordinates scraping operations across multiple districts with:
 * - Configuration loading from district config file
 * - Cache directory resolution
 * - Resilient processing with error isolation
 * - Circuit breaker integration
 * - Retry logic with exponential backoff
 */
export class CollectorOrchestrator {
  private readonly config: CollectorOrchestratorConfig
  private readonly circuitBreaker: CircuitBreaker
  private readonly cacheAdapter: OrchestratorCacheAdapter
  private downloader: HttpCsvDownloader | null = null

  constructor(config: CollectorOrchestratorConfig) {
    this.config = config
    this.circuitBreaker = CircuitBreaker.createDashboardCircuitBreaker(
      'collector-orchestrator'
    )
    this.cacheAdapter = new OrchestratorCacheAdapter(config.cacheDir)

    logger.debug('CollectorOrchestrator initialized', {
      cacheDir: config.cacheDir,
      districtConfigPath: config.districtConfigPath,
      timeout: config.timeout,
      verbose: config.verbose,
    })
  }

  /**
   * Get current date string in YYYY-MM-DD format
   */
  private getCurrentDateString(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * Load district configuration from file
   * Requirement 7.1: Read district configuration from the same source as the Backend
   */
  private async loadDistrictConfiguration(): Promise<DistrictConfiguration> {
    try {
      const configContent = await fs.readFile(
        this.config.districtConfigPath,
        'utf-8'
      )
      const config = JSON.parse(configContent) as DistrictConfiguration

      // Validate configuration structure
      if (!Array.isArray(config.configuredDistricts)) {
        throw new Error(
          'Invalid configuration: configuredDistricts must be an array'
        )
      }

      logger.info('District configuration loaded', {
        districtCount: config.configuredDistricts.length,
        lastUpdated: config.lastUpdated,
        configPath: this.config.districtConfigPath,
      })

      return config
    } catch (error) {
      const err = error as { code?: string }
      if (err.code === 'ENOENT') {
        logger.warn(
          'District configuration file not found, using empty configuration',
          {
            configPath: this.config.districtConfigPath,
          }
        )
        return {
          configuredDistricts: [],
          lastUpdated: new Date().toISOString(),
          updatedBy: 'system',
          version: 1,
        }
      }
      throw error
    }
  }

  /**
   * Validate the orchestrator configuration
   */
  async validateConfiguration(): Promise<ConfigValidationResult> {
    const errors: string[] = []

    // Check cache directory
    try {
      await fs.access(this.config.cacheDir)
    } catch {
      // Try to create it
      try {
        await fs.mkdir(this.config.cacheDir, { recursive: true })
        logger.info('Created cache directory', {
          cacheDir: this.config.cacheDir,
        })
      } catch (_mkdirError) {
        errors.push(
          `Cannot access or create cache directory: ${this.config.cacheDir}`
        )
      }
    }

    // Check district configuration file
    try {
      const config = await this.loadDistrictConfiguration()
      if (config.configuredDistricts.length === 0) {
        errors.push('No districts configured in district configuration file')
      }
    } catch (error) {
      errors.push(
        `Cannot load district configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Get cache status for a specific date
   */
  async getCacheStatus(date: string): Promise<CacheStatus> {
    const config = await this.loadDistrictConfiguration()
    const configuredDistricts = config.configuredDistricts

    const cachedDistricts: string[] = []
    const missingDistricts: string[] = []

    for (const districtId of configuredDistricts) {
      // Check if club performance CSV exists (primary indicator of cached data)
      const hasCached = await this.cacheAdapter.hasCachedCSV(
        date,
        CSVType.CLUB_PERFORMANCE,
        districtId
      )

      if (hasCached) {
        cachedDistricts.push(districtId)
      } else {
        missingDistricts.push(districtId)
      }
    }

    return {
      date,
      cachedDistricts,
      missingDistricts,
    }
  }

  /**
   * Initialize the HTTP downloader instance
   */
  private initDownloader(): HttpCsvDownloader {
    if (!this.downloader) {
      this.downloader = new HttpCsvDownloader({
        ratePerSecond: 5,
        cooldownEvery: 50,
        cooldownMs: 3000,
        maxRetries: 3,
      })
      logger.debug('HttpCsvDownloader instance created')
    }
    return this.downloader
  }

  /**
   * Close resources (no-op now that Playwright is removed).
   * Kept for API compatibility with CLI callers.
   */
  async close(): Promise<void> {
    this.downloader = null
    logger.debug('Collector resources released')
  }

  /**
   * Write CSV content to the cache directory.
   */
  private async writeCsvToCache(
    date: string,
    csvType: CSVType,
    content: string,
    districtId?: string
  ): Promise<string> {
    const filePath = buildCsvPath(
      this.config.cacheDir,
      date,
      csvType,
      districtId
    )
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return filePath
  }

  /**
   * Scrape all-districts summary data via HTTP
   */
  private async scrapeAllDistricts(
    downloader: HttpCsvDownloader,
    date: string,
    force: boolean
  ): Promise<DistrictScrapeResult> {
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    const cacheLocations: string[] = []

    logger.info('Starting all-districts download', { date, force })

    try {
      if (!force) {
        const hasCached = await this.cacheAdapter.hasCachedCSV(
          date,
          CSVType.ALL_DISTRICTS
        )
        if (hasCached) {
          logger.info('All-districts cache exists, skipping', { date })
          return {
            districtId: 'all-districts',
            success: true,
            cacheLocations: [],
            timestamp,
            duration_ms: Date.now() - startTime,
          }
        }
      }

      let closingPeriodInfo: CsvClosingPeriodInfo | undefined

      const retryResult = await RetryManager.executeWithRetry(
        async () => {
          const programYear = calculateProgramYear(date)
          const result = await downloader.downloadCsv({
            programYear,
            reportType: 'districtsummary',
            date: new Date(date + 'T00:00:00'),
          })

          const filePath = await this.writeCsvToCache(
            date,
            CSVType.ALL_DISTRICTS,
            result.content
          )
          cacheLocations.push(filePath)

          // Parse closing period metadata from CSV footer (#278)
          closingPeriodInfo = parseClosingPeriodFromCsv(result.content, date)

          return { byteSize: result.byteSize }
        },
        RetryManager.getDashboardRetryOptions(),
        { date, operation: 'scrapeAllDistricts' }
      )

      if (!retryResult.success) {
        throw (
          retryResult.error ??
          new Error('All-districts download failed after retries')
        )
      }

      if (closingPeriodInfo?.isClosingPeriod) {
        logger.info('Closing period detected from CSV footer', {
          date,
          dataMonth: closingPeriodInfo.dataMonth,
        })
      }

      logger.info('All-districts download completed', {
        date,
        duration_ms: Date.now() - startTime,
        attempts: retryResult.attempts,
      })

      return {
        districtId: 'all-districts',
        success: true,
        cacheLocations,
        closingPeriodInfo,
        timestamp,
        duration_ms: Date.now() - startTime,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      logger.error('All-districts download failed', {
        date,
        error: errorMessage,
      })
      return {
        districtId: 'all-districts',
        success: false,
        cacheLocations: [],
        error: errorMessage,
        timestamp,
        duration_ms: Date.now() - startTime,
      }
    }
  }

  /**
   * Download CSVs for a single district via HTTP
   * Requirement 6.1: Retry with exponential backoff before failing
   */
  private async scrapeDistrict(
    downloader: HttpCsvDownloader,
    districtId: string,
    date: string,
    force: boolean
  ): Promise<DistrictScrapeResult> {
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    const cacheLocations: string[] = []

    logger.info('Starting district download', { districtId, date, force })

    try {
      if (!force) {
        const hasCached = await this.cacheAdapter.hasCachedCSV(
          date,
          CSVType.CLUB_PERFORMANCE,
          districtId
        )
        if (hasCached) {
          logger.info('Cache exists, skipping download', { districtId, date })
          return {
            districtId,
            success: true,
            cacheLocations: [],
            timestamp,
            duration_ms: Date.now() - startTime,
          }
        }
      }

      const retryResult = await RetryManager.executeWithRetry(
        async () => {
          const programYear = calculateProgramYear(date)
          const reportTypes: Array<{ report: HttpReportType; csv: CSVType }> = [
            { report: 'clubperformance', csv: CSVType.CLUB_PERFORMANCE },
            {
              report: 'divisionperformance',
              csv: CSVType.DIVISION_PERFORMANCE,
            },
            {
              report: 'districtperformance',
              csv: CSVType.DISTRICT_PERFORMANCE,
            },
          ]

          for (const { report, csv } of reportTypes) {
            const result = await downloader.downloadCsv({
              programYear,
              reportType: report,
              districtId,
              date: new Date(date + 'T00:00:00'),
            })

            const filePath = await this.writeCsvToCache(
              date,
              csv,
              result.content,
              districtId
            )
            cacheLocations.push(filePath)
          }

          return { csvCount: reportTypes.length }
        },
        RetryManager.getDashboardRetryOptions(),
        { districtId, date, operation: 'scrapeDistrict' }
      )

      if (!retryResult.success) {
        throw retryResult.error ?? new Error('Download failed after retries')
      }

      logger.info('District download completed', {
        districtId,
        date,
        duration_ms: Date.now() - startTime,
        attempts: retryResult.attempts,
      })

      return {
        districtId,
        success: true,
        cacheLocations,
        timestamp,
        duration_ms: Date.now() - startTime,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      logger.error('District download failed', {
        districtId,
        date,
        error: errorMessage,
      })
      return {
        districtId,
        success: false,
        cacheLocations: [],
        error: errorMessage,
        timestamp,
        duration_ms: Date.now() - startTime,
      }
    }
  }

  /**
   * Main scrape method - orchestrates scraping across all districts
   *
   * Requirements:
   * - 1.2: Scrape data and store in Raw_CSV_Cache
   * - 1.10: Continue on individual district failures
   * - 6.1: Retry with exponential backoff
   * - 6.2: Report circuit breaker status and exit gracefully
   */
  async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
    const startTime = Date.now()
    const date = options.date ?? this.getCurrentDateString()
    const force = options.force ?? false

    logger.info('Starting scrape operation', {
      date,
      force,
      requestedDistricts: options.districts ?? 'all configured',
    })

    // Check circuit breaker state
    const cbStats = this.circuitBreaker.getStats()
    if (cbStats.state === CircuitState.OPEN) {
      logger.error('Circuit breaker is open, aborting scrape', {
        failureCount: cbStats.failureCount,
        nextRetryTime: cbStats.nextRetryTime?.toISOString(),
      })

      return {
        success: false,
        date,
        districtsProcessed: [],
        districtsSucceeded: [],
        districtsFailed: [],
        cacheLocations: [],
        errors: [
          {
            districtId: 'N/A',
            error: `Circuit breaker is open. Next retry at ${cbStats.nextRetryTime?.toISOString() ?? 'unknown'}`,
            timestamp: new Date().toISOString(),
          },
        ],
        duration_ms: Date.now() - startTime,
      }
    }

    // Resolve district list:
    // - If --districts is explicitly provided (e.g. from the data pipeline after
    //   auto-discovering from the ALL_DISTRICTS CSV), trust it directly.
    // - If no districts are specified, fall back to the local config file (legacy
    //   path used in local dev or manual targeted runs without an explicit list).
    let districtsToScrape: string[]
    if (options.districts && options.districts.length > 0) {
      districtsToScrape = options.districts
      logger.info('Using explicitly provided district list', {
        districtCount: districtsToScrape.length,
      })
    } else {
      try {
        const config = await this.loadDistrictConfiguration()
        districtsToScrape = config.configuredDistricts
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        logger.error('Failed to load district configuration', {
          error: errorMessage,
        })

        return {
          success: false,
          date,
          districtsProcessed: [],
          districtsSucceeded: [],
          districtsFailed: [],
          cacheLocations: [],
          errors: [
            {
              districtId: 'N/A',
              error: `Failed to load district configuration: ${errorMessage}`,
              timestamp: new Date().toISOString(),
            },
          ],
          duration_ms: Date.now() - startTime,
        }
      }
    }

    if (districtsToScrape.length === 0) {
      logger.warn('No districts to scrape')

      return {
        success: false,
        date,
        districtsProcessed: [],
        districtsSucceeded: [],
        districtsFailed: [],
        cacheLocations: [],
        errors: [
          {
            districtId: 'N/A',
            error: 'No districts configured or specified for scraping',
            timestamp: new Date().toISOString(),
          },
        ],
        duration_ms: Date.now() - startTime,
      }
    }

    // Initialize HTTP downloader
    const downloader = this.initDownloader()

    // Process districts sequentially with error isolation
    const results: DistrictScrapeResult[] = []
    const errors: Array<{
      districtId: string
      error: string
      timestamp: string
    }> = []
    const allCacheLocations: string[] = []

    // Download all-districts summary first
    const allDistrictsResult = await this.scrapeAllDistricts(
      downloader,
      date,
      force
    )
    if (allDistrictsResult.success) {
      allCacheLocations.push(...allDistrictsResult.cacheLocations)
    } else if (allDistrictsResult.error) {
      errors.push({
        districtId: 'all-districts',
        error: allDistrictsResult.error,
        timestamp: allDistrictsResult.timestamp,
      })
    }

    for (const districtId of districtsToScrape) {
      // Check circuit breaker before each district
      const currentCbStats = this.circuitBreaker.getStats()
      if (currentCbStats.state === CircuitState.OPEN) {
        logger.warn('Circuit breaker opened during scrape, stopping', {
          districtId,
          processedCount: results.length,
          remainingCount: districtsToScrape.length - results.length,
        })

        const remainingDistricts = districtsToScrape.slice(results.length)
        for (const remaining of remainingDistricts) {
          errors.push({
            districtId: remaining,
            error: 'Skipped due to circuit breaker opening',
            timestamp: new Date().toISOString(),
          })
        }
        break
      }

      try {
        const result = await this.circuitBreaker.execute(
          () => this.scrapeDistrict(downloader, districtId, date, force),
          { districtId, date }
        )

        results.push(result)

        if (result.success) {
          allCacheLocations.push(...result.cacheLocations)
        } else if (result.error) {
          errors.push({
            districtId: result.districtId,
            error: result.error,
            timestamp: result.timestamp,
          })
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'

        results.push({
          districtId,
          success: false,
          cacheLocations: [],
          error: errorMessage,
          timestamp: new Date().toISOString(),
          duration_ms: 0,
        })

        errors.push({
          districtId,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })

        logger.error('Unexpected error during district download', {
          districtId,
          error: errorMessage,
        })
      }
    }

    // Write metadata.json for this date
    try {
      const succeededDistricts = results
        .filter(r => r.success)
        .map(r => r.districtId)
      if (succeededDistricts.length > 0) {
        let isClosingPeriod = false
        let dataMonth: string | undefined

        // Detect closing period from standard all-districts output
        if (allDistrictsResult.success) {
          try {
            const csvPath = buildCsvPath(
              this.config.cacheDir,
              date,
              CSVType.ALL_DISTRICTS
            )
            const csvContent = await fs.readFile(csvPath, 'utf-8')
            const parsed = parseClosingPeriodFromCsv(csvContent, date)
            isClosingPeriod = parsed.isClosingPeriod
            dataMonth = parsed.dataMonth
          } catch {
            logger.warn('Failed to parse closing period from CSV', { date })
          }
        }

        const metaPath = buildMetadataPath(this.config.cacheDir, date)
        const closingInfo = allDistrictsResult.closingPeriodInfo
        const metadata: Record<string, unknown> = {
          date,
          timestamp: Date.now(),
          programYear: calculateProgramYear(date),
          isClosingPeriod,
          ...(dataMonth ? { dataMonth } : {}),
          csvFiles: {
            allDistricts: allDistrictsResult.success,
            districts: Object.fromEntries(
              succeededDistricts.map(id => [
                id,
                {
                  districtPerformance: true,
                  divisionPerformance: true,
                  clubPerformance: true,
                },
              ])
            ),
          },
          source: 'collector-http',
          cacheVersion: 1,
        }
        await fs.mkdir(path.dirname(metaPath), { recursive: true })
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8')
        logger.info('Wrote metadata.json', {
          date,
          districts: succeededDistricts.length,
        })
      }
    } catch (metaError) {
      logger.error('Failed to write metadata.json', { date, error: metaError })
    }

    // Close resources
    await this.close()

    // Calculate results
    const districtsProcessed = results.map(r => r.districtId)
    const districtsSucceeded = results
      .filter(r => r.success)
      .map(r => r.districtId)
    const districtsFailed = results
      .filter(r => !r.success)
      .map(r => r.districtId)
    const duration_ms = Date.now() - startTime

    const success =
      districtsFailed.length === 0 && districtsSucceeded.length > 0

    logger.info('Scrape operation completed', {
      date,
      duration_ms,
      totalDistricts: districtsToScrape.length,
      succeeded: districtsSucceeded.length,
      failed: districtsFailed.length,
      success,
      requestCount: downloader.getRequestCount(),
    })

    return {
      success,
      date,
      districtsProcessed,
      districtsSucceeded,
      districtsFailed,
      cacheLocations: allCacheLocations,
      errors,
      duration_ms,
    }
  }
}
