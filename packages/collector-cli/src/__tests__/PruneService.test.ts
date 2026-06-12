import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  PruneService,
  isLastDayOfMonth,
  isPenultimateDayOfMonth,
} from '../services/PruneService.js'
import type { ClosingDateEntry } from '../utils/ClosingDateRegistry.js'
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

  /**
   * Helper: create a raw-csv date WITHOUT metadata.json (#1131)
   */
  async function createRawCsvDateWithoutMetadata(date: string): Promise<void> {
    const dateDir = path.join(testDir, 'raw-csv', date)
    await fs.mkdir(dateDir, { recursive: true })
    await fs.writeFile(path.join(dateDir, 'all-districts.csv'), 'dummy')
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

    it('classifies a penultimate day as keeper (#203)', async () => {
      // Jan 30 is penultimate (day before Jan 31)
      await createRawCsvDate('2026-01-30')
      const service = new PruneService({ cacheDir: testDir })

      const result = await service.classifyDate('2026-01-30')

      expect(result.keep).toBe(true)
      expect(result.isMonthEnd).toBe(false)
      expect(result.reason).toContain('Penultimate')
    })
  })

  describe('metadata-less date protection (#1131)', () => {
    // Mirrors docs/month-end-closing-dates.json entries relevant to the
    // 2026-01/2026-02 window (corrected by #1128: 2026-01 closes 2026-02-05).
    const registryMonths: ClosingDateEntry[] = [
      { dataMonth: '2025-12', closingDate: '2026-01-08' },
      { dataMonth: '2026-01', closingDate: '2026-02-05' },
    ]

    it('protects a metadata-less date inside a registry closing window and remaps it to month-end', async () => {
      // 2026-02-03 ≤ 2026-01's closingDate 2026-02-05 → inside the window
      await createRawCsvDateWithoutMetadata('2026-02-03')
      const service = new PruneService({
        cacheDir: testDir,
        closingDateRegistry: registryMonths,
      })

      const result = await service.classifyDate('2026-02-03')

      expect(result.keep).toBe(true)
      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2026-01-31')
      expect(result.reason).toContain('Protected')
    })

    it('protects a metadata-less date even when the registry says non-closing (mapping unprovable)', async () => {
      // 2026-02-13 > 2026-02-05 → registry verdict is non-closing, but with
      // no metadata.json the raw→snapshot mapping is unproven. An
      // irreversible delete must fail closed (this is the live
      // gs://…/raw-csv/2026-02-13 case from the #1036 audit).
      await createRawCsvDateWithoutMetadata('2026-02-13')
      const service = new PruneService({
        cacheDir: testDir,
        closingDateRegistry: registryMonths,
      })

      const result = await service.classifyDate('2026-02-13')

      expect(result.keep).toBe(true)
      expect(result.isClosingPeriod).toBe(false)
      expect(result.snapshotDate).toBe('2026-02-13')
      expect(result.reason).toContain('Protected')
    })

    it('protects a metadata-less date when the registry has no entry for the window (unknown)', async () => {
      await createRawCsvDateWithoutMetadata('2024-05-15')
      const service = new PruneService({
        cacheDir: testDir,
        closingDateRegistry: registryMonths,
      })

      const result = await service.classifyDate('2024-05-15')

      expect(result.keep).toBe(true)
      expect(result.reason).toContain('Protected')
    })

    it('protects metadata-less dates when no registry is provided at all', async () => {
      await createRawCsvDateWithoutMetadata('2026-02-13')
      const service = new PruneService({ cacheDir: testDir })

      const result = await service.classifyDate('2026-02-13')

      expect(result.keep).toBe(true)
      expect(result.reason).toContain('Protected')
    })

    it('remaps a metadata-less January date across the year boundary (Dec window)', async () => {
      // 2026-01-05 ≤ 2025-12's closingDate 2026-01-08 → December's window
      await createRawCsvDateWithoutMetadata('2026-01-05')
      const service = new PruneService({
        cacheDir: testDir,
        closingDateRegistry: registryMonths,
      })

      const result = await service.classifyDate('2026-01-05')

      expect(result.keep).toBe(true)
      expect(result.isClosingPeriod).toBe(true)
      expect(result.snapshotDate).toBe('2025-12-31')
    })

    it('warns when metadata says non-closing but the date sits inside a registry closing window (Lesson 158)', async () => {
      // Laundered default: a footer-less legacy scrape persisted
      // isClosingPeriod:false. Keep rules stay unchanged — but the
      // contradiction must be surfaced.
      await createRawCsvDate('2026-02-03', { isClosingPeriod: false })
      const warn = vi.fn()
      const service = new PruneService({
        cacheDir: testDir,
        closingDateRegistry: registryMonths,
        logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() },
      })

      const result = await service.classifyDate('2026-02-03')

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('registry closing window')
      )
      // Keep rules unchanged: trusted metadata still classifies by raw date
      expect(result.keep).toBe(false)
    })
  })

  describe('prune', () => {
    // Guard-satisfying context (#1133): today is past May-2026's closing
    // window, so destructive prune mechanics can be exercised.
    const NON_CLOSING = {
      today: '2026-06-20',
      closingDateRegistry: [
        { dataMonth: '2026-05', closingDate: '2026-06-05' },
      ] as ClosingDateEntry[],
    }

    it('deletes non-month-end raw-csv and snapshot directories', async () => {
      // Month-end keeper
      await createRawCsvDate('2026-01-31')
      await createSnapshotDate('2026-01-31')
      // Mid-month non-keeper
      await createRawCsvDate('2026-01-15')
      await createSnapshotDate('2026-01-15')

      const service = new PruneService({ cacheDir: testDir, ...NON_CLOSING })
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

    it('reports the layer scope so retained derived layers are never a silent gap (#1132)', async () => {
      await createRawCsvDate('2026-01-15')

      const service = new PruneService({ cacheDir: testDir, ...NON_CLOSING })
      const dryRun = await service.prune(true)
      const execute = await service.prune(false)

      const expectedScope = {
        pruned: ['raw-csv', 'snapshots'],
        retained: ['time-series', 'club-trends', 'v1/rank-history'],
        note: 'Derived layers retained by design (#1132) — trend surfaces keep full daily resolution',
      }
      expect(dryRun.layerScope).toEqual(expectedScope)
      expect(execute.layerScope).toEqual(expectedScope)
    })

    it('never deletes under time-series/, club-trends/, or v1/rank-history/ (#1132 guard)', async () => {
      // A prunable mid-month date
      await createRawCsvDate('2026-01-15')
      await createSnapshotDate('2026-01-15')

      // Seed derived layers — including dirs named after the prunable date,
      // the exact shape a future "thin the derived layers too" regression
      // would reach for.
      const derivedFiles = [
        'time-series/d61/2026-01-15.json',
        'club-trends/2026-01-15/district_61.json',
        'v1/rank-history/61.json',
      ]
      for (const rel of derivedFiles) {
        const abs = path.join(testDir, rel)
        await fs.mkdir(path.dirname(abs), { recursive: true })
        await fs.writeFile(abs, '{}')
      }

      const service = new PruneService({ cacheDir: testDir, ...NON_CLOSING })
      const result = await service.prune(false)

      // The prunable date is gone from the deletable layers…
      expect(result.deletedRawCsv).toEqual(['2026-01-15'])
      expect(result.deletedSnapshots).toEqual(['2026-01-15'])

      // …while every derived-layer file survives untouched.
      for (const rel of derivedFiles) {
        await expect(
          fs.access(path.join(testDir, rel))
        ).resolves.toBeUndefined()
      }
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

      const service = new PruneService({ cacheDir: testDir, ...NON_CLOSING })
      const result = await service.prune(false)

      expect(result.keptDates).toBe(1)
      expect(result.prunedDates).toBe(1)
      expect(result.deletedRawCsv).toContain('2026-02-05')
      expect(result.deletedSnapshots).toContain('2026-02-05')
    })

    it('never deletes a protected metadata-less date (#1131)', async () => {
      // Metadata-less: classification is unprovable → protected
      await createRawCsvDateWithoutMetadata('2026-02-13')
      await createSnapshotDate('2026-02-13')
      // Metadata-full mid-month: still prunes (keep rules unchanged)
      await createRawCsvDate('2026-03-15')
      await createSnapshotDate('2026-03-15')

      const service = new PruneService({
        cacheDir: testDir,
        today: NON_CLOSING.today,
        closingDateRegistry: [
          ...NON_CLOSING.closingDateRegistry,
          { dataMonth: '2026-01', closingDate: '2026-02-05' },
        ],
      })
      const result = await service.prune(false)

      expect(result.keptDates).toBe(1)
      expect(result.prunedDates).toBe(1)
      expect(result.deletedRawCsv).toEqual(['2026-03-15'])

      const rawCsvEntries = await fs.readdir(path.join(testDir, 'raw-csv'))
      expect(rawCsvEntries).toContain('2026-02-13')
      const snapshotEntries = await fs.readdir(path.join(testDir, 'snapshots'))
      expect(snapshotEntries).toContain('2026-02-13')
    })

    describe('closing-period guard (#1133)', () => {
      // Registry: May 2026 closed on 2026-06-05.
      const MAY_CLOSED: ClosingDateEntry[] = [
        { dataMonth: '2026-05', closingDate: '2026-06-05' },
      ]

      it('refuses a destructive prune while today is inside a closing window', async () => {
        await createRawCsvDate('2026-01-15') // prunable if the run proceeded
        await createSnapshotDate('2026-01-15')

        const service = new PruneService({
          cacheDir: testDir,
          closingDateRegistry: MAY_CLOSED,
          today: '2026-06-03', // inside May's closing window
        })
        const result = await service.prune(false)

        expect(result.success).toBe(false)
        expect(result.blocked).toBe(true)
        expect(result.closingGuard.allowed).toBe(false)
        expect(result.closingGuard.windowVerdict).toBe('closing')
        expect(result.deletedRawCsv).toHaveLength(0)
        expect(result.deletedSnapshots).toHaveLength(0)
        expect(result.errors.join(' ')).toContain('closing')

        // Nothing was touched on disk.
        const rawCsvEntries = await fs.readdir(path.join(testDir, 'raw-csv'))
        expect(rawCsvEntries).toContain('2026-01-15')
      })

      it('refuses a destructive prune when the registry cannot decide (fail closed)', async () => {
        await createRawCsvDate('2026-01-15')

        const service = new PruneService({
          cacheDir: testDir,
          closingDateRegistry: [], // no entry for the previous month
          today: '2026-06-11',
        })
        const result = await service.prune(false)

        expect(result.blocked).toBe(true)
        expect(result.closingGuard.windowVerdict).toBe('unknown')
        expect(result.deletedRawCsv).toHaveLength(0)
      })

      it('lets a dry-run proceed during a closing window but surfaces the refused verdict', async () => {
        await createRawCsvDate('2026-01-15')
        await createSnapshotDate('2026-01-15')

        const service = new PruneService({
          cacheDir: testDir,
          closingDateRegistry: MAY_CLOSED,
          today: '2026-06-03',
        })
        const result = await service.prune(true)

        expect(result.blocked).toBe(false) // dry-run is read-only — it ran
        expect(result.closingGuard.allowed).toBe(false) // …but a real run would refuse
        expect(result.prunedDates).toBe(1)
        expect(result.deletedRawCsv).toHaveLength(0)
      })

      it('allows a destructive prune once today is past the closing window', async () => {
        await createRawCsvDate('2026-01-15')
        await createSnapshotDate('2026-01-15')

        const service = new PruneService({
          cacheDir: testDir,
          closingDateRegistry: MAY_CLOSED,
          today: '2026-06-11', // after 2026-06-05
        })
        const result = await service.prune(false)

        expect(result.blocked).toBe(false)
        expect(result.closingGuard.allowed).toBe(true)
        expect(result.closingGuard.windowVerdict).toBe('non-closing')
        expect(result.deletedRawCsv).toEqual(['2026-01-15'])
      })
    })

    it('retains both month-end AND penultimate dates (#203)', async () => {
      // Month-end: Jan 31
      await createRawCsvDate('2026-01-31')
      await createSnapshotDate('2026-01-31')
      // Penultimate: Jan 30
      await createRawCsvDate('2026-01-30')
      await createSnapshotDate('2026-01-30')
      // Mid-month: Jan 15 (should be pruned)
      await createRawCsvDate('2026-01-15')
      await createSnapshotDate('2026-01-15')

      const service = new PruneService({ cacheDir: testDir, ...NON_CLOSING })
      const result = await service.prune(false)

      expect(result.keptDates).toBe(2) // Jan 31 + Jan 30
      expect(result.prunedDates).toBe(1) // Jan 15

      const rawCsvEntries = await fs.readdir(path.join(testDir, 'raw-csv'))
      expect(rawCsvEntries).toContain('2026-01-30')
      expect(rawCsvEntries).toContain('2026-01-31')
      expect(rawCsvEntries).not.toContain('2026-01-15')
    })
  })

  describe('in-progress month exemption (#1178)', () => {
    // The dry-run v3 failure class: June dailies with no June month-end yet
    // were classified deletable, which would regress staging's latest
    // snapshot to 2026-05-31 and propagate to prod. The keep rule must
    // exempt every date after the most recent completed month-end.
    const ctx = {
      today: '2026-06-12',
      closingDateRegistry: [
        { dataMonth: '2026-05', closingDate: '2026-06-05' },
      ] as ClosingDateEntry[],
    }

    /** April + May fully closed (month-end + penultimate + a daily each). */
    async function createCompletedAprilMay(): Promise<void> {
      for (const date of [
        '2026-04-15',
        '2026-04-29',
        '2026-04-30',
        '2026-05-15',
        '2026-05-30',
        '2026-05-31',
      ]) {
        await createRawCsvDate(date)
        await createSnapshotDate(date)
      }
    }

    it('keeps every current-month daily when the month has no month-end snapshot yet', async () => {
      await createCompletedAprilMay()
      const juneDailies = ['2026-06-06', '2026-06-08', '2026-06-10']
      for (const date of juneDailies) {
        await createRawCsvDate(date)
        await createSnapshotDate(date)
      }

      const service = new PruneService({ cacheDir: testDir, ...ctx })
      const classifications = await service.classifyAll()
      const byDate = new Map(classifications.map(c => [c.rawCsvDate, c]))

      // Every June daily is kept, with an explicit in-progress-month reason.
      for (const date of juneDailies) {
        expect(byDate.get(date)?.keep).toBe(true)
        expect(byDate.get(date)?.reason).toMatch(/in-progress month/i)
        expect(byDate.get(date)?.reason).toContain('2026-05-31')
      }

      // Completed-month behavior unchanged: April/May dailies still thinned,
      // month-end and penultimate keeps keep their original reasons.
      expect(byDate.get('2026-04-15')?.keep).toBe(false)
      expect(byDate.get('2026-05-15')?.keep).toBe(false)
      expect(byDate.get('2026-05-31')?.reason).toContain('Month-end')
      expect(byDate.get('2026-05-30')?.reason).toContain('Penultimate')

      // No silent keeps: every classification carries a non-empty reason.
      for (const c of classifications) {
        expect(c.reason.length).toBeGreaterThan(0)
      }
    })

    it('keeps everything when no month-end snapshot exists anywhere (fail closed)', async () => {
      for (const date of ['2026-06-06', '2026-06-08', '2026-06-10']) {
        await createRawCsvDate(date)
      }

      const service = new PruneService({ cacheDir: testDir, ...ctx })
      const classifications = await service.classifyAll()

      expect(classifications).toHaveLength(3)
      for (const c of classifications) {
        expect(c.keep).toBe(true)
        expect(c.reason).toMatch(/in-progress month/i)
      }
    })

    it('treats a closing-remapped month-end as the completed-month boundary', async () => {
      // raw 2026-06-03 → snapshot 2026-05-31 (May closing): May is closed,
      // so its daily is thinned, while June dailies stay protected.
      await createRawCsvDate('2026-06-03', {
        isClosingPeriod: true,
        dataMonth: '2026-05',
      })
      await createRawCsvDate('2026-05-15')
      await createRawCsvDate('2026-06-08')

      const service = new PruneService({ cacheDir: testDir, ...ctx })
      const classifications = await service.classifyAll()
      const byDate = new Map(classifications.map(c => [c.rawCsvDate, c]))

      expect(byDate.get('2026-06-03')?.snapshotDate).toBe('2026-05-31')
      expect(byDate.get('2026-06-03')?.keep).toBe(true)
      expect(byDate.get('2026-05-15')?.keep).toBe(false)
      expect(byDate.get('2026-06-08')?.keep).toBe(true)
      expect(byDate.get('2026-06-08')?.reason).toMatch(/in-progress month/i)
    })

    it('keeps a new-month daily that lands right after a completed month-end', async () => {
      await createRawCsvDate('2026-06-30')
      await createRawCsvDate('2026-07-01')

      const service = new PruneService({ cacheDir: testDir })
      const classifications = await service.classifyAll()
      const byDate = new Map(classifications.map(c => [c.rawCsvDate, c]))

      expect(byDate.get('2026-07-01')?.keep).toBe(true)
      expect(byDate.get('2026-07-01')?.reason).toMatch(/in-progress month/i)
    })

    it('a destructive prune never deletes in-progress month dates', async () => {
      await createCompletedAprilMay()
      await createRawCsvDate('2026-06-10')
      await createSnapshotDate('2026-06-10')

      const service = new PruneService({ cacheDir: testDir, ...ctx })
      const result = await service.prune(false)

      expect(result.deletedRawCsv).toEqual(['2026-04-15', '2026-05-15'])
      expect(result.deletedRawCsv).not.toContain('2026-06-10')
      expect(result.deletedSnapshots).not.toContain('2026-06-10')

      const rawCsvEntries = await fs.readdir(path.join(testDir, 'raw-csv'))
      expect(rawCsvEntries).toContain('2026-06-10')
      const snapshotEntries = await fs.readdir(path.join(testDir, 'snapshots'))
      expect(snapshotEntries).toContain('2026-06-10')
    })
  })

  describe('skeleton-shape cache contract (#1175)', () => {
    // The prune sync no longer downloads CSV payloads or snapshot contents
    // (post-#1147 the full bucket exceeds the runner's disk). The skeleton
    // sync materializes every raw-csv date dir from the `gsutil ls` listing
    // and overlays ONLY metadata.json. This contract pins that
    // classification depends on nothing the skeleton omits — and that a
    // metadata-less dir (locally an EMPTY dir under the new shape, since
    // there is no metadata.json to overlay) stays VISIBLE and protected,
    // not invisible (#1131 constraint).
    const registryMonths: ClosingDateEntry[] = [
      { dataMonth: '2025-12', closingDate: '2026-01-08' },
      { dataMonth: '2026-01', closingDate: '2026-02-05' },
    ]

    /** Same logical bucket state in both shapes. */
    async function populate(
      dir: string,
      shape: 'full' | 'skeleton'
    ): Promise<void> {
      const writeDate = async (
        date: string,
        metadata: { isClosingPeriod?: boolean; dataMonth?: string } | null
      ) => {
        const dateDir = path.join(dir, 'raw-csv', date)
        await fs.mkdir(dateDir, { recursive: true })
        if (metadata !== null) {
          await fs.writeFile(
            path.join(dateDir, 'metadata.json'),
            JSON.stringify({ date, ...metadata })
          )
        }
        if (shape === 'full') {
          await fs.writeFile(path.join(dateDir, 'all-districts.csv'), 'dummy')
          await fs.writeFile(path.join(dateDir, 'district_61.csv'), 'dummy')
        }
      }

      // Month-end keeper, mid-month non-keeper, closing-period remap,
      // and the live #1131 case: a metadata-less date dir.
      await writeDate('2026-01-31', { isClosingPeriod: false })
      await writeDate('2026-03-15', { isClosingPeriod: false })
      await writeDate('2026-02-03', {
        isClosingPeriod: true,
        dataMonth: '2026-01',
      })
      await writeDate('2026-02-13', null)

      const snapshotDir = path.join(dir, 'snapshots', '2026-01-31')
      await fs.mkdir(snapshotDir, { recursive: true })
      if (shape === 'full') {
        await fs.writeFile(path.join(snapshotDir, 'district_61.json'), '{}')
      }
    }

    it('classifies a skeleton-shape cache identically to a full-shape cache, including the metadata-less protection', async () => {
      const fullDir = path.join(testDir, 'full')
      const skeletonDir = path.join(testDir, 'skeleton')
      await populate(fullDir, 'full')
      await populate(skeletonDir, 'skeleton')

      const classify = (cacheDir: string) =>
        new PruneService({
          cacheDir,
          closingDateRegistry: registryMonths,
        }).classifyAll()

      const full = await classify(fullDir)
      const skeleton = await classify(skeletonDir)

      expect(skeleton).toEqual(full)

      // Spot-pin the decisions themselves so the equivalence can't be
      // vacuously satisfied by two empty/broken caches.
      expect(skeleton).toHaveLength(4)
      const byDate = new Map(skeleton.map(c => [c.rawCsvDate, c]))
      expect(byDate.get('2026-01-31')?.keep).toBe(true)
      expect(byDate.get('2026-03-15')?.keep).toBe(false)
      expect(byDate.get('2026-02-03')?.snapshotDate).toBe('2026-01-31')
      expect(byDate.get('2026-02-13')?.keep).toBe(true)
      expect(byDate.get('2026-02-13')?.reason).toContain('Protected')
    })

    it('dry-run prune on a skeleton cache reports the same counts as on a full cache', async () => {
      const fullDir = path.join(testDir, 'full')
      const skeletonDir = path.join(testDir, 'skeleton')
      await populate(fullDir, 'full')
      await populate(skeletonDir, 'skeleton')

      const run = (cacheDir: string) =>
        new PruneService({
          cacheDir,
          closingDateRegistry: registryMonths,
          today: '2026-06-12',
        }).prune(true)

      const full = await run(fullDir)
      const skeleton = await run(skeletonDir)

      expect(skeleton.totalDates).toBe(full.totalDates)
      expect(skeleton.keptDates).toBe(full.keptDates)
      expect(skeleton.prunedDates).toBe(full.prunedDates)
      expect(skeleton.classifications).toEqual(full.classifications)
    })
  })
})

describe('isPenultimateDayOfMonth', () => {
  it('returns true for January 30 (31-day month)', () => {
    expect(isPenultimateDayOfMonth('2026-01-30')).toBe(true)
  })

  it('returns true for February 27 (non-leap year)', () => {
    expect(isPenultimateDayOfMonth('2025-02-27')).toBe(true)
  })

  it('returns true for February 28 (leap year)', () => {
    expect(isPenultimateDayOfMonth('2024-02-28')).toBe(true)
  })

  it('returns false for February 28 (non-leap year — that is the last day)', () => {
    expect(isPenultimateDayOfMonth('2025-02-28')).toBe(false)
  })

  it('returns true for April 29 (30-day month)', () => {
    expect(isPenultimateDayOfMonth('2026-04-29')).toBe(true)
  })

  it('returns true for March 30', () => {
    expect(isPenultimateDayOfMonth('2026-03-30')).toBe(true)
  })

  it('returns false for mid-month day', () => {
    expect(isPenultimateDayOfMonth('2026-01-15')).toBe(false)
  })

  it('returns false for last day of month', () => {
    expect(isPenultimateDayOfMonth('2026-01-31')).toBe(false)
  })

  it('returns false for invalid date string', () => {
    expect(isPenultimateDayOfMonth('invalid')).toBe(false)
  })
})
