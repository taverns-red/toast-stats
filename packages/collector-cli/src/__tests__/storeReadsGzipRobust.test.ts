/**
 * Every GCS-backed store reads through stacked gzip layers (#1702).
 *
 * The pipeline syncs each store down from GCS, upserts today's data and
 * pushes it back (R9). When the download stopped decompressing
 * `Content-Encoding: gzip` objects (#1412 / #1649) the time-series reader
 * failed on every district, the error was swallowed, and `cp -Z` added a
 * gzip layer per run. These tests pin, per store: an N-layer file loads as
 * the plain store, a plain file still loads, a missing file is still the
 * legitimate "start empty" case, and a genuinely corrupt file still throws.
 *
 * Real on-disk temp directories, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import type {
  ProgramYearIndexFile,
  TimeSeriesDataPoint,
} from '@taverns-red/shared-contracts'
import { TimeSeriesIndexWriter } from '../services/TimeSeriesIndexWriter.js'
import { ClubTrendsStore } from '../services/ClubTrendsStore.js'
import { ClubRaceStore } from '../services/ClubRaceStore.js'
import { DistrictAwardsHistoryStore } from '../services/DistrictAwardsHistoryStore.js'

const PY = '2026-2027'
const LAYERS = 10

async function gzipInPlace(filePath: string, layers: number): Promise<void> {
  let buf = await fs.readFile(filePath)
  for (let i = 0; i < layers; i++) buf = gzipSync(buf)
  await fs.writeFile(filePath, buf)
}

function dataPoint(date: string, membership: number): TimeSeriesDataPoint {
  return {
    date,
    snapshotId: date,
    membership,
    payments: membership,
    dcpGoals: 10,
    distinguishedTotal: 2,
    clubCounts: {
      total: 50,
      thriving: 30,
      vulnerable: 15,
      interventionRequired: 5,
    },
  }
}

describe('store reads survive stacked gzip layers (#1702)', () => {
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-gzip-'))
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  describe('TimeSeriesIndexWriter', () => {
    const indexPath = () =>
      path.join(cacheDir, 'time-series', 'district_61', `${PY}.json`)

    async function seed(points: TimeSeriesDataPoint[]): Promise<void> {
      const writer = new TimeSeriesIndexWriter({ cacheDir })
      for (const point of points) await writer.writeDataPoint('61', point)
    }

    it(`appends to a ${LAYERS}-layer index and writes it back as plain JSON`, async () => {
      await seed([dataPoint('2026-10-01', 3000), dataPoint('2026-10-02', 3010)])
      await gzipInPlace(indexPath(), LAYERS)

      const writer = new TimeSeriesIndexWriter({ cacheDir })
      await writer.writeDataPoint('61', dataPoint('2026-10-08', 3050))

      // Plain bytes on disk: parseable without any gunzip.
      const written = JSON.parse(
        await fs.readFile(indexPath(), 'utf-8')
      ) as ProgramYearIndexFile
      expect(written.dataPoints.map(p => p.date)).toEqual([
        '2026-10-01',
        '2026-10-02',
        '2026-10-08',
      ])
    })

    it('reads the payments trend through the layers', async () => {
      await seed([dataPoint('2026-10-01', 3000), dataPoint('2026-10-02', 3010)])
      await gzipInPlace(indexPath(), LAYERS)

      const writer = new TimeSeriesIndexWriter({ cacheDir })
      const trend = await writer.getPaymentsTrend('61', '2026-10-02')
      expect(trend.map(p => p.date)).toEqual(['2026-10-01', '2026-10-02'])
    })

    it('still creates a fresh index when none exists yet', async () => {
      const writer = new TimeSeriesIndexWriter({ cacheDir })
      await writer.writeDataPoint('61', dataPoint('2026-10-08', 3050))
      const written = JSON.parse(
        await fs.readFile(indexPath(), 'utf-8')
      ) as ProgramYearIndexFile
      expect(written.dataPoints).toHaveLength(1)
    })

    it('still throws on a corrupt index instead of overwriting it', async () => {
      await fs.mkdir(path.dirname(indexPath()), { recursive: true })
      await fs.writeFile(indexPath(), '{ not json')

      const writer = new TimeSeriesIndexWriter({ cacheDir })
      await expect(
        writer.writeDataPoint('61', dataPoint('2026-10-08', 3050))
      ).rejects.toThrow(/Failed to read program year index/)
      expect(await fs.readFile(indexPath(), 'utf-8')).toBe('{ not json')
    })
  })

  describe('ClubTrendsStore', () => {
    it(`loads a ${LAYERS}-layer store`, async () => {
      await ClubTrendsStore.create('61', PY).save(cacheDir)
      await gzipInPlace(ClubTrendsStore.getPath(cacheDir, PY, '61'), LAYERS)

      const store = await ClubTrendsStore.load(cacheDir, PY, '61')
      expect(store?.districtId).toBe('61')
    })

    it('returns null for a missing store and throws for a corrupt one', async () => {
      expect(await ClubTrendsStore.load(cacheDir, PY, '61')).toBeNull()
      const filePath = ClubTrendsStore.getPath(cacheDir, PY, '61')
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, '{ not json')
      await expect(ClubTrendsStore.load(cacheDir, PY, '61')).rejects.toThrow()
    })
  })

  describe('ClubRaceStore', () => {
    it(`loads a ${LAYERS}-layer store`, async () => {
      await ClubRaceStore.create(PY).save(cacheDir)
      await gzipInPlace(ClubRaceStore.getPath(cacheDir, PY), LAYERS)

      const store = await ClubRaceStore.load(cacheDir, PY)
      expect(store?.programYear).toBe(PY)
    })

    it('returns null for a missing store and throws for a corrupt one', async () => {
      expect(await ClubRaceStore.load(cacheDir, PY)).toBeNull()
      const filePath = ClubRaceStore.getPath(cacheDir, PY)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, '{ not json')
      await expect(ClubRaceStore.load(cacheDir, PY)).rejects.toThrow()
    })
  })

  describe('DistrictAwardsHistoryStore', () => {
    const filePath = () => path.join(cacheDir, 'district-awards-history.json')

    it(`loads a ${LAYERS}-layer store`, async () => {
      await DistrictAwardsHistoryStore.create().save(cacheDir)
      await gzipInPlace(filePath(), LAYERS)

      const store = await DistrictAwardsHistoryStore.load(cacheDir)
      expect(store).not.toBeNull()
      expect(store?.getHistory('61')).toEqual([])
    })

    it('returns null for a missing store and throws for a corrupt one', async () => {
      expect(await DistrictAwardsHistoryStore.load(cacheDir)).toBeNull()
      await fs.writeFile(filePath(), '{ not json')
      await expect(DistrictAwardsHistoryStore.load(cacheDir)).rejects.toThrow()
    })
  })
})
