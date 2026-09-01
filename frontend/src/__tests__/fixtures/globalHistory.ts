/**
 * `v1/global-history.json` test fixture (#1500, epic #1496 Sprint 4).
 *
 * Shaped from the REAL published artifact so the tests exercise the null
 * combinations that actually exist on the wire — every null below is a fact
 * about the world, not a placeholder:
 *
 * - `distinguishedClubs.smedley` is null before PY 2025-2026 (the tier did
 *   not exist), and a number from 2025-2026 on.
 * - `education` is null for 2025-2026 (the year's reports set is a live hole
 *   being backfilled) and present for every earlier year.
 * - `clubMovement.newClubs` (TI report basis) is null on EVERY row — the
 *   series populates forward from PY 2026-2027 — while `newClubsStillActive`
 *   (our basis) carries values. The two are different metrics.
 *
 * The row count is deliberately not load-bearing: a 2016-17 → 2020-21
 * backfill is in flight, so the UI must handle five or ten rows.
 */

import type {
  GlobalHistory,
  GlobalHistoryYear,
  GlobalTotals,
} from '@taverns-red/shared-contracts'

type YearOverrides = {
  programYear: string
  yearEndDate: string
  marchDate: string | null
  totalMembership: number
  totalMembershipMarch31: number | null
  totalPayments: number
  paidClubs: number
  smedley: number | null
  education: GlobalHistoryYear['education']
  newClubsStillActive: number | null
  suspendedClubs: number | null
}

function makeYear(o: YearOverrides): GlobalHistoryYear {
  const distinguishedOrBetter = 6587
  const select = 1037
  const presidents = 1289
  return {
    programYear: o.programYear,
    yearEndDate: o.yearEndDate,
    marchDate: o.marchDate,
    districts: { total: 127, numbered: 126, includesUndistricted: true },
    membership: {
      totalMembership: o.totalMembership,
      totalMembershipMarch31: o.totalMembershipMarch31,
      totalPayments: o.totalPayments,
      paidClubs: o.paidClubs,
      activeClubs: o.paidClubs + 400,
      clubsCounted: o.paidClubs + 420,
      avgClubSize: o.totalMembership / o.paidClubs,
    },
    distinguishedClubs: {
      distinguishedOrBetter,
      select,
      presidents,
      smedley: o.smedley,
      base: distinguishedOrBetter - select - presidents - (o.smedley ?? 0),
      percentOfPaidClubs: (distinguishedOrBetter / o.paidClubs) * 100,
    },
    distinguishedDistricts: {
      distinguishedOrBetter: 41,
      byTier: {
        Distinguished: 18,
        Select: 11,
        Presidents: 9,
        Smedley: 3,
        NotDistinguished: 84,
        Unknown: 1,
      },
    },
    clubMovement: {
      newClubsStillActive: o.newClubsStillActive,
      suspendedClubs: o.suspendedClubs,
      // Report-basis new clubs are forward-only from PY 2026-2027.
      newClubs: null,
    },
    education: o.education,
  }
}

function education(total: number): GlobalHistoryYear['education'] {
  const level1 = Math.round(total * 0.34)
  const level2 = Math.round(total * 0.24)
  const level3 = Math.round(total * 0.17)
  const level4 = Math.round(total * 0.1)
  const level5 = Math.round(total * 0.08)
  const dtm = Math.round(total * 0.05)
  const other = total - level1 - level2 - level3 - level4 - level5 - dtm
  return {
    level1,
    level2,
    level3,
    level4,
    level5,
    dtm,
    other,
    total,
    districtsReporting: 126,
    excludedDistricts: [],
  }
}

/** Five completed program years, newest first — the live shape. */
export const globalHistoryFixture: GlobalHistory = {
  _format: { version: '1.0.0', type: 'global-history' },
  generatedAt: '2026-09-01T09:06:24.035Z',
  years: [
    makeYear({
      programYear: '2025-2026',
      yearEndDate: '2026-06-30',
      marchDate: '2026-03-31',
      totalMembership: 257398,
      totalMembershipMarch31: 264166,
      totalPayments: 548483,
      paidClubs: 14201,
      smedley: 1912,
      // The live hole being backfilled separately — never zero-filled.
      education: null,
      newClubsStillActive: 913,
      suspendedClubs: 716,
    }),
    makeYear({
      programYear: '2024-2025',
      yearEndDate: '2025-06-30',
      marchDate: '2025-03-31',
      totalMembership: 257729,
      totalMembershipMarch31: 264133,
      totalPayments: 549006,
      paidClubs: 14134,
      // The Smedley tier did not exist before PY 2025-2026.
      smedley: null,
      education: education(108130),
      newClubsStillActive: 874,
      suspendedClubs: 802,
    }),
    makeYear({
      programYear: '2023-2024',
      yearEndDate: '2024-06-30',
      marchDate: '2024-03-31',
      totalMembership: 252989,
      totalMembershipMarch31: 271077,
      totalPayments: 557370,
      paidClubs: 14310,
      smedley: null,
      education: education(118708),
      newClubsStillActive: 946,
      suspendedClubs: 913,
    }),
    makeYear({
      programYear: '2022-2023',
      yearEndDate: '2023-06-30',
      marchDate: '2023-03-31',
      totalMembership: 257892,
      totalMembershipMarch31: 265360,
      totalPayments: 549577,
      paidClubs: 14430,
      smedley: null,
      education: education(112842),
      newClubsStillActive: 1010,
      suspendedClubs: 988,
    }),
    makeYear({
      programYear: '2021-2022',
      yearEndDate: '2022-06-30',
      // No March-31 rollup on record for this year — an honest gap.
      marchDate: null,
      totalMembership: 258664,
      totalMembershipMarch31: null,
      totalPayments: 563250,
      paidClubs: 14618,
      smedley: null,
      education: education(124212),
      newClubsStillActive: 1104,
      suspendedClubs: 1188,
    }),
  ],
  omitted: [],
}

/** The latest snapshot's `global-totals.json` — clubs-by-country only. */
export const globalTotalsFixture: GlobalTotals = {
  _format: { version: '1.0.0', type: 'global-totals' },
  date: '2026-08-31',
  programYear: '2026-2027',
  generatedAt: '2026-09-01T09:06:24.035Z',
  districts: {
    total: 94,
    numbered: 93,
    includesUndistricted: true,
    excludedDistricts: [],
    missingDistricts: [],
    duplicateClubs: [],
  },
  membership: {
    totalMembership: 275404,
    totalMembershipMarch31: null,
    totalPayments: 189505,
    paidClubs: 13866,
    activeClubs: 14358,
    clubsCounted: 14359,
    avgClubSize: 19.861820279821146,
  },
  distinguishedClubs: {
    distinguishedOrBetter: 0,
    select: 0,
    presidents: 0,
    smedley: 0,
    base: 0,
    percentOfPaidClubs: 0,
  },
  distinguishedDistricts: {
    distinguishedOrBetter: 0,
    byTier: {
      Distinguished: 0,
      Select: 0,
      Presidents: 0,
      Smedley: 0,
      NotDistinguished: 0,
      Unknown: 93,
    },
    undefinedVerdictDistricts: [],
  },
  clubMovement: { newClubsStillActive: 121, suspendedClubs: 4 },
  clubsByCountry: {
    countries: [
      { country: 'United States', clubs: 5664 },
      { country: 'India', clubs: 1066 },
      { country: 'Canada', clubs: 921 },
      { country: 'China', clubs: 705 },
      { country: 'Australia', clubs: 574 },
      { country: 'Malaysia', clubs: 346 },
      { country: 'Mexico', clubs: 297 },
      { country: 'United Kingdom', clubs: 262 },
      // One residual row so `sum(countries) + unknown === clubsCounted`.
      { country: 'Rest of world', clubs: 4240 },
    ],
    unknown: 284,
  },
}
