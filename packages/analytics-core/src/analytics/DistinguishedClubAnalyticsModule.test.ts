/**
 * DistinguishedClubAnalyticsModule Unit Tests
 *
 * Focused coverage for the secondary-correctness fixes in epic #1192 Sprint 1
 * (#1116): the year-over-year previous-snapshot selection (item 1) and the
 * achievement-tracking distinguished-level determination (item 4).
 */

import { describe, it, expect } from 'vitest'
import { DistinguishedClubAnalyticsModule } from './DistinguishedClubAnalyticsModule.js'
import type { DistrictStatistics, ClubStatistics } from '../interfaces.js'

function createMockClub(
  overrides: Partial<ClubStatistics> = {}
): ClubStatistics {
  return {
    clubId: '1234',
    clubName: 'Test Club',
    divisionId: 'A',
    areaId: 'A1',
    divisionName: 'Division A',
    areaName: 'Area A1',
    membershipCount: 25,
    paymentsCount: 20,
    dcpGoals: 5,
    status: 'Active',
    octoberRenewals: 10,
    aprilRenewals: 5,
    newMembers: 5,
    membershipBase: 20,
    clubStatus: 'Active',
    ...overrides,
  }
}

function createMockSnapshot(
  snapshotDate: string,
  clubs: ClubStatistics[]
): DistrictStatistics {
  return {
    districtId: 'D101',
    snapshotDate,
    clubs,
    divisions: [],
    areas: [],
    totals: {
      totalClubs: clubs.length,
      totalMembership: clubs.reduce((s, c) => s + c.membershipCount, 0),
      totalPayments: clubs.reduce((s, c) => s + c.paymentsCount, 0),
      distinguishedClubs: clubs.filter(c => c.dcpGoals >= 5).length,
      selectDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 7).length,
      presidentDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 9).length,
    },
  }
}

/** N default (Distinguished-qualifying) clubs with distinct ids. */
function distinguishedClubs(n: number): ClubStatistics[] {
  return Array.from({ length: n }, (_, i) =>
    createMockClub({ clubId: `c${i}`, clubName: `Club ${i}` })
  )
}

describe('DistinguishedClubAnalyticsModule.calculateDistinguishedYearOverYear (#1116 item 1)', () => {
  it('does not fabricate a comparison from a same-program-year snapshot when no previous-PY data exists', () => {
    const module = new DistinguishedClubAnalyticsModule()
    // current 2026-06-15 is program year 2025-26. The only other snapshot,
    // 2025-08-15, is also program year 2025-26 (Jul 2025+) — it shares the
    // calendar year (2025) the buggy `snapshotYear === currentYear-1`
    // predicate matched, so the old code reported a bogus same-PY YoY delta.
    // There is no 2024-25 data, so the honest answer is "no comparison".
    const snapshots = [
      createMockSnapshot('2025-08-15', distinguishedClubs(1)), // same PY (2025-26)
      createMockSnapshot('2026-06-15', distinguishedClubs(3)), // current
    ]

    const result = module.calculateDistinguishedYearOverYear(
      snapshots,
      '2026-06-15'
    )

    expect(result).toBeUndefined()
  })

  it('compares against a real previous-program-year snapshot when one exists', () => {
    const module = new DistinguishedClubAnalyticsModule()
    const snapshots = [
      createMockSnapshot('2025-06-15', distinguishedClubs(2)), // prev PY (2024-25)
      createMockSnapshot('2025-08-15', distinguishedClubs(1)), // same PY (2025-26)
      createMockSnapshot('2026-06-15', distinguishedClubs(3)), // current
    ]

    const result = module.calculateDistinguishedYearOverYear(
      snapshots,
      '2026-06-15'
    )

    expect(result).toBeDefined()
    expect(result?.currentTotal).toBe(3)
    // The previous-program-year snapshot (2 distinguished), not the same-PY one.
    expect(result?.previousTotal).toBe(2)
    expect(result?.change).toBe(1)
  })
})

describe('DistinguishedClubAnalyticsModule achievement tracking (#1116 item 4)', () => {
  it('tracks a club that reaches Select via the net-growth alternative (members < 20)', () => {
    const module = new DistinguishedClubAnalyticsModule()
    // 7 goals + 18 members but +6 net growth (base 12) qualifies as Select via
    // the net-growth path. The inlined ladder (members >= 20 only) missed it.
    const snapshot = createMockSnapshot('2025-08-15', [
      createMockClub({
        clubId: 'growth1',
        clubName: 'Growth Club',
        dcpGoals: 7,
        membershipCount: 18,
        membershipBase: 12,
      }),
    ])

    const result = module.generateDistinguishedClubAnalytics('D101', [snapshot])

    const achievement = result.achievements.find(a => a.clubId === 'growth1')
    expect(achievement).toBeDefined()
    expect(achievement?.level).toBe('Select')
  })

  it('does not track a CSP-less club as a distinguished achievement', () => {
    const module = new DistinguishedClubAnalyticsModule()
    // 5 goals + 25 members would be Distinguished, but no submitted CSP (a
    // 2025-26 requirement) makes the club ineligible. The inlined ladder had
    // no CSP gate and tracked it anyway.
    const snapshot = createMockSnapshot('2025-08-15', [
      createMockClub({
        clubId: 'nocsp1',
        clubName: 'No CSP Club',
        dcpGoals: 5,
        membershipCount: 25,
        membershipBase: 20,
        cspSubmitted: false,
      }),
    ])

    const result = module.generateDistinguishedClubAnalytics('D101', [snapshot])

    expect(result.achievements.find(a => a.clubId === 'nocsp1')).toBeUndefined()
  })
})
