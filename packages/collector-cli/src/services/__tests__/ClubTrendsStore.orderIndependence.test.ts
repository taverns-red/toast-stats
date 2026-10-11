/**
 * ClubTrendsStore order independence (#1741, plan P3-4).
 *
 * A rebuild can walk dates in any order, so the store a run saves must not
 * depend on the order its dates were processed in. Identity fields (name,
 * division, area, membershipBase) come from the LATEST date seen, not from
 * whichever date happened to be processed last.
 *
 * Club records are taken from a recorded production snapshot (D61,
 * 2026-06-08) so the shape is real, then varied per date to model a club
 * renamed and moved between divisions, one chartered mid-year and one that
 * drops off the roster.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ClubStatistics,
  DistrictStatistics,
} from '@taverns-red/analytics-core'
import { ClubTrendsStore, updateClubTrendsStore } from '../ClubTrendsStore.js'

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../shared-contracts/src/__tests__/__fixtures__/recorded-district-snapshot.json'
)

const DISTRICT = '61'
const PY = '2025-2026'
const D1 = '2025-08-15'
const D2 = '2025-11-20'
const D3 = '2026-03-10'

let recorded: DistrictStatistics

function clubAt(index: number, patch: Partial<ClubStatistics>): ClubStatistics {
  return { ...recorded.clubs[index]!, ...patch }
}

/** The district's snapshot on each date, as the transformer produces it. */
function snapshotFor(date: string): DistrictStatistics {
  const byDate: Record<string, ClubStatistics[]> = {
    [D1]: [
      clubAt(0, { membershipCount: 13, dcpGoals: 0 }),
      clubAt(1, { membershipCount: 8, dcpGoals: 0 }),
      // Drops off the roster after D1.
      clubAt(2, { membershipCount: 11, dcpGoals: 1 }),
    ],
    [D2]: [
      // Renamed.
      clubAt(0, {
        clubName: 'Limestone City Toastmasters',
        membershipCount: 15,
        dcpGoals: 2,
      }),
      clubAt(1, { membershipCount: 9, dcpGoals: 1 }),
      // Chartered mid-year: first seen at D2.
      clubAt(3, { membershipCount: 20, dcpGoals: 0 }),
    ],
    [D3]: [
      // Moved to another division and area; base revised.
      clubAt(0, {
        clubName: 'Limestone City Toastmasters',
        divisionId: 'B',
        divisionName: 'Division B',
        areaId: '15',
        areaName: 'Area 15',
        membershipBase: 14,
        membershipCount: 18,
        dcpGoals: 5,
      }),
      clubAt(1, { membershipCount: 10, dcpGoals: 3 }),
      clubAt(3, { membershipCount: 22, dcpGoals: 2 }),
    ],
  }
  return { ...recorded, snapshotDate: date, clubs: byDate[date]! }
}

async function storeBytesFor(
  order: string[],
  snapshotOn: (date: string) => DistrictStatistics = snapshotFor
): Promise<string> {
  const cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'club-trends-order-')
  )
  try {
    for (const date of order) {
      await updateClubTrendsStore(cacheDir, date, DISTRICT, snapshotOn(date))
    }
    return await fs.readFile(
      ClubTrendsStore.getPath(cacheDir, PY, DISTRICT),
      'utf-8'
    )
  } finally {
    await fs.rm(cacheDir, { recursive: true, force: true })
  }
}

describe('ClubTrendsStore order independence (#1741)', () => {
  beforeEach(async () => {
    const raw = JSON.parse(await fs.readFile(FIXTURE, 'utf-8')) as {
      data: DistrictStatistics
    }
    recorded = raw.data
    // updatedAt is the only wall-clock field; pin it so bytes compare.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T08:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves byte-identical output whatever order the dates are processed in', async () => {
    const inOrder = await storeBytesFor([D1, D2, D3])
    for (const order of [
      [D3, D1, D2],
      [D2, D3, D1],
      [D3, D2, D1],
      [D1, D3, D2],
    ]) {
      expect(await storeBytesFor(order), order.join(' → ')).toBe(inOrder)
    }
  })

  it('takes identity fields from the latest date, not the last processed', async () => {
    const saved = JSON.parse(await storeBytesFor([D3, D2, D1])) as {
      clubs: Record<string, Record<string, unknown>>
    }
    const moved = saved.clubs[recorded.clubs[0]!.clubId]!
    expect(moved).toMatchObject({
      clubName: 'Limestone City Toastmasters',
      divisionId: 'B',
      divisionName: 'Division B',
      areaId: '15',
      areaName: 'Area 15',
      membershipBase: 14,
    })
    expect(moved['membershipTrend']).toEqual([
      { date: D1, count: 13 },
      { date: D2, count: 15 },
      { date: D3, count: 18 },
    ])
  })

  it("keeps an older date's division when the latest snapshot omits it", async () => {
    // The latest snapshot carries no division/area for the club. An in-order
    // run keeps the earlier values (`|| existing`); out of order, the older
    // date must fill the placeholders the same way.
    const blankAtLatest = (date: string): DistrictStatistics => {
      const snap = snapshotFor(date)
      if (date !== D3) return snap
      return {
        ...snap,
        clubs: snap.clubs.map((c, i) =>
          i === 0
            ? {
                ...c,
                divisionId: '',
                divisionName: '',
                areaId: '',
                areaName: '',
              }
            : c
        ),
      }
    }
    const inOrder = await storeBytesFor([D1, D2, D3], blankAtLatest)
    const outOfOrder = await storeBytesFor([D3, D2, D1], blankAtLatest)
    expect(outOfOrder).toBe(inOrder)
    const saved = JSON.parse(outOfOrder) as {
      clubs: Record<string, Record<string, unknown>>
    }
    expect(saved.clubs[recorded.clubs[0]!.clubId]).toMatchObject({
      divisionId: 'A',
      divisionName: 'Division A',
      areaId: '01',
      areaName: 'Area 01',
    })
  })
})
