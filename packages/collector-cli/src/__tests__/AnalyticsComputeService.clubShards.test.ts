/**
 * District club shards (#1901): compute-analytics writes, next to each
 * `district_<id>_analytics.json`, ten `district_<id>_clubs_<D>.json` files
 * that split its `allClubs` by the last digit of the club id. The club page
 * reads one of them instead of the whole district file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  DISTRICT_CLUB_SHARD_KEYS,
  DistrictClubShardSchema,
  districtClubShardKey,
} from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import type {
  DistrictStatistics,
  PreComputedAnalyticsFile,
  DistrictAnalytics,
} from '@taverns-red/analytics-core'

/**
 * Create an isolated test cache directory with automatic cleanup.
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(
    os.tmpdir(),
    `analytics-club-shards-test-${uniqueId}`
  )

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Create sample district statistics with configurable membership per club.
 */
function createSampleDistrictStatistics(
  districtId: string,
  date: string,
  overrides?: {
    clubOneMembership?: number
    clubTwoMembership?: number
    clubThreeMembership?: number
    clubOneGoals?: number
    clubTwoGoals?: number
    clubThreeGoals?: number
  }
): DistrictStatistics {
  const club1Membership = overrides?.clubOneMembership ?? 25
  const club2Membership = overrides?.clubTwoMembership ?? 15
  const club3Membership = overrides?.clubThreeMembership ?? 8
  const club1Goals = overrides?.clubOneGoals ?? 7
  const club2Goals = overrides?.clubTwoGoals ?? 4
  const club3Goals = overrides?.clubThreeGoals ?? 2
  const totalMembership = club1Membership + club2Membership + club3Membership

  return {
    districtId,
    snapshotDate: date,
    clubs: [
      {
        clubId: '1234',
        clubName: 'Test Club One',
        divisionId: 'A',
        areaId: 'A1',
        divisionName: 'Division Alpha',
        areaName: 'Area A1',
        membershipCount: club1Membership,
        paymentsCount: 30,
        dcpGoals: club1Goals,
        status: 'Active',
        charterDate: '2020-01-15',
        octoberRenewals: 10,
        aprilRenewals: 8,
        newMembers: 12,
        membershipBase: 20,
      },
      {
        clubId: '5678',
        clubName: 'Test Club Two',
        divisionId: 'A',
        areaId: 'A2',
        divisionName: 'Division Alpha',
        areaName: 'Area A2',
        membershipCount: club2Membership,
        paymentsCount: 18,
        dcpGoals: club2Goals,
        status: 'Active',
        charterDate: '2019-06-01',
        octoberRenewals: 6,
        aprilRenewals: 5,
        newMembers: 7,
        membershipBase: 12,
      },
      {
        clubId: '9012',
        clubName: 'Test Club Three',
        divisionId: 'B',
        areaId: 'B1',
        divisionName: 'Division Beta',
        areaName: 'Area B1',
        membershipCount: club3Membership,
        paymentsCount: 10,
        dcpGoals: club3Goals,
        status: 'Active',
        charterDate: '2021-03-20',
        octoberRenewals: 3,
        aprilRenewals: 2,
        newMembers: 5,
        membershipBase: 10,
      },
    ],
    divisions: [
      {
        divisionId: 'A',
        divisionName: 'Division Alpha',
        clubCount: 2,
        membershipTotal: club1Membership + club2Membership,
        paymentsTotal: 48,
      },
      {
        divisionId: 'B',
        divisionName: 'Division Beta',
        clubCount: 1,
        membershipTotal: club3Membership,
        paymentsTotal: 10,
      },
    ],
    areas: [
      {
        areaId: 'A1',
        areaName: 'Area A1',
        divisionId: 'A',
        clubCount: 1,
        membershipTotal: club1Membership,
        paymentsTotal: 30,
      },
      {
        areaId: 'A2',
        areaName: 'Area A2',
        divisionId: 'A',
        clubCount: 1,
        membershipTotal: club2Membership,
        paymentsTotal: 18,
      },
      {
        areaId: 'B1',
        areaName: 'Area B1',
        divisionId: 'B',
        clubCount: 1,
        membershipTotal: club3Membership,
        paymentsTotal: 10,
      },
    ],
    totals: {
      totalClubs: 3,
      totalMembership,
      totalPayments: 58,
      distinguishedClubs: 1,
      selectDistinguishedClubs: 0,
      presidentDistinguishedClubs: 0,
    },
  }
}

/**
 * Write a district snapshot to the test cache directory.
 */
async function writeDistrictSnapshot(
  cacheDir: string,
  date: string,
  districtId: string,
  stats: DistrictStatistics
): Promise<void> {
  const snapshotDir = path.join(cacheDir, 'snapshots', date)
  await fs.mkdir(snapshotDir, { recursive: true })
  const snapshotPath = path.join(snapshotDir, `district_${districtId}.json`)
  await fs.writeFile(snapshotPath, JSON.stringify(stats, null, 2), 'utf-8')
}

const DATE = '2024-11-15'
const DISTRICT = '1'

const analyticsDir = (cacheDir: string) =>
  path.join(cacheDir, 'snapshots', DATE, 'analytics')

async function readShard(cacheDir: string, shard: string) {
  const raw = await fs.readFile(
    path.join(
      analyticsDir(cacheDir),
      `district_${DISTRICT}_clubs_${shard}.json`
    ),
    'utf-8'
  )
  return { raw, json: JSON.parse(raw) as unknown }
}

describe('AnalyticsComputeService - district club shards (#1901)', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })
    await writeDistrictSnapshot(
      testCache.path,
      DATE,
      DISTRICT,
      createSampleDistrictStatistics(DISTRICT, DATE)
    )
    const service = new AnalyticsComputeService({ cacheDir: testCache.path })
    const result = await service.computeDistrictAnalytics(DATE, DISTRICT, {
      force: true,
    })
    expect(result.success).toBe(true)
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  it('writes all ten shards, empty ones included', async () => {
    const names = (await fs.readdir(analyticsDir(testCache.path)))
      .filter(n => n.startsWith(`district_${DISTRICT}_clubs_`))
      .sort()
    expect(names).toEqual(
      DISTRICT_CLUB_SHARD_KEYS.map(k => `district_${DISTRICT}_clubs_${k}.json`)
    )
  })

  it('writes shards that pass the shared contract and name their own key', async () => {
    for (const key of DISTRICT_CLUB_SHARD_KEYS) {
      const { json } = await readShard(testCache.path, key)
      const shard = DistrictClubShardSchema.parse(json)
      expect(shard.shard).toBe(key)
      expect(shard.districtId).toBe(DISTRICT)
      expect(shard.snapshotDate).toBe(DATE)
      for (const club of shard.clubs) {
        expect(districtClubShardKey(club.clubId)).toBe(key)
      }
    }
  })

  it("splits the analytics file's allClubs exactly: every club once, unchanged", async () => {
    const analytics = JSON.parse(
      await fs.readFile(
        path.join(
          analyticsDir(testCache.path),
          `district_${DISTRICT}_analytics.json`
        ),
        'utf-8'
      )
    ) as PreComputedAnalyticsFile<DistrictAnalytics>
    const fromShards: unknown[] = []
    for (const key of DISTRICT_CLUB_SHARD_KEYS) {
      const { json } = await readShard(testCache.path, key)
      fromShards.push(...(json as { clubs: unknown[] }).clubs)
    }
    const byId = (cs: unknown[]) =>
      [...cs].sort((a, b) =>
        String((a as { clubId: string }).clubId).localeCompare(
          String((b as { clubId: string }).clubId)
        )
      )
    expect(analytics.data.allClubs.length).toBe(3)
    expect(byId(fromShards)).toEqual(byId(analytics.data.allClubs))
  })

  it('puts the fixture clubs in the shard of their last digit', async () => {
    const ids = async (k: string) =>
      (
        (await readShard(testCache.path, k)).json as {
          clubs: { clubId: string }[]
        }
      ).clubs.map(c => c.clubId)
    expect(await ids('4')).toEqual(['1234'])
    expect(await ids('8')).toEqual(['5678'])
    expect(await ids('2')).toEqual(['9012'])
    expect(await ids('0')).toEqual([])
  })

  it('is written compact, not pretty-printed', async () => {
    const { raw } = await readShard(testCache.path, '4')
    expect(raw).not.toContain('\n')
  })
})
