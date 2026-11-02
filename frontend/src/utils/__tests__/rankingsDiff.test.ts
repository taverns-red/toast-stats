import { describe, expect, it } from 'vitest'
import {
  biggestMovers,
  diffRankings,
  recordedDatesUnion,
  regionTotals,
  type RankingsDiffRow,
} from '../rankingsDiff'

/* Region and world What Changed (#2476, phase 1): the district-grain diff of
   two dates' all-districts-rankings files. */

function row(
  districtId: string,
  region: string,
  over: Partial<RankingsDiffRow> = {}
): RankingsDiffRow {
  return {
    districtId,
    districtName: `District ${districtId}`,
    region,
    paidClubs: 100,
    totalPayments: 1000,
    distinguishedClubs: 10,
    aggregateScore: 50,
    overallRank: 10,
    newCharteredClubs: 1,
    suspendedClubs: 1,
    ...over,
  }
}

const byRow = (r: { region: string }) => r.region

describe('diffRankings (#2476)', () => {
  const from = [
    row('1', '05', {
      paidClubs: 100,
      totalPayments: 1000,
      aggregateScore: 90,
      overallRank: 3,
    }),
    row('2', '05', {
      paidClubs: 80,
      totalPayments: 900,
      aggregateScore: 80,
      overallRank: 5,
    }),
    // Only on the from date.
    row('3', '05', {
      paidClubs: 50,
      totalPayments: 400,
      distinguishedClubs: 4,
    }),
    row('9', '07', { paidClubs: 70 }),
  ]
  const to = [
    row('1', '05', {
      paidClubs: 103,
      totalPayments: 1200,
      aggregateScore: 70,
      overallRank: 8,
      suspendedClubs: 2,
    }),
    row('2', '05', {
      paidClubs: 82,
      totalPayments: 1000,
      aggregateScore: 85,
      overallRank: 4,
      newCharteredClubs: 3,
    }),
    // Only on the to date.
    row('4', '05', {
      paidClubs: 20,
      totalPayments: 100,
      distinguishedClubs: 0,
      aggregateScore: 10,
      overallRank: 90,
    }),
    row('9', '07', { paidClubs: 75 }),
  ]
  const opts = { regionOfFrom: byRow, regionOfTo: byRow }

  it('sums each date over the rows present on that date', () => {
    const d = diffRankings(from, to, { ...opts, region: '05' })
    expect(d.totals.paidClubs).toEqual({ from: 230, to: 205, delta: -25 })
    expect(d.totals.payments).toEqual({ from: 2300, to: 2300, delta: 0 })
    expect(d.totals.distinguished).toEqual({ from: 24, to: 20, delta: -4 })
  })

  it('without a region it sums worldwide', () => {
    const d = diffRankings(from, to, opts)
    expect(d.totals.paidClubs).toEqual({ from: 300, to: 280, delta: -20 })
    expect(d.districts).toHaveLength(5)
  })

  it('reports rank moves overall and within the region', () => {
    const d = diffRankings(from, to, { ...opts, region: '05' })
    const one = d.districts.find(c => c.districtId === '1')!
    // Overall 3 → 8 is a fall of 5; climbing is positive.
    expect(one.overallRank).toEqual({ from: 3, to: 8, move: -5 })
    // In the region: 1st of 3 → 2nd of 3 (by aggregate score).
    expect(one.scopeRank).toEqual({ from: 1, to: 2, move: -1 })
    const two = d.districts.find(c => c.districtId === '2')!
    expect(two.overallRank).toEqual({ from: 5, to: 4, move: 1 })
    expect(two.scopeRank).toEqual({ from: 2, to: 1, move: 1 })
    expect(two.paidClubs).toEqual({ from: 80, to: 82, delta: 2 })
  })

  it('keeps a district present on only one date, with no delta', () => {
    const d = diffRankings(from, to, { ...opts, region: '05' })
    const gone = d.districts.find(c => c.districtId === '3')!
    expect(gone.presence).toBe('from-only')
    expect(gone.paidClubs).toEqual({ from: 50, to: null, delta: null })
    expect(gone.overallRank.move).toBeNull()
    expect(gone.scopeRank.to).toBeNull()
    const added = d.districts.find(c => c.districtId === '4')!
    expect(added.presence).toBe('to-only')
    expect(added.payments).toEqual({ from: null, to: 100, delta: null })
    expect(added.scopeRank).toEqual({ from: null, to: 3, move: null })
  })

  it('lists suspended and new-charter changes as notable events', () => {
    const d = diffRankings(from, to, { ...opts, region: '05' })
    expect(d.events).toEqual([
      expect.objectContaining({
        districtId: '1',
        kind: 'suspended',
        from: 1,
        to: 2,
        delta: 1,
      }),
      expect.objectContaining({
        districtId: '2',
        kind: 'new-charter',
        from: 1,
        to: 3,
        delta: 2,
      }),
    ])
  })

  it('treats a census-wide zero suspended count as not collected, not a change', () => {
    const zeroFrom = from.map(r => ({ ...r, suspendedClubs: 0 }))
    const d = diffRankings(zeroFrom, to, { ...opts, region: '05' })
    expect(d.events.some(e => e.kind === 'suspended')).toBe(false)
  })

  it('places a district in the region it belonged to on each date', () => {
    const moved = [row('9', '05', { paidClubs: 75 })]
    const d = diffRankings([row('9', '07', { paidClubs: 70 })], moved, {
      ...opts,
      region: '05',
    })
    expect(d.totals.paidClubs).toEqual({ from: 0, to: 75, delta: 75 })
    expect(d.districts[0]!.paidClubs).toEqual({
      from: null,
      to: 75,
      delta: null,
    })
  })
})

describe('regionTotals (#2476)', () => {
  it('breaks the world down by region, sorted by region id', () => {
    const r = regionTotals(
      [row('1', '07', { paidClubs: 10 }), row('2', '05', { paidClubs: 20 })],
      [row('1', '07', { paidClubs: 12 }), row('2', '05', { paidClubs: 19 })],
      { regionOfFrom: byRow, regionOfTo: byRow }
    )
    expect(r.map(x => x.region)).toEqual(['05', '07'])
    expect(r[0]!.paidClubs).toEqual({ from: 20, to: 19, delta: -1 })
    expect(r[1]!.districtCount).toBe(1)
  })
})

describe('biggestMovers (#2476)', () => {
  const d = diffRankings(
    [
      row('1', '05', { overallRank: 10, totalPayments: 100 }),
      row('2', '05', { overallRank: 20, totalPayments: 100 }),
      row('3', '05', { overallRank: 30, totalPayments: 100 }),
    ],
    [
      row('1', '05', { overallRank: 12, totalPayments: 500 }),
      row('2', '05', { overallRank: 5, totalPayments: 150 }),
      row('3', '05', { overallRank: 30, totalPayments: 90 }),
    ],
    { regionOfFrom: byRow, regionOfTo: byRow }
  )

  it('ranks by the size of the overall rank move, skipping no-moves', () => {
    expect(
      biggestMovers(d.districts, 'overallRank', 5).map(c => c.districtId)
    ).toEqual(['2', '1'])
  })

  it('ranks by the size of the payments change', () => {
    expect(
      biggestMovers(d.districts, 'payments', 2).map(c => c.districtId)
    ).toEqual(['1', '2'])
  })
})

describe('recordedDatesUnion (#2476)', () => {
  it('unions the per-district snapshot index, ascending and de-duplicated', () => {
    expect(
      recordedDatesUnion({
        '61': ['2026-10-01', '2026-10-15'],
        '5': ['2026-10-15', '2026-09-30'],
      })
    ).toEqual(['2026-09-30', '2026-10-01', '2026-10-15'])
  })
})
