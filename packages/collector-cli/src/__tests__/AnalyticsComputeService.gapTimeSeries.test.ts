/**
 * A #1671 source-gap district gets no time-series point on its gap date
 * (#2070). Its club report on that date is TI's HTML error page, so there is
 * nothing to measure; a 0-membership point would plot as a dip to zero.
 *
 * The store only upserts, so the 0 points written before #2036 survive every
 * rebuild that simply writes nothing for the gap district. Prod
 * `time-series/district_U/2017-2018.json` (read 2026-10-15) holds 12 such
 * points, each `{membership:0, payments:0, dcpGoals:0, distinguishedTotal:0,
 * clubCounts:{total:0,…}}`. Compute must remove the gap date's point and
 * record the date as not measured, never write or keep a 0.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ProgramYearIndexFileSchema,
  type ProgramYearIndexFile,
  type TimeSeriesDataPoint,
} from '@taverns-red/shared-contracts'
import { TransformService } from '../services/TransformService.js'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import {
  GAP_DISTRICT,
  SUBSET_DATE,
  SUBSET_DISTRICTS,
  addGapDistrictRaw,
  writeSubsetRawCsv,
} from './fixtures/dateLevelSubsetFixture.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TI_ERROR_PAGE = fsSync.readFileSync(
  path.join(
    HERE,
    'fixtures/ti-error-page-2019-07-16-district-U-clubperformance.html'
  ),
  'utf-8'
)

const PROGRAM_YEAR = '2026-2027'
const EARLIER_DATE = '2026-10-08'

/** The exact shape of the junk point prod serves for U (2017-07-31). */
const junkPoint = (date: string): TimeSeriesDataPoint => ({
  date,
  snapshotId: date,
  membership: 0,
  payments: 0,
  dcpGoals: 0,
  distinguishedTotal: 0,
  clubCounts: { total: 0, thriving: 0, vulnerable: 0, interventionRequired: 0 },
})

const measuredPoint = (date: string): TimeSeriesDataPoint => ({
  date,
  snapshotId: date,
  membership: 3120,
  payments: 2904,
  dcpGoals: 210,
  distinguishedTotal: 12,
  clubCounts: {
    total: 147,
    thriving: 80,
    vulnerable: 50,
    interventionRequired: 17,
  },
})

describe('AnalyticsComputeService — no time-series point for a #1671 gap district (#2070)', () => {
  let cacheDir: string

  const seriesDir = () =>
    path.join(cacheDir, 'time-series', `district_${GAP_DISTRICT}`)
  const seriesPath = () => path.join(seriesDir(), `${PROGRAM_YEAR}.json`)
  const readSeries = async (): Promise<ProgramYearIndexFile> =>
    ProgramYearIndexFileSchema.parse(
      JSON.parse(await fs.readFile(seriesPath(), 'utf-8'))
    ) as ProgramYearIndexFile
  const seedSeries = async (dataPoints: TimeSeriesDataPoint[]) => {
    await fs.mkdir(seriesDir(), { recursive: true })
    const file: ProgramYearIndexFile = {
      districtId: GAP_DISTRICT,
      programYear: PROGRAM_YEAR,
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      lastUpdated: '2026-10-11T00:00:00.000Z',
      dataPoints,
      summary: {
        totalDataPoints: dataPoints.length,
        membershipStart: dataPoints[0]?.membership ?? 0,
        membershipEnd: dataPoints[dataPoints.length - 1]?.membership ?? 0,
        membershipPeak: Math.max(...dataPoints.map(p => p.membership)),
        membershipLow: Math.min(...dataPoints.map(p => p.membership)),
      },
    }
    await fs.writeFile(seriesPath(), JSON.stringify(file, null, 2))
  }

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-time-series-'))
    await writeSubsetRawCsv(cacheDir, SUBSET_DISTRICTS)
    await addGapDistrictRaw(cacheDir, TI_ERROR_PAGE)
    const transform = await new TransformService({ cacheDir }).transform({
      date: SUBSET_DATE,
      force: true,
    })
    expect(transform.districtsSkipped).toEqual([GAP_DISTRICT])
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('removes the 0 point an earlier run left on the gap date and keeps the measured ones', async () => {
    await seedSeries([measuredPoint(EARLIER_DATE), junkPoint(SUBSET_DATE)])

    const result = await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    expect(result.timeSeriesFailed).toEqual([])
    const series = await readSeries()
    expect(series.dataPoints.map(p => p.date)).toEqual([EARLIER_DATE])
    expect(series.dataPoints.some(p => p.membership === 0)).toBe(false)
    expect(series.sourceGapDates).toEqual([SUBSET_DATE])
    // The summary is recomputed over the measured points only.
    expect(series.summary).toMatchObject({
      totalDataPoints: 1,
      membershipLow: 3120,
      membershipEnd: 3120,
    })
  })

  it('writes no point for the gap district even when a stale 0-club district file is on disk', async () => {
    // Before #2036, transform wrote district_U.json from the HTML page with
    // 0 clubs; both buckets still serve those files until the #2038 prune.
    const snapshotDir = path.join(cacheDir, 'snapshots', SUBSET_DATE)
    const real = JSON.parse(
      await fs.readFile(
        path.join(snapshotDir, `district_${SUBSET_DISTRICTS[0]}.json`),
        'utf-8'
      )
    ) as { districtId: string; data: Record<string, unknown> }
    real.districtId = GAP_DISTRICT
    real.data = {
      ...real.data,
      districtId: GAP_DISTRICT,
      clubs: [],
      clubPerformance: [],
    }
    await fs.writeFile(
      path.join(snapshotDir, `district_${GAP_DISTRICT}.json`),
      JSON.stringify(real)
    )
    await seedSeries([measuredPoint(EARLIER_DATE)])

    await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    const series = await readSeries()
    expect(series.dataPoints.map(p => p.date)).toEqual([EARLIER_DATE])
    expect(series.sourceGapDates).toEqual([SUBSET_DATE])
  })

  it('creates no series for a gap district that has none', async () => {
    await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    await expect(fs.access(seriesPath())).rejects.toThrow()
  })

  it('still writes a point for every measured district on that date', async () => {
    const result = await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    expect([...result.timeSeriesWritten].sort()).toEqual(
      [...SUBSET_DISTRICTS].sort()
    )
  })
})
