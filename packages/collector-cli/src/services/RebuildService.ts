/**
 * RebuildService — Orchestrates full rebuild of derived data from raw-csv (#181)
 *
 * Given a cache directory containing raw-csv/{date}/... files, this service:
 * 1. Discovers all raw-csv dates
 * 2. Sorts them chronologically
 * 3. For each date: transform → compute-analytics (time-series + club-trends accumulate)
 * 4. Generates CDN manifests (v1/latest.json, v1/dates.json, v1/rankings.json)
 * 5. Generates config/district-snapshot-index.json
 *
 * Design: Composes existing TransformService + AnalyticsComputeService.
 * Time-series and club-trends directories are NEVER deleted between dates.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Logger } from '@toastmasters/analytics-core'
import { TransformService } from './TransformService.js'
import { AnalyticsComputeService } from './AnalyticsComputeService.js'

/**
 * Options for RebuildService
 */
export interface RebuildOptions {
  /** Base cache directory containing raw-csv/ */
  cacheDir: string
  /** Optional specific dates to rebuild (default: all dates in raw-csv/) */
  dates?: string[]
  /** Delete snapshot dir after each date to save disk (keeps time-series/club-trends) */
  cleanSnapshots?: boolean
  /** Logger */
  logger?: Logger
}

/**
 * Result of a single date's rebuild step
 */
export interface DateRebuildResult {
  date: string
  /** Actual snapshot date after closing period detection */
  snapshotDate: string
  transformSuccess: boolean
  computeSuccess: boolean
  districtsProcessed: number
  error?: string
}

/**
 * Result of the full rebuild operation
 */
export interface RebuildResult {
  success: boolean
  datesProcessed: number
  datesSucceeded: number
  datesFailed: number
  results: DateRebuildResult[]
  /** Generated manifest paths */
  manifests: {
    snapshotIndex?: string
    datesJson?: string
    latestJson?: string
    rankingsJson?: string
  }
  duration_ms: number
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

export class RebuildService {
  private readonly cacheDir: string
  private readonly logger: Logger
  private readonly transformService: TransformService
  private readonly analyticsService: AnalyticsComputeService

  constructor(options: { cacheDir: string; logger?: Logger }) {
    this.cacheDir = options.cacheDir
    this.logger = options.logger ?? noopLogger
    this.transformService = new TransformService({
      cacheDir: options.cacheDir,
      logger: options.logger,
    })
    this.analyticsService = new AnalyticsComputeService({
      cacheDir: options.cacheDir,
      logger: options.logger,
    })
  }

  /**
   * Discover all raw-csv dates in the cache directory, sorted chronologically.
   */
  async discoverDates(): Promise<string[]> {
    const rawCsvDir = path.join(this.cacheDir, 'raw-csv')
    try {
      const entries = await fs.readdir(rawCsvDir, { withFileTypes: true })
      const dates = entries
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name)
        .sort()
      return dates
    } catch (error) {
      const err = error as { code?: string }
      if (err.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * Rebuild derived data for a single date.
   */
  async rebuildDate(date: string): Promise<DateRebuildResult> {
    this.logger.info(`Rebuilding date: ${date}`)

    // Step 1: Transform raw-csv → snapshots
    let snapshotDate: string
    try {
      const transformResult = await this.transformService.transform({
        date,
        force: true,
        verbose: false,
      })

      if (!transformResult.success) {
        return {
          date,
          snapshotDate: date,
          transformSuccess: false,
          computeSuccess: false,
          districtsProcessed: 0,
          error: `Transform failed: ${transformResult.errors.map(e => e.error).join('; ')}`,
        }
      }

      // The transform may have adjusted the date for closing periods
      snapshotDate = transformResult.date
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        date,
        snapshotDate: date,
        transformSuccess: false,
        computeSuccess: false,
        districtsProcessed: 0,
        error: `Transform threw: ${msg}`,
      }
    }

    // Step 2: Compute analytics (time-series + club-trends accumulate)
    try {
      const computeResult = await this.analyticsService.compute({
        date: snapshotDate,
        force: true,
        verbose: false,
      })

      return {
        date,
        snapshotDate,
        transformSuccess: true,
        computeSuccess: computeResult.success,
        districtsProcessed: computeResult.districtsProcessed.length,
        error: computeResult.success
          ? undefined
          : `Compute failed for: ${computeResult.districtsFailed.join(', ')}`,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        date,
        snapshotDate,
        transformSuccess: true,
        computeSuccess: false,
        districtsProcessed: 0,
        error: `Compute threw: ${msg}`,
      }
    }
  }

  /**
   * Generate district-snapshot-index.json from snapshot directories on disk.
   */
  async generateSnapshotIndex(): Promise<string> {
    const snapshotsDir = path.join(this.cacheDir, 'snapshots')
    const index: Record<string, string[]> = {}

    try {
      const dateDirs = await fs.readdir(snapshotsDir, { withFileTypes: true })
      for (const dateDir of dateDirs) {
        if (!dateDir.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateDir.name))
          continue

        const snapshotDate = dateDir.name
        const datePath = path.join(snapshotsDir, snapshotDate)
        const files = await fs.readdir(datePath)

        for (const file of files) {
          const match = file.match(/^district_(\w+)\.json$/)
          if (match?.[1] && /^[A-Z0-9]+$/i.test(match[1])) {
            const districtId = match[1]
            if (!index[districtId]) index[districtId] = []
            index[districtId].push(snapshotDate)
          }
        }
      }
    } catch (error) {
      const err = error as { code?: string }
      if (err.code !== 'ENOENT') throw error
    }

    // Sort dates per district
    for (const id of Object.keys(index)) {
      index[id]?.sort()
    }

    const configDir = path.join(this.cacheDir, 'config')
    await fs.mkdir(configDir, { recursive: true })
    const indexPath = path.join(configDir, 'district-snapshot-index.json')
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2))

    this.logger.info(
      `Generated snapshot index: ${Object.keys(index).length} districts`
    )
    return indexPath
  }

  /**
   * Generate v1/dates.json from snapshot directories on disk.
   */
  async generateDatesManifest(): Promise<string> {
    const snapshotsDir = path.join(this.cacheDir, 'snapshots')
    let dates: string[] = []

    try {
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true })
      dates = entries
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name)
        .sort()
    } catch {
      // No snapshots dir
    }

    const manifest = {
      _format: { version: '1.0.0', type: 'dates-index' },
      dates,
      count: dates.length,
      generatedAt: new Date().toISOString(),
    }

    const v1Dir = path.join(this.cacheDir, 'v1')
    await fs.mkdir(v1Dir, { recursive: true })
    const datesPath = path.join(v1Dir, 'dates.json')
    await fs.writeFile(datesPath, JSON.stringify(manifest, null, 2))

    this.logger.info(`Generated v1/dates.json: ${dates.length} dates`)
    return datesPath
  }

  /**
   * Generate v1/latest.json pointing to the most recent snapshot date.
   */
  async generateLatestManifest(): Promise<string> {
    const snapshotsDir = path.join(this.cacheDir, 'snapshots')
    let latestDate = ''

    try {
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true })
      const dates = entries
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name)
        .sort()
      latestDate = dates[dates.length - 1] ?? ''
    } catch {
      // No snapshots dir
    }

    const manifest = {
      _format: { version: '1.0.0', type: 'manifest' },
      latestSnapshotDate: latestDate,
      generatedAt: new Date().toISOString(),
    }

    const v1Dir = path.join(this.cacheDir, 'v1')
    await fs.mkdir(v1Dir, { recursive: true })
    const latestPath = path.join(v1Dir, 'latest.json')
    await fs.writeFile(latestPath, JSON.stringify(manifest, null, 2))

    this.logger.info(`Generated v1/latest.json: ${latestDate}`)
    return latestPath
  }

  /**
   * Generate v1/rankings.json from the latest all-districts-rankings.json.
   */
  async generateRankingsManifest(): Promise<string | null> {
    const snapshotsDir = path.join(this.cacheDir, 'snapshots')
    let latestDate: string

    try {
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true })
      const dates = entries
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name)
        .sort()
      latestDate = dates[dates.length - 1] ?? ''
    } catch {
      return null
    }

    if (!latestDate) return null

    const rankingsPath = path.join(
      snapshotsDir,
      latestDate,
      'all-districts-rankings.json'
    )
    try {
      const content = await fs.readFile(rankingsPath, 'utf-8')
      const src = JSON.parse(content) as {
        rankings: unknown[]
        metadata: { sourceCsvDate?: string; totalDistricts?: number }
      }

      const manifest = {
        _format: { version: '1.0.0', type: 'rankings' },
        rankings: src.rankings,
        date: src.metadata.sourceCsvDate ?? latestDate,
        generatedAt: new Date().toISOString(),
      }

      const v1Dir = path.join(this.cacheDir, 'v1')
      await fs.mkdir(v1Dir, { recursive: true })
      const outPath = path.join(v1Dir, 'rankings.json')
      await fs.writeFile(outPath, JSON.stringify(manifest, null, 2))

      this.logger.info(
        `Generated v1/rankings.json: ${src.rankings.length} districts`
      )
      return outPath
    } catch {
      this.logger.warn(
        `all-districts-rankings.json not found for ${latestDate}`
      )
      return null
    }
  }

  /**
   * Full rebuild: process all dates, then generate manifests.
   */
  async rebuild(options?: RebuildOptions): Promise<RebuildResult> {
    const startTime = Date.now()
    const cleanSnapshots = options?.cleanSnapshots ?? false

    // Discover dates
    const dates = options?.dates ?? (await this.discoverDates())
    this.logger.info(`Rebuild starting: ${dates.length} dates to process`)

    const results: DateRebuildResult[] = []
    let succeeded = 0
    let failed = 0

    // Process each date chronologically
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!
      this.logger.info(`[${i + 1}/${dates.length}] Processing ${date}`)

      const result = await this.rebuildDate(date)
      results.push(result)

      if (result.transformSuccess && result.computeSuccess) {
        succeeded++
      } else {
        failed++
      }

      // Optionally clean snapshots to save disk (keep time-series/club-trends)
      if (cleanSnapshots && result.snapshotDate) {
        const snapshotDir = path.join(
          this.cacheDir,
          'snapshots',
          result.snapshotDate
        )
        try {
          await fs.rm(snapshotDir, { recursive: true, force: true })
          this.logger.debug(`Cleaned snapshot dir: ${snapshotDir}`)
        } catch {
          // Non-fatal
        }
      }
    }

    // Generate manifests (only if snapshots weren't cleaned)
    const manifests: RebuildResult['manifests'] = {}
    if (!cleanSnapshots) {
      try {
        manifests.snapshotIndex = await this.generateSnapshotIndex()
      } catch (e) {
        this.logger.error(
          `Failed to generate snapshot index: ${e instanceof Error ? e.message : e}`
        )
      }
      try {
        manifests.datesJson = await this.generateDatesManifest()
      } catch (e) {
        this.logger.error(
          `Failed to generate dates manifest: ${e instanceof Error ? e.message : e}`
        )
      }
      try {
        manifests.latestJson = await this.generateLatestManifest()
      } catch (e) {
        this.logger.error(
          `Failed to generate latest manifest: ${e instanceof Error ? e.message : e}`
        )
      }
      try {
        manifests.rankingsJson =
          (await this.generateRankingsManifest()) ?? undefined
      } catch (e) {
        this.logger.error(
          `Failed to generate rankings manifest: ${e instanceof Error ? e.message : e}`
        )
      }
    }

    return {
      success: failed === 0 && dates.length > 0,
      datesProcessed: dates.length,
      datesSucceeded: succeeded,
      datesFailed: failed,
      results,
      manifests,
      duration_ms: Date.now() - startTime,
    }
  }
}
