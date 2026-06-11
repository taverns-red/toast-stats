import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RebuildService } from '../services/RebuildService.js'
import { createRawCsvFixture } from './fixtures/rawCsvFixture.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'

describe('RebuildService', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `rebuild-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await fs.mkdir(path.join(testDir, 'raw-csv'), { recursive: true })
    await fs.mkdir(path.join(testDir, 'snapshots'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('discoverDates', () => {
    it('returns dates sorted chronologically', async () => {
      await fs.mkdir(path.join(testDir, 'raw-csv', '2026-01-15'), {
        recursive: true,
      })
      await fs.mkdir(path.join(testDir, 'raw-csv', '2025-12-31'), {
        recursive: true,
      })
      await fs.mkdir(path.join(testDir, 'raw-csv', '2026-02-10'), {
        recursive: true,
      })

      const service = new RebuildService({ cacheDir: testDir })
      const dates = await service.discoverDates()

      expect(dates).toEqual(['2025-12-31', '2026-01-15', '2026-02-10'])
    })

    it('ignores non-date directories', async () => {
      await fs.mkdir(path.join(testDir, 'raw-csv', '2026-01-15'), {
        recursive: true,
      })
      await fs.mkdir(path.join(testDir, 'raw-csv', 'not-a-date'), {
        recursive: true,
      })

      const service = new RebuildService({ cacheDir: testDir })
      const dates = await service.discoverDates()

      expect(dates).toEqual(['2026-01-15'])
    })

    it('returns empty array when no raw-csv dir', async () => {
      await fs.rm(path.join(testDir, 'raw-csv'), {
        recursive: true,
        force: true,
      })

      const service = new RebuildService({ cacheDir: testDir })
      const dates = await service.discoverDates()

      expect(dates).toEqual([])
    })
  })

  describe('generateSnapshotIndex', () => {
    it('generates flat district-id → dates index', async () => {
      // Create snapshot dirs with district files
      const d1 = path.join(testDir, 'snapshots', '2026-01-31')
      const d2 = path.join(testDir, 'snapshots', '2026-02-28')
      await fs.mkdir(d1, { recursive: true })
      await fs.mkdir(d2, { recursive: true })
      await fs.writeFile(path.join(d1, 'district_49.json'), '{}')
      await fs.writeFile(path.join(d1, 'district_61.json'), '{}')
      await fs.writeFile(path.join(d2, 'district_49.json'), '{}')

      const service = new RebuildService({ cacheDir: testDir })
      const indexPath = await service.generateSnapshotIndex()

      const index = JSON.parse(await fs.readFile(indexPath, 'utf-8'))
      expect(index['49']).toEqual(['2026-01-31', '2026-02-28'])
      expect(index['61']).toEqual(['2026-01-31'])
      // Flat format — no 'districts' wrapper
      expect(index).not.toHaveProperty('districts')
    })
  })

  describe('generateRankHistory', () => {
    it('builds per-district rank history from rankings files', async () => {
      // Create rankings in two snapshot dates
      const d1 = path.join(testDir, 'snapshots', '2026-01-31')
      const d2 = path.join(testDir, 'snapshots', '2026-02-28')
      await fs.mkdir(d1, { recursive: true })
      await fs.mkdir(d2, { recursive: true })

      const makeRankings = (date: string, score49: number, score61: number) =>
        JSON.stringify({
          rankings: [
            {
              districtId: '49',
              districtName: 'District 49',
              aggregateScore: score49,
              clubsRank: 1,
              paymentsRank: 2,
              distinguishedRank: 3,
              overallRank: 1,
            },
            {
              districtId: '61',
              districtName: 'District 61',
              aggregateScore: score61,
              clubsRank: 5,
              paymentsRank: 4,
              distinguishedRank: 6,
              overallRank: 3,
            },
          ],
          metadata: { sourceCsvDate: date, totalDistricts: 130 },
        })

      await fs.writeFile(
        path.join(d1, 'all-districts-rankings.json'),
        makeRankings('2026-01-31', 100, 80)
      )
      await fs.writeFile(
        path.join(d2, 'all-districts-rankings.json'),
        makeRankings('2026-02-28', 110, 85)
      )

      const service = new RebuildService({ cacheDir: testDir })
      const outDir = await service.generateRankHistory()

      // Check district 49
      const d49 = JSON.parse(
        await fs.readFile(path.join(outDir, '49.json'), 'utf-8')
      )
      expect(d49.districtId).toBe('49')
      expect(d49.districtName).toBe('District 49')
      expect(d49.history).toHaveLength(2)
      expect(d49.history[0].date).toBe('2026-01-31')
      expect(d49.history[0].aggregateScore).toBe(100)
      expect(d49.history[1].date).toBe('2026-02-28')
      expect(d49.history[1].aggregateScore).toBe(110)

      // Check district 61
      const d61 = JSON.parse(
        await fs.readFile(path.join(outDir, '61.json'), 'utf-8')
      )
      expect(d61.history).toHaveLength(2)
      expect(d61.history[0].overallRank).toBe(3)
      expect(d61.history[0].totalDistricts).toBe(130)
    })

    it('deduplicates dates in rank history', async () => {
      const d1 = path.join(testDir, 'snapshots', '2026-01-31')
      await fs.mkdir(d1, { recursive: true })

      // Write same date twice (should keep only one)
      await fs.writeFile(
        path.join(d1, 'all-districts-rankings.json'),
        JSON.stringify({
          rankings: [
            {
              districtId: '49',
              districtName: 'District 49',
              aggregateScore: 100,
              clubsRank: 1,
              paymentsRank: 2,
              distinguishedRank: 3,
            },
          ],
          metadata: { sourceCsvDate: '2026-01-31', totalDistricts: 130 },
        })
      )

      const service = new RebuildService({ cacheDir: testDir })
      const outDir = await service.generateRankHistory()

      const d49 = JSON.parse(
        await fs.readFile(path.join(outDir, '49.json'), 'utf-8')
      )
      expect(d49.history).toHaveLength(1)
      // overallRank should default to 0 when missing
      expect(d49.history[0].overallRank).toBe(0)
    })

    it('returns empty dir when no snapshots exist', async () => {
      await fs.rm(path.join(testDir, 'snapshots'), {
        recursive: true,
        force: true,
      })

      const service = new RebuildService({ cacheDir: testDir })
      const outDir = await service.generateRankHistory()

      const files = await fs.readdir(outDir)
      expect(files).toHaveLength(0)
    })
  })

  describe('generateDatesManifest', () => {
    it('generates v1/dates.json with sorted snapshot dates', async () => {
      await fs.mkdir(path.join(testDir, 'snapshots', '2026-02-28'), {
        recursive: true,
      })
      await fs.mkdir(path.join(testDir, 'snapshots', '2026-01-31'), {
        recursive: true,
      })

      const service = new RebuildService({ cacheDir: testDir })
      const datesPath = await service.generateDatesManifest()

      const manifest = JSON.parse(await fs.readFile(datesPath, 'utf-8'))
      expect(manifest.dates).toEqual(['2026-01-31', '2026-02-28'])
      expect(manifest.count).toBe(2)
    })
  })

  describe('generateLatestManifest', () => {
    it('generates v1/latest.json pointing to most recent date', async () => {
      await fs.mkdir(path.join(testDir, 'snapshots', '2026-01-31'), {
        recursive: true,
      })
      await fs.mkdir(path.join(testDir, 'snapshots', '2026-02-28'), {
        recursive: true,
      })

      const service = new RebuildService({ cacheDir: testDir })
      const latestPath = await service.generateLatestManifest()

      const manifest = JSON.parse(await fs.readFile(latestPath, 'utf-8'))
      expect(manifest.latestSnapshotDate).toBe('2026-02-28')
    })
  })
})

describe('RebuildService — closing-date registry pass-through (#1129)', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `rebuild-1129-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await fs.mkdir(path.join(testDir, 'raw-csv'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('remaps a metadata-less closing-window date via the injected registry', async () => {
    await createRawCsvFixture(testDir, '2026-02-03')

    const service = new RebuildService({
      cacheDir: testDir,
      closingDateRegistry: [
        { dataMonth: '2026-01', closingDate: '2026-02-05' },
      ],
    })

    const result = await service.rebuildDate('2026-02-03')

    expect(result.transformSuccess).toBe(true)
    expect(result.snapshotDate).toBe('2026-01-31')
  })

  it('marks an undecided date failed instead of publishing it', async () => {
    await createRawCsvFixture(testDir, '2026-06-08')

    const service = new RebuildService({
      cacheDir: testDir,
      closingDateRegistry: [
        { dataMonth: '2026-01', closingDate: '2026-02-05' },
      ],
    })

    const result = await service.rebuildDate('2026-06-08')

    expect(result.transformSuccess).toBe(false)
    expect(result.error).toMatch(/registry|undecided/i)
    await expect(
      fs.stat(path.join(testDir, 'snapshots', '2026-06-08'))
    ).rejects.toThrow()
  })
})
