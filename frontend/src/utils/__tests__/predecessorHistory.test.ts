import { describe, it, expect } from 'vitest'
import type {
  ClubDistrictHistoryClub,
  ClubStatisticsFile,
} from '@taverns-red/shared-contracts'
import {
  aggregatePredecessor,
  joinRosterToPredecessors,
  pickProbeClubId,
  priorProgramYear,
  probeVerdict,
  totalAggregates,
} from '../predecessorHistory'
import { yearEndDateFor } from '../yearEndSnapshot'

/* #2427 — "Before this district existed": the current roster of a new
   district joined to the club-district history (#1782), grouped by the
   district each club was in the prior program year. Fixtures follow the
   real shard and year-end snapshot shapes read from the prod CDN on
   2026-11-01 (club 977: D01 to 2025-26, D201 from 2026-27). */

const PRIOR = '2025-2026'

function history(
  byProgramYear: Record<string, string>
): ClubDistrictHistoryClub {
  const years = Object.keys(byProgramYear).sort()
  return {
    name: 'A club',
    formerNames: [],
    firstSeen: `${years[0]!.slice(0, 4)}-07-31`,
    lastSeen: '2026-10-31',
    spans: [
      { from: `${years[0]!.slice(0, 4)}-07-31`, to: null, districtId: '1' },
    ],
    byProgramYear,
  } as ClubDistrictHistoryClub
}

/** Year-end club record, shaped like snapshots/2026-06-30/district_01.json. */
function yearEndClub(
  clubId: string,
  over: Partial<ClubStatisticsFile> = {}
): ClubStatisticsFile {
  return {
    clubId,
    clubName: `Club ${clubId}`,
    divisionId: 'A',
    areaId: '01',
    membershipCount: 20,
    paymentsCount: 42,
    dcpGoals: 9,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 01',
    octoberRenewals: 18,
    aprilRenewals: 18,
    newMembers: 6,
    membershipBase: 20,
    clubStatus: 'Active',
    distinguishedStatus: 'P',
    ...over,
  } as ClubStatisticsFile
}

describe('priorProgramYear', () => {
  it('is the program year before the one on screen', () => {
    expect(priorProgramYear('2026-2027')).toMatchObject({
      year: 2025,
      label: '2025-2026',
    })
  })
})

describe('joinRosterToPredecessors (#2427)', () => {
  const shard: Record<string, ClubDistrictHistoryClub> = {
    // Two clubs from D01, one from D52 and one from D100.
    '977': history({ '2024-2025': '01', [PRIOR]: '01', '2026-2027': '201' }),
    '21': history({ [PRIOR]: '01', '2026-2027': '201' }),
    '5011': history({ [PRIOR]: '52', '2026-2027': '201' }),
    '7788': history({ [PRIOR]: '100', '2026-2027': '201' }),
    // Chartered this year: in the history, but not in the prior PY.
    '9001': history({ '2026-2027': '201' }),
  }
  const lookup = (id: string) => shard[id.replace(/^0+/, '')]

  it('groups clubs that moved in from several predecessors', () => {
    const join = joinRosterToPredecessors(
      ['00000977', '21', '5011', '7788'],
      lookup,
      '201',
      PRIOR
    )
    expect(join.hadThisDistrict).toBe(false)
    expect(join.groups).toEqual([
      { districtId: '01', clubIds: ['00000977', '21'] },
      // Most clubs first; ties in district-number order (52 before 100).
      { districtId: '52', clubIds: ['5011'] },
      { districtId: '100', clubIds: ['7788'] },
    ])
    expect(join.newCharterIds).toEqual([])
  })

  it('counts new charters apart, with or without a history entry', () => {
    const join = joinRosterToPredecessors(
      ['977', '9001', '123456'],
      lookup,
      '201',
      PRIOR
    )
    expect(join.groups).toEqual([{ districtId: '01', clubIds: ['977'] }])
    // 9001 is in the history from 2026-27 only; 123456 is not in it at all.
    expect(join.newCharterIds).toEqual(['9001', '123456'])
  })

  it('gates: any current club already in this district last year means the district is not new', () => {
    const join = joinRosterToPredecessors(
      ['977', '61001'],
      id =>
        id === '61001'
          ? history({ [PRIOR]: '61', '2026-2027': '61' })
          : lookup(id),
      '61',
      PRIOR
    )
    expect(join.hadThisDistrict).toBe(true)
  })

  it('matches the district id padding-blind ("01" is District 1)', () => {
    const join = joinRosterToPredecessors(['977'], lookup, '1', PRIOR)
    expect(join.hadThisDistrict).toBe(true)
  })
})

describe('pickProbeClubId / probeVerdict (#2427 cheap gate)', () => {
  it('probes the oldest charter: it certainly existed last year', () => {
    expect(
      pickProbeClubId([
        { clubId: '5', charterDate: '1990-01-01' },
        { clubId: '6' },
        { clubId: '21', charterDate: '1934-09-01' },
      ])
    ).toBe('21')
  })

  it('falls back to the first club when no charter dates are known', () => {
    expect(pickProbeClubId([{ clubId: '8' }, { clubId: '9' }])).toBe('8')
    expect(pickProbeClubId([])).toBeNull()
  })

  it('is a candidate only when the probe club was in another district', () => {
    const d01 = history({ [PRIOR]: '01', '2026-2027': '201' })
    expect(probeVerdict(d01, '201', PRIOR)).toBe('candidate')
    expect(probeVerdict(d01, '1', PRIOR)).toBe('existing')
    // No history, or no prior-year district: never show a panel we cannot fill.
    expect(probeVerdict(undefined, '201', PRIOR)).toBe('existing')
    expect(probeVerdict(history({ '2026-2027': '201' }), '201', PRIOR)).toBe(
      'existing'
    )
  })
})

describe('aggregatePredecessor (#2427)', () => {
  it('sums membership and counts tiers for the clubs found at year end', () => {
    const agg = aggregatePredecessor(
      '01',
      ['00000977', '21', '404'],
      [
        yearEndClub('977'),
        yearEndClub('00000021', {
          membershipCount: 10,
          membershipBase: 14,
          dcpGoals: 3,
          distinguishedStatus: '',
        }),
        // A club of the old district that did not move: not counted.
        yearEndClub('555', { membershipCount: 99 }),
      ]
    )
    expect(agg).toEqual({
      districtId: '01',
      clubs: 3,
      found: 2,
      members: 30,
      base: 34,
      net: -4,
      distinguished: 1,
      byTier: { D: 0, S: 0, P: 1, M: 0 },
      goalsMet: 12,
      avgDcpGoals: 6,
    })
  })

  it('reports nothing found when the year-end snapshot is unavailable', () => {
    const agg = aggregatePredecessor('52', ['5011'], null)
    expect(agg.found).toBe(0)
    expect(agg.members).toBe(0)
    expect(agg.avgDcpGoals).toBeNull()
  })

  it('totals across predecessors', () => {
    const a = aggregatePredecessor('01', ['977'], [yearEndClub('977')])
    const b = aggregatePredecessor(
      '52',
      ['5011'],
      [yearEndClub('5011', { distinguishedStatus: 'D', dcpGoals: 5 })]
    )
    expect(totalAggregates([a, b])).toMatchObject({
      clubs: 2,
      found: 2,
      members: 40,
      base: 40,
      net: 0,
      distinguished: 2,
      byTier: { D: 1, S: 0, P: 1, M: 0 },
      avgDcpGoals: 7,
    })
  })
})

describe('yearEndDateFor (the useClubHistory lookup, shared)', () => {
  const index = {
    '01': ['2025-06-30', '2026-06-29', '2026-06-30', '2026-07-30'],
    '201': ['2026-06-30', '2026-07-26'],
  }

  it('is the latest snapshot inside the program year', () => {
    expect(yearEndDateFor(index, '01', 2025)).toEqual({
      districtId: '01',
      date: '2026-06-30',
    })
  })

  it('resolves the index key padding-blind', () => {
    expect(yearEndDateFor(index, '1', 2025)?.districtId).toBe('01')
  })

  it('is null when the district has no snapshot in that year', () => {
    expect(yearEndDateFor(index, '01', 2019)).toBeNull()
    expect(yearEndDateFor(index, '52', 2025)).toBeNull()
  })
})
