import { describe, it, expect } from 'vitest'
import { buildActionList } from '../actionListData'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { AreaPerformance, DivisionPerformance } from '../divisionStatus'

/* Minimal ClubTrend factory — only the fields buildActionList +
   calculateClubProjection read are meaningful; the rest are filled with inert
   defaults so the strict ClubTrend type is satisfied. */
function makeClub(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: 'c1',
    clubName: 'Club One',
    divisionId: 'A',
    areaId: 'A1',
    areaName: 'Area A1',
    membershipTrend: [
      { date: '2025-07-01', count: 18 },
      { date: '2026-06-01', count: 18 },
    ],
    dcpGoalsTrend: [
      { date: '2025-07-01', goalsAchieved: 0 },
      { date: '2026-06-01', goalsAchieved: 4 },
    ],
    membershipBase: 18,
    aprilRenewals: null,
    cspSubmitted: true,
    currentStatus: 'thriving',
    distinguishedLevel: 'NotDistinguished',
    ...overrides,
  } as ClubTrend
}

/* A club that satisfies isCloseToDistinguished: NotDistinguished, members gap
   = min(20-18, 3-0) = 2 (<=3), currentGoals 4 (>=3), CSP submitted. */
const closeClub = makeClub({
  clubId: 'close-1',
  clubName: 'Close Club',
  divisionId: 'A',
  areaId: 'A1',
})

/* Not close: only 1 DCP goal. */
const notCloseClub = makeClub({
  clubId: 'far-1',
  clubName: 'Far Club',
  divisionId: 'B',
  areaId: 'B2',
  dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 1 }],
})

function makeArea(overrides: Partial<AreaPerformance>): AreaPerformance {
  return {
    areaId: 'A1',
    currentRound: 1,
    clubsMissingCurrentRoundVisit: [],
    clubsMissingCurrentRoundVisitIneligible: [],
    recognitionState: {
      level: 'distinguished',
      status: 'provisional',
      pendingRounds: [{ round: 1, deadline: '2025-11-30' }],
      failureReason: null,
    },
    ...overrides,
  } as AreaPerformance
}

function makeDivision(
  divisionId: string,
  areas: AreaPerformance[]
): DivisionPerformance {
  return { divisionId, areas } as DivisionPerformance
}

const SNAPSHOT = '2025-10-15' // Round 1 window

describe('buildActionList', () => {
  describe('Close-to-Distinguished section', () => {
    it('includes only clubs the predicate flags, with the concrete gap', () => {
      const result = buildActionList({
        clubs: [closeClub, notCloseClub],
        interventionClubs: [],
        divisions: [],
        snapshotDate: SNAPSHOT,
      })
      expect(result.closeToDistinguished).toHaveLength(1)
      const item = result.closeToDistinguished[0]!
      expect(item.clubId).toBe('close-1')
      expect(item.divisionId).toBe('A')
      expect(item.areaId).toBe('A1')
      // gap reused from calculateClubProjection, never re-derived (R3)
      expect(item.membersNeeded).toBe(2)
      expect(item.goalsNeeded).toBe(1)
    })

    it('is empty when no club qualifies', () => {
      const result = buildActionList({
        clubs: [notCloseClub],
        interventionClubs: [],
        divisions: [],
        snapshotDate: SNAPSHOT,
      })
      expect(result.closeToDistinguished).toEqual([])
    })
  })

  describe('Visit-gap section', () => {
    it('lists areas with active clubs missing the current-round visit, with deadline', () => {
      const gapArea = makeArea({
        areaId: 'A1',
        currentRound: 1,
        clubsMissingCurrentRoundVisit: [
          { clubNumber: '123', clubName: 'Unvisited Club' },
        ],
      })
      const metArea = makeArea({
        areaId: 'A2',
        currentRound: 1,
        clubsMissingCurrentRoundVisit: [],
      })
      const result = buildActionList({
        clubs: [],
        interventionClubs: [],
        divisions: [makeDivision('A', [gapArea, metArea])],
        snapshotDate: SNAPSHOT,
      })
      expect(result.visitGaps).toHaveLength(1)
      const gap = result.visitGaps[0]!
      expect(gap.divisionId).toBe('A')
      expect(gap.areaId).toBe('A1')
      expect(gap.currentRound).toBe(1)
      // deadline reused from getAreaVisitDeadlines (R1 = Nov 30)
      expect(gap.deadline).toBe('2025-11-30')
      expect(gap.missingClubs.map(c => c.clubName)).toEqual(['Unvisited Club'])
    })

    it('uses the R2 deadline when the snapshot is in round 2', () => {
      const gapArea = makeArea({
        areaId: 'A1',
        currentRound: 2,
        clubsMissingCurrentRoundVisit: [{ clubNumber: '1', clubName: 'C' }],
      })
      const result = buildActionList({
        clubs: [],
        interventionClubs: [],
        divisions: [makeDivision('A', [gapArea])],
        snapshotDate: '2026-03-01',
      })
      expect(result.visitGaps[0]!.deadline).toBe('2026-05-31')
    })

    it('is empty when every area has met the current round', () => {
      const result = buildActionList({
        clubs: [],
        interventionClubs: [],
        divisions: [makeDivision('A', [makeArea({ areaId: 'A1' })])],
        snapshotDate: SNAPSHOT,
      })
      expect(result.visitGaps).toEqual([])
    })
  })

  describe('Intervention-required section', () => {
    it('lists intervention-required clubs only', () => {
      const intervention = makeClub({
        clubId: 'int-1',
        clubName: 'Intervention Club',
        divisionId: 'C',
        areaId: 'C3',
        currentStatus: 'intervention-required',
      })
      const vulnerable = makeClub({
        clubId: 'vuln-1',
        currentStatus: 'vulnerable',
      })
      const result = buildActionList({
        clubs: [],
        interventionClubs: [intervention, vulnerable],
        divisions: [],
        snapshotDate: SNAPSHOT,
      })
      expect(result.interventionRequired).toHaveLength(1)
      expect(result.interventionRequired[0]!.clubId).toBe('int-1')
      expect(result.interventionRequired[0]!.areaId).toBe('C3')
    })

    it('is empty when there are no intervention clubs', () => {
      const result = buildActionList({
        clubs: [],
        interventionClubs: [],
        divisions: [],
        snapshotDate: SNAPSHOT,
      })
      expect(result.interventionRequired).toEqual([])
    })
  })

  describe('scope filtering (page-owned, passed as arg — R3)', () => {
    const intervention = makeClub({
      clubId: 'int-A1',
      divisionId: 'A',
      areaId: 'A1',
      currentStatus: 'intervention-required',
    })
    const interventionB = makeClub({
      clubId: 'int-B2',
      divisionId: 'B',
      areaId: 'B2',
      currentStatus: 'intervention-required',
    })
    const divisions = [
      makeDivision('A', [
        makeArea({
          areaId: 'A1',
          clubsMissingCurrentRoundVisit: [{ clubNumber: '1', clubName: 'X' }],
        }),
      ]),
      makeDivision('B', [
        makeArea({
          areaId: 'B2',
          clubsMissingCurrentRoundVisit: [{ clubNumber: '2', clubName: 'Y' }],
        }),
      ]),
    ]

    it('filters every section to a division', () => {
      const result = buildActionList(
        {
          clubs: [closeClub],
          interventionClubs: [intervention, interventionB],
          divisions,
          snapshotDate: SNAPSHOT,
        },
        { division: 'A' }
      )
      expect(result.closeToDistinguished.map(c => c.divisionId)).toEqual(['A'])
      expect(result.visitGaps.map(g => g.divisionId)).toEqual(['A'])
      expect(result.interventionRequired.map(c => c.divisionId)).toEqual(['A'])
    })

    it('filters every section to an area', () => {
      const result = buildActionList(
        {
          clubs: [closeClub],
          interventionClubs: [intervention, interventionB],
          divisions,
          snapshotDate: SNAPSHOT,
        },
        { area: 'B2' }
      )
      expect(result.closeToDistinguished).toEqual([])
      expect(result.visitGaps.map(g => g.areaId)).toEqual(['B2'])
      expect(result.interventionRequired.map(c => c.areaId)).toEqual(['B2'])
    })

    it('an out-of-range scope yields empty sections, never throws (URL-seedable, L144)', () => {
      const result = buildActionList(
        {
          clubs: [closeClub],
          interventionClubs: [intervention],
          divisions,
          snapshotDate: SNAPSHOT,
        },
        { division: 'ZZ' }
      )
      expect(result.closeToDistinguished).toEqual([])
      expect(result.visitGaps).toEqual([])
      expect(result.interventionRequired).toEqual([])
    })
  })
})
