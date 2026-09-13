import { describe, expect, it } from 'vitest'

import {
  CLUB_RACE_STORE_FORMAT,
  ClubRaceStoreSchema,
  GLOBAL_CLUB_RACE_FILE_NAME,
  GLOBAL_CLUB_RACE_FORMAT,
  GlobalClubRaceSchema,
  type ClubRaceStoreData,
  type GlobalClubRace,
} from '../index.js'

/**
 * #1556 (phase 2 of 4) — the worldwide "race to Distinguished" contracts:
 * the internal crossing store `club-race/{PY}/first-reached.json` and the
 * published projection `snapshots/{date}/global-club-race.json`.
 *
 * Both shapes exist so a frontend never re-derives a rule from club rows:
 * the ruleset, the observation resolution and every crossing window come
 * pre-stated by the collector.
 */

const STORE: ClubRaceStoreData = {
  _format: { version: '1.0.0', type: 'club-race-store' },
  programYear: '2026-2027',
  updatedAt: '2026-09-11T10:00:00.000Z',
  observedDates: ['2026-07-26', '2026-08-12', '2026-09-11'],
  clubs: {
    '3045': {
      clubId: '3045',
      clubName: 'Limestone City Club',
      districtId: '61',
      lastSeen: '2026-09-11',
      reached: {
        Distinguished: { on: '2026-07-26', after: null },
        Select: { on: '2026-08-12', after: '2026-07-26' },
      },
    },
    '9': {
      clubId: '9',
      clubName: 'Official Only',
      districtId: '61',
      lastSeen: '2026-09-11',
      reached: {},
      official: { code: 'D', on: '2026-09-11', after: '2026-08-12' },
    },
  },
}

const ARTIFACT: GlobalClubRace = {
  _format: { version: '1.0.0', type: 'global-club-race' },
  date: '2026-09-11',
  programYear: '2026-2027',
  generatedAt: '2026-09-11T10:00:00.000Z',
  scope: {
    districts: { total: 2, numbered: 1, includesUndistricted: true },
    clubsScanned: 3,
    excludedDistricts: [],
    missingDistricts: [],
    reachedAbsentToday: 0,
    officialWithoutDerived: 1,
  },
  ruleset: {
    programYear: '2026-2027',
    cspRequired: true,
    smedleyAvailable: true,
    membershipBasis: 'confirmed-renewals',
    officialRecognitionFrom: '2027-04-01',
    tiers: [
      { level: 'Smedley', goals: 10, members: 25, netGrowthAlternative: null },
      {
        level: 'President',
        goals: 9,
        members: 20,
        netGrowthAlternative: null,
      },
      { level: 'Select', goals: 7, members: 20, netGrowthAlternative: 5 },
      {
        level: 'Distinguished',
        goals: 5,
        members: 20,
        netGrowthAlternative: 3,
      },
    ],
  },
  observation: {
    firstObservedDate: '2026-07-26',
    previousSnapshotDate: '2026-08-12',
    observedDates: 3,
    resolution: 'mixed',
  },
  timeline: [
    {
      date: '2026-07-26',
      Distinguished: 1,
      Select: 0,
      President: 0,
      Smedley: 0,
      official: 0,
    },
    {
      date: '2026-08-12',
      Distinguished: 1,
      Select: 1,
      President: 0,
      Smedley: 0,
      official: 0,
    },
    {
      date: '2026-09-11',
      Distinguished: 1,
      Select: 1,
      President: 0,
      Smedley: 0,
      official: 1,
    },
  ],
  distribution: {
    goalsMet: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    membership: { lt12: 1, from12to19: 0, from20to24: 1, ge25: 1 },
    byTierRequirementsMet: {
      none: 2,
      Distinguished: 0,
      Select: 1,
      President: 0,
      Smedley: 0,
    },
    byOfficialCode: { none: 2, D: 1, S: 0, P: 0, M: 0 },
    cohorts: {
      lt12: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from12to19: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from20to24: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      ge25: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    },
  },
  reached: [
    {
      clubId: '3045',
      clubName: 'Limestone City Club',
      districtId: '61',
      current: {
        level: 'Select',
        activeMembersLevel: 'Select',
        goalsMet: 7,
        members: 22,
        membershipBase: 20,
        netGrowth: 2,
        aprilRenewals: 22,
        cspSubmitted: true,
        dcpGoalsAchieved: [
          true,
          true,
          false,
          true,
          true,
          true,
          false,
          true,
          false,
          true,
        ],
        divisionId: 'A',
        areaId: '01',
        country: 'Canada',
      },
      tiers: {
        Distinguished: {
          reachedOn: '2026-07-26',
          observedAfter: null,
          rank: 1,
        },
        Select: {
          reachedOn: '2026-08-12',
          observedAfter: '2026-07-26',
          rank: 1,
        },
      },
      official: null,
    },
    {
      clubId: '9',
      clubName: 'Official Only',
      districtId: '61',
      current: null,
      tiers: {},
      official: { code: 'D', since: '2026-09-11', observedAfter: '2026-08-12' },
    },
  ],
  byDistrict: [
    {
      districtId: '61',
      region: '07',
      clubs: 2,
      paidClubBase: 158,
      reached: { Distinguished: 1, Select: 1, President: 0, Smedley: 0 },
      percentOfBase: 0.63,
      firstReachedOn: {
        Distinguished: '2026-07-26',
        Select: '2026-08-12',
        President: null,
        Smedley: null,
      },
      worldwideFirsts: 2,
    },
    {
      districtId: 'U',
      region: '',
      clubs: 1,
      paidClubBase: 0,
      reached: { Distinguished: 0, Select: 0, President: 0, Smedley: 0 },
      percentOfBase: null,
      firstReachedOn: {
        Distinguished: null,
        Select: null,
        President: null,
        Smedley: null,
      },
      worldwideFirsts: 0,
    },
  ],
}

describe('ClubRaceStoreSchema (#1556)', () => {
  it('round-trips the store fixture', () => {
    const parsed = ClubRaceStoreSchema.parse(STORE)
    expect(parsed).toEqual(STORE)
    expect(parsed._format).toEqual(CLUB_RACE_STORE_FORMAT)
  })

  it('rejects an unknown tier key — the store never invents a rung', () => {
    const bad = structuredClone(STORE) as unknown as {
      clubs: Record<string, { reached: Record<string, unknown> }>
    }
    bad.clubs['3045']!.reached['Presidents'] = { on: '2026-08-12', after: null }
    expect(ClubRaceStoreSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a crossing whose date is not YYYY-MM-DD', () => {
    const bad = structuredClone(STORE)
    bad.clubs['3045']!.reached.Distinguished = {
      on: '26 Jul 2026',
      after: null,
    }
    expect(ClubRaceStoreSchema.safeParse(bad).success).toBe(false)
  })
})

describe('GlobalClubRaceSchema (#1556)', () => {
  it('round-trips the artifact fixture', () => {
    expect(GlobalClubRaceSchema.parse(ARTIFACT)).toEqual(ARTIFACT)
    expect(GLOBAL_CLUB_RACE_FORMAT).toEqual({
      version: '1.0.0',
      type: 'global-club-race',
    })
    expect(GLOBAL_CLUB_RACE_FILE_NAME).toBe('global-club-race.json')
  })

  it('rejects the wrong format literal', () => {
    const bad = structuredClone(ARTIFACT) as unknown as {
      _format: { type: string }
    }
    bad._format.type = 'global-totals'
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a negative count', () => {
    const bad = structuredClone(ARTIFACT)
    bad.timeline[0]!.Distinguished = -1
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a goals histogram that is not exactly 11 buckets', () => {
    const bad = structuredClone(ARTIFACT)
    bad.distribution.goalsMet = [1, 2, 3]
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects percentOfBase above 100', () => {
    const bad = structuredClone(ARTIFACT)
    bad.byDistrict[0]!.percentOfBase = 101
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a rank below 1 — a club that reached is never unranked', () => {
    const bad = structuredClone(ARTIFACT)
    bad.reached[0]!.tiers.Distinguished!.rank = 0
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown tier key in a reached row', () => {
    const bad = structuredClone(ARTIFACT) as unknown as {
      reached: Array<{ tiers: Record<string, unknown> }>
    }
    bad.reached[0]!.tiers['Gold'] = {
      reachedOn: '2026-08-12',
      observedAfter: null,
      rank: 1,
    }
    expect(GlobalClubRaceSchema.safeParse(bad).success).toBe(false)
  })
})
