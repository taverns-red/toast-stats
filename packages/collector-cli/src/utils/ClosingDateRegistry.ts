/**
 * ClosingDateRegistry — Auto-maintain month-end-closing-dates.json (#203)
 *
 * Reads, appends, deduplicates, and writes closing date entries to the
 * docs/month-end-closing-dates.json registry. Used by the daily pipeline
 * to auto-detect new closing periods and persist them.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Logger } from '@toastmasters/analytics-core'

/**
 * A single closing date entry
 */
export interface ClosingDateEntry {
  dataMonth: string // e.g. "2026-01"
  closingDate: string // e.g. "2026-02-13"
}

/**
 * The full registry file format
 */
export interface ClosingDateRegistryFile {
  generatedAt: string
  description: string
  note?: string
  months: ClosingDateEntry[]
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

export class ClosingDateRegistry {
  private readonly registryPath: string
  private readonly logger: Logger

  constructor(options: { projectRoot: string; logger?: Logger }) {
    this.registryPath = path.join(
      options.projectRoot,
      'docs',
      'month-end-closing-dates.json'
    )
    this.logger = options.logger ?? noopLogger
  }

  /**
   * Read the current registry from disk.
   *
   * Returns an empty registry if the file doesn't exist or is corrupt.
   */
  async read(): Promise<ClosingDateRegistryFile> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8')
      const parsed = JSON.parse(content) as ClosingDateRegistryFile

      if (!Array.isArray(parsed.months)) {
        this.logger.warn('Registry months is not an array, treating as empty')
        return this.emptyRegistry()
      }

      return parsed
    } catch (error) {
      const err = error as { code?: string }
      if (err.code === 'ENOENT') {
        this.logger.debug('Registry file not found, creating empty')
        return this.emptyRegistry()
      }

      this.logger.warn('Failed to read registry, treating as empty', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return this.emptyRegistry()
    }
  }

  /**
   * Append a new closing date entry.
   *
   * - Deduplicates by dataMonth (last-write-wins for the same month)
   * - Sorts entries by dataMonth
   * - Writes atomically (write-rename pattern)
   *
   * @returns true if a new entry was added, false if it was a duplicate
   */
  async append(entry: ClosingDateEntry): Promise<boolean> {
    const registry = await this.read()

    // Check for exact duplicate (same dataMonth AND same closingDate)
    const existingExact = registry.months.find(
      m =>
        m.dataMonth === entry.dataMonth && m.closingDate === entry.closingDate
    )
    if (existingExact) {
      this.logger.debug('Closing date already in registry, skipping', {
        dataMonth: entry.dataMonth,
        closingDate: entry.closingDate,
      })
      return false
    }

    // If same dataMonth but different closingDate, update it
    const existingMonth = registry.months.find(
      m => m.dataMonth === entry.dataMonth
    )
    if (existingMonth) {
      this.logger.info('Updating closing date for existing month', {
        dataMonth: entry.dataMonth,
        oldClosingDate: existingMonth.closingDate,
        newClosingDate: entry.closingDate,
      })
      existingMonth.closingDate = entry.closingDate
    } else {
      registry.months.push(entry)
    }

    // Sort by dataMonth
    registry.months.sort((a, b) => a.dataMonth.localeCompare(b.dataMonth))

    // Update timestamp
    registry.generatedAt = new Date().toISOString()

    await this.write(registry)
    return true
  }

  /**
   * Write registry atomically (write-rename)
   */
  private async write(registry: ClosingDateRegistryFile): Promise<void> {
    const content = JSON.stringify(registry, null, 2) + '\n'
    const tempPath = `${this.registryPath}.tmp.${Date.now()}`

    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, this.registryPath)

    this.logger.info('Registry updated', {
      path: this.registryPath,
      totalMonths: registry.months.length,
    })
  }

  private emptyRegistry(): ClosingDateRegistryFile {
    return {
      generatedAt: new Date().toISOString(),
      description:
        'Month-end closing dates derived from raw-csv metadata. Each entry maps a Toastmasters data month (YYYY-MM) to the last closing-period collection date in raw-csv/.',
      months: [],
    }
  }
}
