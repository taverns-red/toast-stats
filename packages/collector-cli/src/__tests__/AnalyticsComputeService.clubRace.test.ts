/**
 * `compute-analytics` folds the date into the club-race crossing store
 * (#1556) — `club-race/{PY}/first-reached.json`, R9 pattern.
 *
 * The compute step is where it belongs for the same reason the worldwide
 * rollup lives there (#1498): it is the one point that already holds every
 * district file for the date plus that date's own
 * `all-districts-rankings.json`, which scopes the district set (#1465). The
 * pipeline syncs `club-race/` from GCS before this step and pushes it back
 * after, exactly like `club-trends/`.
 *
 * Real on-disk cache directory, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AllDistrictsRankingsData } from '@taverns-red/shared-contracts'
import type { ClubStatistics } from '@taverns-red/analytics-core'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import {
  ClubRaceStore,
  type ClubRaceStoreData,
} from '../services/ClubRaceStore.js'
import { determineComputeAnalyticsExitCode } from '../cliHelpers.js'
import { ExitCode } from '../types/index.js'
import type { ComputeAnalyticsResult } from '../types/index.js'

const DATE = '2026-08-12'
const NEXT_DATE = '2026-08-19'
const PY = '2026-2027'

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

function club(overrides: Partial<ClubStatistics> = {}): ClubStatistics {
  return {
    clubId: '00003045',
    clubName: 'Limestone City Club',
    divisionId: 'A',
    areaId: '01',
    membershipCount: 22,
    paymentsCount: 40,
    dcpGoals: 5,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 01',
    octoberRenewals: 20,
    aprilRenewals: 22,
    newMembers: 2,
    membershipBase: 20,
    cspSubmitted: true,
    ...overrides,
  }
}

/** A `district_{id}.json` in the shape the transform writes, clubs only. */
function districtSnapshot(
  districtId: string,
  date: string,
  clubs: ClubStatistics[]
) {
  return {
    districtId,
    districtName: `District ${districtId}`,
    collectedAt: `${date}T10:00:00.000Z`,
    status: 'success',
    data: {
      districtId,
      snapshotDate: date,
      clubs,
      divisions: [],
      areas: [],
      totals: {
        totalClubs: clubs.length,
        totalMembership: 0,
        totalPayments: 0,
        distinguishedClubs: 0,
        selectDistinguishedClubs: 0,
        presidentDistinguishedClubs: 0,
      },
      clubPerformance: [],
      districtPerformance: [],
    },
  }
}

function rankingsFile(
  date: string,
  districtIds: string[]
): AllDistrictsRankingsData {
  return {
    metadata: {
      snapshotId: date,
      calculatedAt: `${date}T10:00:00.000Z`,
      schemaVersion: '1.0.0',
      calculationVersion: '2.0',
      rankingVersion: '2.0',
      sourceCsvDate: date,
      csvFetchedAt: `${date}T10:00:00.000Z`,
      totalDistricts: districtIds.length,
      fromCache: false,
    },
    rankings: districtIds.map((districtId, index) => ({
      districtId,
      districtName: `District ${districtId}`,
      region: 'I',
      paidClubs: 1,
      paidClubBase: 1,
      clubGrowthPercent: 0,
      totalPayments: 0,
      paymentBase: 0,
      paymentGrowthPercent: 0,
      activeClubs: 1,
      distinguishedClubs: 0,
      selectDistinguished: 0,
      presidentsDistinguished: 0,
      smedleyDistinguished: 0,
      distinguishedPercent: 0,
      clubsRank: index + 1,
      paymentsRank: index + 1,
      distinguishedRank: index + 1,
      aggregateScore: 1,
      overallRank: index + 1,
    })),
  }
}

describe('AnalyticsComputeService — club-race crossing store (#1556)', () => {
  let cacheDir: string
  let service: AnalyticsComputeService

  const snapshotDir = (date: string) => path.join(cacheDir, 'snapshots', date)
  const storePath = () => ClubRaceStore.getPath(cacheDir, PY)
  const readStore = async () =>
    JSON.parse(await fs.readFile(storePath(), 'utf-8')) as ClubRaceStoreData

  const writeDate = async (
    date: string,
    districts: Record<string, ClubStatistics[]>,
    rankedIds = Object.keys(districts)
  ) => {
    await fs.mkdir(snapshotDir(date), { recursive: true })
    for (const [districtId, clubs] of Object.entries(districts)) {
      await fs.writeFile(
        path.join(snapshotDir(date), `district_${districtId}.json`),
        JSON.stringify(districtSnapshot(districtId, date, clubs))
      )
    }
    await fs.writeFile(
      path.join(snapshotDir(date), 'all-districts-rankings.json'),
      JSON.stringify(rankingsFile(date, rankedIds))
    )
  }

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'club-race-compute-'))
    service = new AnalyticsComputeService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('writes the crossing store for the date, keyed on the program year', async () => {
    await writeDate(DATE, { '61': [club({ dcpGoals: 7 })] })

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.clubRaceStorePath).toBe(storePath())
    expect(result.clubRaceStoreFailed).toBe(false)

    const store = await readStore()
    expect(store.programYear).toBe(PY)
    expect(store.observedDates).toEqual([DATE])
    // Canonical id: the zero-padded file id is not a second club.
    expect(store.clubs['3045']?.reached).toEqual({
      Distinguished: { on: DATE, after: null },
      Select: { on: DATE, after: null },
    })
    expect(store.clubs['3045']?.districtId).toBe('61')
  })

  it('accumulates across runs: a later date sharpens, never revises, a crossing', async () => {
    await writeDate(DATE, { '61': [club()] })
    await service.compute({ date: DATE, districts: ['61'] })

    await writeDate(NEXT_DATE, { '61': [club({ dcpGoals: 7 })] })
    await service.compute({ date: NEXT_DATE, districts: ['61'] })

    const store = await readStore()
    expect(store.observedDates).toEqual([DATE, NEXT_DATE])
    expect(store.clubs['3045']?.reached).toEqual({
      Distinguished: { on: DATE, after: null },
      Select: { on: NEXT_DATE, after: DATE },
    })
  })

  it('scopes to the rankings district set, ignoring a stray district file (#1465)', async () => {
    await writeDate(
      DATE,
      {
        '61': [club()],
        '201': [club({ clubId: '999', clubName: 'Stray' })],
      },
      ['61']
    )

    await service.compute({ date: DATE, districts: ['61'] })

    const store = await readStore()
    expect(Object.keys(store.clubs)).toEqual(['3045'])
  })

  it('skips the store, without failing the run, when the date has no rankings file', async () => {
    await fs.mkdir(snapshotDir(DATE), { recursive: true })
    await fs.writeFile(
      path.join(snapshotDir(DATE), 'district_61.json'),
      JSON.stringify(districtSnapshot('61', DATE, [club()]))
    )

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.clubRaceStorePath).toBeUndefined()
    expect(result.clubRaceStoreFailed).toBe(false)
    await expect(fs.access(storePath())).rejects.toThrow()
    expect(
      result.errors.filter(e => e.error.includes('first-reached.json'))
    ).toEqual([])
  })

  it('reports a store failure loudly without blocking the publish of the day', async () => {
    await writeDate(DATE, { '61': [club()] })
    // A FILE where the store's directory must go: mkdir → ENOTDIR on save.
    await fs.writeFile(path.join(cacheDir, 'club-race'), 'not a directory')

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.clubRaceStoreFailed).toBe(true)
    expect(result.clubRaceStorePath).toBeUndefined()
    expect(
      result.errors.some(e => e.error.includes('first-reached.json'))
    ).toBe(true)
    // The worldwide rollup is untouched by the store's failure (isolation) ...
    expect(result.globalTotalsFailed).toBe(false)
    // ... and a missed capture is not a broken publication: the exit code
    // that gates the day's upload stays green. The error is in the JSON
    // output and the log, not in the exit status.
    expect(
      determineComputeAnalyticsExitCode(
        asCliResult({
          ...result,
          districtsProcessed: ['61'],
          districtsSucceeded: ['61'],
          districtsFailed: [],
        })
      )
    ).toBe(ExitCode.SUCCESS)
  })
})
