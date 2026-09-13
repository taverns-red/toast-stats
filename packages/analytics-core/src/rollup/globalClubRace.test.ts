/**
 * Rules for the published `global-club-race.json` projection (#1556).
 *
 * Every assertion is a place a plausible wrong number could come from: a
 * rank that skips instead of ties, a goal array re-derived from a count, a
 * district share on the wrong denominator, a stray district file leaking
 * into worldwide sums, or a club that has not reached appearing anywhere.
 */

import { describe, it, expect } from 'vitest'
import {
  GlobalClubRaceSchema,
  type ClubRaceStoreData,
  type DistrictRanking,
} from '@taverns-red/shared-contracts'
import type { ClubStatistics } from '../interfaces.js'
import { buildGlobalClubRace } from './globalClubRace.js'

const DATE = '2026-09-11'

const ranking = (
  districtId: string,
  fields: Partial<DistrictRanking> = {}
): DistrictRanking =>
  ({
    districtId,
    districtName: `District ${districtId}`,
    region: '07',
    paidClubs: 100,
    paidClubBase: 100,
    clubGrowthPercent: 0,
    totalPayments: 0,
    paymentBase: 0,
    paymentGrowthPercent: 0,
    activeClubs: 100,
    distinguishedClubs: 0,
    selectDistinguished: 0,
    presidentsDistinguished: 0,
    distinguishedPercent: 0,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    aggregateScore: 0,
    overallRank: 1,
    ...fields,
  }) as DistrictRanking

function club(overrides: Partial<ClubStatistics> = {}): ClubStatistics {
  return {
    clubId: '3045',
    clubName: 'Limestone City Club',
    divisionId: 'A',
    areaId: '01',
    membershipCount: 30,
    paymentsCount: 40,
    dcpGoals: 7,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 01',
    octoberRenewals: 20,
    aprilRenewals: 22,
    newMembers: 2,
    membershipBase: 20,
    cspSubmitted: true,
    ...overrides,
  }
}

/** Seven INDEPENDENT goals met — not goals 1–7. */
const NON_PREFIX_GOALS = [
  false,
  true,
  false,
  true,
  true,
  true,
  true,
  false,
  true,
  true,
]

const LEADER = club({
  clubId: '00003045',
  dcpGoalsAchieved: NON_PREFIX_GOALS,
  address: { country: 'Canada' },
})
const LAGGARD = club({
  clubId: '9',
  clubName: 'Nine',
  dcpGoals: 2,
  membershipCount: 10,
  aprilRenewals: 8,
})
/** Active members qualify, confirmed renewals do not (ruling R-A). */
const UNCONFIRMED = club({
  clubId: '777',
  clubName: 'Unconfirmed',
  dcpGoals: 5,
  membershipCount: 25,
  aprilRenewals: 10,
  membershipBase: 20,
})
const OFFICIAL_ONLY = club({
  clubId: '55',
  clubName: 'Official Only',
  dcpGoals: 3,
  membershipCount: 15,
  aprilRenewals: 12,
  distinguishedStatus: 'D',
})
const UNDISTRICTED = club({
  clubId: '4242',
  clubName: 'Undistricted',
  dcpGoals: 5,
  membershipCount: 20,
  aprilRenewals: 20,
})

const store = (
  overrides: Partial<ClubRaceStoreData> = {}
): ClubRaceStoreData => ({
  _format: { version: '1.0.0', type: 'club-race-store' },
  programYear: '2026-2027',
  updatedAt: '2026-09-11T10:00:00.000Z',
  observedDates: ['2026-07-26', '2026-08-12', DATE],
  clubs: {
    '3045': {
      clubId: '3045',
      clubName: 'Limestone City Club',
      districtId: '61',
      lastSeen: DATE,
      reached: {
        Distinguished: { on: '2026-07-26', after: null },
        Select: { on: '2026-08-12', after: '2026-07-26' },
      },
    },
    '4242': {
      clubId: '4242',
      clubName: 'Undistricted',
      districtId: 'U',
      lastSeen: DATE,
      reached: { Distinguished: { on: '2026-07-26', after: null } },
    },
    // Reached, then vanished from the roster before today.
    '999': {
      clubId: '999',
      clubName: 'Gone Today',
      districtId: '61',
      lastSeen: '2026-08-12',
      reached: { Distinguished: { on: '2026-08-12', after: '2026-07-26' } },
    },
    '55': {
      clubId: '55',
      clubName: 'Official Only',
      districtId: '61',
      lastSeen: DATE,
      reached: {},
      official: { code: 'D', on: DATE, after: '2026-08-12' },
    },
  },
  ...overrides,
})

const build = () =>
  buildGlobalClubRace({
    snapshotDate: DATE,
    rankings: [
      ranking('61'),
      ranking('U', { paidClubBase: 0, region: '' }),
      // Listed but no file supplied.
      ranking('86'),
    ],
    districts: [
      {
        districtId: '61',
        clubs: [LEADER, LAGGARD, UNCONFIRMED, OFFICIAL_ONLY],
      },
      { districtId: 'U', clubs: [UNDISTRICTED] },
      // Present on disk, not in the date's rankings set (#1465).
      { districtId: '201', clubs: [club({ clubId: '201201' })] },
    ],
    store: store(),
    generatedAt: '2026-09-11T10:00:00.000Z',
  })

const row = (clubId: string) => build().reached.find(r => r.clubId === clubId)

describe('buildGlobalClubRace — envelope and scope (#1556)', () => {
  it('validates against the shared contract', () => {
    expect(GlobalClubRaceSchema.safeParse(build()).success).toBe(true)
  })

  it('scopes to the rankings district set and reports the residue', () => {
    const { scope, programYear, date } = build()
    expect(date).toBe(DATE)
    expect(programYear).toBe('2026-2027')
    expect(scope.districts).toEqual({
      total: 3,
      numbered: 2,
      includesUndistricted: true,
    })
    expect(scope.clubsScanned).toBe(5)
    expect(scope.excludedDistricts).toEqual(['201'])
    expect(scope.missingDistricts).toEqual(['86'])
    expect(scope.reachedAbsentToday).toBe(1)
    expect(scope.officialWithoutDerived).toBe(1)
  })

  it('refuses a store from another program year', () => {
    expect(() =>
      buildGlobalClubRace({
        snapshotDate: DATE,
        rankings: [ranking('61')],
        districts: [],
        store: store({ programYear: '2025-2026' }),
      })
    ).toThrow(/2025-2026/)
  })
})

describe('buildGlobalClubRace — ruleset states the basis (#1556)', () => {
  it('names the tiers, gates and the in-force membership basis', () => {
    const { ruleset } = build()
    expect(ruleset.programYear).toBe('2026-2027')
    expect(ruleset.cspRequired).toBe(true)
    expect(ruleset.smedleyAvailable).toBe(true)
    expect(ruleset.membershipBasis).toBe('confirmed-renewals')
    expect(ruleset.officialRecognitionFrom).toBe('2027-04-01')
    expect(ruleset.tiers).toEqual([
      { level: 'Smedley', goals: 10, members: 25, netGrowthAlternative: null },
      { level: 'President', goals: 9, members: 20, netGrowthAlternative: null },
      { level: 'Select', goals: 7, members: 20, netGrowthAlternative: 5 },
      {
        level: 'Distinguished',
        goals: 5,
        members: 20,
        netGrowthAlternative: 3,
      },
    ])
  })

  it('switches to active members from April and drops Smedley before 2025-26', () => {
    const april = buildGlobalClubRace({
      snapshotDate: '2027-04-30',
      rankings: [ranking('61')],
      districts: [],
      store: store({ observedDates: ['2027-04-30'], clubs: {} }),
    })
    expect(april.ruleset.membershipBasis).toBe('active-members')

    const legacy = buildGlobalClubRace({
      snapshotDate: '2025-05-31',
      rankings: [ranking('61')],
      districts: [],
      store: store({
        programYear: '2024-2025',
        observedDates: ['2025-05-31'],
        clubs: {},
      }),
    })
    expect(legacy.ruleset.smedleyAvailable).toBe(false)
    expect(legacy.ruleset.cspRequired).toBe(false)
    expect(legacy.ruleset.tiers.map(t => t.level)).toEqual([
      'President',
      'Select',
      'Distinguished',
    ])
    expect(legacy.ruleset.officialRecognitionFrom).toBe('2025-04-01')
  })
})

describe('buildGlobalClubRace — observation and timeline (#1556)', () => {
  it('states the date resolution from the observed dates', () => {
    expect(build().observation).toEqual({
      firstObservedDate: '2026-07-26',
      previousSnapshotDate: '2026-08-12',
      observedDates: 3,
      resolution: 'mixed',
    })
  })

  it('classifies daily, monthly and unknown cadences', () => {
    const at = (dates: string[]) =>
      buildGlobalClubRace({
        snapshotDate: dates[dates.length - 1]!,
        rankings: [ranking('61')],
        districts: [],
        store: store({ observedDates: dates, clubs: {} }),
      }).observation
    expect(at(['2026-09-09', '2026-09-10', '2026-09-11']).resolution).toBe(
      'daily'
    )
    expect(at(['2026-07-31', '2026-08-31', '2026-09-30']).resolution).toBe(
      'monthly'
    )
    expect(at(['2026-09-11'])).toEqual({
      firstObservedDate: '2026-09-11',
      previousSnapshotDate: null,
      observedDates: 1,
      resolution: 'unknown',
    })
  })

  it('accumulates crossings per observed date — the race chart', () => {
    expect(build().timeline).toEqual([
      {
        date: '2026-07-26',
        Distinguished: 2,
        Select: 0,
        President: 0,
        Smedley: 0,
        official: 0,
      },
      {
        date: '2026-08-12',
        Distinguished: 3,
        Select: 1,
        President: 0,
        Smedley: 0,
        official: 0,
      },
      {
        date: DATE,
        Distinguished: 3,
        Select: 1,
        President: 0,
        Smedley: 0,
        official: 1,
      },
    ])
  })
})

describe('buildGlobalClubRace — reached rows (#1556)', () => {
  it('lists only clubs that crossed a line or carry the official code', () => {
    expect(
      build()
        .reached.map(r => r.clubId)
        .sort()
    ).toEqual(['3045', '4242', '55', '999'])
  })

  it('ties share a rank and the next rank skips (competition ranking)', () => {
    expect(row('3045')?.tiers.Distinguished?.rank).toBe(1)
    expect(row('4242')?.tiers.Distinguished?.rank).toBe(1)
    expect(row('999')?.tiers.Distinguished?.rank).toBe(3)
    expect(row('3045')?.tiers.Select?.rank).toBe(1)
  })

  it('carries the crossing window verbatim from the store', () => {
    expect(row('3045')?.tiers).toEqual({
      Distinguished: { reachedOn: '2026-07-26', observedAfter: null, rank: 1 },
      Select: { reachedOn: '2026-08-12', observedAfter: '2026-07-26', rank: 1 },
    })
  })

  it("copies today's numbers, the goal array verbatim, and both levels", () => {
    expect(row('3045')?.current).toEqual({
      level: 'Select',
      activeMembersLevel: 'Select',
      goalsMet: 7,
      members: 30,
      membershipBase: 20,
      netGrowth: 10,
      aprilRenewals: 22,
      cspSubmitted: true,
      dcpGoalsAchieved: NON_PREFIX_GOALS,
      divisionId: 'A',
      areaId: '01',
      country: 'Canada',
    })
  })

  it('a club absent today keeps its crossing with current: null and no label', () => {
    const gone = row('999')
    expect(gone?.current).toBeNull()
    expect(gone?.districtId).toBe('61')
    expect(gone?.tiers.Distinguished?.reachedOn).toBe('2026-08-12')
  })

  it('an official code with no derived crossing is a row with no rank', () => {
    const official = row('55')
    expect(official?.tiers).toEqual({})
    expect(official?.official).toEqual({
      code: 'D',
      since: DATE,
      observedAfter: '2026-08-12',
    })
    expect(official?.current?.level).toBe('NotDistinguished')
  })

  it('never lists a club that has not reached, even when active members would qualify', () => {
    expect(row('777')).toBeUndefined()
    expect(row('9')).toBeUndefined()
  })
})

describe('buildGlobalClubRace — distribution (#1556)', () => {
  it('histograms sum to clubsScanned and cohorts sum to their bands', () => {
    const { distribution, scope } = build()
    const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
    expect(sum(distribution.goalsMet)).toBe(scope.clubsScanned)
    expect(sum(Object.values(distribution.membership))).toBe(scope.clubsScanned)
    expect(sum(Object.values(distribution.byTierRequirementsMet))).toBe(
      scope.clubsScanned
    )
    expect(sum(Object.values(distribution.byOfficialCode))).toBe(
      scope.clubsScanned
    )
    for (const band of ['lt12', 'from12to19', 'from20to24', 'ge25'] as const) {
      expect(sum(distribution.cohorts[band])).toBe(
        distribution.membership[band]
      )
    }
  })

  it('buckets goals, membership bands, today’s tier on the stated basis, and official codes', () => {
    const { distribution } = build()
    expect(distribution.goalsMet).toEqual([0, 0, 1, 1, 0, 2, 0, 1, 0, 0, 0])
    expect(distribution.membership).toEqual({
      lt12: 1,
      from12to19: 1,
      from20to24: 1,
      ge25: 2,
    })
    // 777 qualifies on active members but NOT on confirmed renewals: none.
    expect(distribution.byTierRequirementsMet).toEqual({
      none: 3,
      Distinguished: 1,
      Select: 1,
      President: 0,
      Smedley: 0,
    })
    expect(distribution.byOfficialCode).toEqual({
      none: 4,
      D: 1,
      S: 0,
      P: 0,
      M: 0,
    })
    expect(distribution.cohorts.ge25[7]).toBe(1)
    expect(distribution.cohorts.ge25[5]).toBe(1)
  })
})

describe('buildGlobalClubRace — district standings (#1556)', () => {
  it('counts reached clubs where they are today, on the paid-club base (Lesson 60)', () => {
    const d61 = build().byDistrict.find(d => d.districtId === '61')
    expect(d61).toEqual({
      districtId: '61',
      region: '07',
      clubs: 4,
      paidClubBase: 100,
      reached: { Distinguished: 2, Select: 1, President: 0, Smedley: 0 },
      percentOfBase: 2,
      firstReachedOn: {
        Distinguished: '2026-07-26',
        Select: '2026-08-12',
        President: null,
        Smedley: null,
      },
      worldwideFirsts: 2,
    })
  })

  it('the undistricted bucket has no base and no share, but its clubs still race', () => {
    const u = build().byDistrict.find(d => d.districtId === 'U')
    expect(u?.percentOfBase).toBeNull()
    expect(u?.reached.Distinguished).toBe(1)
    expect(u?.worldwideFirsts).toBe(1)
  })

  it('a listed district with no file is still a row, at zero', () => {
    const d86 = build().byDistrict.find(d => d.districtId === '86')
    expect(d86?.clubs).toBe(0)
    expect(d86?.reached).toEqual({
      Distinguished: 0,
      Select: 0,
      President: 0,
      Smedley: 0,
    })
    expect(d86?.percentOfBase).toBe(0)
  })
})
