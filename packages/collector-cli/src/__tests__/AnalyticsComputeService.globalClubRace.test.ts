/**
 * `compute-analytics` writes `snapshots/{date}/global-club-race.json`
 * (#1556, phase 2) — the worldwide race projection — right after folding
 * the date into the crossing store, from the same scoped district files.
 *
 * Writing it next to the district snapshots is the entire publish wiring:
 * the upload step copies `snapshots/${DATE}/*.json` wholesale, gzipped,
 * with the 1-hour CDN TTL (spec §2.6).
 *
 * Real on-disk cache directory, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  GLOBAL_CLUB_RACE_FILE_NAME,
  GlobalClubRaceSchema,
  type AllDistrictsRankingsData,
} from '@taverns-red/shared-contracts'
import type { ClubStatistics } from '@taverns-red/analytics-core'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import { determineComputeAnalyticsExitCode } from '../cliHelpers.js'
import { ExitCode } from '../types/index.js'
import type { ComputeAnalyticsResult } from '../types/index.js'

const DATE = '2026-08-12'
const NEXT_DATE = '2026-08-19'

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
      region: '07',
      paidClubs: 50,
      paidClubBase: 50,
      clubGrowthPercent: 0,
      totalPayments: 0,
      paymentBase: 0,
      paymentGrowthPercent: 0,
      activeClubs: 50,
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

describe('AnalyticsComputeService — global-club-race.json (#1556)', () => {
  let cacheDir: string
  let service: AnalyticsComputeService

  const snapshotDir = (date: string) => path.join(cacheDir, 'snapshots', date)
  const artifactPath = (date: string) =>
    path.join(snapshotDir(date), GLOBAL_CLUB_RACE_FILE_NAME)
  const readArtifact = async (date: string) =>
    GlobalClubRaceSchema.parse(
      JSON.parse(await fs.readFile(artifactPath(date), 'utf-8'))
    )

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
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'club-race-artifact-'))
    service = new AnalyticsComputeService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('writes an artifact that validates and reflects the freshly folded store', async () => {
    await writeDate(DATE, { '61': [club({ dcpGoals: 7 })] })

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.globalClubRacePath).toBe(artifactPath(DATE))
    expect(result.globalClubRaceFailed).toBe(false)

    const race = await readArtifact(DATE)
    expect(race.date).toBe(DATE)
    expect(race.programYear).toBe('2026-2027')
    expect(race.scope.clubsScanned).toBe(1)
    expect(race.observation.firstObservedDate).toBe(DATE)
    expect(race.reached).toHaveLength(1)
    expect(race.reached[0]?.clubId).toBe('3045')
    expect(race.reached[0]?.tiers).toEqual({
      Distinguished: { reachedOn: DATE, observedAfter: null, rank: 1 },
      Select: { reachedOn: DATE, observedAfter: null, rank: 1 },
    })
    expect(race.byDistrict[0]?.percentOfBase).toBe(2)
  })

  it('projects the accumulated store on a later date (crossing dates survive)', async () => {
    await writeDate(DATE, { '61': [club()] })
    await service.compute({ date: DATE, districts: ['61'] })
    // The earlier date's snapshot is pruned before the next run.
    await fs.rm(snapshotDir(DATE), { recursive: true, force: true })

    await writeDate(NEXT_DATE, { '61': [club({ dcpGoals: 3 })] })
    await service.compute({ date: NEXT_DATE, districts: ['61'] })

    const race = await readArtifact(NEXT_DATE)
    expect(race.timeline.map(p => [p.date, p.Distinguished])).toEqual([
      [DATE, 1],
      [NEXT_DATE, 1],
    ])
    const row = race.reached.find(r => r.clubId === '3045')
    expect(row?.tiers.Distinguished?.reachedOn).toBe(DATE)
    // Standing today is separate from the crossing, and carries no label.
    expect(row?.current?.level).toBe('NotDistinguished')
  })

  describe('as of the snapshot date (#1689)', () => {
    // After April 30, so TI's official codes are present (PY 2025-26).
    const EARLY = '2026-05-12'
    const LATE = '2026-05-19'
    const early = {
      '61': [
        club({ dcpGoals: 5, distinguishedStatus: 'D' }),
        club({ clubId: '77', clubName: 'Late Bloomer', dcpGoals: 2 }),
      ],
    }
    const late = {
      '61': [
        club({ dcpGoals: 7, membershipCount: 30, distinguishedStatus: 'S' }),
        club({ clubId: '77', clubName: 'Late Bloomer', dcpGoals: 5 }),
      ],
    }
    const comparable = (race: Awaited<ReturnType<typeof readArtifact>>) => ({
      ...race,
      generatedAt: 'frozen',
    })

    it('a rebuild of an earlier date excludes later crossings and shows the code held then', async () => {
      await writeDate(EARLY, early)
      await service.compute({ date: EARLY, districts: ['61'] })
      const forwardEarly = await readArtifact(EARLY)
      await writeDate(LATE, late)
      await service.compute({ date: LATE, districts: ['61'] })

      // Rebuild the earlier date while the store already holds LATE.
      await service.compute({ date: EARLY, districts: ['61'], force: true })
      const rebuilt = await readArtifact(EARLY)

      expect(rebuilt.timeline.map(p => p.date)).toEqual([EARLY])
      expect(rebuilt.observation.observedDates).toBe(1)
      expect(rebuilt.reached.map(r => r.clubId)).toEqual(['3045'])
      expect(rebuilt.reached[0]?.tiers).toEqual({
        Distinguished: { reachedOn: EARLY, observedAfter: null, rank: 1 },
      })
      expect(rebuilt.reached[0]?.official).toEqual({
        code: 'D',
        since: EARLY,
        observedAfter: null,
      })
      expect(rebuilt.byDistrict[0]?.reached.Select).toBe(0)
      // The rebuild reproduces what the forward run published that day.
      expect(comparable(rebuilt)).toEqual(comparable(forwardEarly))
    })

    it('the forward daily fold is unchanged: crossings stay sticky and the code is current', async () => {
      await writeDate(EARLY, early)
      await service.compute({ date: EARLY, districts: ['61'] })
      await writeDate(LATE, late)
      await service.compute({ date: LATE, districts: ['61'] })

      const race = await readArtifact(LATE)
      expect(
        race.timeline.map(p => [p.date, p.Distinguished, p.Select])
      ).toEqual([
        [EARLY, 1, 0],
        [LATE, 2, 1],
      ])
      const leader = race.reached.find(r => r.clubId === '3045')
      expect(leader?.tiers).toEqual({
        Distinguished: { reachedOn: EARLY, observedAfter: null, rank: 1 },
        Select: { reachedOn: LATE, observedAfter: EARLY, rank: 1 },
      })
      expect(leader?.official).toEqual({
        code: 'S',
        since: LATE,
        observedAfter: EARLY,
      })
      expect(
        race.reached.find(r => r.clubId === '77')?.tiers.Distinguished
      ).toEqual({ reachedOn: LATE, observedAfter: EARLY, rank: 2 })
      // The official-code rows agree with the day's own distribution.
      expect(race.distribution.byOfficialCode).toMatchObject({ D: 0, S: 1 })
    })
  })

  it('writes no artifact, without failing, when the date has no rankings file', async () => {
    await fs.mkdir(snapshotDir(DATE), { recursive: true })
    await fs.writeFile(
      path.join(snapshotDir(DATE), 'district_61.json'),
      JSON.stringify(districtSnapshot('61', DATE, [club()]))
    )

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.globalClubRacePath).toBeUndefined()
    expect(result.globalClubRaceFailed).toBe(false)
    await expect(fs.access(artifactPath(DATE))).rejects.toThrow()
  })

  it('writes no artifact when the store itself failed, and says so', async () => {
    await writeDate(DATE, { '61': [club()] })
    await fs.writeFile(path.join(cacheDir, 'club-race'), 'not a directory')

    const result = await service.compute({ date: DATE, districts: ['61'] })

    expect(result.clubRaceStoreFailed).toBe(true)
    expect(result.globalClubRacePath).toBeUndefined()
    expect(result.globalClubRaceFailed).toBe(true)
    expect(
      result.errors.some(e => e.error.includes(GLOBAL_CLUB_RACE_FILE_NAME))
    ).toBe(true)
    expect(result.globalTotalsFailed).toBe(false)
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
