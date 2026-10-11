/**
 * Store date-safety contract (ADR-015 P4, #1764).
 *
 * Every accumulating store must survive a rebuild of an EARLIER date after a
 * later one: the later date's state stays exactly as it was. Re-deriving one
 * past date (`dates=2024-01-31`) is a normal pipeline mode, so a store that
 * lets the older date win silently regresses data no gate reads.
 *
 * - awards history: newest snapshotDate per PY wins (the #1764 guard)
 * - time-series: upsert by date, so other dates' points are untouched
 * - club-race: crossings take the min date, identity follows the max date
 *
 * Real on-disk temp directories, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ClubStatistics } from '@taverns-red/analytics-core'
import type {
  ProgramYearIndexFile,
  TimeSeriesDataPoint,
} from '@taverns-red/shared-contracts'
import { DistrictAwardsHistoryStore } from '../services/DistrictAwardsHistoryStore.js'
import { TimeSeriesIndexWriter } from '../services/TimeSeriesIndexWriter.js'
import { ClubRaceStore } from '../services/ClubRaceStore.js'

const LATER = '2024-06-30'
const EARLIER = '2024-01-31'

describe('store date-safety contract (ADR-015 P4)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-date-safety-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('awards history: an earlier date never replaces a later summary', () => {
    const store = DistrictAwardsHistoryStore.create()
    const later = {
      programYear: '2023-2024',
      distinguishedTier: 'NotDistinguished',
      avgClubSize: 16.162650602409638,
      totalMembership: 2683,
      activeClubs: 166,
      snapshotDate: LATER,
    }
    store.upsertYearSummary('61', later)
    store.upsertYearSummary('61', {
      ...later,
      distinguishedTier: 'Distinguished',
      snapshotDate: EARLIER,
    })

    expect(store.getYearSummary('61', '2023-2024')).toEqual(later)
  })

  it('time-series: rebuilding an earlier date leaves the later point intact', async () => {
    const point = (date: string, membership: number): TimeSeriesDataPoint => ({
      date,
      snapshotId: date,
      membership,
      payments: membership,
      dcpGoals: 10,
      distinguishedTotal: 2,
      clubCounts: {
        total: 100,
        thriving: 50,
        vulnerable: 10,
        interventionRequired: 5,
      },
    })
    const writer = new TimeSeriesIndexWriter({ cacheDir: tempDir })
    const later = point(LATER, 2683)
    await writer.writeDataPoint('61', point(EARLIER, 2500))
    await writer.writeDataPoint('61', later)

    await writer.writeDataPoint('61', point(EARLIER, 2510))

    const index = JSON.parse(
      await fs.readFile(
        path.join(tempDir, 'time-series', 'district_61', '2023-2024.json'),
        'utf-8'
      )
    ) as ProgramYearIndexFile
    expect(index.dataPoints.map(p => p.date)).toEqual([EARLIER, LATER])
    expect(index.dataPoints[1]).toEqual(later)
  })

  it('club-race: rebuilding an earlier date keeps the later crossing and identity', () => {
    const club = (overrides: Partial<ClubStatistics>): ClubStatistics => ({
      clubId: '3045',
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
    })
    const store = ClubRaceStore.create('2023-2024')
    store.upsertSnapshot(LATER, [
      { districtId: '61', clubs: [club({ clubName: 'Renamed Club' })] },
    ])
    const crossing = store.getClub('3045')?.reached.Distinguished

    // Earlier date: below Distinguished, old name, old district.
    store.upsertSnapshot(EARLIER, [
      { districtId: '42', clubs: [club({ dcpGoals: 0 })] },
    ])

    const after = store.getClub('3045')
    expect(crossing?.on).toBe(LATER)
    expect(after?.reached.Distinguished?.on).toBe(LATER)
    expect(after?.clubName).toBe('Renamed Club')
    expect(after?.districtId).toBe('61')
    expect(after?.lastSeen).toBe(LATER)
  })
})
