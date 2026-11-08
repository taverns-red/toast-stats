/**
 * The district analytics file carries one `distinguishedCounts` for the
 * district and one per division and area (#2553, epic #2555), computed by
 * the shared rule in `distinguishedCounts.ts` over the latest snapshot.
 */

import { describe, expect, it } from 'vitest'
import { AnalyticsComputer } from './AnalyticsComputer.js'
import type { ClubStatistics, DistrictStatistics } from '../interfaces.js'

function club(over: Partial<ClubStatistics>): ClubStatistics {
  return {
    clubId: '1',
    clubName: 'Club',
    divisionId: 'A',
    areaId: '01',
    divisionName: 'Division A',
    areaName: 'Area 01',
    membershipCount: 0,
    paymentsCount: 0,
    dcpGoals: 0,
    status: 'Active',
    octoberRenewals: 0,
    aprilRenewals: 0,
    newMembers: 0,
    membershipBase: 0,
    cspSubmitted: true,
    ...over,
  }
}

function snapshot(
  snapshotDate: string,
  clubs: ClubStatistics[],
  clubPerformance: DistrictStatistics['clubPerformance'] = []
): DistrictStatistics {
  return {
    districtId: '61',
    snapshotDate,
    clubs,
    divisions: [],
    areas: [],
    totals: {
      totalClubs: clubs.length,
      totalMembership: 0,
      totalPayments: 0,
      distinguishedClubs: 0,
      selectDistinguishedClubs: 0,
      presidentDistinguishedClubs: 0,
    },
    divisionPerformance: [],
    clubPerformance,
    districtPerformance: [],
  }
}

// Before April: 1 confirmed on renewals (A/01), 1 provisional Select (B/02).
const PRE_APRIL_CLUBS = [
  club({
    clubId: '11',
    divisionId: 'A',
    areaId: '01',
    dcpGoals: 6,
    membershipCount: 22,
    membershipBase: 18,
    aprilRenewals: 21,
  }),
  club({
    clubId: '12',
    divisionId: 'B',
    areaId: '02',
    dcpGoals: 7,
    membershipCount: 22,
    membershipBase: 20,
    aprilRenewals: 10,
  }),
]

describe('AnalyticsComputer — distinguishedCounts (#2553)', () => {
  it('writes the district count and one per division and area', async () => {
    const result = await new AnalyticsComputer().computeDistrictAnalytics(
      '61',
      [snapshot('2025-11-15', PRE_APRIL_CLUBS)]
    )
    const { distinguishedCounts, distinguishedCountsByDivision } =
      result.districtAnalytics
    expect(distinguishedCounts?.confirmed).toBe(1)
    expect(distinguishedCounts?.provisional).toBe(1)
    expect(distinguishedCounts?.byTier.select.provisional).toBe(1)
    expect(
      distinguishedCountsByDivision?.map(d => [
        d.divisionId,
        d.distinguishedCounts.confirmed,
        d.distinguishedCounts.provisional,
        d.areas.map(a => a.areaId),
      ])
    ).toEqual([
      ['A', 1, 0, ['01']],
      ['B', 0, 1, ['02']],
    ])
  })

  it('counts the latest snapshot only', async () => {
    const result = await new AnalyticsComputer().computeDistrictAnalytics(
      '61',
      [
        snapshot('2025-11-15', PRE_APRIL_CLUBS),
        snapshot('2025-10-15', [PRE_APRIL_CLUBS[0]!]),
      ]
    )
    expect(result.districtAnalytics.distinguishedCounts?.provisional).toBe(1)
  })

  it("reads TI's letter from the raw club row when the transform did not keep it", async () => {
    // Snapshots transformed before #1120 have no clubs[].distinguishedStatus;
    // the raw club-performance rows still carry TI's letter.
    const result = await new AnalyticsComputer().computeDistrictAnalytics(
      '61',
      [
        snapshot('2026-04-10', PRE_APRIL_CLUBS, [
          { 'Club Number': '00000011', 'Club Distinguished Status': 'S' },
          { 'Club Number': '00000012', 'Club Distinguished Status': '' },
        ]),
      ]
    )
    expect(result.districtAnalytics.distinguishedCounts).toEqual({
      confirmed: 1,
      provisional: 0,
      byTier: {
        distinguished: { confirmed: 0, provisional: 0 },
        select: { confirmed: 1, provisional: 0 },
        presidents: { confirmed: 0, provisional: 0 },
        smedley: { confirmed: 0, provisional: 0 },
      },
    })
  })

  it('leaves the existing distinguishedClubs block in place (expand only)', async () => {
    const result = await new AnalyticsComputer().computeDistrictAnalytics(
      '61',
      [snapshot('2025-11-15', PRE_APRIL_CLUBS)]
    )
    expect(result.districtAnalytics.distinguishedClubs).toBeDefined()
  })
})
