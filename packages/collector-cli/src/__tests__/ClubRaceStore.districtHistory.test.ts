/**
 * ClubRaceStore district change points (#1816, Phase 2 of epic #1781).
 *
 * The fold already sees every (date, district, club) triple; it now keeps
 * them per club as one min/max run per district plus `firstSeen`, so the
 * club-district history can date a move to the day. The P4 contract:
 * - an out-of-order past date lands in sorted position (min/max), so every
 *   walk order converges on the same bytes;
 * - re-running a date changes nothing (idempotent rebuild);
 * - a store written before change points existed is honest about it: the
 *   dates it already folded are `districtHistoryGaps` until a rebuild folds
 *   them again, and its entries keep the one sighting they can vouch for.
 *
 * Real on-disk temp directories, never the network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ClubStatistics } from '@taverns-red/analytics-core'
import { ClubRaceStore } from '../services/ClubRaceStore.js'

const PY = '2026-2027'

function club(overrides: Partial<ClubStatistics> = {}): ClubStatistics {
  return {
    clubId: '977',
    clubName: 'Professional Women Toastmasters',
    divisionId: 'A',
    areaId: '01',
    membershipCount: 22,
    paymentsCount: 40,
    dcpGoals: 1,
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

const district = (districtId: string, clubs: ClubStatistics[]) => ({
  districtId,
  clubs,
})

/** A mid-year move: D10 through August, D11 from 3 September. */
const WALK: Array<[string, string]> = [
  ['2026-07-31', '10'],
  ['2026-08-15', '10'],
  ['2026-08-31', '10'],
  ['2026-09-03', '11'],
  ['2026-09-30', '11'],
]

function fold(order: Array<[string, string]>): ClubRaceStore {
  const store = ClubRaceStore.create(PY)
  for (const [date, districtId] of order) {
    store.upsertSnapshot(date, [district(districtId, [club()])])
  }
  return store
}

/** The store minus its wall-clock stamp. */
const stable = (store: ClubRaceStore) => {
  const { updatedAt: _ignored, ...rest } = store.toJSON()
  return rest
}

describe('ClubRaceStore — district change points (#1816)', () => {
  it('records firstSeen and one run per district, from first to last sighting', () => {
    const entry = fold(WALK).getClub('977')!
    expect(entry.firstSeen).toBe('2026-07-31')
    expect(entry.districtHistory).toEqual([
      { districtId: '10', from: '2026-07-31', to: '2026-08-31' },
      { districtId: '11', from: '2026-09-03', to: '2026-09-30' },
    ])
    // The latest sighting still names the club's district.
    expect(entry.districtId).toBe('11')
  })

  it('a fresh store has no gaps: every date it folded recorded change points', () => {
    expect(fold(WALK).toJSON().districtHistoryGaps).toEqual([])
  })

  it('an out-of-order past date inserts in sorted position: any walk order gives identical bytes', () => {
    const forward = stable(fold(WALK))
    const reversed = stable(fold([...WALK].reverse()))
    const shuffled = stable(
      fold([WALK[3]!, WALK[0]!, WALK[4]!, WALK[2]!, WALK[1]!])
    )
    expect(reversed).toEqual(forward)
    expect(shuffled).toEqual(forward)
  })

  it('is idempotent: re-running every date changes nothing', () => {
    const once = fold(WALK)
    const twice = fold([...WALK, ...WALK])
    expect(stable(twice)).toEqual(stable(once))
  })

  it('records both districts when one date lists the club twice (the reader resolves it)', () => {
    // 2026-06-30 shape (#2079): district_01 and district_201 both list 977,
    // once as "977" and once zero-padded.
    const store = ClubRaceStore.create('2025-2026')
    store.upsertSnapshot('2026-06-29', [district('01', [club()])])
    store.upsertSnapshot('2026-06-30', [
      district('01', [club()]),
      district('201', [club({ clubId: '00000977' })]),
    ])
    expect(store.getClub('977')!.districtHistory).toEqual([
      { districtId: '01', from: '2026-06-29', to: '2026-06-30' },
      { districtId: '201', from: '2026-06-30', to: '2026-06-30' },
    ])
  })

  describe('a store written before change points existed', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'club-race-cp-'))
      const legacy = {
        _format: { version: '1.0.0', type: 'club-race-store' },
        programYear: PY,
        updatedAt: '2026-10-16T12:00:00.000Z',
        observedDates: ['2026-07-26', '2026-08-31', '2026-09-30'],
        clubs: {
          '977': {
            clubId: '977',
            clubName: 'Professional Women Toastmasters',
            districtId: '201',
            lastSeen: '2026-09-30',
            reached: {},
          },
        },
      }
      const file = ClubRaceStore.getPath(tempDir, PY)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(legacy), 'utf-8')
    })

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('marks every date it already folded as a gap, and keeps the sighting it can vouch for', async () => {
      const store = (await ClubRaceStore.load(tempDir, PY))!
      store.upsertSnapshot('2026-10-01', [district('201', [club()])])

      expect(store.toJSON().districtHistoryGaps).toEqual([
        '2026-07-26',
        '2026-08-31',
        '2026-09-30',
      ])
      const entry = store.getClub('977')!
      // lastSeen 2026-09-30 in 201 was observed; earlier days were not kept.
      expect(entry.districtHistory).toEqual([
        { districtId: '201', from: '2026-09-30', to: '2026-10-01' },
      ])
      expect(entry.firstSeen).toBe('2026-09-30')
    })

    it('a rebuild of a gap date removes the gap and sharpens the run', async () => {
      const store = (await ClubRaceStore.load(tempDir, PY))!
      store.upsertSnapshot('2026-07-26', [district('201', [club()])])

      expect(store.toJSON().districtHistoryGaps).toEqual([
        '2026-08-31',
        '2026-09-30',
      ])
      expect(store.getClub('977')!.districtHistory).toEqual([
        { districtId: '201', from: '2026-07-26', to: '2026-09-30' },
      ])
      expect(store.getClub('977')!.firstSeen).toBe('2026-07-26')
    })

    it('change points survive a save and load', async () => {
      const store = (await ClubRaceStore.load(tempDir, PY))!
      store.upsertSnapshot('2026-10-01', [district('201', [club()])])
      await store.save(tempDir)
      const loaded = (await ClubRaceStore.load(tempDir, PY))!
      expect(loaded.toJSON()).toEqual(store.toJSON())
    })
  })
})
