/**
 * PruneService — Removes non-month-end raw-csv and derived data (#181)
 *
 * Toastmasters data is relevant at month-end boundaries. Daily data
 * between month-ends can be pruned to save storage.
 *
 * IMPORTANT: raw-csv dates ≠ derived data (snapshot) dates.
 * Closing period detection maps raw-csv (collection date, e.g., 2026-02-13)
 * to snapshot date (e.g., 2026-01-31). A raw-csv date is a "month-end keeper"
 * if its derived snapshot date falls on the last day of a month.
 *
 * The prune logic:
 * 1. List all raw-csv/{date}/ directories
 * 2. For each, read metadata.json to detect closing period → snapshot date
 * 3. Keep dates whose snapshot date is a month-end (last day of month)
 * 4. Delete raw-csv/{date}/ for non-keepers
 * 5. Delete snapshots/{snapshot-date}/ for non-keepers
 * 6. Regenerate CDN manifests and indexes after pruning
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Logger } from '@toastmasters/analytics-core'
import {
  ClosingPeriodDetector,
  type ClosingPeriodInfo,
} from '../utils/ClosingPeriodDetector.js'
import type { CacheMetadata } from '../types/collector.js'

/**
 * Classification of a raw-csv date for pruning
 */
export interface DateClassification {
  /** The raw-csv collection date */
  rawCsvDate: string
  /** The derived snapshot date (may differ due to closing period) */
  snapshotDate: string
  /** Whether this is a closing period */
  isClosingPeriod: boolean
  /** Whether the snapshot date is the last day of its month */
  isMonthEnd: boolean
  /** Whether this date should be kept */
  keep: boolean
  /** Reason for keep/prune decision */
  reason: string
}

/**
 * Result of a prune operation
 */
export interface PruneResult {
  success: boolean
  totalDates: number
  keptDates: number
  prunedDates: number
  classifications: DateClassification[]
  deletedRawCsv: string[]
  deletedSnapshots: string[]
  errors: string[]
  duration_ms: number
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * Check if a date string (YYYY-MM-DD) is the last day of its month.
 */
export function isLastDayOfMonth(dateStr: string): boolean {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  if (!yearStr || !monthStr || !dayStr) return false

  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) return false

  // Last day of month N = day 0 of month N+1 (UTC)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day === lastDay
}

export class PruneService {
  private readonly cacheDir: string
  private readonly logger: Logger
  private readonly closingPeriodDetector: ClosingPeriodDetector

  constructor(options: { cacheDir: string; logger?: Logger }) {
    this.cacheDir = options.cacheDir
    this.logger = options.logger ?? noopLogger
    this.closingPeriodDetector = new ClosingPeriodDetector()
  }

  /**
   * Read metadata.json for a raw-csv date.
   */
  private async readMetadata(date: string): Promise<CacheMetadata | null> {
    const metadataPath = path.join(
      this.cacheDir,
      'raw-csv',
      date,
      'metadata.json'
    )
    try {
      const content = await fs.readFile(metadataPath, 'utf-8')
      return JSON.parse(content) as CacheMetadata
    } catch {
      return null
    }
  }

  /**
   * Classify a single raw-csv date for pruning.
   */
  async classifyDate(rawCsvDate: string): Promise<DateClassification> {
    const metadata = await this.readMetadata(rawCsvDate)
    const closingInfo: ClosingPeriodInfo = this.closingPeriodDetector.detect(
      rawCsvDate,
      metadata
    )

    const snapshotDate = closingInfo.snapshotDate
    const isMonthEnd = isLastDayOfMonth(snapshotDate)

    return {
      rawCsvDate,
      snapshotDate,
      isClosingPeriod: closingInfo.isClosingPeriod,
      isMonthEnd,
      keep: isMonthEnd,
      reason: isMonthEnd
        ? `Month-end snapshot (${snapshotDate})`
        : `Non-month-end snapshot (${snapshotDate})`,
    }
  }

  /**
   * Classify all raw-csv dates for pruning.
   */
  async classifyAll(): Promise<DateClassification[]> {
    const rawCsvDir = path.join(this.cacheDir, 'raw-csv')
    let dates: string[]

    try {
      const entries = await fs.readdir(rawCsvDir, { withFileTypes: true })
      dates = entries
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name)
        .sort()
    } catch (error) {
      const err = error as { code?: string }
      if (err.code === 'ENOENT') return []
      throw error
    }

    const classifications: DateClassification[] = []
    for (const date of dates) {
      classifications.push(await this.classifyDate(date))
    }

    return classifications
  }

  /**
   * Prune non-month-end data from the local cache.
   *
   * @param dryRun - If true, only classify and report; don't actually delete.
   */
  async prune(dryRun = false): Promise<PruneResult> {
    const startTime = Date.now()
    const classifications = await this.classifyAll()

    const kept = classifications.filter(c => c.keep)
    const pruned = classifications.filter(c => !c.keep)

    const deletedRawCsv: string[] = []
    const deletedSnapshots: string[] = []
    const errors: string[] = []

    if (!dryRun) {
      for (const c of pruned) {
        // Delete raw-csv/{date}/
        const rawCsvPath = path.join(this.cacheDir, 'raw-csv', c.rawCsvDate)
        try {
          await fs.rm(rawCsvPath, { recursive: true, force: true })
          deletedRawCsv.push(c.rawCsvDate)
          this.logger.info(`Deleted raw-csv/${c.rawCsvDate}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          errors.push(`raw-csv/${c.rawCsvDate}: ${msg}`)
        }

        // Delete snapshots/{snapshotDate}/ (derived data)
        const snapshotPath = path.join(
          this.cacheDir,
          'snapshots',
          c.snapshotDate
        )
        try {
          await fs.rm(snapshotPath, { recursive: true, force: true })
          deletedSnapshots.push(c.snapshotDate)
          this.logger.info(`Deleted snapshots/${c.snapshotDate}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          errors.push(`snapshots/${c.snapshotDate}: ${msg}`)
        }
      }
    }

    return {
      success: errors.length === 0,
      totalDates: classifications.length,
      keptDates: kept.length,
      prunedDates: pruned.length,
      classifications,
      deletedRawCsv,
      deletedSnapshots,
      errors,
      duration_ms: Date.now() - startTime,
    }
  }
}
