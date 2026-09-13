import { describe, it, expect } from 'vitest'
import {
  buildActionList,
  describeActionSections,
  formatCloseGap,
  formatCspRow,
  formatVisitGap,
  orderActionSections,
} from '../actionListData'
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

describe('formatCloseGap / formatVisitGap (shared list + CSV strings)', () => {
  it('pluralizes the close-to-Distinguished gap', () => {
    expect(
      formatCloseGap({
        clubId: 'c',
        clubName: 'C',
        divisionId: 'A',
        areaId: 'A1',
        membersNeeded: 2,
        goalsNeeded: 1,
      })
    ).toBe('needs 2 members + 1 DCP goal')
    expect(
      formatCloseGap({
        clubId: 'c',
        clubName: 'C',
        divisionId: 'A',
        areaId: 'A1',
        membersNeeded: 1,
        goalsNeeded: 2,
      })
    ).toBe('needs 1 member + 2 DCP goals')
  })

  it('pluralizes the visit-gap summary', () => {
    expect(
      formatVisitGap({
        divisionId: 'A',
        areaId: 'A1',
        currentRound: 1,
        deadline: '2025-11-30',
        missingClubs: [{ clubNumber: '1', clubName: 'X' }],
      })
    ).toBe('1 club unvisited · Round 1, due 2025-11-30')
    expect(
      formatVisitGap({
        divisionId: 'A',
        areaId: 'A1',
        currentRound: 2,
        deadline: '2026-05-31',
        missingClubs: [
          { clubNumber: '1', clubName: 'X' },
          { clubNumber: '2', clubName: 'Y' },
        ],
      })
    ).toBe('2 clubs unvisited · Round 2, due 2026-05-31')
  })
})

/**
 * Clubs without a Club Success Plan (#1555, spec §3.3 / §6.4). Fed by the
 * analytics `allClubs` rows; gated on the `programYear` the page already
 * passes (R3); active only (same `isIneligibleStatus` predicate as the raw
 * path, Lesson 052); `undefined` cspSubmitted is UNKNOWN, not missing (E2).
 */
describe('buildActionList — cspNotSubmitted section (#1555)', () => {
  // Only 1 DCP goal each, so none is also close-to-Distinguished.
  const oneGoal = [{ date: '2026-06-01', goalsAchieved: 1 }]
  const missingA1 = makeClub({
    clubId: 'csp-a1',
    clubName: 'Zulu Club',
    divisionId: 'A',
    areaId: 'A1',
    cspSubmitted: false,
    currentStatus: 'vulnerable',
    dcpGoalsTrend: oneGoal,
  })
  const missingA1b = makeClub({
    clubId: 'csp-a1b',
    clubName: 'Alpha Club',
    divisionId: 'A',
    areaId: 'A1',
    cspSubmitted: false,
    currentStatus: 'intervention-required',
    dcpGoalsTrend: oneGoal,
  })
  const missingA10 = makeClub({
    clubId: 'csp-a10',
    clubName: 'Mid Club',
    divisionId: 'A',
    areaId: 'A10',
    cspSubmitted: false,
    dcpGoalsTrend: oneGoal,
  })
  const missingA2 = makeClub({
    clubId: 'csp-a2',
    clubName: 'Bravo Club',
    divisionId: 'A',
    areaId: 'A2',
    cspSubmitted: false,
    dcpGoalsTrend: oneGoal,
  })
  const missingB1 = makeClub({
    clubId: 'csp-b1',
    clubName: 'Charlie Club',
    divisionId: 'B',
    areaId: 'B1',
    cspSubmitted: false,
    dcpGoalsTrend: oneGoal,
  })
  const submitted = makeClub({
    clubId: 'csp-ok',
    clubName: 'Filed Club',
    divisionId: 'A',
    areaId: 'A1',
    cspSubmitted: true,
    dcpGoalsTrend: oneGoal,
  })
  const suspended = makeClub({
    clubId: 'csp-susp',
    clubName: 'Suspended Club',
    divisionId: 'A',
    areaId: 'A1',
    cspSubmitted: false,
    clubStatus: 'Suspended',
    dcpGoalsTrend: oneGoal,
  })
  const unknown = makeClub({
    clubId: 'csp-unk',
    clubName: 'Unknown Club',
    divisionId: 'A',
    areaId: 'A1',
    cspSubmitted: undefined,
    dcpGoalsTrend: oneGoal,
  })

  const base = {
    interventionClubs: [],
    divisions: [],
    snapshotDate: '2026-09-11',
  }

  it('lists active clubs without a CSP, carrying health status; tracked for a 2025-26+ year', () => {
    const result = buildActionList({
      ...base,
      clubs: [submitted, missingA1],
      programYear: '2026-2027',
    })
    expect(result.cspTracked).toBe(true)
    expect(result.cspNotSubmitted).toEqual([
      {
        clubId: 'csp-a1',
        clubName: 'Zulu Club',
        divisionId: 'A',
        areaId: 'A1',
        currentStatus: 'vulnerable',
        // #1565: existing club, pinned 2026-09-11 → still inside the window.
        cspDueDate: '2026-09-30',
        cspOverdue: false,
      },
    ])
    expect(result.cspNotSubmittedIneligibleCount).toBe(0)
    expect(result.cspNotSubmittedAutoCreditCount).toBe(0)
    expect(result.cspUnknownCount).toBe(0)
  })

  it('judges overdue by the pinned snapshot date the page passes, never the clock (#1565)', () => {
    const result = buildActionList({
      ...base,
      clubs: [missingA1],
      snapshotDate: '2026-10-01',
      programYear: '2026-2027',
    })
    expect(result.cspNotSubmitted[0]).toMatchObject({
      cspDueDate: '2026-09-30',
      cspOverdue: true,
    })
  })

  it('gives a club chartered in-year charter + 90 days (#1565)', () => {
    const newborn = makeClub({
      clubId: 'csp-new',
      clubName: 'Newborn Club',
      divisionId: 'A',
      areaId: 'A1',
      cspSubmitted: false,
      charterDate: '2026-08-15',
      dcpGoalsTrend: oneGoal,
    })
    const result = buildActionList({
      ...base,
      clubs: [newborn],
      snapshotDate: '2026-10-05',
      programYear: '2026-2027',
    })
    expect(result.cspNotSubmitted[0]).toMatchObject({
      clubId: 'csp-new',
      cspDueDate: '2026-11-13',
      cspOverdue: false,
    })
  })

  it('never lists a club chartered after 1 April — automatic credit, counted for the footnote (#1565)', () => {
    const spring = makeClub({
      clubId: 'csp-spring',
      clubName: 'Spring Charter',
      divisionId: 'A',
      areaId: 'A1',
      cspSubmitted: false,
      charterDate: '2027-04-15',
      dcpGoalsTrend: oneGoal,
    })
    const result = buildActionList({
      ...base,
      clubs: [missingA1, spring],
      snapshotDate: '2027-05-31',
      programYear: '2026-2027',
    })
    expect(result.cspNotSubmitted.map(c => c.clubId)).toEqual(['csp-a1'])
    expect(result.cspNotSubmittedAutoCreditCount).toBe(1)
    expect(result.cspNotSubmittedIneligibleCount).toBe(0)
  })

  it('is not tracked — and empty — for a pre-2025-26 program year, whatever the rows say', () => {
    const result = buildActionList({
      ...base,
      clubs: [missingA1, missingB1],
      programYear: '2024-2025',
    })
    expect(result.cspTracked).toBe(false)
    expect(result.cspNotSubmitted).toEqual([])
    expect(result.cspNotSubmittedIneligibleCount).toBe(0)
    expect(result.cspNotSubmittedAutoCreditCount).toBe(0)
    expect(result.cspUnknownCount).toBe(0)
  })

  it('treats an omitted program year as current rules (tracked)', () => {
    const result = buildActionList({ ...base, clubs: [missingA1] })
    expect(result.cspTracked).toBe(true)
    expect(result.cspNotSubmitted).toHaveLength(1)
  })

  it('excludes suspended/ineligible clubs from the list and counts them separately', () => {
    const result = buildActionList({
      ...base,
      clubs: [missingA1, suspended],
      programYear: '2026-2027',
    })
    expect(result.cspNotSubmitted.map(c => c.clubId)).toEqual(['csp-a1'])
    expect(result.cspNotSubmittedIneligibleCount).toBe(1)
  })

  it('treats undefined cspSubmitted on a tracked year as unknown: excluded and counted (E2)', () => {
    const result = buildActionList({
      ...base,
      clubs: [missingA1, unknown],
      programYear: '2026-2027',
    })
    expect(result.cspNotSubmitted.map(c => c.clubId)).toEqual(['csp-a1'])
    expect(result.cspUnknownCount).toBe(1)
  })

  it('sorts division → area (numeric-aware) → club name', () => {
    const result = buildActionList({
      ...base,
      clubs: [missingB1, missingA10, missingA2, missingA1, missingA1b],
      programYear: '2026-2027',
    })
    expect(result.cspNotSubmitted.map(c => c.clubId)).toEqual([
      'csp-a1b', // A / A1 / Alpha Club
      'csp-a1', // A / A1 / Zulu Club
      'csp-a2', // A / A2  (A2 before A10 — numeric-aware)
      'csp-a10', // A / A10
      'csp-b1', // B / B1
    ])
  })

  it('is scoped by division and by area like the other sections', () => {
    const clubs = [missingA1, missingA2, missingB1, suspended]
    const byDivision = buildActionList(
      { ...base, clubs, programYear: '2026-2027' },
      { division: 'B' }
    )
    expect(byDivision.cspNotSubmitted.map(c => c.clubId)).toEqual(['csp-b1'])
    expect(byDivision.cspNotSubmittedIneligibleCount).toBe(0)

    const byArea = buildActionList(
      { ...base, clubs, programYear: '2026-2027' },
      { area: 'A1' }
    )
    expect(byArea.cspNotSubmitted.map(c => c.clubId)).toEqual(['csp-a1'])
    expect(byArea.cspNotSubmittedIneligibleCount).toBe(1)

    const outOfRange = buildActionList(
      { ...base, clubs, programYear: '2026-2027' },
      { division: 'ZZ' }
    )
    expect(outOfRange.cspNotSubmitted).toEqual([])
  })
})

describe('formatCspRow (shared list + CSV string)', () => {
  const item = {
    clubId: 'c',
    clubName: 'C',
    divisionId: 'A',
    areaId: 'A1',
    cspDueDate: '2026-09-30',
  }

  it('before the due date reads "CSP due <date> · <health label>" (#1565)', () => {
    expect(
      formatCspRow({ ...item, cspOverdue: false, currentStatus: 'vulnerable' })
    ).toBe('CSP due 30 September 2026 · Vulnerable')
    expect(
      formatCspRow({
        ...item,
        cspOverdue: false,
        currentStatus: 'intervention-required',
      })
    ).toBe('CSP due 30 September 2026 · Intervention Required')
  })

  it('after the due date states the lost eligibility, with no "until" (#1565)', () => {
    const row = formatCspRow({
      ...item,
      cspOverdue: true,
      currentStatus: 'vulnerable',
    })
    expect(row).toBe(
      'CSP not filed by 30 September 2026 — cannot be Distinguished this program year · Vulnerable'
    )
    expect(row).not.toMatch(/until/)
  })

  it('names a newly chartered club’s own +90-day date', () => {
    expect(
      formatCspRow({
        ...item,
        cspDueDate: '2026-11-13',
        cspOverdue: false,
        currentStatus: 'vulnerable',
      })
    ).toBe('CSP due 13 November 2026 · Vulnerable')
  })
})

/**
 * Section order (#1569). The Club Success Plan section leads while a plan can
 * still earn credit and trails once every deadline has passed — judged by the
 * page-owned program year and pinned snapshot date (R3), never a clock, so
 * every branch below is proven with a plain date argument.
 */
describe('buildActionList — cspActionable + orderActionSections (#1569)', () => {
  const oneGoal = [{ date: '2026-06-01', goalsAchieved: 1 }]
  const planless = makeClub({
    clubId: 'csp-x',
    clubName: 'Planless Club',
    cspSubmitted: false,
    currentStatus: 'vulnerable',
    dcpGoalsTrend: oneGoal,
  })
  const base = {
    interventionClubs: [],
    divisions: [],
    clubs: [planless],
  }

  it('is actionable before the deadline, and pins the CSP section first', () => {
    const result = buildActionList({
      ...base,
      snapshotDate: '2026-09-11',
      programYear: '2026-2027',
    })
    expect(result.cspActionable).toBe(true)
    expect(orderActionSections(result)).toEqual([
      'action-csp',
      'action-close',
      'action-visits',
      'action-intervention',
    ])
  })

  it('stays actionable on the due date itself — a plan filed that day counts', () => {
    const result = buildActionList({
      ...base,
      snapshotDate: '2026-09-30',
      programYear: '2026-2027',
    })
    expect(result.cspActionable).toBe(true)
  })

  it('drops the CSP section last once the deadline has passed', () => {
    const result = buildActionList({
      ...base,
      snapshotDate: '2026-10-01',
      programYear: '2026-2027',
    })
    expect(result.cspActionable).toBe(false)
    expect(orderActionSections(result)).toEqual([
      'action-close',
      'action-visits',
      'action-intervention',
      'action-csp',
    ])
  })

  it('keeps it first past 30 September while a newly chartered club can still file', () => {
    const newborn = makeClub({
      clubId: 'csp-new',
      clubName: 'Newborn Club',
      cspSubmitted: false,
      charterDate: '2026-08-15',
      dcpGoalsTrend: oneGoal,
    })
    const result = buildActionList({
      interventionClubs: [],
      divisions: [],
      clubs: [newborn],
      snapshotDate: '2026-10-05',
      programYear: '2026-2027',
    })
    expect(result.cspActionable).toBe(true)
    expect(orderActionSections(result)[0]).toBe('action-csp')
  })

  it('omits the CSP section entirely for a pre-2025-26 program year', () => {
    const result = buildActionList({
      ...base,
      snapshotDate: '2025-05-15',
      programYear: '2024-2025',
    })
    expect(result.cspTracked).toBe(false)
    expect(result.cspActionable).toBe(false)
    expect(orderActionSections(result)).toEqual([
      'action-close',
      'action-visits',
      'action-intervention',
    ])
  })
})

describe('describeActionSections (#1569 intro copy)', () => {
  it('names four sections in render order, with an Oxford "and"', () => {
    expect(
      describeActionSections([
        'action-csp',
        'action-close',
        'action-visits',
        'action-intervention',
      ])
    ).toBe(
      'clubs without a Club Success Plan, clubs within reach of Distinguished, ' +
        'areas with outstanding club visits, and clubs that need intervention'
    )
  })

  it('names three when the program year has no Club Success Plan requirement', () => {
    expect(
      describeActionSections([
        'action-close',
        'action-visits',
        'action-intervention',
      ])
    ).toBe(
      'clubs within reach of Distinguished, areas with outstanding club visits, ' +
        'and clubs that need intervention'
    )
  })

  it('tracks the post-deadline order too', () => {
    expect(
      describeActionSections([
        'action-close',
        'action-visits',
        'action-intervention',
        'action-csp',
      ])
    ).toBe(
      'clubs within reach of Distinguished, areas with outstanding club visits, ' +
        'clubs that need intervention, and clubs without a Club Success Plan'
    )
  })
})
