import { vi } from 'vitest'

const baseUrl = 'https://cdn.taverns.red'

// Sample data schemas based on cdn.ts
export const cdnMocks = {
  latest: {
    latestSnapshotDate: '2024-12-31',
    generatedAt: '2024-12-31T12:00:00Z',
  },
  dates: {
    dates: ['2024-12-31', '2024-11-30', '2024-06-30', '2023-12-31'],
    count: 4,
    generatedAt: '2024-12-31T12:00:00Z',
  },
  districtSnapshotIndex: {
    districts: {
      '61': ['2024-12-31', '2024-11-30', '2024-06-30', '2023-12-31'],
    },
  },
  rankings: {
    rankings: [
      {
        districtId: '61',
        districtName: 'District 61',
        region: 'Region 6',
        paidClubs: 105,
        paidClubBase: 100,
        clubGrowthPercent: 5,
        totalPayments: 4500,
        paymentBase: 4400,
        paymentGrowthPercent: 2.27,
        activeClubs: 105,
        distinguishedClubs: 50,
        selectDistinguished: 10,
        presidentsDistinguished: 5,
        distinguishedPercent: 61.9,
        clubsRank: 10,
        paymentsRank: 15,
        distinguishedRank: 5,
        aggregateScore: 250,
        overallRank: 8,
      },
    ],
    date: '2024-12-31',
    generatedAt: '2024-12-31T12:00:00Z',
  },
  districtSnapshot: {
    districtId: '61',
    districtName: 'District 61',
    region: 'Region 6',
    asOfDate: '2024-12-31',
    programYear: '2024-2025',
    clubs: [
      {
        id: '123456',
        name: 'Ottawa Club',
        status: 'Active',
        area: '10',
        division: 'A',
        alignment: { area: '10', division: 'A' },
        activeMembers: 25,
        goalsTotal: 8,
        goalsMet: 8,
        goalsNeeded: 0,
        dcpGoalsTrend: [{ date: '2024-01-01', goals: 8 }],
        isDistinguished: true,
        monthUpdates: {
          memberRenewal: 'Complete',
        },
      },
      {
        id: '234567',
        name: 'Vulnerable Club',
        status: 'Active',
        area: '11',
        division: 'A',
        alignment: { area: '11', division: 'A' },
        activeMembers: 10,
        goalsTotal: 2,
        goalsMet: 2,
        goalsNeeded: 3,
        dcpGoalsTrend: [{ date: '2024-01-01', goals: 2 }],
        isDistinguished: false,
        monthUpdates: {
          memberRenewal: 'Complete',
        },
      },
      {
        id: '654321',
        name: 'Struggling Club',
        status: 'Active',
        area: '11',
        division: 'A',
        alignment: { area: '11', division: 'A' },
        activeMembers: 7, // At-risk membership (<8)
        goalsTotal: 1,
        goalsMet: 1,
        goalsNeeded: 4,
        dcpGoalsTrend: [{ date: '2024-01-01', goals: 1 }],
        isDistinguished: false,
        monthUpdates: {
          memberRenewal: 'Incomplete',
        },
      },
    ],
    divisions: [
      {
        id: 'A',
        name: 'Division A',
        activeClubs: 2,
        paidClubs: 2,
        paidClubBase: 2,
        distinguishedClubs: 1,
        clubGrowthPercent: 0,
        totalPayments: 32,
        paymentBase: 30,
        paymentGrowthPercent: 6.6,
      },
    ],
    // CSV-record-format arrays consumed by extractDivisionPerformance
    divisionPerformance: [
      {
        Division: 'A',
        Area: '10',
        'Club Number': '123456',
        'Club Name': 'Ottawa Club',
        'Division Club Base': '3',
        'Area Club Base': '1',
        'Active Members': '25',
        'Mem. Base': '20',
        'Goals Met': '8',
        'Nov Visit award': '1',
        'May Visit award': '0',
      },
      {
        Division: 'A',
        Area: '11',
        'Club Number': '234567',
        'Club Name': 'Vulnerable Club',
        'Division Club Base': '3',
        'Area Club Base': '2',
        'Active Members': '10',
        'Mem. Base': '12',
        'Goals Met': '2',
        'Nov Visit award': '0',
        'May Visit award': '0',
      },
      {
        Division: 'A',
        Area: '11',
        'Club Number': '654321',
        'Club Name': 'Struggling Club',
        'Division Club Base': '3',
        'Area Club Base': '2',
        'Active Members': '7',
        'Mem. Base': '10',
        'Goals Met': '1',
        'Nov Visit award': '0',
        'May Visit award': '0',
      },
    ],
    clubPerformance: [
      {
        'Club Number': '123456',
        'Club Name': 'Ottawa Club',
        'Club Status': 'Active',
        'Club Distinguished Status': 'Select Distinguished',
        'Active Members': '25',
        'Goals Met': '8',
      },
      {
        'Club Number': '234567',
        'Club Name': 'Vulnerable Club',
        'Club Status': 'Active',
        'Club Distinguished Status': '',
        'Active Members': '10',
        'Goals Met': '2',
      },
      {
        'Club Number': '654321',
        'Club Name': 'Struggling Club',
        'Club Status': 'Active',
        'Club Distinguished Status': '',
        'Active Members': '7',
        'Goals Met': '1',
      },
    ],
  },
  clubHealth: {
    districtId: '61',
    eligibleClubs: 2,
    atRiskClubs: 1,
    healthyClubs: 1,
    metrics: {
      avgMembersPerClub: 16,
    },
  },
  rankHistory: {
    districtId: '61',
    districtName: 'District 61',
    history: [
      {
        date: '2024-12-31',
        aggregateScore: 250,
        clubsRank: 10,
        paymentsRank: 15,
        distinguishedRank: 5,
        totalDistricts: 120,
        overallRank: 8,
      },
    ],
  },
}

/**
 * Setup a global fetch mock that intercepts CDN calls and returns fixtures.
 */
export function setupCdnFetchMock() {
  const originalFetch = global.fetch

  const mockFetch = vi
    .fn()
    .mockImplementation(
      async (input: string | URL, init?: globalThis.RequestInit) => {
        const url = input.toString()

        // Check for CDN specific routes
        if (url.startsWith(baseUrl)) {
          const path = url.replace(baseUrl, '')

          let data = {}
          if (path === '/v1/latest.json') {
            data = cdnMocks.latest
          } else if (path === '/v1/dates.json') {
            data = cdnMocks.dates
          } else if (path === '/config/district-snapshot-index.json') {
            data = cdnMocks.districtSnapshotIndex
          } else if (path === '/v1/rankings.json') {
            data = cdnMocks.rankings
          } else if (path.includes('/district_61.json')) {
            data = cdnMocks.districtSnapshot
          } else if (path.includes('/district_61_clubhealth.json')) {
            data = cdnMocks.clubHealth
          } else if (path.includes('v1/rank-history/61.json')) {
            data = cdnMocks.rankHistory
          } else if (path.includes('/district_61/index-metadata.json')) {
            data = {
              latestSnapshotDate: '2024-12-31',
              availableSnapshotDates: ['2024-12-31', '2024-11-30'],
              programYear: '2024-2025',
            }
          } else if (path.includes('/club_123456/index-metadata.json')) {
            // Mock a basic club response
            data = {
              clubId: '123456',
              name: 'Ottawa Club',
              districtId: '61',
              division: 'A',
              area: '10',
              stats: {
                membership: { actual: 20, goal: 20 },
                education: { actual: 6, goal: 6 },
              },
            }
          } else if (path.includes('/analytics/')) {
            // Return structured object wrapped in "data" because useDistrictAnalytics expects `{ data: DistrictAnalytics }`
            interface MockClub {
              id: string
              name: string
              status: string
              area: string
              division: string
              activeMembers: number
              goalsTotal: number
              goalsMet: number
              goalsNeeded: number
              isDistinguished: boolean
              [key: string]: unknown
            }
            const mappedClubs = (
              cdnMocks.districtSnapshot.clubs as MockClub[]
            ).map(c => {
              let statusStr = 'thriving'
              let risks: string[] = []

              if (c.name.includes('Vulnerable')) {
                statusStr = 'vulnerable'
                risks = ['Low Membership']
              } else if (c.name.includes('Struggling')) {
                statusStr = 'intervention-required'
                risks = ['Low Membership', 'No Educational Awards']
              }

              return {
                ...c,
                clubId: c.id,
                clubName: c.name,
                divisionId: c.division,
                divisionName: c.division,
                areaId: c.area,
                areaName: c.area,
                membershipTrend: [
                  { date: '2024-12-31', count: c.activeMembers },
                ],
                dcpGoalsTrend: [
                  { date: '2024-12-31', goalsAchieved: c.goalsTotal },
                ],
                currentStatus: statusStr,
                riskFactors: risks,
                distinguishedLevel: c.isDistinguished
                  ? 'Distinguished'
                  : 'None',
              }
            })

            // Separate them into the respective arrays
            const thriving = mappedClubs.filter(
              (c: Record<string, unknown>) => c.currentStatus === 'thriving'
            )
            const vulnerable = mappedClubs.filter(
              (c: Record<string, unknown>) => c.currentStatus === 'vulnerable'
            )
            const intervention = mappedClubs.filter(
              (c: Record<string, unknown>) =>
                c.currentStatus === 'intervention-required'
            )

            const isNovember = path.includes('2024-11-30')

            data = {
              data: {
                districtId: '61',
                dateRange: { start: '2023-07-01', end: '2024-06-30' },
                totalMembership: 1000,
                membershipChange: 50,
                membershipTrend: [],
                topGrowthClubs: [],
                allClubs: mappedClubs,
                thrivingClubs: thriving,
                vulnerableClubs: vulnerable,
                interventionRequiredClubs: intervention,
                distinguishedClubs: {
                  smedley: isNovember ? 0 : 5,
                  presidents: 10,
                  select: 15,
                  distinguished: 20,
                  total: 50,
                },
                distinguishedProjection: 0,
                divisionRankings: [],
                topPerformingAreas: [],
              },
            }
          } else {
            // Fallback for an unhandled path
            console.warn(`Unmocked CDN path accessed in test: ${path}`)
            data = {}
          }

          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => data,
          } as Response
        }

        // Call original fetch if it's not a CDN URL
        return originalFetch(input, init)
      }
    )

  global.fetch = mockFetch
  return mockFetch
}
