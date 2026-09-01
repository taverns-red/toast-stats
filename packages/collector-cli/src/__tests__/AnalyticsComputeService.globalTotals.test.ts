/**
 * `compute-analytics` writes `snapshots/{date}/global-totals.json` (#1498).
 *
 * The compute step is the only place in the pipeline that already holds the
 * whole date on disk — every district file plus that date's own
 * `all-districts-rankings.json` — so the worldwide rollup is computed there
 * rather than in a second pass over GCS. The upload step copies
 * `snapshots/${DATE}/*.json` wholesale, so writing the file next to the
 * district snapshots is the entire publish wiring.
 *
 * These tests use a real on-disk cache directory, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  GLOBAL_TOTALS_FILE_NAME,
  GlobalTotalsSchema,
  type AllDistrictsRankingsData,
} from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const DATE = '2026-06-30'

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

describe('AnalyticsComputeService — global-totals.json (#1498)', () => {
  let cacheDir: string
  let service: AnalyticsComputeService

  const snapshotDir = () => path.join(cacheDir, 'snapshots', DATE)
  const readTotals = async () =>
    JSON.parse(
      await fs.readFile(
        path.join(snapshotDir(), GLOBAL_TOTALS_FILE_NAME),
        'utf-8'
      )
    ) as unknown

  beforeEach(async () => {
    cacheDir = path.join(
      os.tmpdir(),
      `global-totals-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await fs.mkdir(snapshotDir(), { recursive: true })
    service = new AnalyticsComputeService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('writes a rollup that validates against the shared contract', async () => {
    await fs.writeFile(
      path.join(snapshotDir(), 'district_61.json'),
      JSON.stringify(districtSnapshot('61'))
    )
    await fs.writeFile(
      path.join(snapshotDir(), 'all-districts-rankings.json'),
      JSON.stringify(rankingsFile(['61']))
    )

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.globalTotalsPath).toBe(
      path.join(snapshotDir(), GLOBAL_TOTALS_FILE_NAME)
    )
    const parsed = GlobalTotalsSchema.safeParse(await readTotals())
    expect(parsed.success).toBe(true)

    const totals = parsed.data!
    expect(totals.date).toBe(DATE)
    expect(totals.programYear).toBe('2025-2026')
    expect(totals.membership.totalPayments).toBe(90)
    expect(totals.membership.totalMembership).toBe(60)
    expect(totals.membership.clubsCounted).toBe(3)
    expect(totals.clubMovement).toEqual({
      newClubsStillActive: 1,
      suspendedClubs: 1,
    })
    expect(totals.clubsByCountry).toEqual({
      countries: [
        { country: 'Canada', clubs: 1 },
        { country: 'Japan', clubs: 1 },
      ],
      unknown: 1,
    })
  })

  it('scopes to the rankings district set, excluding a stray district file', async () => {
    // The #1465 shape in miniature: a district file the date's own rankings
    // never lists must not reach the worldwide sums.
    for (const districtId of ['61', '201']) {
      await fs.writeFile(
        path.join(snapshotDir(), `district_${districtId}.json`),
        JSON.stringify(districtSnapshot(districtId))
      )
    }
    await fs.writeFile(
      path.join(snapshotDir(), 'all-districts-rankings.json'),
      JSON.stringify(rankingsFile(['61']))
    )

    await service.compute({ date: DATE, districts: ['61'] })

    const totals = GlobalTotalsSchema.parse(await readTotals())
    expect(totals.districts.excludedDistricts).toEqual(['201'])
    expect(totals.membership.clubsCounted).toBe(3)
    expect(totals.membership.totalPayments).toBe(90)
  })

  it('skips the rollup, without failing the run, when the date has no rankings file', async () => {
    // A date whose rankings file never landed has no authoritative district
    // set, and an unscoped rollup is refused rather than guessed at (#1466).
    await fs.writeFile(
      path.join(snapshotDir(), 'district_61.json'),
      JSON.stringify(districtSnapshot('61'))
    )

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.globalTotalsPath).toBeUndefined()
    await expect(
      fs.access(path.join(snapshotDir(), GLOBAL_TOTALS_FILE_NAME))
    ).rejects.toThrow()
    expect(result.errors.map(e => e.error)).not.toContain(
      expect.stringContaining('global-totals')
    )
  })
})
