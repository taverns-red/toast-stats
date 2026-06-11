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
 *
 * Fail-closed rule (#1131): a date with NO metadata.json can never prove its
 * raw→snapshot mapping, so it is never classified deletable. The closing-date
 * registry (docs/month-end-closing-dates.json) refines the verdict for dates
 * inside a known closing window.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Logger } from '@toastmasters/analytics-core'
import {
  ClosingPeriodDetector,
  type ClosingPeriodInfo,
} from '../utils/ClosingPeriodDetector.js'
import type { CacheMetadata } from '../types/collector.js'
import type { ClosingDateEntry } from '../utils/ClosingDateRegistry.js'
import { resolveClosingWindow } from '../utils/closingWindowResolver.js'
import {
  evaluatePruneClosingGuard,
  type PruneClosingGuardVerdict,
} from '../utils/pruneClosingGuard.js'

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
 * Layer scope of a prune run (#1132): which GCS/cache layers the prune may
 * delete from, and which derived layers are retained by design. Reported in
 * every prune result so the retention asymmetry is never a silent gap.
 */
export interface PruneLayerScope {
  pruned: string[]
  retained: string[]
  note: string
}

/**
 * The one layer-scope statement every prune result carries (#1132).
 * Mirrors scripts/lib/pruneGcsDeletions.ts PRUNE_DELETABLE_LAYERS /
 * PRUNE_RETAINED_LAYERS — kept duplicated because scripts/ must not depend
 * on this package's build (Lesson 140); each side pins the values in tests.
 */
export const PRUNE_LAYER_SCOPE: PruneLayerScope = {
  pruned: ['raw-csv', 'snapshots'],
  retained: ['time-series', 'club-trends', 'v1/rank-history'],
  note: 'Derived layers retained by design (#1132) — trend surfaces keep full daily resolution',
}

/**
 * Result of a prune operation
 */
export interface PruneResult {
  success: boolean
  /**
   * Closing-period guard verdict for the run date (#1133). A destructive
   * run with `allowed: false` is refused before any classification; a
   * dry-run proceeds (read-only) but carries the refused verdict so the
   * operator knows a real run would block.
   */
  closingGuard: PruneClosingGuardVerdict
  /** True when the closing-period guard refused this destructive run (#1133). */
  blocked: boolean
  /** Layer scope of this run — retained derived layers stated explicitly (#1132). */
  layerScope: PruneLayerScope
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

/**
 * Check if a date string (YYYY-MM-DD) is the penultimate (second-to-last) day of its month.
 *
 * Examples: Jan 30, Feb 27 (non-leap), Feb 28 (leap), Mar 30, Apr 29
 */
export function isPenultimateDayOfMonth(dateStr: string): boolean {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  if (!yearStr || !monthStr || !dayStr) return false

  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) return false

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day === lastDay - 1
}

export class PruneService {
  private readonly cacheDir: string
  private readonly logger: Logger
  private readonly closingPeriodDetector: ClosingPeriodDetector
  private readonly closingDateRegistry: ClosingDateEntry[]
  private readonly today: string

  constructor(options: {
    cacheDir: string
    logger?: Logger
    /** Registry months from docs/month-end-closing-dates.json (#1131) */
    closingDateRegistry?: ClosingDateEntry[]
    /**
     * Run date (YYYY-MM-DD) for the closing-period guard (#1133).
     * Injectable for tests; defaults to the current UTC date.
     */
    today?: string
  }) {
    this.cacheDir = options.cacheDir
    this.logger = options.logger ?? noopLogger
    this.closingPeriodDetector = new ClosingPeriodDetector()
    this.closingDateRegistry = options.closingDateRegistry ?? []
    this.today = options.today ?? new Date().toISOString().slice(0, 10)
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
   *
   * Keeps both month-end AND penultimate dates (#203).
   */
  async classifyDate(rawCsvDate: string): Promise<DateClassification> {
    const metadata = await this.readMetadata(rawCsvDate)

    // No metadata.json → the raw→snapshot mapping is unprovable. Deletion is
    // irreversible, so fail closed: never classify deletable (#1131). The
    // registry (the third authority in the #1129 chain) refines the verdict:
    // a date inside a known closing window remaps to its month-end snapshot.
    if (metadata === null) {
      return this.classifyMetadataLessDate(rawCsvDate)
    }

    const closingInfo: ClosingPeriodInfo = this.closingPeriodDetector.detect(
      rawCsvDate,
      metadata
    )

    // Lesson 158: legacy metadata may carry a laundered isClosingPeriod:false
    // (a parser default persisted as a decision). When it contradicts a
    // registry closing window, warn — the keep rules stay unchanged, but the
    // operator should verify the date before trusting a deletion of it.
    if (
      !closingInfo.isClosingPeriod &&
      resolveClosingWindow(rawCsvDate, this.closingDateRegistry).kind ===
        'closing'
    ) {
      this.logger.warn(
        `Metadata for ${rawCsvDate} says non-closing, but the date falls inside a registry closing window — possible laundered default (#1129/#1131); verify before trusting its deletion`
      )
    }

    const snapshotDate = closingInfo.snapshotDate
    const isMonthEnd = isLastDayOfMonth(snapshotDate)
    const isPenultimate = isPenultimateDayOfMonth(snapshotDate)
    const keep = isMonthEnd || isPenultimate

    return {
      rawCsvDate,
      snapshotDate,
      isClosingPeriod: closingInfo.isClosingPeriod,
      isMonthEnd,
      keep,
      reason: isMonthEnd
        ? `Month-end snapshot (${snapshotDate})`
        : isPenultimate
          ? `Penultimate snapshot (${snapshotDate})`
          : `Non-month-end snapshot (${snapshotDate})`,
    }
  }

  /**
   * Classify a raw-csv date that has no metadata.json (#1131).
   *
   * Always protected (keep = true): without metadata the raw→snapshot
   * mapping cannot be proven, and prune deletes irreversibly. The
   * closing-date registry refines the verdict:
   * - inside a closing window → remap to the data month's month-end
   *   (ClosingPeriodDetector owns the last-day math)
   * - non-closing / unknown → snapshot date stays the raw date
   */
  private classifyMetadataLessDate(rawCsvDate: string): DateClassification {
    const verdict = resolveClosingWindow(rawCsvDate, this.closingDateRegistry)

    if (verdict.kind === 'closing') {
      const closingInfo = this.closingPeriodDetector.detect(rawCsvDate, {
        date: rawCsvDate,
        isClosingPeriod: true,
        dataMonth: verdict.dataMonth,
      })
      return {
        rawCsvDate,
        snapshotDate: closingInfo.snapshotDate,
        isClosingPeriod: true,
        isMonthEnd: isLastDayOfMonth(closingInfo.snapshotDate),
        keep: true,
        reason: `Protected: no metadata.json; registry closing window for ${verdict.dataMonth} maps to ${closingInfo.snapshotDate} (#1131)`,
      }
    }

    const detail =
      verdict.kind === 'unknown'
        ? `closing status undecidable (${verdict.reason})`
        : 'registry says non-closing, but the mapping is unproven without metadata'

    return {
      rawCsvDate,
      snapshotDate: rawCsvDate,
      isClosingPeriod: false,
      isMonthEnd: isLastDayOfMonth(rawCsvDate),
      keep: true,
      reason: `Protected: no metadata.json — ${detail}; refusing irreversible delete (#1131)`,
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

    // Closing-period guard (#1133/#1037): a destructive prune must never
    // run while TI is still reconciling the previous month. Fail closed —
    // 'closing' and 'unknown' both refuse. Dry-run is read-only, so it
    // proceeds, carrying the verdict for the operator.
    const closingGuard = evaluatePruneClosingGuard(
      this.today,
      this.closingDateRegistry
    )
    if (!closingGuard.allowed) {
      if (!dryRun) {
        this.logger.error(closingGuard.reason)
        return {
          success: false,
          closingGuard,
          blocked: true,
          layerScope: PRUNE_LAYER_SCOPE,
          totalDates: 0,
          keptDates: 0,
          prunedDates: 0,
          classifications: [],
          deletedRawCsv: [],
          deletedSnapshots: [],
          errors: [closingGuard.reason],
          duration_ms: Date.now() - startTime,
        }
      }
      this.logger.warn(
        `Dry-run proceeding, but a destructive prune would be refused: ${closingGuard.reason}`
      )
    }

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
      closingGuard,
      blocked: false,
      layerScope: PRUNE_LAYER_SCOPE,
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
