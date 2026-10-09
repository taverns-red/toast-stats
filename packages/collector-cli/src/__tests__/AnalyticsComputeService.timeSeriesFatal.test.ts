/**
 * A time-series write failure must fail `compute-analytics` (#1702).
 *
 * The 2026-10 incident: every district's program-year index was unreadable
 * (gzip bytes from a non-decompressing download), `writeDataPoint` threw for
 * all 94 districts, and `computeDistrictAnalytics` logged "(continuing)" and
 * reported success. The run exited 0, Trends froze, and the upload step
 * stacked another gzip layer on the untouched files every day.
 *
 * Pinned here: a store file that EXISTS but cannot be parsed fails the run;
 * a store file that does not exist yet is the normal first-write path and
 * does not.
 *
 * Real on-disk cache directory, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AllDistrictsRankingsData } from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import { determineComputeAnalyticsExitCode } from '../cliHelpers.js'
import { ExitCode } from '../types/index.js'
import type { ComputeAnalyticsResult } from '../types/index.js'

const DATE = '2026-06-30'
const PY = '2025-2026'

/** The subset of the CLI result shape the exit-code helper reads. */
function asCliResult(
  partial: Partial<ComputeAnalyticsResult>
): ComputeAnalyticsResult {
  return {
    success: true,
    date: DATE,
    requestedDate: DATE,
    isClosingPeriod: false,
    districtsProcessed: [],
    districtsSucceeded: [],
    districtsFailed: [],
    districtsSkipped: [],
    analyticsLocations: [],
    errors: [],
    duration_ms: 0,
    ...partial,
  }
}

/** A `district_{id}.json` in the shape the transform actually writes. */
function districtSnapshot(districtId: string) {
  return {
    districtId,
    districtName: `District ${districtId}`,
    collectedAt: '2026-07-02T00:00:00.000Z',
    status: 'success',
    data: {
      districtId,
      snapshotDate: DATE,
      clubs: [
        { clubId: '00000011', address: { country: 'Canada' } },
        { clubId: '00000022', address: { country: 'Japan' } },
        // No address at all — the unknown-country bucket's reason for being.
        { clubId: '00000033' },
      ],
      divisions: [],
      areas: [],
      totals: {
        totalClubs: 3,
        totalMembership: 60,
        totalPayments: 90,
        distinguishedClubs: 1,
        selectDistinguishedClubs: 0,
        presidentDistinguishedClubs: 0,
      },
      clubPerformance: [
        { 'Club Number': '00000011', 'Active Members': '20' },
        { 'Club Number': '00000022', 'Active Members': '25' },
        { 'Club Number': '00000033', 'Active Members': '15' },
      ],
      districtPerformance: [
        {
          Club: '00000011',
          'Total to Date': '30',
          'Charter Date/Suspend Date': 'Charter 03/26/26',
        },
        {
          Club: '00000022',
          'Total to Date': '35',
          'Charter Date/Suspend Date': ' Susp 03/31/26',
        },
        {
          Club: '00000033',
          'Total to Date': '25',
          'Charter Date/Suspend Date': '',
        },
      ],
    },
  }
}

function rankingsFile(districtIds: string[]): AllDistrictsRankingsData {
  return {
    metadata: {
      snapshotId: DATE,
      calculatedAt: '2026-07-02T00:00:00.000Z',
      schemaVersion: '1.0.0',
      calculationVersion: '2.0',
      rankingVersion: '2.0',
      sourceCsvDate: DATE,
      csvFetchedAt: '2026-07-02T00:00:00.000Z',
      totalDistricts: districtIds.length,
      fromCache: false,
    },
    rankings: districtIds.map((districtId, index) => ({
      districtId,
      districtName: `District ${districtId}`,
      region: 'I',
      paidClubs: 3,
      paidClubBase: 3,
      clubGrowthPercent: 0,
      totalPayments: 90,
      paymentBase: 90,
      paymentGrowthPercent: 0,
      activeClubs: 2,
      distinguishedClubs: 2,
      selectDistinguished: 1,
      presidentsDistinguished: 0,
      smedleyDistinguished: 0,
      distinguishedPercent: 66,
      clubsRank: index + 1,
      paymentsRank: index + 1,
      distinguishedRank: index + 1,
      aggregateScore: 1,
      overallRank: index + 1,
    })),
  }
}

describe('AnalyticsComputeService — time-series failures are fatal (#1702)', () => {
  let cacheDir: string
  let service: AnalyticsComputeService

  const snapshotDir = () => path.join(cacheDir, 'snapshots', DATE)
  const indexPath = () =>
    path.join(cacheDir, 'time-series', 'district_61', `${PY}.json`)

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-fatal-'))
    await fs.mkdir(snapshotDir(), { recursive: true })
    await fs.writeFile(
      path.join(snapshotDir(), 'district_61.json'),
      JSON.stringify(districtSnapshot('61'))
    )
    await fs.writeFile(
      path.join(snapshotDir(), 'all-districts-rankings.json'),
      JSON.stringify(rankingsFile(['61']))
    )
    service = new AnalyticsComputeService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('exits 0 when the index does not exist yet (first write)', async () => {
    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.timeSeriesFailed).toEqual([])
    expect(determineComputeAnalyticsExitCode(asCliResult(result))).toBe(
      ExitCode.SUCCESS
    )
    const written = JSON.parse(await fs.readFile(indexPath(), 'utf-8')) as {
      dataPoints: Array<{ date: string }>
    }
    expect(written.dataPoints.map(p => p.date)).toEqual([DATE])
  })

  it('fails the run when an existing index cannot be parsed', async () => {
    await fs.mkdir(path.dirname(indexPath()), { recursive: true })
    await fs.writeFile(indexPath(), '{ not json')

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.timeSeriesFailed).toEqual(['61'])
    expect(result.success).toBe(false)
    expect(
      result.errors.some(
        e => e.districtId === '61' && /time-series/i.test(e.error)
      )
    ).toBe(true)
    // The load-bearing half: the failure has to reach the process exit code.
    expect(determineComputeAnalyticsExitCode(asCliResult(result))).not.toBe(
      ExitCode.SUCCESS
    )
  })

  // #1708: the counters the step summary prints come from these lists.
  it('lists the districts whose time-series point and club-trends store were written', async () => {
    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.timeSeriesWritten).toEqual(['61'])
    expect(result.clubTrendsUpdated).toEqual(['61'])
    expect(result.clubTrendsFailed).toEqual([])
  })

  it('leaves a district out of timeSeriesWritten when its write failed', async () => {
    await fs.mkdir(path.dirname(indexPath()), { recursive: true })
    await fs.writeFile(indexPath(), '{ not json')

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.timeSeriesWritten).toEqual([])
    expect(result.timeSeriesFailed).toEqual(['61'])
  })

  it('counts a district that failed before its club-trends update as clubTrendsFailed', async () => {
    // No snapshot for district 99: compute fails before the store update.
    const result = await service.compute({
      date: DATE,
      districts: ['61', '99'],
    })

    expect(result.districtsFailed).toEqual(['99'])
    expect(result.clubTrendsUpdated).toEqual(['61'])
    expect(result.clubTrendsFailed).toEqual(['99'])
  })

  it('exits non-zero on a time-series failure even when every district computed', () => {
    const allDistrictsFine = asCliResult({
      districtsProcessed: ['61'],
      districtsSucceeded: ['61'],
      timeSeriesFailed: ['61'],
    })
    expect(determineComputeAnalyticsExitCode(allDistrictsFine)).toBe(
      ExitCode.PARTIAL_FAILURE
    )
    expect(
      determineComputeAnalyticsExitCode({
        ...allDistrictsFine,
        timeSeriesFailed: [],
      })
    ).toBe(ExitCode.SUCCESS)
  })
})
