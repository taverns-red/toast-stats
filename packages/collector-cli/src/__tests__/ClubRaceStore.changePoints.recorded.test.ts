/**
 * Club-race change points on RECORDED district files (#1816, #2079).
 *
 * `fixtures/club-race-change-points/{date}/district_{id}.json` are real
 * staging snapshot files read once on 2026-10-17, trimmed to two clubs of
 * the 2026 reformation (977 and 1015, District 01 → District 201) and
 * stripped of contact fields:
 *   2026-06-29 district_01   the last ordinary day of 2025-26
 *   2026-06-30 district_01   the June close, collected 2026-10-17
 *   2026-06-30 district_201  the SAME June close under the new structure,
 *                            collected 2026-07-31, zero-padded ids (#2079)
 *   2026-07-26 district_201  the first 2026-27 date
 * The production fold scopes a date to its `all-districts-rankings.json`,
 * and the recorded 2026-06-30 rankings list 128 old-structure districts and
 * none of 201-231, so district_201's June close is never folded today. This
 * test folds it anyway — the worst case, should a rebuild ever widen the
 * scope — and pins that it only ever lands as a second run on the same day.
 *
 * The stores it builds are the golden inputs of the club-district history
 * test (scripts/lib/__tests__/fixtures/identity-history/change-points/),
 * so the history fold is tested on exactly what this store writes.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ClubStatistics } from '@taverns-red/analytics-core'
import { ClubRaceStoreSchema } from '@taverns-red/shared-contracts'
import { ClubRaceStore } from '../services/ClubRaceStore.js'

const FIXTURES = path.resolve(__dirname, 'fixtures/club-race-change-points')
const GOLDEN = path.resolve(
  __dirname,
  '../../../../scripts/lib/__tests__/fixtures/identity-history/change-points'
)

function observation(date: string, districtId: string) {
  const file = JSON.parse(
    fs.readFileSync(
      path.join(FIXTURES, date, `district_${districtId}.json`),
      'utf-8'
    )
  ) as { districtId: string; data: { clubs: ClubStatistics[] } }
  return { districtId: file.districtId, clubs: file.data.clubs }
}

function buildStores(): Record<string, ClubRaceStore> {
  const py2526 = ClubRaceStore.create('2025-2026')
  py2526.upsertSnapshot('2026-06-29', [observation('2026-06-29', '01')])
  py2526.upsertSnapshot('2026-06-30', [
    observation('2026-06-30', '01'),
    observation('2026-06-30', '201'),
  ])
  const py2627 = ClubRaceStore.create('2026-2027')
  py2627.upsertSnapshot('2026-07-26', [observation('2026-07-26', '201')])
  return { '2025-2026': py2526, '2026-2027': py2627 }
}

describe('ClubRaceStore change points — recorded 2026 reformation (#1816)', () => {
  it('records the June close under both districts as two runs on one day', () => {
    const stores = buildStores()
    expect(stores['2025-2026']!.getClub('977')!.districtHistory).toEqual([
      { districtId: '01', from: '2026-06-29', to: '2026-06-30' },
      { districtId: '201', from: '2026-06-30', to: '2026-06-30' },
    ])
    expect(stores['2026-2027']!.getClub('977')!.districtHistory).toEqual([
      { districtId: '201', from: '2026-07-26', to: '2026-07-26' },
    ])
  })

  it('matches the golden stores the history fold is tested on', () => {
    for (const [py, store] of Object.entries(buildStores())) {
      const golden = ClubRaceStoreSchema.parse(
        JSON.parse(
          fs.readFileSync(path.join(GOLDEN, py, 'first-reached.json'), 'utf-8')
        )
      )
      expect({ ...store.toJSON(), updatedAt: golden.updatedAt }).toEqual(golden)
    }
  })
})
