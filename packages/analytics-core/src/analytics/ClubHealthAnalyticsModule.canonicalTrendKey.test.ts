/**
 * Preloaded club trends are keyed by the canonical club id (#2100).
 *
 * The ClubTrendsStore now re-keys every club to its canonical (bare) id, so
 * a snapshot that still carries a zero-padded id must find its trend under
 * the canonical key rather than silently falling back to an empty trend.
 */

import { describe, it, expect } from 'vitest'
import { ClubHealthAnalyticsModule } from './ClubHealthAnalyticsModule.js'
import type { DistrictStatistics } from '../interfaces.js'

describe('preloaded trends keyed by canonical club id (#2100)', () => {
  it('finds a canonical-keyed trend for a zero-padded snapshot id', () => {
    const snapshot = {
      districtId: '61',
      snapshotDate: '2018-06-30',
      clubs: [
        {
          clubId: '00000180',
          clubName: 'Causeurs Sussex Speakers Club',
          divisionId: 'C',
          divisionName: 'Division C',
          areaId: '23',
          areaName: 'Area 23',
          membershipCount: 17,
          paymentsCount: 17,
          dcpGoals: 8,
          status: 'Active',
          octoberRenewals: 0,
          aprilRenewals: 0,
          newMembers: 0,
          membershipBase: 20,
        },
      ],
      divisions: [],
      areas: [],
      totals: {
        totalClubs: 1,
        totalMembership: 17,
        totalPayments: 17,
        distinguishedClubs: 1,
        selectDistinguishedClubs: 1,
        presidentDistinguishedClubs: 0,
      },
    } as unknown as DistrictStatistics
    const membershipTrend = [
      { date: '2018-05-31', count: 16 },
      { date: '2018-06-30', count: 17 },
    ]
    const dcpGoalsTrend = [
      { date: '2018-05-31', goalsAchieved: 6 },
      { date: '2018-06-30', goalsAchieved: 8 },
    ]

    const data = new ClubHealthAnalyticsModule().generateClubHealthData(
      [snapshot],
      { '180': { membershipTrend, dcpGoalsTrend } }
    )

    expect(data.allClubs[0]!.membershipTrend).toEqual(membershipTrend)
    expect(data.allClubs[0]!.dcpGoalsTrend).toEqual(dcpGoalsTrend)
  })
})
