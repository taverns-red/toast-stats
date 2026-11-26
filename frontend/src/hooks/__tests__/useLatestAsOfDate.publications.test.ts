import { describe, expect, it } from 'vitest'
import { rankingsAsOfDate, resolveGlobalFreshness } from '../useLatestAsOfDate'

const D1 = '2026-11-23'
const D2 = '2026-11-24'
const DATES = [D1, D2]

function pillAsOfDate(
  rankingsSnapshotDate: string,
  latestSnapshotDate: string,
  districtLatestSnapshotDate: string
): string | undefined {
  const asOfDate = rankingsAsOfDate(
    {
      asOfDate: rankingsSnapshotDate,
      sourceSnapshotDate: rankingsSnapshotDate,
    },
    latestSnapshotDate
  )
  return resolveGlobalFreshness({
    asOfDate,
    latestSnapshotDate,
    districtLatestSnapshotDate,
    isLatestSnapshot: true,
  }).asOfDate
}

describe('freshness publication agreement', () => {
  for (const rankingsSnapshotDate of DATES) {
    for (const latestSnapshotDate of DATES) {
      for (const districtLatestSnapshotDate of DATES) {
        const allSame =
          rankingsSnapshotDate === latestSnapshotDate &&
          latestSnapshotDate === districtLatestSnapshotDate

        it(`shows ${allSame ? rankingsSnapshotDate : 'no date'} for rankings ${rankingsSnapshotDate}, latest ${latestSnapshotDate}, district ${districtLatestSnapshotDate}`, () => {
          expect(
            pillAsOfDate(
              rankingsSnapshotDate,
              latestSnapshotDate,
              districtLatestSnapshotDate
            )
          ).toBe(allSame ? rankingsSnapshotDate : undefined)
        })
      }
    }
  }

  it('keeps the existing behavior for rankings without a snapshot date', () => {
    const asOfDate = rankingsAsOfDate({ asOfDate: D1 }, D2)

    expect(
      resolveGlobalFreshness({
        asOfDate,
        latestSnapshotDate: D2,
        districtLatestSnapshotDate: D2,
        isLatestSnapshot: true,
      }).asOfDate
    ).toBe(D1)
  })

  it('compares rankings with the viewed date when the caller passes one (#3221)', () => {
    const rankings = { asOfDate: D2, sourceSnapshotDate: D2 }

    expect(rankingsAsOfDate(rankings, D1, D2)).toBe(D2)
    expect(rankingsAsOfDate(rankings, D2, D1)).toBeUndefined()
  })
})
