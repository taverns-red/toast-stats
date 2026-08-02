/**
 * Backfill Orchestrator
 *
 * Orchestrates the 3-phase historical data backfill:
 *   Phase 1: Discovery — download districtsummary for each date to discover districts
 *   Phase 2: Collection — download per-district CSVs (district, division, club)
 *   Phase 3: Transform — run existing transform pipeline on collected data
 *
 * Requirements (#123):
 *   - Resume-capable (skip already-cached files)
 *   - Progress reporting
 *   - Graceful shutdown on SIGINT
 *   - Storage-agnostic: supports local filesystem or GCS
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  HttpCsvDownloader,
  computeMonthEndDate,
  type DateFrequency,
  type ExportPathStyle,
  type ReportType,
} from './HttpCsvDownloader.js'
import { logger } from '../utils/logger.js'
import {
  toYYYYMMDD,
  calculateProgramYear,
  getPriorProgramYear,
  buildCsvPathFromReport,
  buildMetadataPath,
} from '../utils/CachePaths.js'
import { resolveActiveProgramYear } from '../utils/programYearResolver.js'
import {
  BackfillContentMismatchError,
  resolveExportPathStyle,
  verifyBackfillCsv,
} from '../utils/backfillContentGuard.js'

// ── Storage Abstraction ──────────────────────────────────────────────

/**
 * Storage backend interface for backfill data.
 * Implementations handle local filesystem or cloud storage.
 */
export interface BackfillStorage {
  /** Check if a file already exists (for resume). */
  exists(filePath: string): Promise<boolean>
  /** Read a file's content (for parsing cached summaries). */
  read(filePath: string): Promise<string>
  /** Write content to a file, creating directories as needed. */
  write(filePath: string, content: string): Promise<void>
}

/**
 * Local filesystem storage backend.
 */
export class LocalBackfillStorage implements BackfillStorage {
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async read(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
  }

  async write(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }
}

/**
 * Google Cloud Storage backend.
 * Streams CSV data directly to GCS without touching local disk.
 */
export class GcsBackfillStorage implements BackfillStorage {
  private readonly bucket: import('@google-cloud/storage').Bucket
  private existingKeys: Set<string> | null = null

  constructor(bucket: import('@google-cloud/storage').Bucket) {
    this.bucket = bucket
  }

  /**
   * Create a GcsBackfillStorage from a bucket name.
   */
  static async create(
    bucketName: string,
    projectId?: string
  ): Promise<GcsBackfillStorage> {
    const { Storage } = await import('@google-cloud/storage')
    const storage = new Storage({ projectId })
    const bucket = storage.bucket(bucketName)
    return new GcsBackfillStorage(bucket)
  }

  /**
   * Pre-load all existing object keys under a prefix into memory.
   * This converts O(N) HTTP HEAD requests into a single paginated LIST.
   * Call this before starting a phase to make exists() O(1).
   */
  async warmCache(prefix: string): Promise<number> {
    const keys = new Set<string>()
    const [files] = await this.bucket.getFiles({
      prefix,
      // Only fetch the name, not full metadata
      autoPaginate: true,
    })
    for (const file of files) {
      keys.add(file.name)
    }
    this.existingKeys = keys
    return keys.size
  }

  async exists(filePath: string): Promise<boolean> {
    // Use in-memory cache if warmed
    if (this.existingKeys) {
      return this.existingKeys.has(filePath)
    }
    // Fallback to individual check
    const file = this.bucket.file(filePath)
    const [exists] = await file.exists()
    return exists
  }

  async read(filePath: string): Promise<string> {
    const file = this.bucket.file(filePath)
    const [buffer] = await file.download()
    return buffer.toString('utf-8')
  }

  async write(filePath: string, content: string): Promise<void> {
    const file = this.bucket.file(filePath)
    await file.save(content, { contentType: 'text/csv' })
    // Keep cache in sync
    if (this.existingKeys) {
      this.existingKeys.add(filePath)
    }
  }
}

// ── Config & Types ───────────────────────────────────────────────────

export interface BackfillConfig {
  startYear: number
  endYear: number
  frequency: DateFrequency
  ratePerSecond: number
  outputDir: string
  cooldownEvery?: number
  cooldownMs?: number
  phase?: 'discover' | 'collect' | 'all'
  resume?: boolean
  storage?: BackfillStorage
  /**
   * The program year currently served by the bare `/export.aspx` (#1384).
   *
   * That year has no `/{programYear}/` archive path — requesting one returns
   * HTTP 500 — so it can only be fetched from the root. When omitted, it is
   * resolved once per run by asking the dashboard, and only when the backfill
   * range could actually contain it: a purely historical backfill makes no
   * extra request and its URLs are unchanged.
   */
  liveProgramYear?: string
}

export interface BackfillScope {
  programYears: string[]
  datesPerYear: number
  phase1Requests: number
  requestsPerDistrict: number
}

export interface Phase1Result {
  districtsPerYear: Record<string, string[]>
  totalDistricts: number
  requestsMade: number
  /** Dates the dashboard answered 200 for but had no data on (#1384). */
  emptySkipped: number
  /** Responses rejected because they were not for the requested period. */
  mismatches: number
}

export interface BackfillProgress {
  phase: number
  total: number
  completed: number
  currentYear: string
  currentDistrict?: string
  requestsMade: number
  startTime: number
}

export interface TimeEstimate {
  totalSeconds: number
  humanReadable: string
}

/**
 * Build a metadata.json object compatible with OrchestratorCacheAdapter.
 *
 * The TransformService reads: date, isClosingPeriod, dataMonth, programYear.
 * The full FullCacheMetadata shape is maintained for compatibility.
 */
export function buildBackfillMetadata(
  date: Date,
  districtIds: string[]
): Record<string, unknown> {
  const dateStr = toYYYYMMDD(date)
  const districts: Record<
    string,
    {
      districtPerformance: boolean
      divisionPerformance: boolean
      clubPerformance: boolean
    }
  > = {}
  for (const id of districtIds) {
    districts[id] = {
      districtPerformance: true,
      divisionPerformance: true,
      clubPerformance: true,
    }
  }

  // isClosingPeriod is intentionally OMITTED. Backfill writes raw CSVs
  // without parsing the "As of" footer, so it cannot decide closing-period
  // status. Writing a hardcoded `false` would be a laundered default that the
  // downstream trust branch (TransformService) honors as an explicit scraper
  // decision — the #1129 twin-writer hole (Lesson 158). Omitting the key
  // leaves the decision to the resolution chain (CSV footer → registry),
  // which fails closed when undecided rather than publishing under a raw date.
  return {
    date: dateStr,
    timestamp: Date.now(),
    programYear: calculateProgramYear(date),
    csvFiles: {
      allDistricts: true,
      districts,
    },
    downloadStats: {
      totalDownloads: districtIds.length * 3 + 1,
      cacheHits: 0,
      cacheMisses: districtIds.length * 3 + 1,
      lastAccessed: Date.now(),
    },
    integrity: {
      checksums: {},
      totalSize: 0,
      fileCount: districtIds.length * 3 + 1,
    },
    source: 'backfill',
    cacheVersion: 1,
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────

export class BackfillOrchestrator {
  private readonly config: BackfillConfig
  public readonly downloader: HttpCsvDownloader
  private readonly storage: BackfillStorage
  private aborted = false
  private progress: BackfillProgress = {
    phase: 0,
    total: 0,
    completed: 0,
    currentYear: '',
    requestsMade: 0,
    startTime: Date.now(),
  }

  private liveProgramYearResolved = false
  private liveProgramYear: string | undefined

  constructor(config: BackfillConfig) {
    this.config = config
    this.downloader = new HttpCsvDownloader({
      ratePerSecond: config.ratePerSecond,
      cooldownEvery: config.cooldownEvery ?? 100,
      cooldownMs: config.cooldownMs ?? 5000,
    })
    this.storage = config.storage ?? new LocalBackfillStorage()
  }

  /**
   * Which program year the bare `/export.aspx` currently serves, resolved once
   * per run and memoised (#1384).
   *
   * Resolved by asking the dashboard rather than by reading the calendar: TM's
   * rollover lags July 1, so the live year is a fact about their data, not
   * about today's date (#1284). Anything we cannot confirm is live stays on
   * the archive path, whose URL constrains the year — the safe default.
   *
   * A backfill whose range cannot contain the live year skips the probe
   * entirely, so purely historical runs issue exactly the requests they always
   * did.
   */
  private async getLiveProgramYear(): Promise<string | undefined> {
    if (this.liveProgramYearResolved) return this.liveProgramYear
    this.liveProgramYearResolved = true

    if (this.config.liveProgramYear !== undefined) {
      this.liveProgramYear = this.config.liveProgramYear
      return this.liveProgramYear
    }

    const today = toYYYYMMDD(new Date())
    const calendarPY = calculateProgramYear(today)
    const candidates = new Set([calendarPY, getPriorProgramYear(calendarPY)])
    const targetYears = this.downloader.getProgramYearRange(
      this.config.startYear,
      this.config.endYear
    )
    if (!targetYears.some(y => candidates.has(y))) {
      logger.info(
        'Backfill range is entirely historical — every fetch uses /{programYear}/ (#1384)',
        { targetYears }
      )
      return undefined
    }

    const resolution = await resolveActiveProgramYear(
      today,
      async (programYear, pathStyle) => {
        const date = new Date(`${today}T00:00:00`)
        const result = await this.downloader.downloadCsv({
          programYear,
          reportType: 'districtsummary',
          date,
          monthEndDate: computeMonthEndDate(date),
          pathStyle,
        })
        return result.content
      }
    )

    this.liveProgramYear =
      resolution.pathStyle === 'live' ? resolution.programYear : undefined

    logger.info('Resolved the live program year for backfill (#1384)', {
      today,
      liveProgramYear: this.liveProgramYear ?? null,
      reason: resolution.reason,
    })

    return this.liveProgramYear
  }

  /**
   * Verify a downloaded body against the request that produced it, then say
   * whether it may be stored (#1384).
   *
   * A mismatch throws: it means the dashboard gave us a different period than
   * we asked for, and writing it would put wrong data under a real date.
   */
  private acceptDownload(args: {
    content: string
    programYear: string
    date: Date
    pathStyle: ExportPathStyle
    url: string
    context: Record<string, unknown>
  }): 'store' | 'skip' {
    const dateStr = toYYYYMMDD(args.date)
    const verdict = verifyBackfillCsv({
      content: args.content,
      programYear: args.programYear,
      date: dateStr,
      pathStyle: args.pathStyle,
    })

    if (verdict.status === 'mismatch') {
      throw new BackfillContentMismatchError(
        `Refusing to ingest ${args.url}: ${verdict.reason}`,
        { programYear: args.programYear, date: dateStr, url: args.url }
      )
    }

    if (verdict.status === 'empty') {
      logger.warn(
        'Dashboard returned no data for this date — skipping, not ingesting (#1384)',
        { ...args.context, date: dateStr, reason: verdict.reason }
      )
      return 'skip'
    }

    return 'store'
  }

  /**
   * Calculate the total scope of the backfill operation.
   */
  calculateScope(): BackfillScope {
    const programYears = this.downloader.getProgramYearRange(
      this.config.startYear,
      this.config.endYear
    )
    const dates = this.downloader.generateDateGrid(
      programYears[0]!,
      this.config.frequency
    )
    const datesPerYear = dates.length

    return {
      programYears,
      datesPerYear,
      phase1Requests: datesPerYear * programYears.length,
      requestsPerDistrict: datesPerYear * 3,
    }
  }

  /**
   * Estimate completion time.
   */
  estimateTime(totalRequests: number, ratePerSecond: number): TimeEstimate {
    const totalSeconds = totalRequests / ratePerSecond
    let humanReadable: string

    if (totalSeconds < 60) {
      humanReadable = `${Math.round(totalSeconds)} seconds`
    } else if (totalSeconds < 3600) {
      humanReadable = `${Math.round(totalSeconds / 60)} min`
    } else {
      const hours = Math.floor(totalSeconds / 3600)
      const mins = Math.round((totalSeconds % 3600) / 60)
      humanReadable = `${hours}h ${mins}min`
    }

    return { totalSeconds, humanReadable }
  }

  /**
   * Phase 1: Discovery — download summary CSVs to discover district IDs per year.
   */
  async runPhase1Discovery(): Promise<Phase1Result> {
    const scope = this.calculateScope()
    const districtsPerYear: Record<string, string[]> = {}
    const liveProgramYear = await this.getLiveProgramYear()
    let requestsMade = 0
    let emptySkipped = 0
    let mismatches = 0

    this.progress = {
      phase: 1,
      total: scope.phase1Requests,
      completed: 0,
      currentYear: '',
      requestsMade: 0,
      startTime: Date.now(),
    }

    logger.info('Phase 1: Discovery starting', {
      programYears: scope.programYears.length,
      datesPerYear: scope.datesPerYear,
      totalRequests: scope.phase1Requests,
    })

    for (const year of scope.programYears) {
      if (this.aborted) break

      this.progress.currentYear = year
      const pathStyle = resolveExportPathStyle(year, liveProgramYear)
      const dates = this.downloader.generateDateGrid(
        year,
        this.config.frequency
      )
      const discoveredDistricts = new Set<string>()

      for (const date of dates) {
        if (this.aborted) break

        const key = buildCsvPathFromReport(
          this.config.outputDir,
          date,
          'districtsummary'
        )

        // Resume: skip if already stored
        if (this.config.resume) {
          const cached = await this.storage.exists(key)
          if (cached) {
            this.progress.completed++
            try {
              const content = await this.storage.read(key)
              const districts =
                this.downloader.parseDistrictsFromSummary(content)
              for (const d of districts) discoveredDistricts.add(d)
            } catch {
              // Read failed, will re-download
            }
            continue
          }
        }

        try {
          const result = await this.downloader.downloadCsv({
            programYear: year,
            reportType: 'districtsummary',
            date,
            monthEndDate: computeMonthEndDate(date),
            pathStyle,
          })

          requestsMade++
          this.progress.completed++
          this.progress.requestsMade = requestsMade

          const disposition = this.acceptDownload({
            content: result.content,
            programYear: year,
            date,
            pathStyle,
            url: result.url,
            context: { phase: 1, year },
          })
          if (disposition === 'skip') {
            emptySkipped++
            continue
          }

          // Save to storage
          await this.storage.write(key, result.content)

          // Parse districts from this summary
          const districts = this.downloader.parseDistrictsFromSummary(
            result.content
          )
          for (const d of districts) discoveredDistricts.add(d)

          logger.info('Phase 1 progress', {
            year,
            date: date.toISOString().split('T')[0],
            completed: this.progress.completed,
            total: this.progress.total,
            districtsFound: discoveredDistricts.size,
          })
        } catch (error) {
          if (error instanceof BackfillContentMismatchError) mismatches++
          logger.error('Phase 1: failed to download summary', {
            year,
            date: date.toISOString().split('T')[0],
            error,
          })
        }
      }

      const sortedDistricts = Array.from(discoveredDistricts).sort((a, b) => {
        const numA = parseInt(a, 10)
        const numB = parseInt(b, 10)
        if (isNaN(numA) && isNaN(numB)) return a.localeCompare(b)
        if (isNaN(numA)) return 1
        if (isNaN(numB)) return -1
        return numA - numB
      })

      districtsPerYear[year] = sortedDistricts

      logger.info('Phase 1: year complete', {
        year,
        districtsDiscovered: sortedDistricts.length,
      })
    }

    const totalDistricts = Object.values(districtsPerYear).reduce(
      (sum, d) => sum + d.length,
      0
    )

    return {
      districtsPerYear,
      totalDistricts,
      requestsMade,
      emptySkipped,
      mismatches,
    }
  }

  /**
   * Phase 2: Collection — download per-district CSVs for all discovered districts.
   */
  async runPhase2Collection(
    districtsPerYear: Record<string, string[]>
  ): Promise<{
    requestsMade: number
    errors: number
    emptySkipped: number
    mismatches: number
  }> {
    const reportTypes: ReportType[] = [
      'districtperformance',
      'divisionperformance',
      'clubperformance',
    ]
    const liveProgramYear = await this.getLiveProgramYear()
    let requestsMade = 0
    let errors = 0
    let emptySkipped = 0
    let mismatches = 0

    // Calculate total
    let total = 0
    for (const [year, districts] of Object.entries(districtsPerYear)) {
      const dates = this.downloader.generateDateGrid(
        year,
        this.config.frequency
      )
      total += districts.length * reportTypes.length * dates.length
    }

    this.progress = {
      phase: 2,
      total,
      completed: 0,
      currentYear: '',
      requestsMade: 0,
      startTime: Date.now(),
    }

    logger.info('Phase 2: Collection starting', {
      totalRequests: total,
      estimate: this.estimateTime(total, this.config.ratePerSecond),
    })

    // Track all dates touched for metadata generation
    const datesTouched = new Map<
      string,
      { date: Date; districtIds: Set<string> }
    >()

    for (const [year, districts] of Object.entries(districtsPerYear)) {
      if (this.aborted) break

      this.progress.currentYear = year
      const pathStyle = resolveExportPathStyle(year, liveProgramYear)
      const dates = this.downloader.generateDateGrid(
        year,
        this.config.frequency
      )

      for (const districtId of districts) {
        if (this.aborted) break

        this.progress.currentDistrict = districtId

        for (const reportType of reportTypes) {
          for (const date of dates) {
            if (this.aborted) break

            const key = buildCsvPathFromReport(
              this.config.outputDir,
              date,
              reportType,
              districtId
            )

            // Resume: skip if already stored
            if (this.config.resume) {
              const cached = await this.storage.exists(key)
              if (cached) {
                this.progress.completed++
                continue
              }
            }

            try {
              const result = await this.downloader.downloadCsv({
                programYear: year,
                reportType,
                districtId,
                date,
                monthEndDate: computeMonthEndDate(date),
                pathStyle,
              })

              requestsMade++
              this.progress.completed++
              this.progress.requestsMade = requestsMade

              const disposition = this.acceptDownload({
                content: result.content,
                programYear: year,
                date,
                pathStyle,
                url: result.url,
                context: { phase: 2, year, districtId, reportType },
              })
              if (disposition === 'skip') {
                emptySkipped++
                continue
              }

              await this.storage.write(key, result.content)

              // Track this date + district for metadata
              const dateKey = toYYYYMMDD(date)
              if (!datesTouched.has(dateKey)) {
                datesTouched.set(dateKey, { date, districtIds: new Set() })
              }
              datesTouched.get(dateKey)!.districtIds.add(districtId)

              if (this.progress.completed % 100 === 0) {
                logger.info('Phase 2 progress', {
                  year,
                  districtId,
                  reportType,
                  completed: this.progress.completed,
                  total,
                  percentComplete: (
                    (this.progress.completed / total) *
                    100
                  ).toFixed(1),
                })
              }
            } catch (error) {
              errors++
              if (error instanceof BackfillContentMismatchError) mismatches++
              logger.error('Phase 2: failed to download', {
                year,
                districtId,
                reportType,
                date: date.toISOString().split('T')[0],
                error,
              })
            }
          }
        }
      }
    }

    // Write metadata.json for each date touched
    for (const [dateKey, { date, districtIds }] of datesTouched) {
      try {
        const metadataPath = buildMetadataPath(this.config.outputDir, date)
        const metadata = buildBackfillMetadata(
          date,
          Array.from(districtIds).sort()
        )
        await this.storage.write(
          metadataPath,
          JSON.stringify(metadata, null, 2)
        )
        logger.info('Wrote metadata.json', {
          date: dateKey,
          districts: districtIds.size,
        })
      } catch (error) {
        logger.error('Failed to write metadata.json', { date: dateKey, error })
      }
    }

    return { requestsMade, errors, emptySkipped, mismatches }
  }

  /**
   * Run the full backfill pipeline.
   */
  async run(): Promise<void> {
    const scope = this.calculateScope()
    const phase = this.config.phase ?? 'all'

    logger.info('Backfill starting', {
      startYear: this.config.startYear,
      endYear: this.config.endYear,
      frequency: this.config.frequency,
      ratePerSecond: this.config.ratePerSecond,
      outputDir: this.config.outputDir,
      phase,
      programYears: scope.programYears.length,
      datesPerYear: scope.datesPerYear,
    })

    // Set up graceful shutdown
    const handler = (): void => {
      logger.info(
        'Received SIGINT — finishing current request and saving progress...'
      )
      this.aborted = true
    }
    process.on('SIGINT', handler)

    try {
      // Pre-warm GCS cache if using GCS storage (converts O(N) HEAD → O(1) SET lookups)
      if (this.config.resume && 'warmCache' in this.storage) {
        const gcsStorage = this.storage as GcsBackfillStorage
        logger.info('Warming GCS cache — listing existing objects...')
        const cachedCount = await gcsStorage.warmCache(this.config.outputDir)
        logger.info('GCS cache warmed', { existingFiles: cachedCount })
      }

      // Phase 1: Discovery
      const phase1Result = await this.runPhase1Discovery()
      logger.info('Phase 1 complete', {
        districtsPerYear: Object.fromEntries(
          Object.entries(phase1Result.districtsPerYear).map(([y, d]) => [
            y,
            d.length,
          ])
        ),
        totalDistricts: phase1Result.totalDistricts,
        requestsMade: phase1Result.requestsMade,
        emptySkipped: phase1Result.emptySkipped,
        mismatches: phase1Result.mismatches,
      })

      if (phase === 'discover') {
        logger.info('Discovery-only mode — stopping after Phase 1')
        return
      }

      if (this.aborted) {
        logger.info('Aborted after Phase 1')
        return
      }

      // Phase 2: Collection
      const phase2Result = await this.runPhase2Collection(
        phase1Result.districtsPerYear
      )
      logger.info('Phase 2 complete', {
        requestsMade: phase2Result.requestsMade,
        errors: phase2Result.errors,
        emptySkipped: phase2Result.emptySkipped,
        mismatches: phase2Result.mismatches,
      })

      if (phase === 'collect' || this.aborted) {
        logger.info('Collection complete — run transform separately')
        return
      }

      // Phase 3: Transform (placeholder — runs existing pipeline)
      logger.info(
        'Phase 3: Transform — run the existing transform pipeline on collected data'
      )
    } finally {
      process.removeListener('SIGINT', handler)
    }
  }

  getProgress(): BackfillProgress {
    return { ...this.progress }
  }

  abort(): void {
    this.aborted = true
  }
}
