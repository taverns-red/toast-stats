import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PruneService, isLastDayOfMonth } from '../services/PruneService.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'

describe('isLastDayOfMonth', () => {
  it('returns true for January 31', () => {
    expect(isLastDayOfMonth('2026-01-31')).toBe(true)
  })

  it('returns true for February 28 (non-leap year)', () => {
    expect(isLastDayOfMonth('2025-02-28')).toBe(true)
  })

  it('returns true for February 29 (leap year)', () => {
    expect(isLastDayOfMonth('2024-02-29')).toBe(true)
  })

  it('returns false for February 28 in a leap year', () => {
    expect(isLastDayOfMonth('2024-02-28')).toBe(false)
  })

  it('returns true for December 31', () => {
    expect(isLastDayOfMonth('2026-12-31')).toBe(true)
  })

  it('returns false for January 15 (mid-month)', () => {
    expect(isLastDayOfMonth('2026-01-15')).toBe(false)
  })

  it('returns false for April 29 (not the 30th)', () => {
    expect(isLastDayOfMonth('2026-04-29')).toBe(false)
  })

  it('returns true for April 30', () => {
    expect(isLastDayOfMonth('2026-04-30')).toBe(true)
  })

  it('returns false for invalid date string', () => {
    expect(isLastDayOfMonth('invalid')).toBe(false)
  })
})

describe('PruneService', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `prune-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await fs.mkdir(path.join(testDir, 'raw-csv'), { recursive: true })
    await fs.mkdir(path.join(testDir, 'snapshots'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  /**
   * Helper: create a raw-csv date with metadata
   */
  async function createRawCsvDate(
    date: string,
    metadata?: {
      isClosingPeriod?: boolean
      dataMonth?: string
    }
  ): Promise<void> {
    const dateDir = path.join(testDir, 'raw-csv', date)
    await fs.mkdir(dateDir, { recursive: true })
    await fs.writeFile(
      path.join(dateDir, 'metadata.json'),
      JSON.stringify({
        date,
        isClosingPeriod: metadata?.isClosingPeriod ?? false,
        dataMonth: metadata?.dataMonth,
      })
    )
    // Write a dummy CSV
    await fs.writeFile(path.join(dateDir, 'all-districts.csv'), 'dummy')
  }

  /**
   * Helper: create a snapshot date directory
   */
  async function createSnapshotDate(snapshotDate: string): Promise<void> {
    const dir = path.join(testDir, 'snapshots', snapshotDate)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'district_49.json'), '{}')
  }

  describe('classifyDate', () => {
    it('classifies a non-closing-period month-end date as keeper', async () => {
      await createRawCsvDate('2026-01-31')
      const service = new PruneService({ cacheDir: testDir })

      const result = await service.classifyDate('2026-01-31')

      expect(result.keep).toBe(true)
      expect(result.isMonthEnd).toBe(true)
      expect(result.snapshotDate).toBe('2026-01-31')
    })

    it('classifies a mid-month date as non-keeper', async () => {
      await createRawCsvDate('2026-01-15')
      const service = new PruneService({ cacheDir: testDir })

      const result = await service.classifyDate('2026-01-15')

      expect(result.keep).toBe(false)
      expect(result.isMonthEnd).toBe(false)
      expect(result.snapshotDate).toBe('2026-01-15')
    })

    it('classifies a closing period date as keeper when snapshot is month-end', async () => {
      // raw-csv/2026-02-13 → snapshot 2026-01-31 (closing period for January)
      await createRawCsvDate('2026-02-13', {
        isClosingPeriod: true,
        dataMonth: '2026-01',
      })
      const service = new PruneService({ cacheDir: testDir })

      const result = await service.classifyDate('2026-02-13')

      expect(result.keep).toBe(true)
      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2026-01-31')
      expect(result.rawCsvDate).toBe('2026-02-13')
    })

    it('classifies closing period Dec→Jan cross-year correctly', async () => {
      // raw-csv/2026-01-05 → snapshot 2025-12-31 (closing period for December)
      await createRawCsvDate('2026-01-05', {
        isClosingPeriod: true,
        dataMonth: '2025-12',
      })
      const service = new PruneService({ cacheDir: testDir })

      const result = await service.classifyDate('2026-01-05')

      expect(result.keep).toBe(true)
      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2025-12-31')
    })
  })

  describe('prune', () => {
    it('deletes non-month-end raw-csv and snapshot directories', async () => {
      // Month-end keeper
      await createRawCsvDate('2026-01-31')
      await createSnapshotDate('2026-01-31')
      // Mid-month non-keeper
      await createRawCsvDate('2026-01-15')
      await createSnapshotDate('2026-01-15')

      const service = new PruneService({ cacheDir: testDir })
      const result = await service.prune(false)

      expect(result.keptDates).toBe(1)
      expect(result.prunedDates).toBe(1)
      expect(result.deletedRawCsv).toContain('2026-01-15')
      expect(result.deletedSnapshots).toContain('2026-01-15')

      // Verify files: keeper should exist, non-keeper should be gone
      const rawCsvEntries = await fs.readdir(path.join(testDir, 'raw-csv'))
      expect(rawCsvEntries).toEqual(['2026-01-31'])

      const snapshotEntries = await fs.readdir(path.join(testDir, 'snapshots'))
      expect(snapshotEntries).toEqual(['2026-01-31'])
    })

    it('dry-run mode does not delete anything', async () => {
      await createRawCsvDate('2026-01-15')
      await createSnapshotDate('2026-01-15')

      const service = new PruneService({ cacheDir: testDir })
      const result = await service.prune(true)

      expect(result.prunedDates).toBe(1)
      expect(result.deletedRawCsv).toHaveLength(0)
      expect(result.deletedSnapshots).toHaveLength(0)

      // Files should still exist
      const rawCsvEntries = await fs.readdir(path.join(testDir, 'raw-csv'))
      expect(rawCsvEntries).toContain('2026-01-15')
    })

    it('handles closing period dates — deletes raw-csv and derived snapshot', async () => {
      // Closing period: raw-csv/2026-02-13 → snapshots/2026-01-31 (keeper)
      await createRawCsvDate('2026-02-13', {
        isClosingPeriod: true,
        dataMonth: '2026-01',
      })
      await createSnapshotDate('2026-01-31')
      // Also a mid-month: raw-csv/2026-02-05 → snapshots/2026-02-05 (non-keeper)
      await createRawCsvDate('2026-02-05')
      await createSnapshotDate('2026-02-05')

      const service = new PruneService({ cacheDir: testDir })
      const result = await service.prune(false)

      expect(result.keptDates).toBe(1)
      expect(result.prunedDates).toBe(1)
      expect(result.deletedRawCsv).toContain('2026-02-05')
      expect(result.deletedSnapshots).toContain('2026-02-05')
    })
  })
})
