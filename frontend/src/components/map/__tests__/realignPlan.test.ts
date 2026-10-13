/**
 * Realignment sandbox plan (#1819): the URL encoding of a proposed
 * assignment and the balance metrics it drives. Fixtures follow the real
 * D61 analytics shape (`allClubs[]` from
 * snapshots/2026-10-11/analytics/district_61_analytics.json): unpadded
 * club ids, letter divisions, two-digit district-unique area ids.
 */
import { describe, expect, it } from 'vitest'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import {
  AREA_NORM,
  applyPlan,
  areaOptions,
  balanceMetrics,
  decodePlan,
  encodePlan,
  newAreaId,
  normStatus,
  planCsvRows,
  planSummary,
  setMove,
  type Plan,
} from '../realign/realignPlan'

const club = (
  clubId: string,
  divisionId: string,
  areaId: string,
  o: Partial<ClubTrend> = {}
): ClubTrend =>
  ({
    clubId,
    clubName: `Club ${clubId}`,
    divisionId,
    divisionName: `Division ${divisionId}`,
    areaId,
    areaName: `Area ${areaId}`,
    membershipTrend: [
      { date: '2026-10-10', count: 9 },
      { date: '2026-10-11', count: 10 },
    ],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    clubStatus: 'Active',
    ...o,
  }) as ClubTrend

// Area A01 has 4 clubs, A02 has 3 (under the norm), B12 has 6.
const CLUBS: ClubTrend[] = [
  club('3045', 'A', '01', { currentStatus: 'intervention-required' }),
  club('3046', 'A', '01'),
  club('3047', 'A', '01', { distinguishedLevel: 'Distinguished' }),
  club('3048', 'A', '01', { currentStatus: 'vulnerable' }),
  club('5101', 'A', '02'),
  club('5102', 'A', '02', {
    distinguishedLevel: 'Select',
    isProvisionallyDistinguished: true,
  }),
  club('5103', 'A', '02', { membershipTrend: [] }),
  club('7001', 'B', '12'),
  club('7002', 'B', '12'),
  club('7003', 'B', '12'),
  club('7004', 'B', '12'),
  club('7005', 'B', '12'),
  club('7006', 'B', '12', { currentStatus: 'vulnerable' }),
]

const A01 = { divisionId: 'A', areaId: '01' }
const A02 = { divisionId: 'A', areaId: '02' }
const B12 = { divisionId: 'B', areaId: '12' }

const plan = (...moves: Array<[string, typeof A01]>): Plan => new Map(moves)

describe('encodePlan / decodePlan', () => {
  it('round-trips a plan, grouped by target area, in URL-safe characters', () => {
    const p = plan(['7006', A02], ['3048', A02], ['7005', A01])
    const raw = encodePlan(p)
    expect(raw).toBe('A-01-7005_A-02-3048.7006')
    // URLSearchParams leaves it as-is: no percent-encoding in shared links.
    expect(new URLSearchParams({ plan: raw }).toString()).toBe(`plan=${raw}`)
    expect(decodePlan(raw, CLUBS)).toEqual(p)
  })

  it('is deterministic whatever order the moves were made in', () => {
    const a = plan(['3048', A02], ['7006', A02])
    const b = plan(['7006', A02], ['3048', A02])
    expect(encodePlan(a)).toBe(encodePlan(b))
  })

  it('encodes the empty plan as the empty string, and decodes null/empty to it', () => {
    expect(encodePlan(new Map())).toBe('')
    expect(decodePlan(null, CLUBS).size).toBe(0)
    expect(decodePlan('', CLUBS).size).toBe(0)
  })

  it('keeps a new area (one no club is in yet)', () => {
    const p = plan(['7005', { divisionId: 'B', areaId: '15' }])
    expect(decodePlan(encodePlan(p), CLUBS)).toEqual(p)
  })

  it('drops unknown clubs, no-op moves and malformed groups (URL-seedable input)', () => {
    const raw = [
      'A-02-3048.9999', // 9999 is not in the district
      'B-12-7001', // already in B12: a no-op
      'A-01', // no clubs
      'A-<script>-7002', // bad area id
      'A-01-70x3', // bad club id
      'A-01-7004-extra',
    ].join('_')
    expect(decodePlan(raw, CLUBS)).toEqual(plan(['3048', A02]))
  })

  it('a club listed twice keeps its last target', () => {
    expect(decodePlan('A-01-7006_A-02-7006', CLUBS)).toEqual(
      plan(['7006', A02])
    )
  })

  it('stays compact: 30 moves fit in well under 300 characters', () => {
    const many = new Map(
      Array.from({ length: 30 }, (_, i) => [
        String(1000000 + i),
        i % 2 ? A01 : A02,
      ])
    )
    expect(encodePlan(many).length).toBeLessThan(300)
  })
})

describe('setMove', () => {
  it('adds a move, and removes it when the club goes back home', () => {
    const c = CLUBS.find(x => x.clubId === '7006')!
    const moved = setMove(new Map(), c, A02)
    expect(moved).toEqual(plan(['7006', A02]))
    expect(setMove(moved, c, B12).size).toBe(0)
  })

  it('never mutates the plan it was given', () => {
    const before = plan(['7006', A02])
    setMove(
      before,
      CLUBS.find(x => x.clubId === '7005')!,
      A01
    )
    expect(before.size).toBe(1)
  })
})

describe('applyPlan', () => {
  it('reassigns moved clubs to the target division and area, with names', () => {
    const out = applyPlan(CLUBS, plan(['7006', A02]))
    const moved = out.find(c => c.clubId === '7006')!
    expect(moved).toMatchObject({
      divisionId: 'A',
      divisionName: 'Division A',
      areaId: '02',
      areaName: 'Area 02',
    })
    // Everything else is untouched (same objects).
    expect(out.find(c => c.clubId === '7001')).toBe(
      CLUBS.find(c => c.clubId === '7001')
    )
  })

  it('names a new area after its id', () => {
    const out = applyPlan(
      CLUBS,
      plan(['7006', { divisionId: 'B', areaId: '15' }])
    )
    expect(out.find(c => c.clubId === '7006')).toMatchObject({
      divisionId: 'B',
      areaId: '15',
      areaName: 'Area 15',
    })
  })
})

describe('balanceMetrics', () => {
  it('counts clubs, members, health mix and Distinguished clubs per area', () => {
    const { areas } = balanceMetrics(CLUBS)
    expect(areas.map(a => a.code)).toEqual(['A01', 'A02', 'B12'])
    const a01 = areas[0]!
    expect(a01).toMatchObject({
      divisionId: 'A',
      areaId: '01',
      clubs: 4,
      members: 40,
      health: { thriving: 2, vulnerable: 1, intervention: 1 },
      distinguished: 1,
    })
    // A club with no membership trend counts 0 members; a provisional
    // (pre-April) Distinguished level still counts as Distinguished.
    expect(areas[1]).toMatchObject({ clubs: 3, members: 20, distinguished: 1 })
  })

  it('rolls areas up into divisions', () => {
    const { divisions } = balanceMetrics(CLUBS)
    expect(divisions.map(d => [d.code, d.areas, d.clubs, d.members])).toEqual([
      ['A', 2, 7, 60],
      ['B', 1, 6, 60],
    ])
  })

  it('updates when a plan moves a club (the live recount)', () => {
    const { areas, divisions } = balanceMetrics(
      applyPlan(CLUBS, plan(['7006', A02]))
    )
    expect(areas.find(a => a.code === 'A02')).toMatchObject({
      clubs: 4,
      members: 30,
      health: { thriving: 3, vulnerable: 1, intervention: 0 },
    })
    expect(areas.find(a => a.code === 'B12')).toMatchObject({ clubs: 5 })
    expect(divisions.find(d => d.code === 'A')).toMatchObject({ clubs: 8 })
  })

  it('an area emptied by the plan disappears', () => {
    const emptied = plan(['5101', A01], ['5102', A01], ['5103', A01])
    const { areas, divisions } = balanceMetrics(applyPlan(CLUBS, emptied))
    expect(areas.map(a => a.code)).toEqual(['A01', 'B12'])
    expect(divisions.find(d => d.code === 'A')).toMatchObject({ areas: 1 })
  })
})

describe('normStatus and planSummary', () => {
  it('flags areas against the 4–6 club norm', () => {
    expect(AREA_NORM).toEqual({ min: 4, max: 6 })
    expect(normStatus(3)).toBe('under')
    expect(normStatus(4)).toBe('within')
    expect(normStatus(6)).toBe('within')
    expect(normStatus(7)).toBe('over')
  })

  it('summarises moves and areas outside the norm, current against proposed', () => {
    const p = plan(['7006', A02])
    const s = planSummary(CLUBS, p)
    expect(s).toEqual({
      moved: 1,
      outsideNorm: { current: 1, proposed: 0 },
      areas: { current: 3, proposed: 3 },
    })
  })
})

describe('areaOptions and newAreaId', () => {
  it('lists every existing area plus areas the plan created, grouped by division', () => {
    const opts = areaOptions(
      CLUBS,
      plan(['7006', { divisionId: 'B', areaId: '15' }])
    )
    expect(opts.map(o => [o.divisionId, o.areaId, o.label])).toEqual([
      ['A', '01', 'A01'],
      ['A', '02', 'A02'],
      ['B', '12', 'B12'],
      ['B', '15', 'B15 (new)'],
    ])
  })

  it('a new area takes the next unused number after its division’s highest', () => {
    expect(newAreaId('A', CLUBS, new Map())).toBe('03')
    expect(newAreaId('B', CLUBS, new Map())).toBe('13')
    // A number another division already uses is skipped (area ids are
    // district-unique), and so is one the plan already created.
    const withB13 = [...CLUBS, club('8000', 'C', '13')]
    expect(
      newAreaId('B', withB13, plan(['7006', { divisionId: 'B', areaId: '14' }]))
    ).toBe('15')
  })
})

describe('planCsvRows', () => {
  it('exports every club with its current and proposed area, moved clubs flagged', () => {
    const rows = planCsvRows(CLUBS, plan(['7006', A02]))
    expect(rows[0]).toEqual([
      'Club number',
      'Club name',
      'Current division',
      'Current area',
      'Proposed division',
      'Proposed area',
      'Moved',
      'Members',
      'Club health',
      'Distinguished level',
    ])
    expect(rows).toHaveLength(CLUBS.length + 1)
    expect(rows.find(r => r[0] === '7006')).toEqual([
      '7006',
      'Club 7006',
      'B',
      'B12',
      'A',
      'A02',
      'yes',
      10,
      'vulnerable',
      'NotDistinguished',
    ])
    expect(rows.find(r => r[0] === '7001')?.[6]).toBe('no')
  })

  it('never exports contact details', () => {
    const withContact = CLUBS.map(c => ({
      ...c,
      email: 'x@example.org',
      phone: '555-0100',
    }))
    const flat = JSON.stringify(planCsvRows(withContact, new Map()))
    expect(flat).not.toContain('example.org')
    expect(flat).not.toContain('555-0100')
  })
})
