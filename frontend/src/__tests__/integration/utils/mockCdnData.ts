import { vi } from 'vitest'
import { resetCdnManifestCache } from '../../../services/cdn'
import { resetCdnCacheStats } from '../../../services/cdnCacheTracker'
import { queryClient } from '../../../config/queryClient'

const baseUrl = 'https://cdn.taverns.red'

/**
 * DIVERGENCE-BY-DEFAULT fixture dates (#1322, epic #1319 Sprint 3).
 *
 * THE RULE: a per-snapshot CDN file lives under the **snapshot date**, so every
 * per-snapshot fetch, query key, and date-scoped lookup keys on
 * `SNAPSHOT_DATE`. The as-of `sourceCsvDate` is display/provenance ONLY and must
 * never key a fetch.
 *
 * These two dates are deliberately NOT equal. Toastmasters' month-end
 * reconciliation pins the snapshot to the month-end while the dashboard as-of
 * date advances into the next month — they agree ~340 days a year and diverge
 * for 1–3 weeks each close. Fixtures that set them equal make the wrong keying
 * unobservable: that blind spot is why the RegionPage suite missed #1315, the
 * fourth recurrence of this bug. Every page test therefore runs inside the
 * closing window by default.
 *
 * The +5d offset crosses a month boundary on purpose — that is the real shape
 * (live 2026-07-06: snapshot 2026-06-30, `sourceCsvDate` 2026-07-05), and it is
 * what makes `computeFreshness` report `reconciling`. Real year-end lag runs to
 * ~3 weeks, so +5d is conservative.
 *
 * A test asserting equal-date behaviour must opt in EXPLICITLY by overriding
 * these values in its own mock — never by flattening the default back.
 *
 * @see tasks/lessons/lessons/key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate.md
 */
export const SNAPSHOT_DATE = '2024-12-31'
export const SOURCE_CSV_DATE = '2025-01-05'

/**
 * The snapshot dates this fixture CDN actually has files for.
 *
 * Every per-snapshot file lives under `/snapshots/{date}/…`, and the real bucket
 * has nothing under any other date — a request for one 404s. The mock enforces
 * that, which is what makes the divergence above a GUARD rather than decoration:
 * a date-blind mock that matches on `path.includes('competitive-awards.json')`
 * happily serves the same fixture for `snapshots/2025-01-05/…`, rubber-stamping
 * the exact keying bug the fixture is meant to expose.
 */
export const KNOWN_SNAPSHOT_DATES: readonly string[] = [
  SNAPSHOT_DATE,
  '2024-11-30',
  '2024-06-30',
  '2023-12-31',
]

// Sample data schemas based on cdn.ts
export const cdnMocks = {
  latest: {
    latestSnapshotDate: SNAPSHOT_DATE,
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
    // `v1/rankings.json` carries its AS-OF date as a bare `date` (cdn.ts reads
    // it out as `asOfDate`). There is no pinned snapshot on the latest path.
    date: SOURCE_CSV_DATE,
    generatedAt: '2024-12-31T12:00:00Z',
  },
  districtSnapshot: {
    districtId: '61',
    districtName: 'District 61',
    region: 'Region 6',
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
  resetCdnManifestCache()
  resetCdnCacheStats()
  queryClient.clear()
  const originalFetch = global.fetch

  const mockFetch = vi
    .fn()
    .mockImplementation(
      async (input: string | URL, init?: globalThis.RequestInit) => {
        const url = input.toString()

        // Check for CDN specific routes
        if (url.startsWith(baseUrl)) {
          const path = url.replace(baseUrl, '')

          // Serve per-snapshot files ONLY under a date the bucket really has
          // (#1322). The route table below matches on `path.includes(filename)`
          // and is otherwise date-blind, so without this gate a consumer keying
          // on the as-of `sourceCsvDate` is handed the snapshot's own fixture
          // and every test passes — the #1315 blind spot, reproduced in the
          // harness. Live, that fetch 404s: awards → null → blank UI.
          const requestedSnapshotDate = /^\/snapshots\/([^/]+)\//.exec(
            path
          )?.[1]
          if (
            requestedSnapshotDate &&
            !KNOWN_SNAPSHOT_DATES.includes(requestedSnapshotDate)
          ) {
            return {
              ok: false,
              status: 404,
              headers: new Headers(),
              json: async () => ({}),
            } as Response
          }

          let data = {}
          if (path === '/v1/latest.json') {
            data = cdnMocks.latest
          } else if (path === '/v1/dates.json') {
            data = cdnMocks.dates
          } else if (path === '/config/district-snapshot-index.json') {
            data = cdnMocks.districtSnapshotIndex
          } else if (path === '/v1/rankings.json') {
            data = cdnMocks.rankings
          } else if (path.includes('all-districts-rankings.json')) {
            data = {
              metadata: {
                // Diverges from the snapshot date this file is stored under —
                // see SOURCE_CSV_DATE. A consumer that keys a per-snapshot
                // fetch on this value 404s during the closing window (#1315).
                sourceCsvDate: SOURCE_CSV_DATE,
                calculatedAt: '2025-01-01T00:00:00Z',
              },
              rankings: cdnMocks.rankings.rankings,
            }
          } else if (path.includes('/district_61.json')) {
            data = cdnMocks.districtSnapshot
          } else if (path.includes('/district_61_clubhealth.json')) {
            data = cdnMocks.clubHealth
          } else if (path.includes('v1/rank-history/61.json')) {
            data = cdnMocks.rankHistory
          } else if (path.includes('/district_61/index-metadata.json')) {
            data = {
              latestSnapshotDate: SNAPSHOT_DATE,
              availableSnapshotDates: [SNAPSHOT_DATE, '2024-11-30'],
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
